import { Subscription, SubscriptionStatus } from '@prisma/client';

// Mock Prisma with inline jest.fn() calls
jest.mock('@prisma/client', () => {
  const mockUser = {
    findUnique: jest.fn(),
  };

  const mockSubscription = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };

  const mockBillingEvent = {
    create: jest.fn(),
  };

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: mockUser,
      subscription: mockSubscription,
      subscriptionBillingEvent: mockBillingEvent,
    })),
    SubscriptionStatus: {
      ACTIVE: 'ACTIVE',
      PAUSED: 'PAUSED',
      PAYMENT_FAILED: 'PAYMENT_FAILED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
    },
  };
});

// Mock Stripe with inline jest.fn() calls
jest.mock('stripe', () => {
  const mockSetupIntents = {
    create: jest.fn(),
  };

  const mockPaymentIntents = {
    create: jest.fn(),
  };

  const mockCustomers = {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
  };

  const mockPaymentMethods = {
    attach: jest.fn(),
  };

  return jest.fn().mockImplementation(() => ({
    setupIntents: mockSetupIntents,
    paymentIntents: mockPaymentIntents,
    customers: mockCustomers,
    paymentMethods: mockPaymentMethods,
  }));
});

// Mock EmailService
jest.mock('../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Import the service AFTER mocks are set up
import BillingService from '../../services/subscription/billingService';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

describe('BillingService Tests', () => {
  let billingService: BillingService;
  let mockPrisma: any;
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();
    billingService = new BillingService();

    // Get the mock instances
    mockPrisma = new PrismaClient();
    mockStripe = new Stripe('test_key' as any);
  });

  describe('createSetupIntent', () => {
    test('should create SetupIntent for new customer', async () => {
      const userId = 'auth0|user123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '0412345678',
      });

      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_test123',
        email: 'user@example.com',
      });

      mockStripe.setupIntents.create.mockResolvedValue({
        id: 'seti_test123',
        client_secret: 'seti_test123_secret_test',
      });

      const result = await billingService.createSetupIntent(userId);

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        name: 'John Doe',
        phone: '0412345678',
        metadata: { userId },
      });

      expect(mockStripe.setupIntents.create).toHaveBeenCalledWith({
        customer: 'cus_test123',
        payment_method_types: ['card'],
        usage: 'off_session', // Critical for recurring billing
      });

      expect(result).toEqual({ clientSecret: 'seti_test123_secret_test' });
    });

    test('should reuse existing Stripe customer', async () => {
      const userId = 'auth0|user123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
      });

      mockPrisma.subscription.findFirst.mockResolvedValue({
        stripeCustomerId: 'cus_existing123',
      });

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_existing123',
        deleted: false,
      });

      mockStripe.setupIntents.create.mockResolvedValue({
        id: 'seti_test123',
        client_secret: 'seti_test123_secret_test',
      });

      await billingService.createSetupIntent(userId);

      expect(mockStripe.customers.create).not.toHaveBeenCalled();
      expect(mockStripe.customers.retrieve).toHaveBeenCalledWith('cus_existing123');
    });
  });

  describe('chargeOffSession', () => {
    test('should charge saved payment method successfully', async () => {
      const subscription = {
        id: 'sub_test123',
        userId: 'auth0|user123',
        type: 'RECURRING_MONTHLY',
        stripeCustomerId: 'cus_test123',
        stripePaymentMethodId: 'pm_test123',
      } as Subscription;

      const amountCents = 5999; // $59.99

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_test123',
        status: 'succeeded',
        amount: amountCents,
      });

      const result = await billingService.chargeOffSession(
        subscription,
        amountCents,
        { subscriptionId: subscription.id, renewalDate: '2025-01-01' }
      );

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: amountCents,
        currency: 'aud',
        customer: 'cus_test123',
        payment_method: 'pm_test123',
        off_session: true,
        confirm: true,
        metadata: {
          subscriptionId: 'sub_test123',
          userId: 'auth0|user123',
          subscriptionType: 'RECURRING_MONTHLY',
          renewalDate: '2025-01-01',
        },
        description: 'Flora subscription renewal: RECURRING_MONTHLY',
      });

      expect(result.id).toBe('pi_test123');
    });

    test('should throw error if subscription missing payment info', async () => {
      const subscription = {
        id: 'sub_test123',
        stripeCustomerId: null,
        stripePaymentMethodId: null,
      } as any;

      await expect(
        billingService.chargeOffSession(subscription, 5999, {})
      ).rejects.toThrow('Subscription missing payment method information');
    });
  });

  describe('handlePaymentFailure', () => {
    test('should schedule retry for first failure', async () => {
      const subscription = {
        id: 'sub_test123',
        userId: 'auth0|user123',
        failedPaymentCount: 0,
      } as Subscription;

      const error = {
        message: 'Your card was declined.',
        code: 'card_declined',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'auth0|user123',
        email: 'user@example.com',
      });

      mockPrisma.subscription.update.mockResolvedValue({});
      mockPrisma.subscriptionBillingEvent.create.mockResolvedValue({});

      await billingService.handlePaymentFailure(subscription, error);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub_test123' },
        data: expect.objectContaining({
          failedPaymentCount: 1,
          lastBillingError: 'Your card was declined.',
          status: 'PAYMENT_FAILED',
          nextRetryDate: expect.any(Date), // 3 days from now
        }),
      });

      expect(mockPrisma.subscriptionBillingEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subscriptionId: 'sub_test123',
          eventType: 'RENEWAL_FAILED',
          errorCode: 'card_declined',
        }),
      });
    });

    test('should expire subscription after 3 failures', async () => {
      const subscription = {
        id: 'sub_test123',
        userId: 'auth0|user123',
        failedPaymentCount: 2, // This will be the 3rd failure
      } as Subscription;

      const error = {
        message: 'Insufficient funds.',
        code: 'insufficient_funds',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'auth0|user123',
        email: 'user@example.com',
      });

      mockPrisma.subscription.update.mockResolvedValue({});
      mockPrisma.subscriptionBillingEvent.create.mockResolvedValue({});

      await billingService.handlePaymentFailure(subscription, error);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub_test123' },
        data: expect.objectContaining({
          failedPaymentCount: 3,
          status: 'EXPIRED', // No more retries
          nextRetryDate: null,
        }),
      });

      expect(mockPrisma.subscriptionBillingEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'SUBSCRIPTION_EXPIRED',
        }),
      });
    });
  });

  describe('attachPaymentMethodToSubscription', () => {
    test('should attach payment method and update subscription', async () => {
      const subscriptionId = 'sub_test123';
      const paymentMethodId = 'pm_test123';

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        userId: 'auth0|user123',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'auth0|user123',
        email: 'user@example.com',
      });

      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_test123',
      });

      mockStripe.paymentMethods.attach.mockResolvedValue({});
      mockStripe.customers.update.mockResolvedValue({});
      mockPrisma.subscription.update.mockResolvedValue({});

      await billingService.attachPaymentMethodToSubscription(
        subscriptionId,
        paymentMethodId
      );

      expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith('pm_test123', {
        customer: 'cus_test123',
      });

      expect(mockStripe.customers.update).toHaveBeenCalledWith('cus_test123', {
        invoice_settings: {
          default_payment_method: 'pm_test123',
        },
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: {
          stripeCustomerId: 'cus_test123',
          stripePaymentMethodId: 'pm_test123',
        },
      });
    });
  });
});
