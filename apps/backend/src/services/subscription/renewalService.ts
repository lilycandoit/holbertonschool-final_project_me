import { PrismaClient, Subscription, SubscriptionType, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import BillingService from './billingService';
import InventoryValidator, { AvailableItem, SkippedItem } from './inventoryValidator';
import { EmailService } from '../EmailService';
import OrderService from '../OrderService';

const prisma = new PrismaClient();

/**
 * RenewalService orchestrates the complete subscription renewal process
 *
 * Workflow:
 * 1. Find subscriptions due for renewal
 * 2. Validate inventory (check product availability)
 * 3. Skip if ALL items unavailable
 * 4. Calculate total based on CURRENT prices
 * 5. Charge customer off-session
 * 6. Create Order record if payment succeeds
 * 7. Update subscription dates
 * 8. Log billing event
 * 9. Send email (success or failure)
 */
export class RenewalService {
  private billingService: BillingService;
  private inventoryValidator: InventoryValidator;
  private emailService: EmailService;
  private orderService: OrderService;

  constructor() {
    this.billingService = new BillingService();
    this.inventoryValidator = new InventoryValidator();
    this.emailService = new EmailService();
    this.orderService = new OrderService();
  }

  /**
   * Process all subscriptions due for renewal today
   * Called by cron job daily at 2 AM
   */
  async processRenewals(): Promise<void> {
    const today = new Date();
    console.log(`\n[RenewalService] ==========================================`);
    console.log(`[RenewalService] Starting subscription renewal processing`);
    console.log(`[RenewalService] Date: ${today.toISOString()}`);
    console.log(`[RenewalService] ==========================================\n`);

    try {
      // Find subscriptions due for renewal
      const subscriptions = await prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          nextDeliveryDate: { lte: today },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          user: true,
        },
      });

      console.log(`[RenewalService] Found ${subscriptions.length} subscriptions due for renewal\n`);

      if (subscriptions.length === 0) {
        console.log(`[RenewalService] No subscriptions to process. Exiting.\n`);
        return;
      }

      // Process each subscription
      let successCount = 0;
      let failureCount = 0;
      let skippedCount = 0;

      for (const subscription of subscriptions) {
        try {
          console.log(`[RenewalService] ========================================`);
          console.log(`[RenewalService] Processing subscription: ${subscription.id}`);
          console.log(`[RenewalService] User: ${subscription.user.email}`);
          console.log(`[RenewalService] Type: ${subscription.type}`);
          console.log(`[RenewalService] Items: ${subscription.items.length}`);
          console.log(`[RenewalService] ========================================`);

          const result = await this.processSubscriptionRenewal(subscription);

          if (result === 'success') {
            successCount++;
          } else if (result === 'skipped') {
            skippedCount++;
          } else {
            failureCount++;
          }

          console.log(``); // Empty line for readability
        } catch (error) {
          console.error(`[RenewalService] Error processing subscription ${subscription.id}:`, error);
          failureCount++;
        }
      }

      console.log(`\n[RenewalService] ==========================================`);
      console.log(`[RenewalService] Renewal processing complete`);
      console.log(`[RenewalService] Success: ${successCount}, Failed: ${failureCount}, Skipped: ${skippedCount}`);
      console.log(`[RenewalService] ==========================================\n`);
    } catch (error) {
      console.error('[RenewalService] Fatal error during renewal processing:', error);
      throw error;
    }
  }

  /**
   * Process single subscription renewal
   * Returns 'success', 'failed', or 'skipped'
   */
  async processSubscriptionRenewal(subscription: Subscription & { items: any[], user: any }): Promise<string> {
    try {
      // Step 1: Validate inventory
      const { availableItems, skippedItems, totalCents } =
        await this.inventoryValidator.validateSubscriptionItems(subscription.items);

      // Step 2: Skip if ALL items unavailable
      if (availableItems.length === 0) {
        console.log(`[RenewalService] All items unavailable for subscription ${subscription.id}. Skipping renewal.`);
        await this.handleAllItemsUnavailable(subscription, skippedItems);
        return 'skipped';
      }

      // Step 3: Calculate shipping cost (simplified - using subscription delivery type)
      const shippingCostCents = this.calculateShippingCost(subscription.deliveryType);
      const finalTotalCents = totalCents + shippingCostCents;

      console.log(`[RenewalService] Subtotal: $${(totalCents / 100).toFixed(2)}`);
      console.log(`[RenewalService] Shipping: $${(shippingCostCents / 100).toFixed(2)}`);
      console.log(`[RenewalService] Total: $${(finalTotalCents / 100).toFixed(2)}`);

      // Step 4: Charge off-session
      try {
        console.log(`[RenewalService] Charging payment method...`);

        const paymentIntent = await this.billingService.chargeOffSession(
          subscription,
          finalTotalCents,
          {
            subscriptionId: subscription.id,
            userId: subscription.userId,
            renewalDate: new Date().toISOString(),
          }
        );

        console.log(`[RenewalService] Payment successful! PaymentIntent: ${paymentIntent.id}`);

        // Step 5: Create Order record
        const order = await this.createRenewalOrder(
          subscription,
          availableItems,
          totalCents,
          shippingCostCents,
          finalTotalCents,
          paymentIntent.id
        );

        console.log(`[RenewalService] Order created: ${order.id}`);

        // Step 6: Update subscription for next cycle
        const nextDate = this.calculateNextDelivery(
          subscription.nextDeliveryDate || new Date(),
          subscription.type
        );

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            nextDeliveryDate: nextDate,
            lastDeliveryDate: new Date(),
            failedPaymentCount: 0, // Reset on success
            lastBillingAttempt: new Date(),
            lastBillingError: null,
            nextRetryDate: null,
          },
        });

        console.log(`[RenewalService] Next delivery scheduled: ${nextDate.toDateString()}`);

        // Step 7: Log billing event
        await prisma.subscriptionBillingEvent.create({
          data: {
            subscriptionId: subscription.id,
            eventType: 'RENEWAL_SUCCESS',
            amountCents: finalTotalCents,
            stripePaymentIntentId: paymentIntent.id,
            orderId: order.id,
            skippedItems: skippedItems.length > 0 ? JSON.parse(JSON.stringify(skippedItems)) : null,
            createdAt: new Date(),
          },
        });

        // Step 8: Send confirmation email
        await this.sendRenewalSuccessEmail(subscription, order, skippedItems, availableItems);

        console.log(`[RenewalService] ✅ Renewal successful for subscription ${subscription.id}`);
        return 'success';
      } catch (paymentError) {
        // Payment failed - handle retry
        console.error(`[RenewalService] Payment failed for subscription ${subscription.id}:`, paymentError);

        await this.billingService.handlePaymentFailure(
          subscription,
          paymentError
        );

        console.log(`[RenewalService] ❌ Renewal failed for subscription ${subscription.id}`);
        return 'failed';
      }
    } catch (error) {
      console.error(`[RenewalService] Unexpected error processing subscription ${subscription.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle case where all items are unavailable
   */
  private async handleAllItemsUnavailable(
    subscription: Subscription,
    skippedItems: SkippedItem[]
  ): Promise<void> {
    // Reschedule to next cycle without charging
    const nextDate = this.calculateNextDelivery(
      subscription.nextDeliveryDate || new Date(),
      subscription.type
    );

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { nextDeliveryDate: nextDate },
    });

    // Log event
    await prisma.subscriptionBillingEvent.create({
      data: {
        subscriptionId: subscription.id,
        eventType: 'SKIPPED_ITEM',
        skippedItems: JSON.parse(JSON.stringify(skippedItems)),
        createdAt: new Date(),
      },
    });

    // Send email notification
    await this.sendAllItemsUnavailableEmail(subscription, skippedItems, nextDate);
  }

  /**
   * Create Order record for successful renewal
   */
  private async createRenewalOrder(
    subscription: Subscription & { user: any },
    availableItems: AvailableItem[],
    subtotalCents: number,
    shippingCents: number,
    totalCents: number,
    stripePaymentIntentId: string
  ): Promise<any> {
    // Generate unique order number
    const orderNumber = `SUB-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: subscription.userId,
        purchaseType: 'SUBSCRIPTION',
        subscriptionId: subscription.id,
        subscriptionType: subscription.type,
        status: 'CONFIRMED', // Payment already succeeded

        // Pricing
        subtotalCents,
        shippingCents,
        taxCents: 0, // Tax calculation can be added later
        discountCents: 0,
        totalCents,

        // Delivery
        deliveryType: subscription.deliveryType,
        deliveryNotes: subscription.deliveryNotes,

        // Shipping address (inline from subscription)
        shippingFirstName: subscription.shippingFirstName,
        shippingLastName: subscription.shippingLastName,
        shippingStreet1: subscription.shippingStreet1,
        shippingStreet2: subscription.shippingStreet2,
        shippingCity: subscription.shippingCity,
        shippingState: subscription.shippingState,
        shippingZipCode: subscription.shippingZipCode,
        shippingCountry: subscription.shippingCountry,
        shippingPhone: subscription.shippingPhone,

        // Order items (only available items)
        items: {
          create: availableItems.map(({ item, product }) => ({
            productId: product.id,
            quantity: item.quantity,
            priceCents: product.priceCents, // Current price
          })),
        },

        // Payment record
        payments: {
          create: {
            amountCents: totalCents,
            currency: 'AUD',
            status: 'succeeded',
            stripePaymentIntentId,
            paidAt: new Date(),
          },
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return order;
  }

  /**
   * Calculate next delivery date based on subscription type
   */
  private calculateNextDelivery(currentDate: Date, type: SubscriptionType): Date {
    const nextDelivery = new Date(currentDate);

    switch (type) {
      case SubscriptionType.RECURRING_WEEKLY:
        nextDelivery.setDate(nextDelivery.getDate() + 7);
        break;
      case SubscriptionType.RECURRING_BIWEEKLY:
        nextDelivery.setDate(nextDelivery.getDate() + 14);
        break;
      case SubscriptionType.RECURRING_MONTHLY:
        nextDelivery.setMonth(nextDelivery.getMonth() + 1);
        break;
      case SubscriptionType.RECURRING_QUARTERLY:
        nextDelivery.setMonth(nextDelivery.getMonth() + 3);
        break;
      case SubscriptionType.RECURRING_YEARLY:
        nextDelivery.setFullYear(nextDelivery.getFullYear() + 1);
        break;
      case SubscriptionType.SPONTANEOUS_WEEKLY:
      case SubscriptionType.SPONTANEOUS_BIWEEKLY:
      case SubscriptionType.SPONTANEOUS_MONTHLY:
        // For spontaneous, add base period then randomize within range
        // Simplified version - can be enhanced with proper random date logic
        nextDelivery.setDate(nextDelivery.getDate() + 7); // Default to weekly
        break;
      default:
        throw new Error(`Unsupported subscription type: ${type}`);
    }

    return nextDelivery;
  }

  /**
   * Calculate shipping cost based on delivery type
   * Simplified version - can be enhanced with delivery zone logic
   */
  private calculateShippingCost(deliveryType: string): number {
    switch (deliveryType) {
      case 'STANDARD':
        return 899; // $8.99
      case 'EXPRESS':
        return 1599; // $15.99
      case 'SAME_DAY':
        return 2999; // $29.99
      default:
        return 899;
    }
  }

  /**
   * Send renewal success email
   */
  private async sendRenewalSuccessEmail(
    subscription: Subscription & { user: any },
    order: any,
    skippedItems: SkippedItem[],
    availableItems: AvailableItem[]
  ): Promise<void> {
    try {
      const subject = 'Your Flora subscription delivery is confirmed';

      const itemsList = availableItems
        .map(({ product, item }) => `<li>${product.name} × ${item.quantity} - $${(product.priceCents / 100).toFixed(2)}</li>`)
        .join('');

      const skippedItemsSection = skippedItems.length > 0 ? `
        <h3 style="color: #f59e0b; margin-top: 20px;">⚠️ Note: Some items were unavailable</h3>
        <ul>
          ${skippedItems.map(item => `<li>${item.productName} - ${item.reason}</li>`).join('')}
        </ul>
      ` : '';

      const html = `
        <h1>Subscription Delivery Confirmed</h1>
        <p>Your ${subscription.type} subscription has been renewed.</p>

        <h2>Order Details</h2>
        <p><strong>Order Number:</strong> ${order.orderNumber}</p>
        <p><strong>Amount charged:</strong> $${(order.totalCents / 100).toFixed(2)} AUD</p>

        <h3>Items:</h3>
        <ul>
          ${itemsList}
        </ul>

        ${skippedItemsSection}

        <p><strong>Next delivery:</strong> ${subscription.nextDeliveryDate ? new Date(subscription.nextDeliveryDate).toLocaleDateString() : 'TBD'}</p>

        <p>
          <a href="${process.env.FRONTEND_URL}/orders/${order.id}" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Order</a>
          <a href="${process.env.FRONTEND_URL}/subscriptions" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Manage Subscription</a>
        </p>
      `;

      await this.emailService.sendEmail({
        to: subscription.user.email,
        subject,
        html,
      });

      console.log(`[RenewalService] Success email sent to ${subscription.user.email}`);
    } catch (error) {
      console.error('[RenewalService] Error sending success email:', error);
      // Don't throw - email failure shouldn't block renewal
    }
  }

  /**
   * Send all items unavailable email
   */
  private async sendAllItemsUnavailableEmail(
    subscription: Subscription,
    skippedItems: SkippedItem[],
    nextDate: Date
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: subscription.userId },
      });

      if (!user || !user.email) return;

      const subject = 'Your Flora subscription delivery postponed';

      const html = `
        <h1>Delivery Postponed</h1>
        <p>All items in your subscription are currently unavailable:</p>

        <ul>
          ${skippedItems.map(item => `<li>${item.productName} - ${item.reason}</li>`).join('')}
        </ul>

        <p>We've rescheduled your delivery to the next cycle: <strong>${nextDate.toLocaleDateString()}</strong></p>

        <p>You were not charged for this delivery.</p>

        <p>
          <a href="${process.env.FRONTEND_URL}/subscriptions" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Manage Subscription</a>
        </p>
      `;

      await this.emailService.sendEmail({
        to: user.email,
        subject,
        html,
      });

      console.log(`[RenewalService] All items unavailable email sent to ${user.email}`);
    } catch (error) {
      console.error('[RenewalService] Error sending unavailable email:', error);
    }
  }
}

export default RenewalService;
