import { PrismaClient } from '@prisma/client';
import RetryService from '../services/subscription/retryService';

const prisma = new PrismaClient();

/**
 * Retry failed subscription payments
 *
 * This script is called by GitHub Actions cron job daily at 10:00 AM UTC
 * It finds all subscriptions with failed payments that are due for retry:
 * - status = PAYMENT_FAILED
 * - nextRetryDate <= today
 * - failedPaymentCount < 3
 *
 * Retry schedule:
 * - Attempt 1: Immediate (at renewal time)
 * - Attempt 2: 3 days later
 * - Attempt 3: 7 days later (final attempt)
 * - After 3 failures: Status = EXPIRED
 */
async function main() {
  console.log('\n========================================');
  console.log('[Retries Script] Starting failed payment retry processing');
  console.log('[Retries Script] Timestamp:', new Date().toISOString());
  console.log('========================================\n');

  try {
    const retryService = new RetryService();
    await retryService.retryFailedSubscriptions();

    console.log('\n========================================');
    console.log('[Retries Script] Completed successfully');
    console.log('========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n========================================');
    console.error('[Retries Script] Fatal error:', error);
    console.error('========================================\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
