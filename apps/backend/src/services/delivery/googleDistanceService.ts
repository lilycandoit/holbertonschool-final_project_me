// ============================================
// 🗺️ GOOGLE DISTANCE MATRIX SERVICE
// ============================================
// Handles Google Maps API integration for:
// - Distance calculation between origin and destination
// - Address geocoding (address → lat/lng)
// - Delivery time estimation based on distance
// - Coordinate caching to minimize API quota usage

import { DELIVERY_FEATURES } from '../../config/features';

/**
 * Coordinates interface
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Distance calculation result
 */
export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
  origin: Coordinates;
  destination: Coordinates;
  apiResponse?: any; // Cache full API response for debugging
}

/**
 * Geocoding result
 */
export interface GeocodeResult {
  coordinates: Coordinates;
  formattedAddress: string;
}

/**
 * Google Distance Matrix Service
 *
 * **Important**: This service requires GOOGLE_MAPS_API_KEY environment variable
 * Feature flag: DELIVERY_FEATURES.USE_GOOGLE_DISTANCE
 */
export class GoogleDistanceService {
  private apiKey: string | undefined;
  private origin: Coordinates;
  private coordinateCache: Map<string, Coordinates>; // Cache by postcode

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;

    // Flora's origin (Melbourne CBD - Parliament House)
    this.origin = {
      latitude: parseFloat(process.env.DELIVERY_ORIGIN_LAT || '-37.8136'),
      longitude: parseFloat(process.env.DELIVERY_ORIGIN_LNG || '144.9631'),
    };

    // In-memory cache for coordinates (avoid repeated API calls)
    this.coordinateCache = new Map();

