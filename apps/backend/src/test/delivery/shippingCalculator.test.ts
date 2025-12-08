// ============================================
// 💰 SHIPPING CALCULATOR TESTS
// ============================================
// Tests for 4-tier fallback shipping calculator
// Verifies all tiers work correctly and fall back properly

import { ShippingCalculator } from '../../services/delivery/shippingCalculator';
import { GoogleDistanceService } from '../../services/delivery/googleDistanceService';
import { SendleService } from '../../services/delivery/sendleService';
import { DeliveryService } from '../../services/delivery/deliveryService';

// Mock all service dependencies
jest.mock('../../services/delivery/googleDistanceService');
jest.mock('../../services/delivery/sendleService');
jest.mock('../../services/delivery/deliveryService');

describe.skip('ShippingCalculator', () => {
  let calculator: ShippingCalculator;
  let mockGoogleService: jest.Mocked<GoogleDistanceService>;
  let mockSendleService: jest.Mocked<SendleService>;
  let mockDeliveryService: jest.Mocked<DeliveryService>;

  const mockShippingRequest = {
    deliveryPostcode: '3121',
    deliverySuburb: 'Richmond',
    deliveryAddress: '123 Test St, Richmond',
    orderValueCents: 8000, // $80
    weightKg: 1.5,
  };

  beforeEach(() => {
    // Reset environment for each test
    process.env.ENABLE_SENDLE_QUOTES = 'false';
    process.env.ENABLE_GOOGLE_DISTANCE = 'false';

    // Create calculator instance
    calculator = new ShippingCalculator();

    // Get mocked instances
    mockGoogleService = (calculator as any).googleService;
    mockSendleService = (calculator as any).sendleService;
    mockDeliveryService = (calculator as any).deliveryService;

    jest.clearAllMocks();
  });

  // ============================================
  // TIER 1: SENDLE API TESTS
  // ============================================

  describe('Tier 1: Sendle API', () => {
    beforeEach(() => {
      process.env.ENABLE_SENDLE_QUOTES = 'true';
      calculator = new ShippingCalculator();
      mockSendleService = (calculator as any).sendleService;
    });

    it('should use Sendle tier when enabled and successful', async () => {
      const mockQuote = {
        quoteId: 'QUOTE_123',
        priceCents: 1250,
        priceWithTaxCents: 1250,
        etaDays: 3,
        etaDate: '2025-01-29',
        serviceName: 'Standard',
      };

      mockSendleService.getQuote.mockResolvedValueOnce(mockQuote);
      mockSendleService.storeQuote.mockResolvedValueOnce(undefined);

      const result = await calculator.calculate(mockShippingRequest);

      expect(result).toEqual({
        costCents: 1250,
        method: 'SENDLE',
        estimatedDays: 3,
        details: 'Sendle Standard',
        quoteId: 'QUOTE_123',
      });

      expect(mockSendleService.getQuote).toHaveBeenCalledWith(
        '3121',
        'Richmond',
        1.5
      );

      expect(mockSendleService.storeQuote).toHaveBeenCalledWith(
        mockQuote,
        '3121'
      );
    });

    it('should fallback to Tier 2 if Sendle fails', async () => {
      process.env.ENABLE_GOOGLE_DISTANCE = 'true';
      calculator = new ShippingCalculator();
      mockSendleService = (calculator as any).sendleService;
      mockGoogleService = (calculator as any).googleService;

      // Sendle fails
      mockSendleService.getQuote.mockRejectedValueOnce(new Error('API error'));

      // Google succeeds
      mockGoogleService.calculateDistance.mockResolvedValueOnce({
        distanceKm: 4.2,
        durationMinutes: 8,
        origin: { latitude: -37.8136, longitude: 144.9631 },
        destination: { latitude: -37.8227, longitude: 144.9984 },
      });
      mockGoogleService.calculateDistanceBasedCost.mockReturnValueOnce(710);
      mockGoogleService.estimateDeliveryDays.mockReturnValueOnce(1);

      const result = await calculator.calculate(mockShippingRequest);

      expect(result.method).toBe('GOOGLE_DISTANCE');
      expect(mockSendleService.getQuote).toHaveBeenCalled();
      expect(mockGoogleService.calculateDistance).toHaveBeenCalled();
    });
  });

  // ============================================
  // TIER 2: GOOGLE DISTANCE TESTS
  // ============================================

  describe('Tier 2: Google Distance', () => {
    beforeEach(() => {
      process.env.ENABLE_GOOGLE_DISTANCE = 'true';
      calculator = new ShippingCalculator();
      mockGoogleService = (calculator as any).googleService;
    });

    it('should use Google Distance tier when enabled', async () => {
      mockGoogleService.calculateDistance.mockResolvedValueOnce({
        distanceKm: 4.2,
        durationMinutes: 8,
        origin: { latitude: -37.8136, longitude: 144.9631 },
        destination: { latitude: -37.8227, longitude: 144.9984 },
      });
      mockGoogleService.calculateDistanceBasedCost.mockReturnValueOnce(710);
      mockGoogleService.estimateDeliveryDays.mockReturnValueOnce(1);

      const result = await calculator.calculate(mockShippingRequest);

      expect(result).toEqual({
        costCents: 710,
        method: 'GOOGLE_DISTANCE',
        estimatedDays: 1,
        distanceKm: 4.2,
        details: 'Distance-based (4.2km)',
      });

      expect(mockGoogleService.calculateDistance).toHaveBeenCalledWith(
        '123 Test St, Richmond'
      );
    });

    it('should fallback to Tier 3 if Google fails', async () => {
      mockGoogleService.calculateDistance.mockRejectedValueOnce(
        new Error('API error')
      );

      // Zone succeeds
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        cities: ['Richmond'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
      } as any);

      const result = await calculator.calculate(mockShippingRequest);

      expect(result.method).toBe('ZONE');
      expect(mockGoogleService.calculateDistance).toHaveBeenCalled();
      expect(mockDeliveryService.findDeliveryZoneByZipCode).toHaveBeenCalled();
    });
  });

  // ============================================
  // TIER 3: DELIVERY ZONE TESTS
  // ============================================

  describe('Tier 3: Delivery Zone', () => {
    it('should use Zone tier when APIs disabled', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        cities: ['Richmond'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
        freeDeliveryThreshold: null,
      } as any);

      const result = await calculator.calculate(mockShippingRequest);

      expect(result).toEqual({
        costCents: 1099,
        method: 'ZONE',
        estimatedDays: 2,
        details: 'Zone: Inner East',
      });
    });

    it('should apply free shipping threshold from zone', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        cities: ['Richmond'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
        freeDeliveryThreshold: 5000, // $50 threshold
      } as any);

      // Order value is $80 (8000 cents) - over threshold
      const result = await calculator.calculate({
        ...mockShippingRequest,
        orderValueCents: 8000,
      });

      expect(result.costCents).toBe(0); // Free shipping
    });

    it('should not apply free shipping if under threshold', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        cities: ['Richmond'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
        freeDeliveryThreshold: 10000, // $100 threshold
      } as any);

      // Order value is $80 (8000 cents) - under threshold
      const result = await calculator.calculate({
        ...mockShippingRequest,
        orderValueCents: 8000,
      });

      expect(result.costCents).toBe(1099); // Regular shipping cost
    });

    it('should fallback to Tier 4 if no zone found', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce(null);

      const result = await calculator.calculate(mockShippingRequest);

      expect(result.method).toBe('FALLBACK');
      expect(result.costCents).toBe(899); // Hardcoded fallback
    });
  });

  // ============================================
  // TIER 4: HARDCODED FALLBACK TESTS
  // ============================================

  describe('Tier 4: Hardcoded Fallback', () => {
    it('should use fallback when all tiers fail', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockRejectedValueOnce(
        new Error('Database error')
      );

      const result = await calculator.calculate(mockShippingRequest);

      expect(result).toEqual({
        costCents: 899,
        method: 'FALLBACK',
        estimatedDays: 3,
        details: 'Standard delivery (fallback pricing)',
      });
    });

    it('should always work regardless of errors', async () => {
      // Simulate complete system failure
      process.env.ENABLE_SENDLE_QUOTES = 'true';
      process.env.ENABLE_GOOGLE_DISTANCE = 'true';
      calculator = new ShippingCalculator();
      mockSendleService = (calculator as any).sendleService;
      mockGoogleService = (calculator as any).googleService;
      mockDeliveryService = (calculator as any).deliveryService;

      mockSendleService.getQuote.mockRejectedValueOnce(new Error('Sendle down'));
      mockGoogleService.calculateDistance.mockRejectedValueOnce(new Error('Google down'));
      mockDeliveryService.findDeliveryZoneByZipCode.mockRejectedValueOnce(new Error('DB down'));

      const result = await calculator.calculate(mockShippingRequest);

      expect(result.method).toBe('FALLBACK');
      expect(result.costCents).toBe(899);
      // Checkout succeeds even with all systems down!
    });
  });

  // ============================================
  // MULTIPLE DELIVERY OPTIONS TESTS
  // ============================================

  describe('calculateOptions', () => {
    it('should return multiple delivery options', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Melbourne CBD',
        zipCodes: ['3000'],
        cities: ['Melbourne'],
        standardCostCents: 899,
        standardDeliveryDays: 2,
        expressCostCents: 1599,
        expressDeliveryDays: 1,
        sameDayAvailable: true,
        sameDayCostCents: 2999,
        sameDayCutoffHour: 12,
        isActive: true,
      } as any);

      // Mock current time before cutoff (10 AM)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      const options = await calculator.calculateOptions({
        ...mockShippingRequest,
        deliveryPostcode: '3000',
        deliverySuburb: 'Melbourne',
      });

      expect(options).toHaveLength(3);
      expect(options[0].costCents).toBe(899); // Standard (cheapest)
      expect(options[1].costCents).toBe(1599); // Express
      expect(options[2].costCents).toBe(2999); // Same-day

      // Should be sorted by price
      expect(options[0].costCents).toBeLessThan(options[1].costCents);
      expect(options[1].costCents).toBeLessThan(options[2].costCents);
    });

    it('should not include same-day if after cutoff', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Melbourne CBD',
        zipCodes: ['3000'],
        cities: ['Melbourne'],
        standardCostCents: 899,
        standardDeliveryDays: 2,
        expressCostCents: 1599,
        expressDeliveryDays: 1,
        sameDayAvailable: true,
        sameDayCostCents: 2999,
        sameDayCutoffHour: 12,
        isActive: true,
      } as any);

      // Mock current time after cutoff (2 PM)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);

      const options = await calculator.calculateOptions({
        ...mockShippingRequest,
        deliveryPostcode: '3000',
      });

      expect(options).toHaveLength(2); // No same-day
      expect(options.find(o => o.estimatedDays === 0)).toBeUndefined();
    });

    it('should return only standard if zone does not support express', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Outer Metro',
        zipCodes: ['3805'],
        cities: ['Fountain Gate'],
        standardCostCents: 1599,
        standardDeliveryDays: 3,
        expressCostCents: null,
        sameDayAvailable: false,
        isActive: true,
      } as any);

      const options = await calculator.calculateOptions({
        ...mockShippingRequest,
        deliveryPostcode: '3805',
      });

      expect(options).toHaveLength(1); // Only standard
    });
  });

  // ============================================
  // FEATURE FLAG TESTS
  // ============================================

  describe('Feature Flags', () => {
    it('should skip Sendle tier if disabled', async () => {
      process.env.ENABLE_SENDLE_QUOTES = 'false';
      process.env.ENABLE_GOOGLE_DISTANCE = 'true';
      calculator = new ShippingCalculator();
      mockGoogleService = (calculator as any).googleService;
      mockSendleService = (calculator as any).sendleService;

      mockGoogleService.calculateDistance.mockResolvedValueOnce({
        distanceKm: 4.2,
        durationMinutes: 8,
        origin: { latitude: -37.8136, longitude: 144.9631 },
        destination: { latitude: -37.8227, longitude: 144.9984 },
      });
      mockGoogleService.calculateDistanceBasedCost.mockReturnValueOnce(710);
      mockGoogleService.estimateDeliveryDays.mockReturnValueOnce(1);

      await calculator.calculate(mockShippingRequest);

      // Should NOT call Sendle
      expect(mockSendleService.getQuote).not.toHaveBeenCalled();
      // Should call Google directly
      expect(mockGoogleService.calculateDistance).toHaveBeenCalled();
    });

    it('should skip Google tier if disabled', async () => {
      process.env.ENABLE_SENDLE_QUOTES = 'false';
      process.env.ENABLE_GOOGLE_DISTANCE = 'false';
      calculator = new ShippingCalculator();
      mockGoogleService = (calculator as any).googleService;
      mockDeliveryService = (calculator as any).deliveryService;

      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        cities: ['Richmond'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
      } as any);

      await calculator.calculate(mockShippingRequest);

      // Should NOT call Google
      expect(mockGoogleService.calculateDistance).not.toHaveBeenCalled();
      // Should call Zone directly
      expect(mockDeliveryService.findDeliveryZoneByZipCode).toHaveBeenCalled();
    });
  });

  // ============================================
  // FALLBACK STATISTICS TESTS
  // ============================================

  describe('getFallbackStats', () => {
    it('should return feature flag states', () => {
      process.env.ENABLE_SENDLE_QUOTES = 'true';
      process.env.ENABLE_GOOGLE_DISTANCE = 'true';
      process.env.SENDLE_SANDBOX_MODE = 'true';

      calculator = new ShippingCalculator();
      const stats = calculator.getFallbackStats();

      expect(stats).toEqual({
        sendleEnabled: true,
        googleEnabled: true,
        sandboxMode: true,
      });
    });

    it('should reflect disabled states', () => {
      process.env.ENABLE_SENDLE_QUOTES = 'false';
      process.env.ENABLE_GOOGLE_DISTANCE = 'false';

      calculator = new ShippingCalculator();
      const stats = calculator.getFallbackStats();

      expect(stats.sendleEnabled).toBe(false);
      expect(stats.googleEnabled).toBe(false);
    });
  });

  // ============================================
  // EDGE CASES & ERROR HANDLING
  // ============================================

  describe('Edge Cases', () => {
    it('should handle missing address gracefully', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        cities: ['Richmond'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
      } as any);

      const result = await calculator.calculate({
        deliveryPostcode: '3121',
        deliverySuburb: 'Richmond',
        orderValueCents: 5000,
        // No deliveryAddress
      });

      expect(result.method).toBe('ZONE');
      expect(result.costCents).toBe(1099);
    });

    it('should handle zero order value', async () => {
      mockDeliveryService.findDeliveryZoneByZipCode.mockResolvedValueOnce({
        id: 'zone-1',
        name: 'Inner East',
        zipCodes: ['3121'],
        cities: ['Richmond'],
        standardCostCents: 1099,
        standardDeliveryDays: 2,
        isActive: true,
        freeDeliveryThreshold: 5000,
      } as any);

      const result = await calculator.calculate({
        ...mockShippingRequest,
        orderValueCents: 0,
      });

      expect(result.costCents).toBe(1099); // No free shipping
    });

    it('should use default weight if not provided', async () => {
      process.env.ENABLE_SENDLE_QUOTES = 'true';
      calculator = new ShippingCalculator();
      mockSendleService = (calculator as any).sendleService;

      mockSendleService.getQuote.mockResolvedValueOnce({
        quoteId: 'QUOTE_123',
        priceCents: 1250,
        priceWithTaxCents: 1250,
        etaDays: 3,
        etaDate: '2025-01-29',
        serviceName: 'Standard',
      });

      await calculator.calculate({
        deliveryPostcode: '3121',
        deliverySuburb: 'Richmond',
        orderValueCents: 5000,
        // No weightKg
      });

      expect(mockSendleService.getQuote).toHaveBeenCalledWith(
        '3121',
        'Richmond',
        1.0 // Default weight
      );
    });
  });
});
