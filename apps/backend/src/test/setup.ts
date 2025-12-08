// Jest setup file for Flora backend tests
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment variables if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Mock environment variables for testing
process.env.AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'test-domain.auth0.com';
process.env.AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || 'https://flora-api.com';
process.env.AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || 'test-secret';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.test.com';
process.env.SMTP_PORT = process.env.SMTP_PORT || '587';
process.env.SMTP_USER = process.env.SMTP_USER || 'test@flora.com';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test-password';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/flora_test';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key';

// Delivery system test environment variables
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'test-google-api-key';
process.env.SENDLE_API_ID = process.env.SENDLE_API_ID || 'test-sendle-id';
process.env.SENDLE_API_KEY = process.env.SENDLE_API_KEY || 'test-sendle-key';
process.env.SENDLE_SANDBOX_MODE = 'true'; // Always true for tests
process.env.DELIVERY_ORIGIN_LAT = '-37.8136';
process.env.DELIVERY_ORIGIN_LNG = '144.9631';
process.env.ENABLE_GOOGLE_DISTANCE = 'false'; // Default disabled
process.env.ENABLE_SENDLE_QUOTES = 'false'; // Default disabled
process.env.ENABLE_SENDLE_TRACKING = 'false'; // Default disabled

// Global test timeout
jest.setTimeout(10000);

// Mock console methods for cleaner test output (only if needed)
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
  });
}

// Global mocks for external services
jest.mock('../config/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    order: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      upsert: jest.fn(),
    },
    subscription: {
      update: jest.fn(),
    },
    deliveryTracking: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    trackingEvent: {
      create: jest.fn(),
    },
    deliveryZone: {
      findFirst: jest.fn(),
    },
  },
}));

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
    },
    paymentMethods: {
      list: jest.fn(),
      attach: jest.fn(),
      detach: jest.fn(),
    },
    subscriptions: {
      create: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

// Export test utilities
export const createMockAuthRequest = (user?: { id: string; email?: string }) => ({
  user,
  headers: user ? { authorization: 'Bearer mock-token' } : {},
  body: {},
  params: {},
  query: {},
});

export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

export const createMockNext = () => jest.fn();

// Helper to create mock orders
export const createMockOrder = (overrides: any = {}) => ({
  id: 'order-123',
  orderNumber: 'FLR202501010001',
  totalCents: 2999,
  status: 'PENDING',
  createdAt: new Date(),
  userId: null,
  guestEmail: null,
  shippingFirstName: 'Test',
  shippingLastName: 'Customer',
  shippingStreet1: '123 Test St',
  shippingStreet2: null,
  shippingCity: 'Test City',
  shippingState: 'CA',
  shippingZipCode: '12345',
  requestedDeliveryDate: null,
  deliveryNotes: null,
  items: [],
  user: null,
  payments: [],
  ...overrides,
});

// Helper to create mock users
export const createMockUser = (overrides: any = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User',
  auth0Id: 'auth0|123456',
  createdAt: new Date(),
  updatedAt: new Date(),
  phoneNumber: null,
  profilePicture: null,
  address: null,
  preferredLanguage: null,
  marketingOptIn: true,
  stripeCustomerId: null,
  favoriteColors: [],
  favoriteOccasions: [],
  favoriteMoods: [],
  ...overrides,
});