    this.logStatus();
  }

  /**
   * Log service status on initialization
   */
  private logStatus(): void {
    console.log('🗺️  Google Distance Matrix Service:');

    if (!this.apiKey) {
      console.log('   ⚠️  API Key: NOT CONFIGURED');
      console.log('   💡 Set GOOGLE_MAPS_API_KEY in .env to enable');
    } else {
      console.log(`   ✅ API Key: Configured (${this.apiKey.substring(0, 10)}...)`);
    }

    console.log(`   📍 Origin: ${this.origin.latitude}, ${this.origin.longitude} (Melbourne CBD)`);
    console.log(`   🎛️  Feature Flag: ${DELIVERY_FEATURES.USE_GOOGLE_DISTANCE ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Check if service is properly configured
   */
  private isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Calculate distance between origin and destination
   *
   * @param destinationAddress - Full delivery address or postcode
   * @returns Distance result with km, duration, and coordinates
   * @throws Error if API key not configured or API call fails
   */
  async calculateDistance(destinationAddress: string): Promise<DistanceResult> {
    if (!this.isConfigured()) {
      throw new Error('Google Distance Matrix API not configured or feature disabled');
    }

    try {
      // First, geocode the destination address to get coordinates
      const geocodeResult = await this.geocodeAddress(destinationAddress);

      // Call Distance Matrix API
      const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
      url.searchParams.append('origins', `${this.origin.latitude},${this.origin.longitude}`);
      url.searchParams.append('destinations', `${geocodeResult.coordinates.latitude},${geocodeResult.coordinates.longitude}`);
      url.searchParams.append('mode', 'driving');
      url.searchParams.append('key', this.apiKey!);

      console.log(`🗺️  Calling Google Distance Matrix API: ${destinationAddress}`);

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.status !== 'OK') {
        throw new Error(`Google Distance Matrix API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
      }

      const element = data.rows[0]?.elements[0];

      if (!element || element.status !== 'OK') {
        throw new Error(`Distance calculation failed: ${element?.status || 'No data'}`);
      }

      // Extract distance and duration
      const distanceMeters = element.distance.value;
      const durationSeconds = element.duration.value;

      const result: DistanceResult = {
        distanceKm: distanceMeters / 1000, // Convert to km
        durationMinutes: Math.ceil(durationSeconds / 60), // Convert to minutes
        origin: this.origin,
        destination: geocodeResult.coordinates,
        apiResponse: data, // Cache for debugging
      };

      console.log(`✅ Distance calculated: ${result.distanceKm.toFixed(2)}km, ${result.durationMinutes} minutes`);

      return result;

    } catch (error) {
      console.error('❌ Google Distance Matrix API error:', error);
      throw error;
    }
  }

  /**
   * Geocode address to coordinates (lat/lng)
   * Uses cache to minimize API calls
   *
   * @param address - Address string or postcode
   * @returns Geocoding result with coordinates
   */
  async geocodeAddress(address: string): Promise<GeocodeResult> {
    if (!this.isConfigured()) {
      throw new Error('Google Geocoding API not configured or feature disabled');
    }

    // Check cache first (use postcode as cache key if available)
    const postcode = this.extractPostcode(address);
    if (postcode && this.coordinateCache.has(postcode)) {
      const cached = this.coordinateCache.get(postcode)!;
      console.log(`📦 Using cached coordinates for ${postcode}`);

      return {
        coordinates: cached,
        formattedAddress: address,
      };
    }

    try {
      // Call Geocoding API
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.append('address', `${address}, Melbourne, VIC, Australia`); // Scope to Melbourne
      url.searchParams.append('key', this.apiKey!);

      console.log(`🗺️  Geocoding address: ${address}`);

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.status !== 'OK') {
        throw new Error(`Google Geocoding API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
      }

      const location = data.results[0]?.geometry?.location;
      if (!location) {
        throw new Error('No geocoding results found');
      }

      const coordinates: Coordinates = {
        latitude: location.lat,
        longitude: location.lng,
      };

      const formattedAddress = data.results[0]?.formatted_address || address;

      // Validate coordinates are in Melbourne region (rough bounds check)
      if (!this.isInMelbourneRegion(coordinates)) {
        console.warn(`⚠️  Coordinates outside Melbourne region: ${coordinates.latitude}, ${coordinates.longitude}`);
      }

      // Cache result if postcode available
      if (postcode) {
        this.coordinateCache.set(postcode, coordinates);
        console.log(`💾 Cached coordinates for ${postcode}`);
      }

      console.log(`✅ Geocoded: ${formattedAddress}`);

      return {
        coordinates,
        formattedAddress,
      };

    } catch (error) {
      console.error('❌ Google Geocoding API error:', error);
      throw error;
    }
  }

  /**
   * Calculate distance-based shipping cost
   * Simple formula: Base cost + (distance × rate per km)
   *
   * @param distanceKm - Distance in kilometers
   * @returns Shipping cost in cents
   */
  calculateDistanceBasedCost(distanceKm: number): number {
    const baseCostCents = 500;  // $5 base cost
    const costPerKmCents = 50;  // $0.50 per km

    // Calculate with ceiling to avoid fractional cents
    const totalCost = baseCostCents + Math.ceil(distanceKm * costPerKmCents);

    // Cap maximum cost at $30
    const maxCostCents = 3000;
    return Math.min(totalCost, maxCostCents);
  }

  /**
   * Estimate delivery time based on distance
   *
   * @param distanceKm - Distance in kilometers
   * @returns Estimated delivery days
   */
  estimateDeliveryDays(distanceKm: number): number {
    if (distanceKm <= 10) return 1;      // Same or next day
    if (distanceKm <= 25) return 2;      // 2 days
    if (distanceKm <= 50) return 3;      // 3 days (max Melbourne metro)
    return 5;                             // Extended delivery
  }

  /**
   * Extract postcode from address string
   * Australian postcodes are 4 digits
   */
  private extractPostcode(address: string): string | null {
    const match = address.match(/\b(\d{4})\b/);
    return match ? match[1] : null;
  }

  /**
   * Validate coordinates are within Melbourne metropolitan region
   * Rough bounds check to catch geocoding errors
   */
  private isInMelbourneRegion(coords: Coordinates): boolean {
    // Melbourne rough bounding box
    const MIN_LAT = -38.5;
    const MAX_LAT = -37.5;
    const MIN_LNG = 144.5;
    const MAX_LNG = 145.5;

    return (
      coords.latitude >= MIN_LAT &&
      coords.latitude <= MAX_LAT &&
      coords.longitude >= MIN_LNG &&
      coords.longitude <= MAX_LNG
    );
  }

  /**
   * Clear coordinate cache
   * Useful for testing or if cache becomes stale
   */
  clearCache(): void {
    this.coordinateCache.clear();
    console.log('🗑️  Coordinate cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.coordinateCache.size,
      entries: Array.from(this.coordinateCache.keys()),
    };
  }
}
