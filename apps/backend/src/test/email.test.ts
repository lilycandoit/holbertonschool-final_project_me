import { EmailService } from '../services/EmailService';
import { User, Order } from '@prisma/client';

// Create a mock send function that we can track
const mockSendFunction = jest.fn().mockResolvedValue({ id: 'test-email-id' });

// Mock the Resend library
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: mockSendFunction,
      },
    })),
  };
});

describe('EmailService Tests', () => {
  let emailService: EmailService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockSendFunction.mockClear();

    // Mock environment variables
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.FROM_EMAIL = 'test@flora.com';

    // Create EmailService instance (Resend is mocked)
    emailService = new EmailService();
  });

  describe('constructor', () => {
    test('should initialize with RESEND_API_KEY', () => {
      expect(emailService).toBeDefined();
    });

    test('should throw error when RESEND_API_KEY is missing', () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SMTP_PASS;

      expect(() => new EmailService()).toThrow('RESEND_API_KEY is required');
    });

    test('should use FROM_EMAIL from environment', () => {
      process.env.FROM_EMAIL = 'custom@flora.com';
      const service = new EmailService();
      expect(service).toBeDefined();
    });
  });

  describe('sendWelcomeEmail', () => {
    test('should send welcome email to user with name', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: null,
        role: 'CUSTOMER' as any,
        favoriteColors: ['RED', 'BLUE'],
        favoriteOccasions: ['BIRTHDAY', 'ANNIVERSARY'],
        favoriteMoods: ['ROMANTIC', 'CHEERFUL'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await emailService.sendWelcomeEmail(mockUser);

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Flora Marketplace <test@flora.com>',
          to: 'user@example.com',
          subject: 'Welcome to Flora!',
          html: expect.stringContaining('Dear John'),
        })
      );
    });

    test('should send welcome email to user without name', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        phone: null,
        role: 'CUSTOMER' as any,
        favoriteColors: [],
        favoriteOccasions: [],
        favoriteMoods: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await emailService.sendWelcomeEmail(mockUser);

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Flora Marketplace <test@flora.com>',
          to: 'user@example.com',
          subject: 'Welcome to Flora!',
          html: expect.stringContaining('Dear Customer'),
        })
      );
    });

    test('should include personalization for user preferences', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'user@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: null,
        role: 'CUSTOMER' as any,
        favoriteColors: ['PINK'],
        favoriteOccasions: ['WEDDING'],
        favoriteMoods: ['ELEGANT'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await emailService.sendWelcomeEmail(mockUser);

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('pink'),
        })
      );
    });
  });

  describe('sendOrderConfirmation', () => {
    test('should send order confirmation to authenticated user', async () => {
      const mockOrder: any = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        userId: 'user-123',
        guestEmail: null,
        totalCents: 5000,
        subtotalCents: 4500,
        shippingFirstName: 'John',
        shippingLastName: 'Doe',
        shippingStreet1: '123 Main St',
        shippingStreet2: null,
        shippingCity: 'Melbourne',
        shippingState: 'VIC',
        shippingZipCode: '3000',
        shippingCountry: 'AU',
        billingFirstName: 'John',
        billingLastName: 'Doe',
        billingStreet1: '123 Main St',
        billingStreet2: null,
        billingCity: 'Melbourne',
        billingState: 'VIC',
        billingZipCode: '3000',
        billingCountry: 'AU',
        deliveryType: 'STANDARD',
        createdAt: new Date(),
        user: {
          id: 'user-123',
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
        items: [],
      };

      await emailService.sendOrderConfirmation(mockOrder);

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Flora Marketplace <test@flora.com>',
          to: 'user@example.com',
          subject: 'Order Confirmation #ORD-001',
          html: expect.stringContaining('ORDER CONFIRMATION'),
        })
      );
    });

    test('should send order confirmation to guest user', async () => {
      const mockOrder: any = {
        id: 'order-123',
        orderNumber: 'ORD-002',
        userId: null,
        guestEmail: 'guest@example.com',
        totalCents: 3000,
        subtotalCents: 2500,
        shippingFirstName: 'Jane',
        shippingLastName: 'Guest',
        shippingStreet1: '456 Oak Ave',
        shippingStreet2: null,
        shippingCity: 'Melbourne',
        shippingState: 'VIC',
        shippingZipCode: '3001',
        shippingCountry: 'AU',
        billingFirstName: 'Jane',
        billingLastName: 'Guest',
        billingStreet1: '456 Oak Ave',
        billingStreet2: null,
        billingCity: 'Melbourne',
        billingState: 'VIC',
        billingZipCode: '3001',
        billingCountry: 'AU',
        deliveryType: 'STANDARD',
        createdAt: new Date(),
        user: null,
        items: [],
      };

      await emailService.sendOrderConfirmation(mockOrder);

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'guest@example.com',
          subject: 'Order Confirmation #ORD-002',
        })
      );
    });

    test('should not send if no email found', async () => {
      const mockOrder: any = {
        id: 'order-123',
        orderNumber: 'ORD-003',
        userId: null,
        guestEmail: null,
        totalCents: 1000,
        subtotalCents: 900,
        shippingFirstName: 'Test',
        shippingLastName: 'User',
        shippingStreet1: '789 Elm St',
        shippingCity: 'Melbourne',
        shippingState: 'VIC',
        shippingZipCode: '3002',
        deliveryType: 'STANDARD',
        createdAt: new Date(),
        user: null,
        items: [],
      };

      await emailService.sendOrderConfirmation(mockOrder);

      expect(mockSendFunction).not.toHaveBeenCalled();
    });
  });

  describe('sendOrderShipped', () => {
    test('should send shipping notification with tracking number', async () => {
      const mockOrder: any = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        guestEmail: 'user@example.com',
        shippingFirstName: 'John',
        shippingLastName: 'Doe',
        shippingStreet1: '123 Main St',
        shippingStreet2: null,
        shippingCity: 'Melbourne',
        shippingState: 'VIC',
        shippingZipCode: '3000',
        requestedDeliveryDate: new Date('2025-01-15'),
        user: null,
      };

      await emailService.sendOrderShipped(mockOrder, 'TRACK-12345');

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Your Flora Order #ORD-001 Has Shipped!',
          html: expect.stringContaining('TRACK-12345'),
        })
      );
    });

    test('should send shipping notification without tracking number', async () => {
      const mockOrder: any = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        guestEmail: 'user@example.com',
        shippingFirstName: 'John',
        shippingLastName: 'Doe',
        shippingStreet1: '123 Main St',
        shippingCity: 'Melbourne',
        shippingState: 'VIC',
        shippingZipCode: '3000',
        user: null,
      };

      await emailService.sendOrderShipped(mockOrder);

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Your Flora Order #ORD-001 Has Shipped!',
        })
      );
    });
  });

  describe('sendTrackingUpdate', () => {
    test('should send tracking update email', async () => {
      await emailService.sendTrackingUpdate({
        to: 'user@example.com',
        orderNumber: 'ORD-001',
        trackingNumber: 'FLR123456789',
        newStatus: 'IN_TRANSIT',
        trackingUrl: 'https://flora.com/tracking/ORD-001',
        customerName: 'John Doe',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user@example.com'],
          subject: '📦 Delivery Update: ORD-001',
          html: expect.stringContaining('IN_TRANSIT'),
          text: expect.stringContaining('Tracking Number: FLR123456789'),
        })
      );
    });

    test('should send tracking update without customer name', async () => {
      await emailService.sendTrackingUpdate({
        to: 'user@example.com',
        orderNumber: 'ORD-002',
        trackingNumber: 'FLR987654321',
        newStatus: 'DELIVERED',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Hello'),
        })
      );
    });
  });

  describe('sendSubscriptionRenewalSuccess', () => {
    test('should send renewal success email', async () => {
      await emailService.sendSubscriptionRenewalSuccess({
        to: 'user@example.com',
        customerName: 'John Doe',
        subscriptionType: 'Weekly Recurring',
        items: [
          { name: 'Roses', quantity: 2, price: '$25.00' },
          { name: 'Lilies', quantity: 1, price: '$15.00' },
        ],
        totalAmount: '$40.00',
        nextDeliveryDate: '2025-02-01',
        subscriptionUrl: 'https://flora.com/subscriptions/123',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user@example.com'],
          subject: '🌸 Your Flora Subscription Has Been Renewed',
          html: expect.stringContaining('Subscription Renewed'),
        })
      );
    });

    test('should include skipped items in renewal email', async () => {
      await emailService.sendSubscriptionRenewalSuccess({
        to: 'user@example.com',
        customerName: 'Jane Smith',
        subscriptionType: 'Monthly Recurring',
        items: [{ name: 'Roses', quantity: 1, price: '$20.00' }],
        skippedItems: [{ name: 'Tulips', reason: 'Out of stock' }],
        totalAmount: '$20.00',
        nextDeliveryDate: '2025-03-01',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Items Unavailable'),
        })
      );
    });
  });

  describe('sendSubscriptionPaymentFailed', () => {
    test('should send payment failed email for attempt 1', async () => {
      await emailService.sendSubscriptionPaymentFailed({
        to: 'user@example.com',
        customerName: 'John Doe',
        subscriptionType: 'Weekly Recurring',
        attempt: 1,
        nextRetryDate: '2025-01-18',
        updatePaymentUrl: 'https://flora.com/payment-update',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '⚠️ Payment Issue - Subscription Renewal Attempt 1/3',
          html: expect.stringMatching(/Attempt.*1 of 3/),
        })
      );
    });

    test('should send payment failed email for final attempt', async () => {
      await emailService.sendSubscriptionPaymentFailed({
        to: 'user@example.com',
        customerName: 'John Doe',
        subscriptionType: 'Weekly Recurring',
        attempt: 3,
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '⚠️ Payment Issue - Subscription Renewal Attempt 3/3',
          html: expect.stringContaining('will be cancelled'),
        })
      );
    });
  });

  describe('sendSubscriptionExpired', () => {
    test('should send subscription expired email', async () => {
      await emailService.sendSubscriptionExpired({
        to: 'user@example.com',
        customerName: 'John Doe',
        subscriptionType: 'Weekly Recurring',
        reactivateUrl: 'https://flora.com/reactivate',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your Flora Subscription Has Expired',
          html: expect.stringContaining('Subscription Expired'),
        })
      );
    });
  });

  describe('sendSubscriptionAllItemsUnavailable', () => {
    test('should send all items unavailable email', async () => {
      await emailService.sendSubscriptionAllItemsUnavailable({
        to: 'user@example.com',
        customerName: 'Jane Smith',
        subscriptionType: 'Monthly Recurring',
        unavailableItems: [
          { name: 'Roses', reason: 'Out of stock' },
          { name: 'Lilies', reason: 'Seasonal unavailable' },
        ],
        nextAttemptDate: '2025-02-15',
        manageUrl: 'https://flora.com/subscriptions/456',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '📦 Subscription Renewal Skipped - Items Unavailable',
          html: expect.stringContaining('Subscription Renewal Skipped'),
        })
      );
    });
  });

  describe('sendEmail (generic method)', () => {
    test('should send custom email', async () => {
      await emailService.sendEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test Text',
      });

      expect(mockSendFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Flora Marketplace <test@flora.com>',
          to: ['user@example.com'],
          subject: 'Test Subject',
          html: '<p>Test HTML</p>',
          text: 'Test Text',
        })
      );
    });
  });
});
