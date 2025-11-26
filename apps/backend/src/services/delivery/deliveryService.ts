// ============================================
// 🚚 DELIVERY SERVICE
// ============================================
// Handles all delivery-related business logic:
// - Shipping cost calculation
// - Delivery zone validation
// - Delivery method management
// - Order tracking functionality

import prisma from '../../config/database';
import {
  DeliveryZoneResponse,
  DeliveryMethodResponse,
  ShippingCalculationRequest,
  ShippingCalculationResponse,
  DeliveryValidationRequest,
  DeliveryTrackingResponse,
} from '../../types/api';

export class DeliveryService {
  // ============================================
  // 📍 DELIVERY ZONE MANAGEMENT
  // ============================================

  /**
   * Get all available delivery zones
   * Used for admin management and zone lookup
   */
  async getAllDeliveryZones(): Promise<DeliveryZoneResponse[]> {
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true },
      include: {
        deliveryWindows: {
          where: { isAvailable: true },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return zones.map((zone: any) => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      zipCodes: zone.zipCodes,
      cities: zone.cities,
      standardCostCents: zone.standardCostCents,
      expressCostCents: zone.expressCostCents,
      sameDayCostCents: zone.sameDayCostCents,
      standardDeliveryDays: zone.standardDeliveryDays,
      expressDeliveryDays: zone.expressDeliveryDays,
      sameDayAvailable: zone.sameDayAvailable,
      sameDayCutoffHour: zone.sameDayCutoffHour,
      freeDeliveryThreshold: zone.freeDeliveryThreshold,
      weekendDelivery: zone.weekendDelivery,
      holidayDelivery: zone.holidayDelivery,
      deliveryWindows: zone.deliveryWindows.map((window: any) => ({
        id: window.id,
        name: window.name,
        startTime: window.startTime,
        endTime: window.endTime,
        additionalCostCents: window.additionalCostCents,
        isAvailable: window.isAvailable,
      })),
    }));
  }

  /**
   * Find delivery zone by zip code
   * Core function for shipping calculation
   */
  async findDeliveryZoneByZipCode(
    zipCode: string
  ): Promise<DeliveryZoneResponse | null> {
    const zone = await prisma.deliveryZone.findFirst({
      where: {
        isActive: true,
        zipCodes: {
          has: zipCode, // PostgreSQL array contains check
        },
      },
      include: {
        deliveryWindows: {
          where: { isAvailable: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!zone) return null;

    return {
      id: zone.id,
      name: zone.name,
      description: zone.description ?? undefined,
      zipCodes: zone.zipCodes,
      cities: zone.cities,
      standardCostCents: zone.standardCostCents,
      expressCostCents: zone.expressCostCents ?? undefined,
      sameDayCostCents: zone.sameDayCostCents ?? undefined,
      standardDeliveryDays: zone.standardDeliveryDays,
      expressDeliveryDays: zone.expressDeliveryDays,
      sameDayAvailable: zone.sameDayAvailable,
      sameDayCutoffHour: zone.sameDayCutoffHour ?? undefined,
      freeDeliveryThreshold: zone.freeDeliveryThreshold ?? undefined,
      weekendDelivery: zone.weekendDelivery,
      holidayDelivery: zone.holidayDelivery,
      deliveryWindows: zone.deliveryWindows.map((window: {
        id: string;
        name: string;
        startTime: string;
        endTime: string;
        additionalCostCents: number | null;
        isAvailable: boolean;
      }) => ({
        id: window.id,
        name: window.name,
        startTime: window.startTime,
        endTime: window.endTime,
        additionalCostCents: window.additionalCostCents ?? 0,
        isAvailable: window.isAvailable,
      })),
    };
  }

  // ============================================
  // 📦 DELIVERY METHODS
  // ============================================

  /**
   * Get all available delivery methods
   * Used for showing shipping options to customers
   */
  async getAllDeliveryMethods(): Promise<DeliveryMethodResponse[]> {
    const methods = await prisma.deliveryMethod.findMany({
      where: { isActive: true },
      orderBy: { estimatedDays: 'asc' }, // Fastest delivery first
    });

    return methods.map((method: any) => ({
      id: method.id,
      name: method.name,
      description: method.description,
      deliveryType: method.deliveryType as any,
      baseCostCents: method.baseCostCents,
      estimatedDays: method.estimatedDays,
      trackingAvailable: method.trackingAvailable,
      signatureRequired: method.signatureRequired,
      insuranceIncluded: method.insuranceIncluded,
    }));
  }

  // ============================================
  // 💰 SHIPPING CALCULATION
  // ============================================

  /**
   * Calculate shipping costs for a given order
   * This is the main function called during checkout
   */
  async calculateShipping(
    request: ShippingCalculationRequest
  ): Promise<ShippingCalculationResponse> {
    const { zipCode, orderValueCents, deliveryType, deliveryWindowId } =
      request;

    // Find delivery zone for the zip code
    const zone = await this.findDeliveryZoneByZipCode(zipCode);

    if (!zone) {
      return {
        availableMethods: [],
        unavailableReasons: [
          `We don't currently deliver to zip code ${zipCode}. Please contact us for special arrangements.`,
        ],
      };
    }

    // Get available delivery methods
    const allMethods = await this.getAllDeliveryMethods();

    // Filter and calculate costs for each method
    const availableMethods = [];
    const unavailableReasons = [];

    for (const method of allMethods) {
      const calculation = await this.calculateMethodCost(
        method,
        zone,
        orderValueCents,
        deliveryWindowId
      );

      if (calculation.available) {
        availableMethods.push({
          method,
          costCents: calculation.costCents,
          finalCostCents: calculation.finalCostCents,
          estimatedDelivery: calculation.estimatedDelivery,
          isFree: calculation.finalCostCents === 0,
        });
      } else {
        unavailableReasons.push(`${method.name}: ${calculation.reason}`);
      }
    }

    // Sort by final cost (free first, then cheapest)
    availableMethods.sort((a, b) => a.finalCostCents - b.finalCostCents);

    return {
      zone,
      availableMethods,
      unavailableReasons:
        unavailableReasons.length > 0 ? unavailableReasons : undefined,
    };
  }

  /**
   * Calculate cost for a specific delivery method
   * Private helper function with detailed logic
   */
  private async calculateMethodCost(
    method: DeliveryMethodResponse,
    zone: DeliveryZoneResponse,
    orderValueCents: number,
    deliveryWindowId?: string
  ) {
    const now = new Date();
    const currentHour = now.getHours();

    // Check if method is available in this zone
    let zoneCostCents = 0;
    let estimatedDays = method.estimatedDays;

    switch (method.deliveryType) {
      case 'STANDARD':
        zoneCostCents = zone.standardCostCents;
        estimatedDays = zone.standardDeliveryDays;
        break;
      case 'EXPRESS':
        if (!zone.expressCostCents) {
          return {
            available: false,
            reason: 'Express delivery not available in your area',
            costCents: 0,
            finalCostCents: 0,
            estimatedDelivery: '',
          };
        }
        zoneCostCents = zone.expressCostCents;
        estimatedDays = zone.expressDeliveryDays;
        break;
      case 'SAME_DAY':
        if (!zone.sameDayAvailable || !zone.sameDayCostCents) {
          return {
            available: false,
            reason: 'Same day delivery not available in your area',
            costCents: 0,
            finalCostCents: 0,
            estimatedDelivery: '',
          };
        }
        if (zone.sameDayCutoffHour && currentHour >= zone.sameDayCutoffHour) {
          return {
            available: false,
            reason: `Same day delivery cutoff time (${zone.sameDayCutoffHour}:00) has passed`,
            costCents: 0,
            finalCostCents: 0,
            estimatedDelivery: '',
          };
        }
        zoneCostCents = zone.sameDayCostCents;
        estimatedDays = 0; // Same day
        break;
      case 'PICKUP':
        // Store pickup - no delivery cost
        zoneCostCents = 0;
        estimatedDays = 0;
        break;
    }

    // Calculate total cost (method base cost + zone cost)
    let totalCostCents = method.baseCostCents + zoneCostCents;

    // Add delivery window cost if specified
    if (deliveryWindowId) {
      const window = zone.deliveryWindows.find(
        (w) => w.id === deliveryWindowId
      );
      if (window) {
        totalCostCents += window.additionalCostCents;
      }
    }

    // Apply free shipping threshold
    let finalCostCents = totalCostCents;
    if (
      zone.freeDeliveryThreshold &&
      orderValueCents >= zone.freeDeliveryThreshold
    ) {
      finalCostCents = 0;
    }

    // Calculate estimated delivery date
    const estimatedDelivery = this.calculateEstimatedDelivery(estimatedDays);

    return {
      available: true,
      reason: '',
      costCents: totalCostCents,
      finalCostCents,
      estimatedDelivery: estimatedDelivery.toISOString(),
    };
  }

  /**
   * Calculate estimated delivery date
   * Accounts for weekends and business days
   */
  private calculateEstimatedDelivery(estimatedDays: number): Date {
    const now = new Date();
    let deliveryDate = new Date(now);

    if (estimatedDays === 0) {
      // Same day delivery
      return deliveryDate;
    }

    let businessDaysAdded = 0;

    while (businessDaysAdded < estimatedDays) {
      deliveryDate.setDate(deliveryDate.getDate() + 1);

      // Skip weekends (Saturday = 6, Sunday = 0)
      const dayOfWeek = deliveryDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        businessDaysAdded++;
      }
    }

    return deliveryDate;
  }

  // ============================================
  // ✅ DELIVERY VALIDATION
  // ============================================

  /**
   * Validate if delivery is possible to a location
   * Used for address validation during checkout
   */
  async validateDelivery(request: DeliveryValidationRequest): Promise<{
    isValid: boolean;
    zone?: DeliveryZoneResponse;
    message: string;
  }> {
    const { zipCode, city, deliveryType, requestedDate } = request;

    // Check if we deliver to this zip code
    const zone = await this.findDeliveryZoneByZipCode(zipCode);

    if (!zone) {
      return {
        isValid: false,
        message: `We don't currently deliver to zip code ${zipCode}. Please contact us for special arrangements.`,
      };
    }

    // Validate city if provided
    if (city && zone.cities.length > 0) {
      const cityMatch = zone.cities.some(
        (zoneCity) => zoneCity.toLowerCase() === city.toLowerCase()
      );
      if (!cityMatch) {
        return {
          isValid: false,
          zone,
          message: `We don't deliver to ${city} in zip code ${zipCode}. Available cities: ${zone.cities.join(
            ', '
          )}`,
        };
      }
    }

    // Validate delivery type if specified
    if (deliveryType) {
      switch (deliveryType) {
        case 'EXPRESS':
          if (!zone.expressCostCents) {
            return {
              isValid: false,
              zone,
              message: 'Express delivery is not available in your area',
            };
          }
          break;
        case 'SAME_DAY':
          if (!zone.sameDayAvailable) {
            return {
              isValid: false,
              zone,
              message: 'Same day delivery is not available in your area',
            };
          }
          break;
      }
    }

    // Validate requested date if provided
    if (requestedDate) {
      const requested = new Date(requestedDate);
      const now = new Date();

      if (requested < now) {
        return {
          isValid: false,
          zone,
          message: 'Requested delivery date cannot be in the past',
        };
      }

      // Check if weekend delivery is available
      const dayOfWeek = requested.getDay();
      if ((dayOfWeek === 0 || dayOfWeek === 6) && !zone.weekendDelivery) {
        return {
          isValid: false,
          zone,
          message: 'Weekend delivery is not available in your area',
        };
      }
    }

    return {
      isValid: true,
      zone,
      message: 'Delivery is available to this location',
    };
  }

  // ============================================
  // 📍 ORDER TRACKING
  // ============================================

  /**
   * Get tracking information for an order
   * Used in customer order tracking pages
   */
  async getOrderTracking(
    orderId: string
  ): Promise<DeliveryTrackingResponse | null> {
    const tracking = await prisma.deliveryTracking.findUnique({
      where: { orderId },
      include: {
        events: {
          where: { isCustomerVisible: true },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!tracking) return null;

    return {
      id: tracking.id,
      orderId: tracking.orderId,
      trackingNumber: tracking.trackingNumber ?? undefined,
      carrierName: tracking.carrierName ?? undefined,
      status: tracking.status,
      currentLocation: tracking.currentLocation ?? undefined,
      estimatedDelivery: tracking.estimatedDelivery?.toISOString(),
      actualDelivery: tracking.actualDelivery?.toISOString(),
      deliveredTo: tracking.deliveredTo ?? undefined,
      deliveryNotes: tracking.deliveryNotes ?? undefined,
      deliveryPhoto: tracking.deliveryPhoto ?? undefined,
      events: tracking.events.map((event: any) => ({
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        location: event.location,
        status: event.status,
        description: event.description,
        isCustomerVisible: event.isCustomerVisible,
      })),
    };
  }

  /**
   * Create tracking record for new order
   * Called when order is placed
   */
  async createOrderTracking(
    orderId: string,
    carrierName: string = 'Flora Express'
  ): Promise<string> {
    // Generate tracking number (in real app, this would come from carrier API)
    const trackingNumber = `FL${Date.now()}${Math.random()
      .toString(36)
      .substr(2, 4)
      .toUpperCase()}`;

    const tracking = await prisma.deliveryTracking.create({
      data: {
        orderId,
        trackingNumber,
        carrierName,
        status: 'PREPARING',
        events: {
          create: {
            timestamp: new Date(),
            status: 'ORDER_PLACED',
            description:
              'Your Flora order has been placed and is being prepared',
            isCustomerVisible: true,
          },
        },
      },
    });

    return tracking.trackingNumber!;
  }

  /**
   * Update tracking status
   * Called by internal systems or carrier webhooks
   */
  async updateTrackingStatus(
    trackingNumber: string,
    status: string,
    description: string,
    location?: string
  ): Promise<void> {
    await prisma.deliveryTracking.update({
      where: { trackingNumber },
      data: {
        status,
        currentLocation: location,
        updatedAt: new Date(),
        events: {
          create: {
            timestamp: new Date(),
            status,
            description,
            location,
            isCustomerVisible: true,
          },
        },
      },
    });
  }
}
