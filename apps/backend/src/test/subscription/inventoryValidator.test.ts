import { Product, SubscriptionItem } from '@prisma/client';

// Mock Prisma with inline jest.fn() calls
jest.mock('@prisma/client', () => {
  const mockProduct = {
    findUnique: jest.fn(),
  };

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      product: mockProduct,
    })),
  };
});

// Import the service AFTER mocks are set up
import InventoryValidator from '../../services/subscription/inventoryValidator';
import { PrismaClient } from '@prisma/client';

describe('InventoryValidator Tests', () => {
  let inventoryValidator: InventoryValidator;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    inventoryValidator = new InventoryValidator();

    // Get the mock instance
    mockPrisma = new PrismaClient();
  });

  describe('validateSubscriptionItems', () => {
    test('should return all items as available when products exist and are active', async () => {
      const subscriptionItems = [
        {
          id: 'item1',
          productId: 'prod1',
          quantity: 2,
          product: {
            id: 'prod1',
            name: 'Red Roses',
            priceCents: 2999,
            isActive: true,
            inStock: true,
            stockCount: 100,
          },
        },
        {
          id: 'item2',
          productId: 'prod2',
          quantity: 1,
          product: {
            id: 'prod2',
            name: 'Tulips',
            priceCents: 1999,
            isActive: true,
            inStock: true,
            stockCount: 50,
          },
        },
      ];

      mockPrisma.product.findUnique
        .mockResolvedValueOnce(subscriptionItems[0].product)
        .mockResolvedValueOnce(subscriptionItems[1].product);

      const result = await inventoryValidator.validateSubscriptionItems(
        subscriptionItems as any
      );

      expect(result.availableItems).toHaveLength(2);
      expect(result.skippedItems).toHaveLength(0);
      expect(result.totalCents).toBe(2999 * 2 + 1999 * 1); // $59.98 + $19.99 = $79.97
    });

    test('should skip inactive products', async () => {
      const subscriptionItems = [
        {
          id: 'item1',
          productId: 'prod1',
          quantity: 2,
          product: {
            id: 'prod1',
            name: 'Red Roses',
            priceCents: 2999,
            isActive: true,
            inStock: true,
            stockCount: 100,
          },
        },
        {
          id: 'item2',
          productId: 'prod2',
          quantity: 1,
          product: {
            id: 'prod2',
            name: 'Discontinued Flowers',
            priceCents: 1999,
            isActive: false,
            inStock: true,
            stockCount: 50,
          },
        },
      ];

      mockPrisma.product.findUnique
        .mockResolvedValueOnce(subscriptionItems[0].product)
        .mockResolvedValueOnce({
          ...subscriptionItems[1].product,
          isActive: false,
        });

      const result = await inventoryValidator.validateSubscriptionItems(
        subscriptionItems as any
      );

      expect(result.availableItems).toHaveLength(1);
      expect(result.skippedItems).toHaveLength(1);
      expect(result.skippedItems[0]).toEqual({
        productId: 'prod2',
        productName: 'Discontinued Flowers',
        reason: 'Product has been discontinued',
      });
      expect(result.totalCents).toBe(2999 * 2); // Only Red Roses
    });

    test('should skip out-of-stock products', async () => {
      const subscriptionItems = [
        {
          id: 'item1',
          productId: 'prod1',
          quantity: 2,
          product: {
            id: 'prod1',
            name: 'Red Roses',
            priceCents: 2999,
            isActive: true,
            inStock: false, // Out of stock
            stockCount: 0,
          },
        },
      ];

      mockPrisma.product.findUnique.mockResolvedValueOnce({
        ...subscriptionItems[0].product,
        inStock: false,
      });

      const result = await inventoryValidator.validateSubscriptionItems(
        subscriptionItems as any
      );

      expect(result.availableItems).toHaveLength(0);
      expect(result.skippedItems).toHaveLength(1);
      expect(result.skippedItems[0].reason).toBe('Product is currently out of stock');
      expect(result.totalCents).toBe(0);
    });

    test('should skip non-existent products', async () => {
      const subscriptionItems = [
        {
          id: 'item1',
          productId: 'prod_deleted',
          quantity: 1,
          product: {
            id: 'prod_deleted',
            name: 'Deleted Product',
            priceCents: 2999,
          },
        },
      ];

      mockPrisma.product.findUnique.mockResolvedValueOnce(null); // Product deleted

      const result = await inventoryValidator.validateSubscriptionItems(
        subscriptionItems as any
      );

      expect(result.availableItems).toHaveLength(0);
      expect(result.skippedItems).toHaveLength(1);
      expect(result.skippedItems[0].reason).toBe('Product not found in catalog');
      expect(result.totalCents).toBe(0);
    });

    test('should handle mixed scenario (some available, some skipped)', async () => {
      const subscriptionItems = [
        {
          id: 'item1',
          productId: 'prod1',
          quantity: 1,
          product: {
            id: 'prod1',
            name: 'Available Product',
            priceCents: 3999,
            isActive: true,
            inStock: true,
            stockCount: 100,
          },
        },
        {
          id: 'item2',
          productId: 'prod2',
          quantity: 1,
          product: {
            id: 'prod2',
            name: 'Out of Stock Product',
            priceCents: 2999,
            isActive: true,
            inStock: false,
            stockCount: 0,
          },
        },
        {
          id: 'item3',
          productId: 'prod3',
          quantity: 1,
          product: {
            id: 'prod3',
            name: 'Inactive Product',
            priceCents: 1999,
            isActive: false,
            inStock: true,
            stockCount: 50,
          },
        },
      ];

      mockPrisma.product.findUnique
        .mockResolvedValueOnce(subscriptionItems[0].product)
        .mockResolvedValueOnce({ ...subscriptionItems[1].product, inStock: false })
        .mockResolvedValueOnce({ ...subscriptionItems[2].product, isActive: false });

      const result = await inventoryValidator.validateSubscriptionItems(
        subscriptionItems as any
      );

      expect(result.availableItems).toHaveLength(1);
      expect(result.skippedItems).toHaveLength(2);
      expect(result.totalCents).toBe(3999); // Only first product
    });

    test('should use CURRENT product prices, not subscription item prices', async () => {
      const subscriptionItems = [
        {
          id: 'item1',
          productId: 'prod1',
          quantity: 2,
          product: {
            id: 'prod1',
            name: 'Red Roses',
            priceCents: 2999, // OLD PRICE (from when subscription created)
            isActive: true,
            inStock: true,
            stockCount: 100,
          },
        },
      ];

      // Current price in database is higher
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod1',
        name: 'Red Roses',
        priceCents: 3499, // NEW CURRENT PRICE
        isActive: true,
        inStock: true,
        stockCount: 100,
      });

      const result = await inventoryValidator.validateSubscriptionItems(
        subscriptionItems as any
      );

      // Should use CURRENT price (3499), not subscription item price (2999)
      expect(result.totalCents).toBe(3499 * 2); // $69.98
    });
  });
});
