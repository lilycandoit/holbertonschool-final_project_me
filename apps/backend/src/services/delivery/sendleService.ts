// ============================================
// 📦 SENDLE API SERVICE
// ============================================
// Handles Sendle Sandbox API integration for:
// - Shipping quote requests
// - Order creation (sandbox only!)
// - Tracking updates
// - Webhook event processing
//
// **CRITICAL**: Always runs in SANDBOX mode for Flora

import { DELIVERY_FEATURES } from '../../config/features';
import prisma from '../../config/database';

/**
 * Sendle quote response
 */
export interface SendleQuote {
  quoteId: string;
  priceCents: number;
  priceWithTaxCents: number;
  etaDays: number;
  etaDate: string;
  serviceName: string;
}

/**
 * Sendle order response
 */
export interface SendleOrder {
  orderId: string;
  trackingNumber: string;
  trackingUrl: string;
  state: string;
  createdAt: string;
}

/**
 * Sendle tracking response
 */
export interface SendleTracking {
  trackingNumber: string;
  state: string; // "Pickup", "In Transit", "Delivered"
  trackingEvents: SendleTrackingEvent[];
}

export interface SendleTrackingEvent {
  eventType: string;
  scanTime: string;
  description: string;
  location?: string;
}

/**
 * Sendle Service
 *
 * **IMPORTANT**: This service ALWAYS uses Sendle Sandbox API
 * Real shipments are NEVER created - all operations are test mode
 *
 * Requires:
 * - SENDLE_API_ID environment variable
 * - SENDLE_API_KEY environment variable
 * - SENDLE_SANDBOX_MODE=true (enforced)
 *
 * Feature flag: DELIVERY_FEATURES.USE_SENDLE_QUOTES
 */
export class SendleService {
  private apiId: string | undefined;
  private apiKey: string | undefined;
  private baseUrl: string;
  private pickupSuburb: string;
  private pickupPostcode: string;

  constructor() {
    this.apiId = process.env.SENDLE_API_ID;
    this.apiKey = process.env.SENDLE_API_KEY;

    // ALWAYS use sandbox URL (safety enforcement)
    this.baseUrl = 'https://sandbox.sendle.com/api';

    // Pickup location (Flora's warehouse/store)
    this.pickupSuburb = process.env.SENDLE_PICKUP_SUBURB || 'Melbourne';
    this.pickupPostcode = process.env.SENDLE_PICKUP_POSTCODE || '3000';

    this.logStatus();
    this.enforceSandboxMode();
  }

  /**
   * Log service status on initialization
   */
  private logStatus(): void {
    console.log('📦 Sendle API Service:');

    if (!this.apiId || !this.apiKey) {
      console.log('   ⚠️  Credentials: NOT CONFIGURED');
      console.log('   💡 Set SENDLE_API_ID and SENDLE_API_KEY in .env');
    } else {
      console.log(`   ✅ API ID: ${this.apiId.substring(0, 10)}...`);
      console.log('   ✅ API Key: Configured');
    }

    console.log(`   🏠 Pickup: ${this.pickupSuburb} ${this.pickupPostcode}`);
    console.log(`   🔧 Mode: ${DELIVERY_FEATURES.SENDLE_SANDBOX_MODE ? 'SANDBOX (Safe)' : '⚠️  PRODUCTION (DANGER!)'}`);
    console.log(`   🌐 Base URL: ${this.baseUrl}`);
    console.log(`   🎛️  Feature Flags: Quotes ${DELIVERY_FEATURES.USE_SENDLE_QUOTES ? 'ON' : 'OFF'}, Tracking ${DELIVERY_FEATURES.USE_SENDLE_TRACKING ? 'ON' : 'OFF'}`);
  }

  /**
   * Enforce sandbox mode - prevent accidental production shipments
   */
  private enforceSandboxMode(): void {
    if (!DELIVERY_FEATURES.SENDLE_SANDBOX_MODE) {
      console.error('🚨 CRITICAL: Sendle SANDBOX_MODE is disabled!');
      console.error('🚨 This could create REAL shipments and charges!');
      console.error('🚨 For Flora, ALWAYS use sandbox mode.');
      throw new Error('Sendle production mode is not allowed for Flora. Set SENDLE_SANDBOX_MODE=true');
    }
  }

