#!/usr/bin/env tsx
// ============================================
// 📦 TRACKING UPDATE SCRIPT
// ============================================
// Runs via GitHub Actions cron (every 30 minutes)
// Polls Sendle API for tracking updates
// Updates database and sends email notifications

import { PrismaClient } from '@prisma/client';
import { SendleService } from '../services/delivery/sendleService';
import { EmailService } from '../services/EmailService';

const prisma = new PrismaClient();
const sendleService = new SendleService();
const emailService = new EmailService();

/**
 * Mapping of Sendle tracking states to user-friendly statuses
 */
const STATUS_MAPPING: Record<string, { status: string; userMessage: string }> = {
  'Info Received': {
    status: 'PROCESSING',
    userMessage: 'Order information received'
  },
  'Pickup Scheduled': {
    status: 'PROCESSING',
    userMessage: 'Pickup scheduled'
  },
  'Picked Up': {
    status: 'IN_TRANSIT',
    userMessage: 'Package picked up by courier'
  },
  'In Transit': {
    status: 'IN_TRANSIT',
    userMessage: 'Package in transit'
  },
  'Out for Delivery': {
    status: 'OUT_FOR_DELIVERY',
    userMessage: 'Out for delivery'
  },
  'Delivered': {
    status: 'DELIVERED',
    userMessage: 'Delivered successfully'
  },
  'Return to Sender': {
    status: 'FAILED',
    userMessage: 'Delivery failed - returning to sender'
  },
  'Cancelled': {
    status: 'CANCELLED',
    userMessage: 'Shipment cancelled'
  }
};

/**
 * Process tracking updates for all active deliveries
 */
async function updateTracking() {
  console.log('🚀 Starting tracking update job...\n');

  try {
    // Step 1: Find all orders with Sendle tracking that are not yet delivered
    const activeTrackings = await prisma.deliveryTracking.findMany({
      where: {
        sendleOrderId: { not: null },
        status: { notIn: ['DELIVERED', 'CANCELLED', 'FAILED'] }
      },
      include: {
        order: {
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    console.log(`📊 Found ${activeTrackings.length} active trackings to update\n`);

    if (activeTrackings.length === 0) {
      console.log('✅ No active trackings to update');
      return;
    }

    // Step 2: Process each tracking
    let updatedCount = 0;
    let errorCount = 0;

    for (const tracking of activeTrackings) {
      try {
        console.log(`📦 Processing tracking: ${tracking.trackingNumber}`);
        console.log(`   Order: ${tracking.order.orderNumber}`);
        console.log(`   Sendle Order ID: ${tracking.sendleOrderId}`);

        // Fetch latest tracking info from Sendle
        const sendleTracking = await sendleService.getTrackingDetails(tracking.sendleOrderId!);

        if (!sendleTracking || !sendleTracking.trackingEvents || sendleTracking.trackingEvents.length === 0) {
          console.log(`   ⚠️  No tracking events from Sendle, skipping\n`);
          continue;
        }

        // Extract latest status (SendleTracking type has trackingEvents array)
        const latestEvent = sendleTracking.trackingEvents[0]; // Sendle returns newest first
        const sendleStatus = latestEvent.eventType || 'Unknown';
        const mappedStatus = STATUS_MAPPING[sendleStatus] || {
          status: 'IN_TRANSIT',
          userMessage: sendleStatus
        };

        console.log(`   📍 Current status: ${tracking.status}`);
        console.log(`   📍 Sendle status: ${sendleStatus} → ${mappedStatus.status}`);

        // Check if status changed
        const statusChanged = tracking.status !== mappedStatus.status;

        // Step 3: Update delivery tracking in database
        await prisma.deliveryTracking.update({
          where: { id: tracking.id },
          data: {
            status: mappedStatus.status,
            lastWebhookReceivedAt: new Date(),
            sendleWebhookEvents: {
              push: {
                timestamp: latestEvent.scanTime || new Date().toISOString(),
                event_type: latestEvent.eventType,
                description: latestEvent.description || '',
                location: latestEvent.location || '',
                source: 'CRON_POLL'
              }
            }
          }
        });

        // Step 4: Send email notification if status changed
        if (statusChanged) {
          console.log(`   ✉️  Status changed! Sending notification email...`);

          const recipientEmail = tracking.order.user?.email || tracking.order.guestEmail;
          const recipientName = tracking.order.user
            ? `${tracking.order.user.firstName} ${tracking.order.user.lastName}`
            : (tracking.order.shippingFirstName || 'Customer');

          if (recipientEmail) {
            await emailService.sendTrackingUpdate({
              to: recipientEmail as string,
              orderNumber: tracking.order.orderNumber,
              trackingNumber: tracking.trackingNumber || 'N/A',
              newStatus: mappedStatus.userMessage,
              trackingUrl: tracking.sendleTrackingUrl || undefined,
              customerName: recipientName
            });

            console.log(`   ✅ Email sent to ${recipientEmail}`);
          }
        } else {
          console.log(`   ℹ️  No status change, email not sent`);
        }

        updatedCount++;
        console.log(`   ✅ Tracking updated successfully\n`);

      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error updating tracking ${tracking.trackingNumber}:`);
        console.error(`      ${error instanceof Error ? error.message : String(error)}\n`);
        // Continue with next tracking even if one fails
      }
    }

    // Step 5: Summary
    console.log('📊 Tracking update summary:');
    console.log(`   Total processed: ${activeTrackings.length}`);
    console.log(`   Successfully updated: ${updatedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('\n✅ Tracking update job completed!');

  } catch (error) {
    console.error('❌ Fatal error in tracking update job:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateTracking()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
