 import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { EmailService } from "./EmailService";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const prisma = new PrismaClient();

export class PaymentService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  async createPaymentIntent(data: {
    amount: number;
    currency?: string;
    orderId: string;
    customerId?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    const { amount, currency = "usd", orderId, customerId, metadata } = data;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      customer: customerId,
      metadata: {
        orderId,
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return paymentIntent;
  }

  async createCustomer(data: {
    email: string;
    name?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    };
  }): Promise<Stripe.Customer> {
    const customer = await stripe.customers.create(data);
    return customer;
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      return customer as Stripe.Customer;
    } catch (error) {
      return null;
    }
  }

  async updateCustomer(customerId: string, data: Stripe.CustomerUpdateParams): Promise<Stripe.Customer> {
    const customer = await stripe.customers.update(customerId, data);
    return customer;
  }

  async createSubscription(data: {
    customerId: string;
    priceId: string;
    trialPeriodDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    const { customerId, priceId, trialPeriodDays, metadata } = data;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialPeriodDays,
      metadata,
      expand: ["latest_invoice.payment_intent"],
    });

    return subscription;
  }

  // NEW: Safe subscription creation with payment setup for Flora subscriptions
  async createSubscriptionWithPaymentSetup(data: {
    email: string;
    name: string;
    subscriptionType: 'RECURRING_WEEKLY' | 'RECURRING_MONTHLY' | 'SPONTANEOUS';
    floraSubscriptionId: string;
    metadata?: Record<string, string>;
  }): Promise<{
    subscription: Stripe.Subscription;
    clientSecret: string;
  }> {
    const { email, name, subscriptionType, floraSubscriptionId, metadata } = data;

    // Step 1: Create or get customer
    let customer: Stripe.Customer;
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          floraSubscriptionId,
          ...metadata,
        },
      });
    }

    // Step 2: Get price ID for subscription type
    const priceId = this.getSubscriptionPriceId(subscriptionType);

    // Step 3: Create subscription with payment setup
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        floraSubscriptionId,
        subscriptionType,
        ...metadata,
      },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return {
      subscription,
      clientSecret: paymentIntent.client_secret!,
    };
  }

  // Helper: Map Flora subscription types to Stripe price IDs
  private getSubscriptionPriceId(subscriptionType: string): string {
    // TODO: Replace with actual Stripe price IDs once products are created
    const priceMapping = {
      'RECURRING_WEEKLY': process.env.STRIPE_WEEKLY_PRICE_ID || 'price_weekly_placeholder',
      'RECURRING_MONTHLY': process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_placeholder',
      'SPONTANEOUS': process.env.STRIPE_SPONTANEOUS_PRICE_ID || 'price_spontaneous_placeholder',
    };

    return priceMapping[subscriptionType as keyof typeof priceMapping];
  }

  async cancelSubscription(localSubscriptionId: string): Promise<Stripe.Subscription> {
    const localSubscription = await prisma.subscription.findUnique({
      where: { id: localSubscriptionId },
    });

    if (!localSubscription?.stripeSubscriptionId) {
      throw new Error("Subscription not found or not linked to Stripe");
    }

    const subscription = await stripe.subscriptions.cancel(localSubscription.stripeSubscriptionId);
    return subscription;
  }

  async pauseSubscription(localSubscriptionId: string): Promise<Stripe.Subscription> {
    const localSubscription = await prisma.subscription.findUnique({
      where: { id: localSubscriptionId },
    });

    if (!localSubscription?.stripeSubscriptionId) {
      throw new Error("Subscription not found or not linked to Stripe");
    }

    const subscription = await stripe.subscriptions.update(localSubscription.stripeSubscriptionId, {
      pause_collection: {
        behavior: "mark_uncollectible",
      },
    });
    return subscription;
  }

  async resumeSubscription(localSubscriptionId: string): Promise<Stripe.Subscription> {
    const localSubscription = await prisma.subscription.findUnique({
      where: { id: localSubscriptionId },
    });

    if (!localSubscription?.stripeSubscriptionId) {
      throw new Error("Subscription not found or not linked to Stripe");
    }

    const subscription = await stripe.subscriptions.update(localSubscription.stripeSubscriptionId, {
      pause_collection: null,
    });
    return subscription;
  }

  async handleWebhook(body: Buffer, signature: string, endpointSecret: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err}`);
    }

    switch (event.type) {
      case "payment_intent.succeeded":
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "customer.subscription.created":
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    let orderId = paymentIntent.metadata.orderId;
    console.log(`💳 Payment intent succeeded: ${paymentIntent.id}, orderId: ${orderId || "NOT SET"}`);


    // FOR DEMO: Create a test order if none exists
    if (!orderId) {
      console.log("🎯 Creating demo order for webhook testing...");
      const demoOrder = await prisma.order.create({
        data: {
          orderNumber: `DEMO-${Date.now()}`,
          purchaseType: "ONE_TIME",
          guestEmail: "demo@flora-test.com",
          guestPhone: "+1234567890",
          shippingFirstName: "Demo",
          shippingLastName: "Customer",
          shippingStreet1: "123 Test Street",
          shippingCity: "Demo City",
          shippingState: "CA",
          shippingZipCode: "12345",
          deliveryType: "STANDARD",
          subtotalCents: paymentIntent.amount - 500,
          shippingCents: 500,
          taxCents: 0,
          totalCents: paymentIntent.amount,
          status: "PENDING",
          deliveryNotes: "Demo order created for webhook testing",
        },
      });
      orderId = demoOrder.id;
      console.log(`✅ Created demo order: ${orderId}`);
    }

    if (orderId) {
      // Use OrderService.confirmOrder() to ensure tracking is created
      const { OrderService } = await import('./OrderService');
      const orderService = new OrderService();

      await orderService.confirmOrder(orderId, paymentIntent.id);
      console.log(`✅ Order confirmed with tracking: ${orderId}`);

      // NOTE: confirmOrder() already sends confirmation email, creates payment, and tracking
      // 📧 Send additional payment confirmation email (optional)
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
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
          },
        });

        if (order) {
          await this.emailService.sendOrderConfirmation(order);
          console.log(`✅ Payment confirmation email sent for order: ${orderId}`);
        }
      } catch (emailError) {
        console.error("❌ Failed to send payment confirmation email:", emailError);
        // Don't throw - payment success shouldn't fail due to email issues
      }
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const orderId = paymentIntent.metadata.orderId;

    if (orderId) {
      // Update order status to cancelled since payment failed
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "CANCELLED",
        },
      });

      // Update or create payment record
      await prisma.payment.upsert({
        where: {
          stripePaymentIntentId: paymentIntent.id,
        },
        create: {
          orderId,
          amountCents: paymentIntent.amount,
          currency: paymentIntent.currency.toUpperCase(),
          stripePaymentIntentId: paymentIntent.id,
          status: "failed",
        },
        update: {
          status: "failed",
        },
      });
    }
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    // Update local subscription record with Stripe subscription ID
    const subscriptionId = subscription.metadata.subscriptionId;

    if (subscriptionId) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          stripeSubscriptionId: subscription.id,
        },
      });
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    // Handle subscription status changes
    const subscriptionId = subscription.metadata.subscriptionId;

    if (subscriptionId) {
      let status: string;

      switch (subscription.status) {
        case "active":
          status = "ACTIVE";
          break;
        case "canceled":
          status = "CANCELLED";
          break;
        case "past_due":
        case "unpaid":
          status = "PAUSED";
          break;
        default:
          status = "ACTIVE";
      }

      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: status as any },
      });
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const subscriptionId = subscription.metadata.subscriptionId;

    if (subscriptionId) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: "CANCELLED",
        },
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // Handle successful subscription payment
    console.log(`Invoice payment succeeded: ${invoice.id}`);
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // Handle failed subscription payment
    console.log(`Invoice payment failed: ${invoice.id}`);
  }

  async getPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    return paymentMethods.data;
  }

  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<Stripe.PaymentMethod> {
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    return paymentMethod;
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);
    return paymentMethod;
  }

  async confirmPayment(paymentIntentId: string, orderId: string): Promise<Stripe.PaymentIntent> {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);

    if (paymentIntent.status === "succeeded") {
      // Update order status
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "CONFIRMED",
        },
      });

      // Create or update payment record
      await prisma.payment.upsert({
        where: {
          stripePaymentIntentId: paymentIntentId,
        },
        create: {
          orderId,
          amountCents: paymentIntent.amount,
          currency: paymentIntent.currency.toUpperCase(),
          stripePaymentIntentId: paymentIntentId,
          stripePaymentMethodId: paymentIntent.payment_method as string | undefined,
          status: "succeeded",
          paidAt: new Date(),
        },
        update: {
          stripePaymentMethodId: paymentIntent.payment_method as string | undefined,
          status: "succeeded",
          paidAt: new Date(),
        },
      });
    }

    return paymentIntent;
  }

  async getPaymentById(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      console.error("Error retrieving payment:", error);
      return null;
    }
  }

  // Sync payment details from Stripe to database
  async syncPaymentDetails(orderId: string): Promise<void> {
    try {
      // Get the payment intent from the order's payments
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          payments: true,
        },
      });

      if (!order || !order.payments || order.payments.length === 0) {
        console.log('No payments found for order:', orderId);
        return;
      }

      const payment = order.payments[0];

      // If no Stripe payment intent ID, skip
      if (!payment.stripePaymentIntentId) {
        console.log('No Stripe payment intent ID found');
        return;
      }

      // If payment already has payment method ID, skip
      if (payment.stripePaymentMethodId) {
        console.log('Payment already has payment method ID');
        return;
      }

      // Retrieve payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

      if (!paymentIntent.payment_method) {
        console.log('No payment method attached to payment intent');
        return;
      }

      // Update payment record with payment method ID
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripePaymentMethodId: paymentIntent.payment_method as string,
        },
      });
      console.log(`✅ Synced payment method ID for order ${orderId}`);
    } catch (error) {
      console.error('Error syncing payment details:', error);
    }
  }

  async refundPayment(
    paymentIntentId: string,
    amount?: number,
    reason?: Stripe.RefundCreateParams.Reason
  ): Promise<Stripe.Refund> {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount,
      reason,
    });

    return refund;
  }
}
