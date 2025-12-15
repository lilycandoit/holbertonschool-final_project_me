import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestTracking() {
  try {
    console.log('🧪 Creating test order with tracking...');

    // Find or create a test user
    const user = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      },
    });

    // Find a product
    const product = await prisma.product.findFirst();
    if (!product) {
      throw new Error('No products found. Run seed first.');
    }

    // Create order
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        orderNumber: `TEST-${Date.now()}`,
        status: 'CONFIRMED',
        subtotalCents: 5999,
        shippingCents: 899,
        taxCents: 0,
        totalCents: 6898,
        purchaseType: 'ONE_TIME',
        deliveryType: 'STANDARD',
        shippingFirstName: 'Test',
        shippingLastName: 'User',
        shippingStreet1: '123 Test St',
        shippingCity: 'Melbourne',
        shippingState: 'VIC',
        shippingZipCode: '3000',
        shippingCountry: 'AU',
        items: {
          create: [
            {
              productId: product.id,
              quantity: 2,
              priceCents: product.priceCents,
            },
          ],
        },
      },
    });

    console.log('✅ Order created:', order.orderNumber, order.id);

    // Create delivery tracking
    const tracking = await prisma.deliveryTracking.create({
      data: {
        orderId: order.id,
        trackingNumber: `FLR${Date.now()}123`,
        status: 'IN_TRANSIT',
        carrierName: 'Sendle',
        sendleTrackingUrl: 'https://track.sendle.com/tracking/test123',
        currentLocation: 'Melbourne, VIC',
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        sendleWebhookEvents: [
          {
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
            event_type: 'Picked Up',
            description: 'Package picked up by courier',
            location: 'Melbourne, VIC',
            source: 'WEBHOOK',
          },
          {
            timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
            event_type: 'In Transit',
            description: 'Package in transit to destination',
            location: 'Tullamarine, VIC',
            source: 'WEBHOOK',
          },
          {
            timestamp: new Date().toISOString(), // Now
            event_type: 'In Transit',
            description: 'Package arrived at sorting facility',
            location: 'Sydney, NSW',
            source: 'CRON_POLL',
          },
        ],
      },
    });

    console.log('✅ Tracking created:', tracking.trackingNumber);
    console.log('\n📋 Test Data Summary:');
    console.log('  Order ID:', order.id);
    console.log('  Order Number:', order.orderNumber);
    console.log('  Tracking Number:', tracking.trackingNumber);
    console.log('  Status:', tracking.status);
    console.log('  Events:', tracking.sendleWebhookEvents.length);
    console.log('\n🔗 Test URLs:');
    console.log('  Tracking API:', `http://localhost:3001/api/tracking/${order.id}`);
    console.log('  Events API:', `http://localhost:3001/api/tracking/${order.id}/events`);
    console.log('  Frontend:', `http://localhost:5173/tracking/${order.id}`);

  } catch (error) {
    console.error('❌ Error creating test tracking:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTestTracking();
