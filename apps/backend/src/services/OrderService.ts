import { prisma } from "../config/database";
import {
  Order,
  OrderItem,
  PurchaseType,
  SubscriptionType,
  OrderStatus,
  DeliveryType,
  DeliveryTracking,
} from "@prisma/client";
import { EmailService } from "./EmailService";
import { ShippingCalculator } from "./delivery/shippingCalculator";

export interface CreateOrderData {
  userId?: string;
  guestEmail?: string;
  guestPhone?: string;
  purchaseType: PurchaseType;
  subscriptionType?: SubscriptionType;
  subscriptionId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    priceCents: number;
    subscriptionType?: SubscriptionType;     // Item-level subscription type
    requestedDeliveryDate?: Date;            // Item-level delivery date
  }>;
  shippingAddress: {
    firstName: string;
    lastName: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
    phone?: string;
  };
  billingAddress?: {
    firstName: string;
    lastName: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
    phone?: string;
  };
  deliveryType: DeliveryType;
  deliveryNotes?: string;
  requestedDeliveryDate?: Date;
}

export interface OrderWithDetails extends Order {
  items: (OrderItem & {
    product: {
      id: string;
      name: string;
      priceCents: number;
      imageUrl: string | null;
    };
  })[];
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  payments?: Array<{
    id: string;
    amountCents: number;
    status: string;
    paidAt: Date | null;
  }>;
}

export class OrderService {
  private emailService: EmailService;
  private shippingCalculator: ShippingCalculator;

  // Reusable Prisma include structure for order queries
  private readonly orderInclude = {
    items: {
      include: {
        product: {
          select: {
            id: true,
            name: true,
            priceCents: true,
            imageUrl: true,
          },
        },
      },
    },
    user: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
    payments: {
      select: {
        id: true,
        amountCents: true,
        status: true,
        paidAt: true,
      },
    },
  };

