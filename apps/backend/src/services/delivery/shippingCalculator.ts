// ============================================
// 💰 SHIPPING COST CALCULATOR
// ============================================
// Intelligent shipping calculator with 4-tier fallback:
// 1. Try Sendle real-time quote (if enabled)
// 2. Fallback to Google Distance pricing (if enabled)
// 3. Fallback to DeliveryZone pricing (database)
// 4. Fallback to hardcoded pricing (always works)
//
// This ensures checkout NEVER fails due to API issues

import { GoogleDistanceService } from './googleDistanceService';
import { SendleService } from './sendleService';
import { DeliveryService } from './deliveryService';
import { DELIVERY_FEATURES } from '../../config/features';

/**
 * Shipping calculation request
 */
export interface ShippingRequest {
  deliveryPostcode: string;
  deliverySuburb: string;
  deliveryAddress?: string;  // Full address if available
  orderValueCents: number;
  weightKg?: number;
}

/**
 * Shipping calculation result
 */
export interface ShippingResult {
  costCents: number;
  method: 'SENDLE' | 'GOOGLE_DISTANCE' | 'ZONE' | 'FALLBACK';
  estimatedDays: number;
  distanceKm?: number;
  details: string;
  quoteId?: string;  // Sendle quote ID if applicable
}

/**
 * Shipping Calculator
 *
 * **Architecture**: 4-tier fallback ensures checkout always works
 *
 * Tier 1: Sendle API (most accurate, real carrier pricing)
 * Tier 2: Google Distance Matrix (distance-based calculation)
 * Tier 3: DeliveryZone database (zone-based flat rates)
 * Tier 4: Hardcoded fallback ($8.99 standard delivery)
 */
export class ShippingCalculator {
  private googleService: GoogleDistanceService;
  private sendleService: SendleService;
  private deliveryService: DeliveryService;

  // Hardcoded fallback rates (always work)
  private readonly FALLBACK_STANDARD_CENTS = 899;   // $8.99
  private readonly FALLBACK_EXPRESS_CENTS = 1599;   // $15.99
  private readonly FALLBACK_ESTIMATED_DAYS = 3;

  constructor() {
    this.googleService = new GoogleDistanceService();
    this.sendleService = new SendleService();
    this.deliveryService = new DeliveryService();

    console.log('💰 Shipping Calculator initialized with 4-tier fallback');
  }

  /**
   * Calculate shipping cost with intelligent fallback
   *
   * @param request - Shipping calculation request
   * @returns Shipping result with cost and method used
   */
  async calculate(request: ShippingRequest): Promise<ShippingResult> {
    console.log(`💰 Calculating shipping for ${request.deliveryPostcode}...`);

    // Tier 1: Try Sendle API (real carrier quotes)
    if (DELIVERY_FEATURES.USE_SENDLE_QUOTES) {
      try {
        const sendleResult = await this.calculateWithSendle(request);
        console.log(`✅ Tier 1 (Sendle): $${(sendleResult.costCents / 100).toFixed(2)}`);
        return sendleResult;
      } catch (error) {
        console.warn(`⚠️  Tier 1 (Sendle) failed, falling back to Google Distance:`, (error as Error).message);
      }
    }

    // Tier 2: Try Google Distance Matrix (distance-based pricing)
    if (DELIVERY_FEATURES.USE_GOOGLE_DISTANCE) {
      try {
        const googleResult = await this.calculateWithGoogleDistance(request);
        console.log(`✅ Tier 2 (Google Distance): $${(googleResult.costCents / 100).toFixed(2)}`);
        return googleResult;
      } catch (error) {
        console.warn(`⚠️  Tier 2 (Google Distance) failed, falling back to Zone:`, (error as Error).message);
      }
    }

    // Tier 3: Try DeliveryZone database (zone-based flat rates)
    try {
      const zoneResult = await this.calculateWithZone(request);
      console.log(`✅ Tier 3 (Zone): $${(zoneResult.costCents / 100).toFixed(2)}`);
      return zoneResult;
    } catch (error) {
      console.warn(`⚠️  Tier 3 (Zone) failed, using hardcoded fallback:`, (error as Error).message);
    }

    // Tier 4: Hardcoded fallback (always works)
    const fallbackResult = this.calculateFallback(request);
    console.log(`✅ Tier 4 (Fallback): $${(fallbackResult.costCents / 100).toFixed(2)}`);
    return fallbackResult;
  }

