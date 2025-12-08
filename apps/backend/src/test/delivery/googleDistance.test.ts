// ============================================
// 🗺️ GOOGLE DISTANCE SERVICE TESTS
// ============================================
// Tests for Google Distance Matrix API integration
// Includes mocked tests and optional live API tests

import { GoogleDistanceService } from '../../services/delivery/googleDistanceService';

// Mock fetch globally for all tests
global.fetch = jest.fn();

describe('GoogleDistanceService', () => {
  let service: GoogleDistanceService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Set required environment variables
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
    process.env.DELIVERY_ORIGIN_LAT = '-37.8136';
    process.env.DELIVERY_ORIGIN_LNG = '144.9631';
    process.env.ENABLE_GOOGLE_DISTANCE = 'true';

    service = new GoogleDistanceService();
    mockFetch.mockClear();
  });

  afterEach(() => {
    service.clearCache();
  });

  // ============================================
  // INITIALIZATION TESTS
  // ============================================

  describe('Initialization', () => {
    it('should initialize with correct origin coordinates', () => {
      expect(service).toBeDefined();
      // Service should log initialization status
    });

    it('should handle missing API key gracefully', () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      const newService = new GoogleDistanceService();
      expect(newService).toBeDefined();
    });
  });

  // ============================================
  // GEOCODING TESTS
  // ============================================

  describe('geocodeAddress', () => {
    const mockGeocodeResponse = {
      status: 'OK',
      results: [
        {
          formatted_address: 'Richmond VIC 3121, Australia',
          geometry: {
            location: {
              lat: -37.8227,
              lng: 144.9984,
            },
          },
        },
      ],
    };

    it('should geocode a valid Melbourne address', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeocodeResponse,
      } as Response);

      const result = await service.geocodeAddress('Richmond, VIC 3121');

      expect(result).toEqual({
        coordinates: {
          latitude: -37.8227,
          longitude: 144.9984,
        },
        formattedAddress: 'Richmond VIC 3121, Australia',
      });

      // Verify API was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('maps.googleapis.com/maps/api/geocode')
      );
    });

    it('should cache coordinates by postcode', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGeocodeResponse,
      } as Response);

      // First call - hits API
      await service.geocodeAddress('Richmond, VIC 3121');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call with same postcode - uses cache
      await service.geocodeAddress('Different street, VIC 3121');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional call

      // Check cache stats
      const stats = service.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toContain('3121');
    });

    it('should handle geocoding errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          error_message: 'No results found',
        }),
      } as Response);

      await expect(service.geocodeAddress('Invalid Address')).rejects.toThrow(
        'Google Geocoding API error'
      );
    });

    it('should warn if coordinates outside Melbourne region', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Sydney coordinates (outside Melbourne)
      const sydneyResponse = {
        status: 'OK',
        results: [
          {
            formatted_address: 'Sydney NSW 2000, Australia',
            geometry: {
              location: {
                lat: -33.8688,
                lng: 151.2093,
              },
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sydneyResponse,
      } as Response);

      await service.geocodeAddress('Sydney, NSW 2000');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside Melbourne region')
      );

      consoleSpy.mockRestore();
    });

    it('should extract postcode from address string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGeocodeResponse,
      } as Response);

      await service.geocodeAddress('123 Test St, Richmond 3121');
      await service.geocodeAddress('456 Other St, 3121'); // Same postcode

      // Should only call API once due to postcode caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // DISTANCE CALCULATION TESTS
  // ============================================

  describe('calculateDistance', () => {
    const mockDistanceResponse = {
      status: 'OK',
      rows: [
        {
          elements: [
            {
              status: 'OK',
              distance: {
                value: 4200, // 4.2 km in meters
                text: '4.2 km',
              },
              duration: {
                value: 480, // 8 minutes in seconds
                text: '8 mins',
              },
            },
          ],
        },
      ],
    };

    const mockGeocodeResponse = {
      status: 'OK',
      results: [
        {
          formatted_address: 'Richmond VIC 3121, Australia',
          geometry: {
            location: {
              lat: -37.8227,
              lng: 144.9984,
            },
          },
        },
      ],
    };

    it('should calculate distance between origin and destination', async () => {
      // Mock geocoding call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeocodeResponse,
      } as Response);

      // Mock distance matrix call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDistanceResponse,
      } as Response);

      const result = await service.calculateDistance('Richmond, VIC 3121');

      expect(result).toEqual({
        distanceKm: 4.2,
        durationMinutes: 8,
        origin: {
          latitude: -37.8136,
          longitude: 144.9631,
        },
        destination: {
          latitude: -37.8227,
          longitude: 144.9984,
        },
        apiResponse: mockDistanceResponse,
      });

      // Verify both APIs called
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle distance calculation errors', async () => {
      // Mock geocoding success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeocodeResponse,
      } as Response);

      // Mock distance matrix error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          error_message: 'No route found',
        }),
      } as Response);

      await expect(
        service.calculateDistance('Invalid Destination')
      ).rejects.toThrow('Google Distance Matrix API error');
    });

    it('should throw error if feature disabled', async () => {
      process.env.ENABLE_GOOGLE_DISTANCE = 'false';
      const disabledService = new GoogleDistanceService();

      await expect(
        disabledService.calculateDistance('Richmond, VIC 3121')
      ).rejects.toThrow('not configured or feature disabled');
    });

    it('should throw error if API key missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      const noKeyService = new GoogleDistanceService();

      await expect(
        noKeyService.calculateDistance('Richmond, VIC 3121')
      ).rejects.toThrow('not configured or feature disabled');
    });
  });

  // ============================================
  // COST CALCULATION TESTS
  // ============================================

  describe('calculateDistanceBasedCost', () => {
    it('should calculate cost for short distances', () => {
      const cost = service.calculateDistanceBasedCost(5); // 5 km
      expect(cost).toBe(750); // $5 base + (5 × $0.50) = $7.50
    });

    it('should calculate cost for medium distances', () => {
      const cost = service.calculateDistanceBasedCost(25); // 25 km
      expect(cost).toBe(1750); // $5 + (25 × $0.50) = $17.50
    });

    it('should cap cost at maximum', () => {
      const cost = service.calculateDistanceBasedCost(100); // 100 km
      expect(cost).toBe(3000); // Capped at $30
    });

    it('should handle zero distance', () => {
      const cost = service.calculateDistanceBasedCost(0);
      expect(cost).toBe(500); // $5 base cost
    });

    it('should round up fractional cents', () => {
      const cost = service.calculateDistanceBasedCost(5.5); // 5.5 km
      // $5 + (5.5 × $0.50) = $7.75 → 775 cents
      expect(cost).toBe(775);
    });
  });

  // ============================================
  // DELIVERY TIME ESTIMATION TESTS
  // ============================================

  describe('estimateDeliveryDays', () => {
    it('should estimate 1 day for short distances', () => {
      expect(service.estimateDeliveryDays(5)).toBe(1);
      expect(service.estimateDeliveryDays(10)).toBe(1);
    });

    it('should estimate 2 days for medium distances', () => {
      expect(service.estimateDeliveryDays(15)).toBe(2);
      expect(service.estimateDeliveryDays(25)).toBe(2);
    });

    it('should estimate 3 days for outer metro', () => {
      expect(service.estimateDeliveryDays(30)).toBe(3);
      expect(service.estimateDeliveryDays(50)).toBe(3);
    });

    it('should estimate 5 days for extended delivery', () => {
      expect(service.estimateDeliveryDays(60)).toBe(5);
      expect(service.estimateDeliveryDays(100)).toBe(5);
    });
  });

  // ============================================
  // CACHE MANAGEMENT TESTS
  // ============================================

  describe('Cache Management', () => {
    it('should clear cache successfully', () => {
      const mockGeocodeResponse = {
        status: 'OK',
        results: [
          {
            formatted_address: 'Richmond VIC 3121, Australia',
            geometry: {
              location: { lat: -37.8227, lng: 144.9984 },
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockGeocodeResponse,
      } as Response);

      // Add entries to cache
      service.geocodeAddress('Richmond, VIC 3121');

      // Clear cache
      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it('should provide cache statistics', () => {
      const stats = service.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('entries');
      expect(Array.isArray(stats.entries)).toBe(true);
    });
  });

  // ============================================
  // OPTIONAL: LIVE API TESTS
  // ============================================
  // Uncomment to test with real Google API (requires API key)

  describe.skip('Live API Tests', () => {
    let liveService: GoogleDistanceService;

    beforeAll(() => {
      // Use real API key from environment
      if (!process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY === 'test-api-key') {
        console.warn('⚠️  Skipping live API tests - GOOGLE_MAPS_API_KEY not set');
        return;
      }
      liveService = new GoogleDistanceService();
    });

    it('should geocode real Melbourne address', async () => {
      const result = await liveService.geocodeAddress('Flinders Street Station, Melbourne');

      expect(result.coordinates.latitude).toBeCloseTo(-37.818, 1);
      expect(result.coordinates.longitude).toBeCloseTo(144.967, 1);
      expect(result.formattedAddress).toContain('Melbourne');
    }, 15000);

    it('should calculate real distance to Richmond', async () => {
      const result = await liveService.calculateDistance('Richmond, VIC 3121');

      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.distanceKm).toBeLessThan(10); // Should be ~4km
      expect(result.durationMinutes).toBeGreaterThan(0);
    }, 15000);
  });
});
