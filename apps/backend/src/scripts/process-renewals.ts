import { PrismaClient } from '@prisma/client';
import { SubscriptionService } from '../services/SubscriptionService';

const prisma = new PrismaClient();

/**
 * Process subscription renewals
 *
 * This script is called by GitHub Actions cron job daily at 2:00 AM UTC
 * It finds all subscriptions due for renewal and processes them:
 * - Validates product availability
 * - Charges payment method off-session
 * - Creates Order record
 * - Updates subscription dates
 * - Sends confirmation emails
 */
async function main() {
  console.log('\n========================================');
  console.log('[Renewals Script] Starting subscription renewal processing');
  console.log('[Renewals Script] Timestamp:', new Date().toISOString());
  console.log('========================================\n');

  try {
    const subscriptionService = new SubscriptionService();
    await subscriptionService.processSubscriptionDeliveries();

    console.log('\n========================================');
    console.log('[Renewals Script] Completed successfully');
    console.log('========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n========================================');
    console.error('[Renewals Script] Fatal error:', error);
    console.error('========================================\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
