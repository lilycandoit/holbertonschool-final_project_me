import express, { Router } from "express";
import dotenv from "dotenv";
import { PaymentService } from "../services/PaymentService";
import { SendleService } from "../services/delivery/sendleService";
import { EmailService } from "../services/EmailService";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const router: Router = express.Router();
const stripeEndpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const prisma = new PrismaClient();

// ============================================
// STRIPE WEBHOOK
// ============================================
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const paymentService = new PaymentService();

    await paymentService.handleWebhook(
      req.body,
      req.headers["stripe-signature"] as string,
      stripeEndpointSecret
    );

    res.json({ received: true });
  } catch (err: any) {
    console.error("❌ Stripe webhook error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// ============================================
// SENDLE WEBHOOK (Tracking Updates)
// ============================================
router.post("/sendle", express.json(), async (req, res) => {
  console.log('📦 Sendle webhook received');

  try {
    const sendleService = new SendleService();
    const emailService = new EmailService();

    // Extract Sendle webhook payload
    const { order_id, tracking_events, state } = req.body;

    if (!order_id) {
      console.warn('⚠️  Sendle webhook missing order_id');
      return res.status(400).json({ error: 'Missing order_id' });
    }

    console.log(`📦 Sendle Order ID: ${order_id}`);
    console.log(`📍 State: ${state}`);
    console.log(`📊 Events: ${tracking_events?.length || 0}`);

    // Log webhook to database for debugging
    await prisma.webhookLog.create({
      data: {
        provider: 'SENDLE',
        eventType: state || 'TRACKING_UPDATE',
        payload: req.body,
        status: 'PROCESSING',
      },
    });

    // Find the delivery tracking by Sendle order ID
    const tracking = await prisma.deliveryTracking.findUnique({
      where: { sendleOrderId: order_id },
      include: {
        order: {
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!tracking) {
      console.warn(`⚠️  No tracking found for Sendle order: ${order_id}`);
      await prisma.webhookLog.updateMany({
        where: {
          provider: 'SENDLE',
          payload: { path: ['order_id'], equals: order_id },
        },
        data: {
          status: 'FAILED',
          errorMessage: 'No matching delivery tracking found',
        },
      });
      return res.status(404).json({ error: 'Tracking not found' });
    }

    console.log(`✅ Found tracking: ${tracking.trackingNumber}`);
    console.log(`   Order: ${tracking.order.orderNumber}`);

    // Map Sendle state to our status
    const STATUS_MAPPING: Record<string, { status: string; userMessage: string }> = {
      'Info Received': { status: 'PROCESSING', userMessage: 'Order information received' },
      'Pickup Scheduled': { status: 'PROCESSING', userMessage: 'Pickup scheduled' },
      'Picked Up': { status: 'IN_TRANSIT', userMessage: 'Package picked up by courier' },
      'In Transit': { status: 'IN_TRANSIT', userMessage: 'Package in transit' },
      'Out for Delivery': { status: 'OUT_FOR_DELIVERY', userMessage: 'Out for delivery' },
      'Delivered': { status: 'DELIVERED', userMessage: 'Delivered successfully' },
      'Return to Sender': { status: 'FAILED', userMessage: 'Delivery failed - returning to sender' },
      'Cancelled': { status: 'CANCELLED', userMessage: 'Shipment cancelled' },
    };

    const mappedStatus = STATUS_MAPPING[state] || {
      status: 'IN_TRANSIT',
      userMessage: state,
    };

    const statusChanged = tracking.status !== mappedStatus.status;

    console.log(`📍 Current status: ${tracking.status}`);
    console.log(`📍 New status: ${mappedStatus.status}`);
    console.log(`📍 Status changed: ${statusChanged}`);

    // Update delivery tracking with webhook event
    await prisma.deliveryTracking.update({
      where: { id: tracking.id },
      data: {
        status: mappedStatus.status,
        lastWebhookReceivedAt: new Date(),
        sendleWebhookEvents: {
          push: {
            timestamp: new Date().toISOString(),
            event_type: state,
            description: tracking_events?.[0]?.description || '',
            location: tracking_events?.[0]?.location || '',
            source: 'WEBHOOK',
          },
        },
      },
    });

    console.log(`✅ Tracking updated in database`);

    // Send email notification if status changed
    if (statusChanged) {
      console.log(`✉️  Sending email notification...`);

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
          customerName: recipientName,
        });

        console.log(`✅ Email sent to ${recipientEmail}`);
      }
    }

    // Mark webhook as processed
    await prisma.webhookLog.updateMany({
      where: {
        provider: 'SENDLE',
        payload: { path: ['order_id'], equals: order_id },
        status: 'PROCESSING',
      },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        trackingId: tracking.id,
        orderId: tracking.orderId,
      },
    });

    console.log('✅ Sendle webhook processed successfully\n');
    res.json({ received: true, tracking_number: tracking.trackingNumber });

  } catch (err: any) {
    console.error('❌ Sendle webhook error:', err);

    // Mark webhook as failed
    try {
      await prisma.webhookLog.updateMany({
        where: {
          provider: 'SENDLE',
          status: 'PROCESSING',
        },
        data: {
          status: 'FAILED',
          errorMessage: err.message,
        },
      });
    } catch (logError) {
      console.error('❌ Failed to log webhook error:', logError);
    }

    res.status(500).json({ error: err.message });
  }
});

export default router;
