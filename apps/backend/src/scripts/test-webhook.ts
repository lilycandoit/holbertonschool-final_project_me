#!/usr/bin/env tsx
// ============================================
// 🧪 SENDLE WEBHOOK TEST SCRIPT
// ============================================
// Tests the Sendle webhook endpoint locally
// Simulates Sendle sending a tracking update

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * Mock Sendle webhook payload
 * This simulates what Sendle sends when a package status changes
 */
const mockSendleWebhook = {
  order_id: 'TEST_SENDLE_ORDER_123',
  state: 'In Transit',
  tracking_events: [
    {
      event_type: 'In Transit',
      scan_time: new Date().toISOString(),
      description: 'Package is on its way to Melbourne',
      location: 'Sydney, NSW'
    }
  ]
};

/**
 * Test the Sendle webhook endpoint
 */
async function testSendleWebhook() {
  console.log('🧪 Testing Sendle Webhook Endpoint\n');
  console.log('📍 Backend URL:', BACKEND_URL);
  console.log('📦 Mock Sendle Order ID:', mockSendleWebhook.order_id);
  console.log('📊 Mock State:', mockSendleWebhook.state);
  console.log();

  try {
    // Send mock webhook to our endpoint
    console.log('📤 Sending mock webhook to /api/webhooks/sendle...');

    const response = await fetch(`${BACKEND_URL}/api/webhooks/sendle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockSendleWebhook)
    });

    const responseText = await response.text();

    console.log();
    console.log('📥 Response Status:', response.status, response.statusText);
    console.log('📥 Response Body:', responseText);
    console.log();

    if (response.status === 404) {
      console.log('⚠️  Expected result: Tracking not found');
      console.log('💡 This is normal - we need a real order with Sendle tracking first');
      console.log();
      console.log('To test with real data:');
      console.log('1. Create an order via the frontend (checkout flow)');
      console.log('2. Backend creates DeliveryTracking with sendleOrderId');
      console.log('3. Run this script again with the real sendleOrderId');
      console.log('4. Webhook should find tracking and update status');
    } else if (response.status === 200) {
      console.log('✅ Webhook processed successfully!');
      console.log('📧 Email notification should have been sent (check logs)');
    } else {
      console.log('❌ Unexpected response');
    }

    console.log();
    console.log('🔍 Check backend logs for detailed processing info:');
    console.log('   docker logs flora-backend --tail 50');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testSendleWebhook()
  .then(() => {
    console.log('✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test error:', error);
    process.exit(1);
  });