  /**
   * Tier 1: Calculate using Sendle API
   * Most accurate - uses real carrier pricing
   */
  private async calculateWithSendle(request: ShippingRequest): Promise<ShippingResult> {
    const quote = await this.sendleService.getQuote(
      request.deliveryPostcode,
      request.deliverySuburb,
      request.weightKg || 1.0
    );

    // Store quote in database for reference
    await this.sendleService.storeQuote(quote, request.deliveryPostcode);

    return {
      costCents: quote.priceCents,
      method: 'SENDLE',
      estimatedDays: quote.etaDays,
      details: `Sendle ${quote.serviceName}`,
      quoteId: quote.quoteId,
    };
  }

  /**
   * Tier 2: Calculate using Google Distance Matrix
   * Good accuracy - based on actual distance
   */
  private async calculateWithGoogleDistance(request: ShippingRequest): Promise<ShippingResult> {
    const address = request.deliveryAddress || `${request.deliverySuburb}, VIC ${request.deliveryPostcode}`;
    const distance = await this.googleService.calculateDistance(address);

    const costCents = this.googleService.calculateDistanceBasedCost(distance.distanceKm);
    const estimatedDays = this.googleService.estimateDeliveryDays(distance.distanceKm);

    return {
      costCents,
      method: 'GOOGLE_DISTANCE',
      estimatedDays,
      distanceKm: distance.distanceKm,
      details: `Distance-based (${distance.distanceKm.toFixed(1)}km)`,
    };
  }

  /**
   * Tier 3: Calculate using DeliveryZone database
   * Moderate accuracy - zone-based flat rates
   */
  private async calculateWithZone(request: ShippingRequest): Promise<ShippingResult> {
    const zone = await this.deliveryService.findDeliveryZoneByZipCode(request.deliveryPostcode);

    if (!zone) {
      throw new Error(`No delivery zone found for ${request.deliveryPostcode}`);
    }

    // Use standard delivery pricing from zone
    let costCents = zone.standardCostCents;
    let estimatedDays = zone.standardDeliveryDays;

    // Apply free shipping threshold if applicable
    if (zone.freeDeliveryThreshold && request.orderValueCents >= zone.freeDeliveryThreshold) {
      costCents = 0;
    }

    return {
      costCents,
      method: 'ZONE',
      estimatedDays,
      details: `Zone: ${zone.name}`,
    };
  }

  /**
   * Tier 4: Hardcoded fallback
   * Always works - ensures checkout never fails
   */
  private calculateFallback(request: ShippingRequest): ShippingResult {
    return {
      costCents: this.FALLBACK_STANDARD_CENTS,
      method: 'FALLBACK',
      estimatedDays: this.FALLBACK_ESTIMATED_DAYS,
      details: 'Standard delivery (fallback pricing)',
    };
  }

  /**
   * Calculate multiple delivery options (standard, express, etc.)
   * Returns array of options sorted by price
   *
   * @param request - Shipping calculation request
   * @returns Array of shipping options
   */
  async calculateOptions(request: ShippingRequest): Promise<ShippingResult[]> {
    const options: ShippingResult[] = [];

    // Standard delivery (use main calculate method)
    const standardOption = await this.calculate(request);
    options.push(standardOption);

    // Express delivery (try zone-based if available)
    try {
      const zone = await this.deliveryService.findDeliveryZoneByZipCode(request.deliveryPostcode);

      if (zone && zone.expressCostCents) {
        options.push({
          costCents: zone.expressCostCents,
          method: 'ZONE',
          estimatedDays: zone.expressDeliveryDays,
          details: `Express delivery - ${zone.name}`,
        });
      }

      // Same-day delivery if available
      if (zone && zone.sameDayAvailable && zone.sameDayCostCents) {
        const currentHour = new Date().getHours();
        if (!zone.sameDayCutoffHour || currentHour < zone.sameDayCutoffHour) {
          options.push({
            costCents: zone.sameDayCostCents,
            method: 'ZONE',
            estimatedDays: 0,
            details: `Same-day delivery - ${zone.name}`,
          });
        }
      }
    } catch (error) {
      // If zone lookup fails, just return standard option
      console.warn('Failed to get express options:', error);
    }

    // Sort by price (cheapest first)
    options.sort((a, b) => a.costCents - b.costCents);

    return options;
  }

  /**
   * Get fallback statistics
   * Useful for monitoring which tiers are being used
   */
  getFallbackStats(): {
    sendleEnabled: boolean;
    googleEnabled: boolean;
    sandboxMode: boolean;
  } {
    return {
      sendleEnabled: DELIVERY_FEATURES.USE_SENDLE_QUOTES,
      googleEnabled: DELIVERY_FEATURES.USE_GOOGLE_DISTANCE,
      sandboxMode: DELIVERY_FEATURES.SENDLE_SANDBOX_MODE,
    };
  }
}