  /**
   * Check if service is properly configured
   */
  private isConfigured(): boolean {
    return !!this.apiId && !!this.apiKey;
  }

  /**
   * Get shipping quote from Sendle
   *
   * @param deliveryPostcode - Destination postcode
   * @param deliverySuburb - Destination suburb
   * @param weightKg - Package weight in kg (default: 1kg)
   * @returns Sendle quote with pricing and ETA
   */
  async getQuote(
    deliveryPostcode: string,
    deliverySuburb: string,
    weightKg: number = 1.0
  ): Promise<SendleQuote> {
    if (!this.isConfigured()) {
      throw new Error('Sendle API not configured');
    }

    if (!DELIVERY_FEATURES.USE_SENDLE_QUOTES) {
      throw new Error('Sendle quotes feature is disabled');
    }

    try {
      const url = `${this.baseUrl}/quote`;

      const requestBody = {
        pickup_suburb: this.pickupSuburb,
        pickup_postcode: this.pickupPostcode,
        delivery_suburb: deliverySuburb,
        delivery_postcode: deliveryPostcode,
        weight_value: weightKg,
        weight_units: 'kg',
      };

      console.log(`📦 Requesting Sendle quote: ${deliverySuburb} ${deliveryPostcode}, ${weightKg}kg`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${this.apiId}:${this.apiKey}`).toString('base64'),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sendle API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;

      // Sendle returns quotes array - use the first standard quote
      const quote = data.quote;

      if (!quote) {
        throw new Error('No quote returned from Sendle');
      }

      const result: SendleQuote = {
        quoteId: quote.quote_id || `QUOTE_${Date.now()}`,
        priceCents: Math.round(parseFloat(quote.gross.amount) * 100), // Convert to cents
        priceWithTaxCents: Math.round(parseFloat(quote.gross.amount) * 100),
        etaDays: quote.eta?.days_range?.[1] || 5, // Use max days from range
        etaDate: quote.eta?.date_range?.[1] || '',
        serviceName: quote.product || 'Standard',
      };

      console.log(`✅ Sendle quote: $${(result.priceCents / 100).toFixed(2)}, ETA: ${result.etaDays} days`);

      return result;

    } catch (error) {
      console.error('❌ Sendle quote error:', error);
      throw error;
    }
  }

  /**
   * Create Sendle order (SANDBOX ONLY)
   *
   * @param orderDetails - Order information
   * @returns Sendle order with tracking info
   */
  async createOrder(orderDetails: {
    deliveryName: string;
    deliveryAddress: string;
    deliverySuburb: string;
    deliveryPostcode: string;
    deliveryPhone?: string;
    weightKg?: number;
    description?: string;
    reference?: string; // Flora order number
  }): Promise<SendleOrder> {
    if (!this.isConfigured()) {
      throw new Error('Sendle API not configured');
    }

    if (!DELIVERY_FEATURES.SENDLE_SANDBOX_MODE) {
      throw new Error('Cannot create Sendle orders - sandbox mode enforced');
    }

    try {
      const url = `${this.baseUrl}/orders`;

      const requestBody = {
        // Pickup details (Flora's warehouse)
        pickup_suburb: this.pickupSuburb,
        pickup_postcode: this.pickupPostcode,

        // Delivery details
        receiver_name: orderDetails.deliveryName,
        receiver_address_line1: orderDetails.deliveryAddress,
        receiver_suburb: orderDetails.deliverySuburb,
        receiver_postcode: orderDetails.deliveryPostcode,
        receiver_country: 'Australia',
        receiver_phone: orderDetails.deliveryPhone || '',

        // Package details
        weight_value: orderDetails.weightKg || 1.0,
        weight_units: 'kg',
        description: orderDetails.description || 'Flora flowers delivery',

        // Reference
        customer_reference: orderDetails.reference || '',
      };

      console.log(`📦 Creating Sendle order (SANDBOX): ${orderDetails.deliverySuburb} ${orderDetails.deliveryPostcode}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${this.apiId}:${this.apiKey}`).toString('base64'),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sendle order creation failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;

      const result: SendleOrder = {
        orderId: data.order_id || data.sendle_reference,
        trackingNumber: data.sendle_reference,
        trackingUrl: data.tracking_url,
        state: data.state,
        createdAt: data.created_at,
      };

      console.log(`✅ Sendle order created (SANDBOX): ${result.orderId}`);
      console.log(`   📍 Tracking: ${result.trackingUrl}`);

      return result;

    } catch (error) {
      console.error('❌ Sendle order creation error:', error);
      throw error;
    }
  }

  /**
   * Get tracking information for a Sendle order
   *
   * @param orderId - Sendle order ID or tracking number
   * @returns Tracking information with events
   */
  async getTracking(orderId: string): Promise<SendleTracking> {
    if (!this.isConfigured()) {
      throw new Error('Sendle API not configured');
    }

    if (!DELIVERY_FEATURES.USE_SENDLE_TRACKING) {
      throw new Error('Sendle tracking feature is disabled');
    }

    try {
      const url = `${this.baseUrl}/tracking/${orderId}`;

      console.log(`📦 Fetching Sendle tracking: ${orderId}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${this.apiId}:${this.apiKey}`).toString('base64'),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sendle tracking fetch failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;

      const result: SendleTracking = {
        trackingNumber: data.sendle_reference,
        state: data.state,
        trackingEvents: (data.tracking_events || []).map((event: any) => ({
          eventType: event.event_type,
          scanTime: event.scan_time,
          description: event.description,
          location: event.location,
        })),
      };

      console.log(`✅ Sendle tracking: ${result.state}, ${result.trackingEvents.length} events`);

      return result;

    } catch (error) {
      console.error('❌ Sendle tracking error:', error);
      throw error;
    }
  }

  /**
   * Get tracking details (alias for getTracking)
   * Used by update-tracking.ts script
   */
  async getTrackingDetails(orderId: string): Promise<any> {
    return this.getTracking(orderId);
  }

  /**
   * Store Sendle quote in database for later reference
   *
   * @param quote - Sendle quote object
   * @param orderId - Flora order ID (optional)
   * @param deliveryPostcode - Destination postcode
   */
  async storeQuote(
    quote: SendleQuote,
    deliveryPostcode: string,
    orderId?: string
  ): Promise<void> {
    try {
      await prisma.sendleQuote.create({
        data: {
          orderId: orderId || undefined,
          quoteId: quote.quoteId,
          priceCents: quote.priceCents,
          etaDays: quote.etaDays,
          pickupSuburb: this.pickupSuburb,
          deliverySuburb: '', // Would need to be passed in
          deliveryPostcode,
          weightKg: 1.0,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          isSelected: !!orderId,
        },
      });

      console.log(`💾 Stored Sendle quote: ${quote.quoteId}`);
    } catch (error) {
      console.error('❌ Failed to store Sendle quote:', error);
      // Don't throw - quote storage is not critical
    }
  }

  /**
   * Process Sendle webhook event
   * Called when Sendle sends tracking update
   *
   * @param webhookPayload - Raw webhook payload
   * @returns Processed tracking data
   */
  async processWebhook(webhookPayload: any): Promise<SendleTracking | null> {
    try {
      console.log(`📦 Processing Sendle webhook: ${webhookPayload.event_type}`);

      // Log webhook to database for debugging
      await prisma.webhookLog.create({
        data: {
          provider: 'SENDLE',
          eventType: webhookPayload.event_type || 'unknown',
          payload: webhookPayload,
          status: 'PENDING',
        },
      });

      // Extract tracking information from webhook
      const tracking: SendleTracking = {
        trackingNumber: webhookPayload.sendle_reference,
        state: webhookPayload.state,
        trackingEvents: webhookPayload.tracking_events || [],
      };

      // Mark webhook as processed
      await prisma.webhookLog.updateMany({
        where: {
          provider: 'SENDLE',
          payload: { equals: webhookPayload },
        },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

      console.log(`✅ Processed Sendle webhook: ${tracking.state}`);

      return tracking;

    } catch (error) {
      console.error('❌ Sendle webhook processing error:', error);

      // Mark webhook as failed
      await prisma.webhookLog.updateMany({
        where: {
          provider: 'SENDLE',
          payload: { equals: webhookPayload },
        },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          processedAt: new Date(),
        },
      });

      return null;
    }
  }
}
