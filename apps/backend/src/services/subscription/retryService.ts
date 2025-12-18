import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import RenewalService from './renewalService';

const prisma = new PrismaClient();

/**
 * RetryService handles retrying subscriptions with failed payments
 *
 * Retry schedule:
 * - Attempt 1: Immediate (at renewal time)
 * - Attempt 2: 3 days later (nextRetryDate)
 * - Attempt 3: 7 days later (nextRetryDate)
 * - After 3 failures: Status = EXPIRED
 *
 * This service finds subscriptions with nextRetryDate <= today
 * and delegates to RenewalService for actual charging logic
 */
export class RetryService {
  private renewalService: RenewalService;

  constructor() {
    this.renewalService = new RenewalService();
  }

  /**
   * Retry subscriptions with failed payments
   * Called by cron job daily at 10 AM
   */
  async retryFailedSubscriptions(): Promise<void> {
    const today = new Date();
    console.log(`\n[RetryService] ==========================================`);
    console.log(`[RetryService] Starting failed payment retry processing`);
    console.log(`[RetryService] Date: ${today.toISOString()}`);
    console.log(`[RetryService] ==========================================\n`);

    try {
      // Find subscriptions with retry scheduled for today
      const subscriptions = await prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.PAYMENT_FAILED,
          nextRetryDate: { lte: today },
          failedPaymentCount: { lt: 3 }, // Don't retry EXPIRED subscriptions
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

      console.log(`[RetryService] Found ${subscriptions.length} subscriptions to retry\n`);

      if (subscriptions.length === 0) {
        console.log(`[RetryService] No subscriptions to retry. Exiting.\n`);
        return;
      }

      // Process each subscription
      let successCount = 0;
      let failureCount = 0;

      for (const subscription of subscriptions) {
        try {
          console.log(`[RetryService] ========================================`);
          console.log(`[RetryService] Retrying subscription: ${subscription.id}`);
          console.log(`[RetryService] User: ${subscription.user.email}`);
          console.log(`[RetryService] Attempt: ${subscription.failedPaymentCount + 1}/3`);
          console.log(`[RetryService] Last error: ${subscription.lastBillingError}`);
          console.log(`[RetryService] ========================================`);

          // Use same renewal logic as normal renewals
          const result = await this.renewalService.processSubscriptionRenewal(subscription);

          if (result === 'success') {
            console.log(`[RetryService] ✅ Retry successful for subscription ${subscription.id}`);
            successCount++;
          } else {
            console.log(`[RetryService] ❌ Retry failed for subscription ${subscription.id}`);
            failureCount++;
          }

          console.log(``); // Empty line for readability
        } catch (error) {
          console.error(`[RetryService] Error retrying subscription ${subscription.id}:`, error);
          failureCount++;
        }
      }

      console.log(`\n[RetryService] ==========================================`);
      console.log(`[RetryService] Retry processing complete`);
      console.log(`[RetryService] Success: ${successCount}, Failed: ${failureCount}`);
      console.log(`[RetryService] ==========================================\n`);
    } catch (error) {
      console.error('[RetryService] Fatal error during retry processing:', error);
      throw error;
    }
  }

  /**
   * Get retry statistics
   * Useful for monitoring and dashboards
   */
  async getRetryStats(): Promise<{
    totalFailed: number;
    pendingRetry: number;
    expiredSubscriptions: number;
    attempt1: number;
    attempt2: number;
    attempt3: number;
  }> {
    const [totalFailed, pendingRetry, expiredSubscriptions] = await Promise.all([
      // Total subscriptions with payment failures
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.PAYMENT_FAILED,
        },
      }),

      // Subscriptions waiting for retry
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.PAYMENT_FAILED,
          nextRetryDate: { not: null },
        },
      }),

      // Subscriptions that failed 3 times (expired)
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.EXPIRED,
        },
      }),
    ]);

    // Count by attempt number
    const [attempt1, attempt2, attempt3] = await Promise.all([
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.PAYMENT_FAILED,
          failedPaymentCount: 1,
        },
      }),
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.PAYMENT_FAILED,
          failedPaymentCount: 2,
        },
      }),
      prisma.subscription.count({
        where: {
          status: SubscriptionStatus.PAYMENT_FAILED,
          failedPaymentCount: 3,
        },
      }),
    ]);

    return {
      totalFailed,
      pendingRetry,
      expiredSubscriptions,
      attempt1,
      attempt2,
      attempt3,
    };
  }
}

export default RetryService;
