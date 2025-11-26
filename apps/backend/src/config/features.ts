// ============================================
// 🎛️ FEATURE FLAGS
// ============================================
// Feature flags for gradual rollout of new delivery features
// Use these to enable/disable features without code changes

/**
 * Delivery feature flags
 * Set via environment variables for easy production toggling
 */
export const DELIVERY_FEATURES = {
  /**
   * Enable Google Distance Matrix API for distance-based pricing
   * When disabled: Falls back to DeliveryZone or hardcoded pricing
   */
  USE_GOOGLE_DISTANCE: process.env.ENABLE_GOOGLE_DISTANCE === 'true',

  /**
   * Enable Sendle API for real-time shipping quotes
   * When disabled: Falls back to Google Distance or DeliveryZone pricing
   */
  USE_SENDLE_QUOTES: process.env.ENABLE_SENDLE_QUOTES === 'true',

  /**
   * Enable Sendle tracking integration
   * When disabled: Uses manual Flora tracking only
   */
  USE_SENDLE_TRACKING: process.env.ENABLE_SENDLE_TRACKING === 'true',

  /**
   * Sendle sandbox mode (ALWAYS true for Flora - never use production)
   * This prevents accidental real shipment creation
   */
  SENDLE_SANDBOX_MODE: process.env.SENDLE_SANDBOX_MODE !== 'false', // Default to true
};

/**
 * Log feature flag status on startup
 * Helps debug which features are enabled
 */
export function logFeatureFlags() {
  console.log('🎛️  Feature Flags Status:');
  console.log(`  Google Distance API: ${DELIVERY_FEATURES.USE_GOOGLE_DISTANCE ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`  Sendle Quotes: ${DELIVERY_FEATURES.USE_SENDLE_QUOTES ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`  Sendle Tracking: ${DELIVERY_FEATURES.USE_SENDLE_TRACKING ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`  Sendle Sandbox Mode: ${DELIVERY_FEATURES.SENDLE_SANDBOX_MODE ? '✅ SANDBOX' : '⚠️  PRODUCTION (DANGER!)'}`);
}
