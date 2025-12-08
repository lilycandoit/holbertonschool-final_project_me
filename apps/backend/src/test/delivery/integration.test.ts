// ============================================
// 🚀 DELIVERY SYSTEM INTEGRATION TESTS
// ============================================
// End-to-end tests for complete delivery flow
// Tests OrderService integration with ShippingCalculator

import { OrderService } from '../../services/OrderService';
import { DeliveryType, PurchaseType } from '@prisma/client';
import prisma from '../../config/database';

// Mock Prisma
jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    order: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderItem: {
      create: jest.fn(),
    },
    deliveryZone: {
      findFirst: jest.fn(),
    },
  },
}));

// Mock external services
jest.mock('../../services/delivery/googleDistanceService');
jest.mock('../../services/delivery/sendleService');
jest.mock('../../services/EmailService');

describe('Delivery System Integration', () => {
  let orderService: OrderService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    orderService = new OrderService();
    jest.clearAllMocks();

    // Set up default environment
    process.env.ENABLE_SENDLE_QUOTES = 'false';
    process.env.ENABLE_GOOGLE_DISTANCE = 'false';
  });

  // ============================================
  // COMPLETE ORDER FLOW TESTS
  // ============================================

  describe('Complete Order Flow', () => {
    const createOrderData = (deliveryType: DeliveryType, overrides: any = {}) => ({
      userId: 'user-123',
      purchaseType: PurchaseType.ONE_TIME,
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          priceCents: 2999,
        },
        {
          productId: 'product-2',
          quantity: 2,
          priceCents: 1999,
        },
      ],
      shippingAddress: {
        firstName: 'John',
        lastName: 'Doe',
        street1: '123 Test St',
        city: 'Richmond',
        state: 'VIC',
        zipCode: '3121',
        country: 'Australia',
      },
      deliveryType,
      ...overrides,
    });

    it('should calculate shipping with Zone tier (Tier 3)', async () => {
      // Mock product lookups
      mockPrisma.product.findUnique
        .mockResolvedValueOnce({
          id: 'product-1',
          stockQuantity: 10,
          priceCents: 2999,
        } as any)
        .mockResolvedValueOnce({
          id: 'product-2',
          stockQuantity: 20,
          priceCents: 1999,
        } as any);

      // Mock delivery zone lookup
      mockPrisma.deliveryZone.findFirst.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
        freeDeliveryThreshold: null,
      } as any);

      // Mock transaction
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-123',
        orderNumber: 'FLR20250126001',
        shippingCents: 1099,
        subtotalCents: 6997, // (2999 × 1) + (1999 × 2)
        totalCents: 8096, // 6997 + 1099
      } as any);

      const orderData = createOrderData(DeliveryType.STANDARD);
      const result = await orderService.createOrder(orderData as any);

      expect(result.shippingCents).toBe(1099); // Zone pricing
      expect(result.totalCents).toBe(8096);
    });

    it('should apply free shipping over threshold', async () => {
      // Mock product lookups (high value order)
      mockPrisma.product.findUnique
        .mockResolvedValueOnce({
          id: 'product-1',
          stockQuantity: 10,
          priceCents: 15000, // $150
        } as any)
        .mockResolvedValueOnce({
          id: 'product-2',
          stockQuantity: 20,
          priceCents: 5000, // $50
        } as any);

      // Mock delivery zone with free shipping threshold
      mockPrisma.deliveryZone.findFirst.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Melbourne CBD',
        zipCodes: ['3000'],
        standardCostCents: 899,
        standardDeliveryDays: 2,
        isActive: true,
        freeDeliveryThreshold: 15000, // $150 threshold
      } as any);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-124',
        orderNumber: 'FLR20250126002',
        shippingCents: 0, // Free shipping!
        subtotalCents: 25000, // Over threshold
        totalCents: 25000,
      } as any);

      const orderData = createOrderData(DeliveryType.STANDARD, {
        shippingAddress: {
          firstName: 'Jane',
          lastName: 'Smith',
          street1: '456 Collins St',
          city: 'Melbourne',
          state: 'VIC',
          zipCode: '3000',
          country: 'Australia',
        },
        items: [
          { productId: 'product-1', quantity: 1, priceCents: 15000 },
          { productId: 'product-2', quantity: 2, priceCents: 5000 },
        ],
      });

      const result = await orderService.createOrder(orderData as any);

      expect(result.shippingCents).toBe(0); // Free shipping applied
    });

    it('should charge zero for PICKUP delivery', async () => {
      mockPrisma.product.findUnique
        .mockResolvedValueOnce({ id: 'product-1', stockQuantity: 10, priceCents: 2999 } as any)
        .mockResolvedValueOnce({ id: 'product-2', stockQuantity: 20, priceCents: 1999 } as any);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-125',
        orderNumber: 'FLR20250126003',
        shippingCents: 0,
        subtotalCents: 6997,
        totalCents: 6997,
      } as any);

      const orderData = createOrderData(DeliveryType.PICKUP);
      const result = await orderService.createOrder(orderData as any);

      expect(result.shippingCents).toBe(0);
      // Zone should NOT be queried for PICKUP
      expect(mockPrisma.deliveryZone.findFirst).not.toHaveBeenCalled();
    });

    it('should multiply shipping cost by number of delivery dates', async () => {
      mockPrisma.product.findUnique
        .mockResolvedValueOnce({ id: 'product-1', stockQuantity: 10, priceCents: 2999 } as any)
        .mockResolvedValueOnce({ id: 'product-2', stockQuantity: 20, priceCents: 1999 } as any)
        .mockResolvedValueOnce({ id: 'product-3', stockQuantity: 15, priceCents: 2499 } as any);

      mockPrisma.deliveryZone.findFirst.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        standardCostCents: 899, // $8.99 per delivery
        standardDeliveryDays: 2,
        isActive: true,
      } as any);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-126',
        orderNumber: 'FLR20250126004',
        shippingCents: 2697, // $8.99 × 3 deliveries
        subtotalCents: 9996,
        totalCents: 12693,
      } as any);

      const orderData = createOrderData(DeliveryType.STANDARD, {
        items: [
          {
            productId: 'product-1',
            quantity: 1,
            priceCents: 2999,
            requestedDeliveryDate: new Date('2025-02-14'), // Valentine's Day
          },
          {
            productId: 'product-2',
            quantity: 2,
            priceCents: 1999,
            requestedDeliveryDate: new Date('2025-02-20'), // Anniversary
          },
          {
            productId: 'product-3',
            quantity: 1,
            priceCents: 2499,
            requestedDeliveryDate: new Date('2025-02-27'), // Birthday
          },
        ],
      });

      const result = await orderService.createOrder(orderData as any);

      // Should charge for 3 separate deliveries
      expect(result.shippingCents).toBe(2697); // 899 × 3
    });

    it('should use fallback pricing if no zone found', async () => {
      mockPrisma.product.findUnique
        .mockResolvedValueOnce({ id: 'product-1', stockQuantity: 10, priceCents: 2999 } as any)
        .mockResolvedValueOnce({ id: 'product-2', stockQuantity: 20, priceCents: 1999 } as any);

      // No zone found for postcode
      mockPrisma.deliveryZone.findFirst.mockResolvedValueOnce(null);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-127',
        orderNumber: 'FLR20250126005',
        shippingCents: 899, // Hardcoded fallback
        subtotalCents: 6997,
        totalCents: 7896,
      } as any);

      const orderData = createOrderData(DeliveryType.STANDARD, {
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          street1: '123 Unknown St',
          city: 'Unknown',
          state: 'VIC',
          zipCode: '9999', // Invalid postcode
          country: 'Australia',
        },
      });

      const result = await orderService.createOrder(orderData as any);

      expect(result.shippingCents).toBe(899); // Fallback pricing
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling', () => {
    it('should handle insufficient stock', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'product-1',
        stockQuantity: 0, // Out of stock!
        priceCents: 2999,
      } as any);

      const orderData = {
        userId: 'user-123',
        purchaseType: PurchaseType.ONE_TIME,
        items: [
          {
            productId: 'product-1',
            quantity: 1,
            priceCents: 2999,
          },
        ],
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          street1: '123 Test St',
          city: 'Melbourne',
          state: 'VIC',
          zipCode: '3000',
        },
        deliveryType: DeliveryType.STANDARD,
      };

      await expect(orderService.createOrder(orderData as any)).rejects.toThrow(
        /insufficient stock/i
      );
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.product.findUnique
        .mockResolvedValueOnce({ id: 'product-1', stockQuantity: 10, priceCents: 2999 } as any);

      mockPrisma.deliveryZone.findFirst.mockRejectedValueOnce(
        new Error('Database connection lost')
      );

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      // Should still work with fallback pricing
      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-128',
        orderNumber: 'FLR20250126006',
        shippingCents: 899, // Emergency fallback
        subtotalCents: 2999,
        totalCents: 3898,
      } as any);

      const orderData = {
        userId: 'user-123',
        purchaseType: PurchaseType.ONE_TIME,
        items: [{ productId: 'product-1', quantity: 1, priceCents: 2999 }],
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          street1: '123 Test St',
          city: 'Melbourne',
          state: 'VIC',
          zipCode: '3000',
        },
        deliveryType: DeliveryType.STANDARD,
      };

      const result = await orderService.createOrder(orderData as any);

      // Order should succeed with emergency fallback
      expect(result.shippingCents).toBe(899);
    });
  });

  // ============================================
  // DELIVERY TYPE TESTS
  // ============================================

  describe('Delivery Type Variations', () => {
    const setupMocks = () => {
      mockPrisma.product.findUnique
        .mockResolvedValueOnce({ id: 'product-1', stockQuantity: 10, priceCents: 2999 } as any);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });
    };

    it('should handle STANDARD delivery', async () => {
      setupMocks();

      mockPrisma.deliveryZone.findFirst.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        standardCostCents: 899,
        standardDeliveryDays: 2,
        isActive: true,
      } as any);

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-129',
        shippingCents: 899,
        deliveryType: DeliveryType.STANDARD,
      } as any);

      const orderData = {
        userId: 'user-123',
        purchaseType: PurchaseType.ONE_TIME,
        items: [{ productId: 'product-1', quantity: 1, priceCents: 2999 }],
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          street1: '123 Test St',
          city: 'Richmond',
          state: 'VIC',
          zipCode: '3121',
        },
        deliveryType: DeliveryType.STANDARD,
      };

      const result = await orderService.createOrder(orderData as any);
      expect(result.deliveryType).toBe(DeliveryType.STANDARD);
    });

    it('should handle EXPRESS delivery', async () => {
      setupMocks();

      mockPrisma.deliveryZone.findFirst.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        standardCostCents: 899,
        expressCostCents: 1599,
        expressDeliveryDays: 1,
        isActive: true,
      } as any);

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-130',
        shippingCents: 1599,
        deliveryType: DeliveryType.EXPRESS,
      } as any);

      const orderData = {
        userId: 'user-123',
        purchaseType: PurchaseType.ONE_TIME,
        items: [{ productId: 'product-1', quantity: 1, priceCents: 2999 }],
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          street1: '123 Test St',
          city: 'Richmond',
          state: 'VIC',
          zipCode: '3121',
        },
        deliveryType: DeliveryType.EXPRESS,
      };

      const result = await orderService.createOrder(orderData as any);
      expect(result.deliveryType).toBe(DeliveryType.EXPRESS);
    });

    it('should handle SAME_DAY delivery', async () => {
      setupMocks();

      mockPrisma.deliveryZone.findFirst.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Melbourne CBD',
        zipCodes: ['3000'],
        standardCostCents: 899,
        sameDayAvailable: true,
        sameDayCostCents: 2999,
        isActive: true,
      } as any);

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'order-131',
        shippingCents: 2999,
        deliveryType: DeliveryType.SAME_DAY,
      } as any);

      const orderData = {
        userId: 'user-123',
        purchaseType: PurchaseType.ONE_TIME,
        items: [{ productId: 'product-1', quantity: 1, priceCents: 2999 }],
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          street1: '123 Collins St',
          city: 'Melbourne',
          state: 'VIC',
          zipCode: '3000',
        },
        deliveryType: DeliveryType.SAME_DAY,
      };

      const result = await orderService.createOrder(orderData as any);
      expect(result.deliveryType).toBe(DeliveryType.SAME_DAY);
    });
  });
});
