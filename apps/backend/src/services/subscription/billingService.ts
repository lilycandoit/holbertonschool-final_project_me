import Stripe from 'stripe';
import { PrismaClient, Subscription } from '@prisma/client';
import { addDays } from 'date-fns';
import { EmailService } from '../EmailService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const prisma = new PrismaClient();

/**
 * BillingService handles Stripe SetupIntent and off-session charging for subscriptions
 *
 * Key responsibilities:
 * - Create SetupIntent for saving payment methods without charging
 * - Charge saved payment methods off-session (without customer interaction)
 * - Handle payment failures and schedule retries
 */
export class BillingService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Create SetupIntent for saving payment method WITHOUT charging
   * Used during subscription creation to save card for future use
   *
   * @param userId - User ID from Auth0
   * @returns clientSecret for frontend Stripe Elements
   */
  async createSetupIntent(userId: string): Promise<{ clientSecret: string }> {
    try {
      // Get or create Stripe customer
      const customer = await this.getOrCreateStripeCustomer(userId);

      // Create SetupIntent with off_session usage
      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
        usage: 'off_session', // Critical: allows future off-session charges
      });

      return { clientSecret: setupIntent.client_secret! };
    } catch (error) {
      console.error('[BillingService] Error creating SetupIntent:', error);
      throw new Error('Failed to create payment setup intent');
    }
  }

  /**
   * Charge saved payment method without customer interaction (off-session)
   *
   * @param subscription - Subscription with stripeCustomerId and stripePaymentMethodId
   * @param amountCents - Amount to charge in cents
   * @param metadata - Order metadata for Stripe dashboard
   * @returns PaymentIntent result
   */
  async chargeOffSession(
    subscription: Subscription,
    amountCents: number,
    metadata: Record<string, string>
  ): Promise<Stripe.PaymentIntent> {
    if (!subscription.stripeCustomerId || !subscription.stripePaymentMethodId) {
      throw new Error('Subscription missing payment method information');
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'aud',
        customer: subscription.stripeCustomerId,
        payment_method: subscription.stripePaymentMethodId,
        off_session: true, // Critical: charge without customer present
        confirm: true, // Charge immediately
        metadata: {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          subscriptionType: subscription.type,
          ...metadata,
        },
        description: `Flora subscription renewal: ${subscription.type}`,
      });

      return paymentIntent;
    } catch (error) {
      // Payment failed - will be handled by handlePaymentFailure
      throw error;
    }
  }

  /**
   * Handle failed payment, update retry tracking, send email
   *
   * Retry schedule:
   * - Attempt 1: Immediate (at renewal time)
   * - Attempt 2: 3 days later
   * - Attempt 3: 7 days later (final attempt)
   * - After 3 failures: Status = EXPIRED
   *
   * @param subscription - Subscription that failed
   * @param error - Stripe error object
   */
  async handlePaymentFailure(
    subscription: Subscription,
    error: any
  ): Promise<void> {
    const failedCount = subscription.failedPaymentCount + 1;

    // Calculate next retry date
    let nextRetryDate: Date | null = null;
    let newStatus: 'PAYMENT_FAILED' | 'EXPIRED' = 'PAYMENT_FAILED';

    if (failedCount === 1) {
      // First failure: retry in 3 days
      nextRetryDate = addDays(new Date(), 3);
    } else if (failedCount === 2) {
      // Second failure: retry in 4 more days (7 days total from first failure)
      nextRetryDate = addDays(new Date(), 4);
    } else {
      // Third failure: no more retries, subscription expires
      newStatus = 'EXPIRED';
    }

    try {
      // Update subscription with failure tracking
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          failedPaymentCount: failedCount,
          lastBillingAttempt: new Date(),
          lastBillingError: error.message,
          nextRetryDate,
          status: newStatus,
        },
      });

      // Log billing event
      await prisma.subscriptionBillingEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: failedCount >= 3 ? 'SUBSCRIPTION_EXPIRED' : 'RENEWAL_FAILED',
          errorCode: error.code || 'unknown_error',
          errorMessage: error.message,
          createdAt: new Date(),
        },
      });

      // Send appropriate failure email
      await this.sendFailureEmail(subscription, failedCount, error);

      console.log(
        `[BillingService] Payment failure handled for subscription ${subscription.id}. ` +
        `Attempt ${failedCount}/3. Status: ${newStatus}`
      );
    } catch (dbError) {
      console.error('[BillingService] Error updating subscription after payment failure:', dbError);
      throw dbError;
    }
  }

  /**
   * Get or create Stripe customer for user
   */
  private async getOrCreateStripeCustomer(userId: string): Promise<Stripe.Customer> {
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if user already has subscriptions with Stripe customer ID
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        stripeCustomerId: { not: null },
      },
    });

    if (existingSubscription?.stripeCustomerId) {
      // Verify customer exists in Stripe
      try {
        const customer = await stripe.customers.retrieve(existingSubscription.stripeCustomerId);
        if (!customer.deleted) {
          return customer as Stripe.Customer;
        }
      } catch (error) {
        console.log('[BillingService] Existing Stripe customer not found, creating new one');
      }
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : undefined,
      phone: user.phone || undefined,
      metadata: {
        userId: user.id,
      },
    });

    return customer;
  }

  /**
   * Attach payment method to customer and update subscription
   */
  async attachPaymentMethodToSubscription(
    subscriptionId: string,
    paymentMethodId: string
  ): Promise<void> {
    try {
      // Get subscription with user
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { user: true },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Get or create Stripe customer
      const customer = await this.getOrCreateStripeCustomer(subscription.userId);

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id,
      });

      // Set as default payment method
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Update subscription record
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          stripeCustomerId: customer.id,
          stripePaymentMethodId: paymentMethodId,
        },
      });

      console.log(`[BillingService] Payment method attached to subscription ${subscriptionId}`);
    } catch (error) {
      console.error('[BillingService] Error attaching payment method:', error);
      throw new Error('Failed to attach payment method to subscription');
    }
  }

  /**
   * Send appropriate failure email based on attempt number
   */
  private async sendFailureEmail(
    subscription: Subscription,
    attemptNumber: number,
    error: any
  ): Promise<void> {
    try {
      // Get user for email
      const user = await prisma.user.findUnique({
        where: { id: subscription.userId },
      });

      if (!user || !user.email) {
        console.error('[BillingService] Cannot send failure email: user not found or no email');
        return;
      }

      let subject: string;
      let message: string;

      if (attemptNumber === 1) {
        subject = 'Payment issue with your Flora subscription';
        message = `
          <h1>Payment Issue</h1>
          <p>We couldn't process your subscription payment.</p>

          <p><strong>We'll automatically retry in 3 days.</strong></p>

          <p>If you'd like to update your payment method, please visit:</p>
          <a href="${process.env.FRONTEND_URL}/subscriptions">Manage Subscription</a>

          <p>Error: ${error.message}</p>
          <p>Attempt: 1 of 3</p>
        `;
      } else if (attemptNumber === 2) {
        subject = 'Second attempt: Payment issue with your Flora subscription';
        message = `
          <h1>Payment Issue - Second Attempt</h1>
          <p>We tried to process your subscription payment again, but it failed.</p>

          <p><strong>We'll make one final attempt in 4 days.</strong></p>

          <p>Please update your payment method to avoid subscription cancellation:</p>
          <a href="${process.env.FRONTEND_URL}/subscriptions">Update Payment Method</a>

          <p>Error: ${error.message}</p>
          <p>Attempt: 2 of 3</p>
        `;
      } else {
        // Attempt 3 or expired
        subject = 'Your Flora subscription has been cancelled';
        message = `
          <h1>Subscription Cancelled</h1>
          <p>After 3 failed payment attempts, your subscription has been cancelled.</p>

          <p>You can create a new subscription anytime:</p>
          <a href="${process.env.FRONTEND_URL}/products">Browse Products</a>

          <p>We'd love to have you back!</p>

          <p>Last error: ${error.message}</p>
        `;
      }

      await this.emailService.sendEmail({
        to: user.email,
        subject,
        html: message,
      });

      console.log(`[BillingService] Failure email sent to ${user.email} (attempt ${attemptNumber})`);
    } catch (emailError) {
      console.error('[BillingService] Error sending failure email:', emailError);
      // Don't throw - email failure shouldn't block payment processing
    }
  }
}

export default BillingService;