  // Status mapping constants
  private readonly trackingStatusMap: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: "PREPARING",
    [OrderStatus.CONFIRMED]: "PREPARING",
    [OrderStatus.PREPARING]: "PREPARING",
    [OrderStatus.OUT_FOR_DELIVERY]: "OUT_FOR_DELIVERY",
    [OrderStatus.DELIVERED]: "DELIVERED",
    [OrderStatus.CANCELLED]: "CANCELLED",
    [OrderStatus.REFUNDED]: "CANCELLED",
  };

  private readonly statusDescriptions: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: "Order received and being processed",
    [OrderStatus.CONFIRMED]: "Order confirmed and being prepared",
    [OrderStatus.PREPARING]: "Your beautiful flowers are being prepared",
    [OrderStatus.OUT_FOR_DELIVERY]: "Your order is out for delivery",
    [OrderStatus.DELIVERED]: "Order has been successfully delivered",
    [OrderStatus.CANCELLED]: "Order has been cancelled",
    [OrderStatus.REFUNDED]: "Order has been refunded",
  };

  constructor() {
    this.emailService = new EmailService();
    this.shippingCalculator = new ShippingCalculator();
  }

  // Create new order (guest or user)
  async createOrder(orderData: CreateOrderData): Promise<OrderWithDetails> {
    // Validate products exist and are in stock
    await this.validateOrderItems(orderData.items);

    // Calculate totals
    const subtotalCents = orderData.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

    // Calculate shipping based on delivery type, zip code, and delivery dates
    const shippingCents = await this.calculateShipping(
      orderData.deliveryType,
      orderData.shippingAddress,
      subtotalCents,
      orderData.items
    );

    // No additional tax (tax included in item price)
    const taxCents = 0;

    const totalCents = subtotalCents + shippingCents + taxCents;

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Create order with transaction
    const order = await prisma.$transaction(async (tx) => {
      // Debug billing data before insertion
      console.log('🔍 OrderService - About to insert billing data:', {
        billingAddress: orderData.billingAddress,
        billingFirstName: orderData.billingAddress?.firstName,
        billingLastName: orderData.billingAddress?.lastName,
        billingStreet1: orderData.billingAddress?.street1,
        billingCity: orderData.billingAddress?.city,
        billingState: orderData.billingAddress?.state,
        billingZipCode: orderData.billingAddress?.zipCode,
      });

      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          purchaseType: orderData.purchaseType,
          subscriptionType: orderData.subscriptionType,
          subscriptionId: orderData.subscriptionId,
          userId: orderData.userId,
          guestEmail: orderData.guestEmail,
          guestPhone: orderData.guestPhone,
          subtotalCents,
          shippingCents,
          taxCents,
          totalCents,
          deliveryType: orderData.deliveryType,
          requestedDeliveryDate: orderData.requestedDeliveryDate,
          deliveryNotes: orderData.deliveryNotes,
          // Shipping address snapshot (recipient/delivery address)
          shippingFirstName: orderData.shippingAddress.firstName,
          shippingLastName: orderData.shippingAddress.lastName,
          shippingStreet1: orderData.shippingAddress.street1,
          shippingStreet2: orderData.shippingAddress.street2,
          shippingCity: orderData.shippingAddress.city,
          shippingState: orderData.shippingAddress.state,
          shippingZipCode: orderData.shippingAddress.zipCode,
          shippingCountry: orderData.shippingAddress.country || 'AU',
          shippingPhone: orderData.shippingAddress.phone,
          // Billing address snapshot (sender/payer address)
          billingFirstName: orderData.billingAddress?.firstName,
          billingLastName: orderData.billingAddress?.lastName,
          billingStreet1: orderData.billingAddress?.street1,
          billingStreet2: orderData.billingAddress?.street2,
          billingCity: orderData.billingAddress?.city,
          billingState: orderData.billingAddress?.state,
          billingZipCode: orderData.billingAddress?.zipCode,
          billingCountry: orderData.billingAddress?.country || 'AU',
          billingPhone: orderData.billingAddress?.phone,
          items: {
            create: orderData.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              priceCents: item.priceCents,
              subscriptionType: item.subscriptionType,
              requestedDeliveryDate: item.requestedDeliveryDate,
            })),
          },
        },
        include: this.orderInclude,
      });

      // Update product stock
      for (const item of orderData.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockCount: {
              decrement: item.quantity,
            },
          },
        });
      }

      return newOrder;
    });

    return order;
  }

  // Get order by ID (with access control)
  async getOrderById(orderId: string, userId?: string): Promise<OrderWithDetails | null> {
    const whereClause: any = { id: orderId };

    // If user is provided, ensure they own the order
    // If no user, only allow access to guest orders (for order confirmation pages)
    if (userId) {
      whereClause.OR = [
        { userId }, // User owns the order
        { AND: [{ userId: null }, { guestEmail: { not: null } }] } // Guest order
      ];
    } else {
      // No auth - only allow guest orders
      whereClause.AND = [{ userId: null }, { guestEmail: { not: null } }];
    }

    return await prisma.order.findFirst({
      where: whereClause,
      include: this.orderInclude,
    });
  }

  // Get user orders (exclude PENDING - those are abandoned/incomplete orders)
  async getUserOrders(
    userId: string,
    page = 1,
    limit = 10
  ): Promise<{
    orders: OrderWithDetails[];
    total: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    // Only show confirmed orders (exclude PENDING which are abandoned orders)
    const whereClause = {
      userId,
      status: {
        not: OrderStatus.PENDING, // Exclude draft/abandoned orders
      },
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        include: this.orderInclude,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.order.count({ where: whereClause }),
    ]);

    return {
      orders,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Get all orders (admin)
  async getAllOrders(
    page = 1,
    limit = 20,
    status?: OrderStatus,
    purchaseType?: PurchaseType
  ): Promise<{
    orders: OrderWithDetails[];
    total: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;
    const where: any = {};

    if (status) where.status = status;
    if (purchaseType) where.purchaseType = purchaseType;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: this.orderInclude,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Confirm order (after payment)
  async confirmOrder(orderId: string, paymentIntentId: string): Promise<OrderWithDetails> {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CONFIRMED,
        payments: {
          create: {
            amountCents: 0, // Will be updated by payment service
            stripePaymentIntentId: paymentIntentId,
            status: "succeeded",
            paidAt: new Date(),
          },
        },
      },
      include: this.orderInclude,
    });

    // Create delivery tracking record
    await this.createDeliveryTracking(order);

    // Send confirmation email
    await this.emailService.sendOrderConfirmation(order as any);

    return order;
  }

  // Update order status
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<OrderWithDetails> {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        actualDeliveryDate: status === OrderStatus.DELIVERED ? new Date() : undefined,
      },
      include: this.orderInclude,
    });

    // Update delivery tracking
    await this.updateDeliveryTracking(orderId, status);

    // Send status update email
    await this.emailService.sendOrderShipped(order as any);

    return order;
  }

  // Get order tracking information
  async getOrderTracking(orderId: string): Promise<DeliveryTracking | null> {
    return await prisma.deliveryTracking.findUnique({
      where: { orderId },
      include: {
        events: {
          where: { isCustomerVisible: true },
          orderBy: { timestamp: "desc" },
        },
      },
    });
  }

  // Private helper methods
  private async validateOrderItems(items: Array<{ productId: string; quantity: number }>) {
    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, inStock: true, stockCount: true, isActive: true },
      });

      if (!product || !product.isActive) {
        throw new Error(`Product ${product?.name || item.productId} is not available`);
      }

      if (!product.inStock) {
        throw new Error(`${product.name} is out of stock`);
      }

      if (product.stockCount < item.quantity) {
        throw new Error(`${product.name} has insufficient stock. Only ${product.stockCount} available, but ${item.quantity} requested`);
      }
    }
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    // Use timestamp + random to ensure uniqueness even with concurrent requests
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");

    const orderNumber = `FLR${dateStr}${timestamp}${random}`;
    return orderNumber;
  }

  private async calculateShipping(
    deliveryType: DeliveryType,
    shippingAddress: {
      firstName: string;
      lastName: string;
      street1: string;
      street2?: string;
      city: string;
      state: string;
      zipCode: string;
      country?: string;
      phone?: string;
    },
    subtotalCents: number,
    items: Array<{ requestedDeliveryDate?: Date }>
  ): Promise<number> {
    // PICKUP is always free, regardless of delivery dates
    if (deliveryType === DeliveryType.PICKUP) {
      return 0;
    }

    // Group items by delivery date to handle multiple delivery charges
    const deliveryGroups = new Map<string, number>();
    items.forEach((item) => {
      const dateKey = item.requestedDeliveryDate
        ? new Date(item.requestedDeliveryDate).toISOString().split('T')[0] // YYYY-MM-DD
        : 'no-date';

      deliveryGroups.set(dateKey, (deliveryGroups.get(dateKey) || 0) + 1);
    });

    const numberOfDeliveries = deliveryGroups.size;

    // Check if delivery zone offers free shipping (only applies if single delivery)
    const deliveryZone = await prisma.deliveryZone.findFirst({
      where: {
        zipCodes: { has: shippingAddress.zipCode },
        isActive: true,
      },
    });

    if (numberOfDeliveries === 1 && deliveryZone?.freeDeliveryThreshold && subtotalCents >= deliveryZone.freeDeliveryThreshold) {
      console.log(`🎁 Free shipping applied (order over $${deliveryZone.freeDeliveryThreshold / 100})`);
      return 0;
    }

    // Use ShippingCalculator's intelligent 4-tier fallback to get base cost
    try {
      const fullAddress = shippingAddress.street2
        ? `${shippingAddress.street1}, ${shippingAddress.street2}, ${shippingAddress.city}`
        : `${shippingAddress.street1}, ${shippingAddress.city}`;

      const shippingResult = await this.shippingCalculator.calculate({
        deliveryPostcode: shippingAddress.zipCode,
        deliverySuburb: shippingAddress.city,
        deliveryAddress: fullAddress,
        orderValueCents: subtotalCents,
        weightKg: 1.0, // TODO: Calculate actual weight based on products
      });

      console.log(`💰 Shipping calculated via ${shippingResult.method}: $${(shippingResult.costCents / 100).toFixed(2)}, ETA: ${shippingResult.estimatedDays} days`);

      // Base cost per delivery from calculator
      const costPerDelivery = shippingResult.costCents;

      // Total shipping = cost per delivery × number of unique delivery dates
      const totalShippingCents = costPerDelivery * numberOfDeliveries;

      if (numberOfDeliveries > 1) {
        console.log(`📦 Multiple deliveries (${numberOfDeliveries}): $${(costPerDelivery / 100).toFixed(2)} × ${numberOfDeliveries} = $${(totalShippingCents / 100).toFixed(2)}`);
      }

      return totalShippingCents;

    } catch (error) {
      // If ShippingCalculator fails completely (shouldn't happen with 4-tier fallback),
      // use absolute emergency fallback
      console.error('❌ ShippingCalculator failed unexpectedly:', error);

      const emergencyFallbackCents = 899; // $8.99 standard delivery
      const totalShippingCents = emergencyFallbackCents * numberOfDeliveries;

      console.warn(`⚠️  Using emergency fallback: $${(totalShippingCents / 100).toFixed(2)}`);
      return totalShippingCents;
    }
  }

  private async createDeliveryTracking(order: OrderWithDetails): Promise<void> {
    const trackingNumber = await this.generateTrackingNumber();

    await prisma.deliveryTracking.create({
      data: {
        orderId: order.id,
        trackingNumber,
        carrierName: "Flora Express",
        status: "PREPARING",
        estimatedDelivery: order.requestedDeliveryDate,
        events: {
          create: {
            timestamp: new Date(),
            status: "ORDER_PLACED",
            description: "Order has been placed and is being prepared",
            location: "Flora Marketplace",
          },
        },
      },
    });
  }

  private async updateDeliveryTracking(orderId: string, status: OrderStatus): Promise<void> {
    const trackingStatus = this.trackingStatusMap[status];
    if (!trackingStatus) return;

    const tracking = await prisma.deliveryTracking.findUnique({
      where: { orderId },
    });

    if (tracking) {
      await prisma.deliveryTracking.update({
        where: { orderId },
        data: {
          status: trackingStatus,
          actualDelivery: status === OrderStatus.DELIVERED ? new Date() : undefined,
        },
      });

      // Add tracking event
      await prisma.trackingEvent.create({
        data: {
          trackingId: tracking.id,
          timestamp: new Date(),
          status: trackingStatus,
          description: this.getTrackingDescription(status),
          location: status === OrderStatus.DELIVERED ? "Delivered" : "Flora Express",
        },
      });
    }
  }

  private async generateTrackingNumber(): Promise<string> {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `FLR${timestamp.slice(-6)}${random}`;
  }

  private getTrackingDescription(status: OrderStatus): string {
    return this.statusDescriptions[status] || "Order status updated";
  }
}
