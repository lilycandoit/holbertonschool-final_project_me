import express, { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { SendleService } from "../services/delivery/sendleService";

const router: Router = express.Router();
const prisma = new PrismaClient();

// Status mapping (same as webhook handler for consistency)
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

// Internal status to user-friendly message mapping
const INTERNAL_STATUS_MESSAGES: Record<string, string> = {
  PROCESSING: 'Order information received',
  IN_TRANSIT: 'Package in transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered successfully',
  FAILED: 'Delivery failed',
  CANCELLED: 'Shipment cancelled',
};

// ============================================
// GET /api/tracking/:orderId
// Get tracking information for an order
// ============================================
router.get("/:orderId", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    console.log(`📦 Fetching tracking for order: ${orderId}`);

    // Find order with tracking information
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryTracking: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if tracking exists
    if (!order.deliveryTracking) {
      return res.status(404).json({
        error: 'Tracking not available',
        message: 'This order does not have tracking information yet'
      });
    }

    const tracking = order.deliveryTracking;

    // Get status message
    const statusMessage = INTERNAL_STATUS_MESSAGES[tracking.status] || tracking.status;

    // Format response
    const response = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingNumber: tracking.trackingNumber || 'N/A',
      status: tracking.status,
      statusMessage,
      sendleTrackingUrl: tracking.sendleTrackingUrl,
      estimatedDelivery: tracking.estimatedDelivery?.toISOString() || null,
      actualDelivery: tracking.actualDelivery?.toISOString() || null,
      currentLocation: tracking.currentLocation,
      lastUpdated: (tracking.lastWebhookReceivedAt || tracking.updatedAt || tracking.createdAt)?.toISOString() || new Date().toISOString(),
      carrierName: tracking.carrierName || 'Sendle',
    };

    console.log(`✅ Tracking found: ${tracking.trackingNumber}, status: ${tracking.status}`);

    res.json(response);

  } catch (error) {
    console.error('❌ Error fetching tracking:', error);
    res.status(500).json({
      error: 'Failed to fetch tracking information',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// GET /api/tracking/:orderId/events
// Get detailed tracking event timeline
// ============================================
router.get("/:orderId/events", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    console.log(`📊 Fetching tracking events for order: ${orderId}`);

    // Find order with tracking and events
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryTracking: {
          include: {
            events: {
              orderBy: {
                timestamp: 'desc', // Newest first
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.deliveryTracking) {
      return res.status(404).json({
        error: 'Tracking not available',
        message: 'This order does not have tracking information yet'
      });
    }

    const tracking = order.deliveryTracking;

    // Combine events from two sources:
    // 1. tracking_events table (created during order confirmation)
    // 2. sendleWebhookEvents JSON array (from Sendle API updates)

    const formattedEvents = [];

    // Add events from tracking_events table
    if (tracking.events && tracking.events.length > 0) {
      tracking.events.forEach((event) => {
        formattedEvents.push({
          timestamp: event.timestamp.toISOString(),
          eventType: event.status,
          description: event.description,
          location: event.location || '',
          source: 'SYSTEM',
        });
      });
    }

    // Add events from sendleWebhookEvents JSON array
    const webhookEvents = (tracking.sendleWebhookEvents as any[]) || [];
    webhookEvents.forEach((event: any) => {
      formattedEvents.push({
        timestamp: event.timestamp,
        eventType: event.event_type,
        description: event.description,
        location: event.location || '',
        source: event.source || 'WEBHOOK',
      });
    });

    // Sort all events by timestamp (newest first)
    formattedEvents.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    console.log(`✅ Found ${formattedEvents.length} tracking events (${tracking.events?.length || 0} system, ${webhookEvents.length} webhook)`);

    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingNumber: tracking.trackingNumber || 'N/A',
      events: formattedEvents,
      totalEvents: formattedEvents.length,
      lastUpdated: tracking.updatedAt?.toISOString() || new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Error fetching tracking events:', error);
    res.status(500).json({
      error: 'Failed to fetch tracking events',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// POST /api/tracking/:orderId/refresh
// Manually refresh tracking from Sendle API
// ============================================
router.post("/:orderId/refresh", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    console.log(`🔄 Manual refresh requested for order: ${orderId}`);

    // Find order with tracking
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryTracking: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.deliveryTracking) {
      return res.status(404).json({
        error: 'Tracking not available',
        message: 'This order does not have tracking information yet'
      });
    }

    const tracking = order.deliveryTracking;

    // Check if we have a Sendle order ID to poll
    if (!tracking.sendleOrderId) {
      console.log(`ℹ️  No Sendle order ID - tracking is local only`);
      return res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        trackingNumber: tracking.trackingNumber || 'N/A',
        status: tracking.status,
        statusMessage: INTERNAL_STATUS_MESSAGES[tracking.status] || tracking.status,
        statusChanged: false,
        newEventsCount: 0,
        message: 'No new updates available',
        note: 'This order does not have a Sendle shipment yet'
      });
    }

    // Poll Sendle API for latest tracking info
    const sendleService = new SendleService();

    console.log(`📡 Polling Sendle API for order: ${tracking.sendleOrderId}`);

    const sendleTracking = await sendleService.getTrackingDetails(tracking.sendleOrderId);

    if (!sendleTracking || !sendleTracking.trackingEvents || sendleTracking.trackingEvents.length === 0) {
      console.log(`⚠️  No tracking events from Sendle`);
      return res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        message: 'No new tracking updates available',
        trackingNumber: tracking.trackingNumber || 'N/A',
        status: tracking.status,
      });
    }

    // Extract latest status
    const latestEvent = sendleTracking.trackingEvents[0]; // Sendle returns newest first
    const sendleStatus = latestEvent.eventType || 'Unknown';
    const mappedStatus = STATUS_MAPPING[sendleStatus] || {
      status: 'IN_TRANSIT',
      userMessage: sendleStatus
    };

    const statusChanged = tracking.status !== mappedStatus.status;

    console.log(`📍 Current: ${tracking.status}, Sendle: ${sendleStatus} → ${mappedStatus.status}`);

    // Update tracking in database
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
            source: 'MANUAL_REFRESH',
          },
        },
      },
    });

    console.log(`✅ Tracking refreshed successfully`);

    // Return updated tracking info
    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingNumber: tracking.trackingNumber || 'N/A',
      status: mappedStatus.status,
      statusMessage: mappedStatus.userMessage,
      statusChanged,
      sendleTrackingUrl: tracking.sendleTrackingUrl,
      lastUpdated: new Date().toISOString(),
      newEventsCount: 1,
    });

  } catch (error) {
    console.error('❌ Error refreshing tracking:', error);
    res.status(500).json({
      error: 'Failed to refresh tracking',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
