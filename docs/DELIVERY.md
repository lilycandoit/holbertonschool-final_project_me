# Flora Delivery & Tracking System

Flora implements a **hybrid delivery system** with real-time tracking, intelligent pricing fallbacks, and automated status updates.

---

## Core Features

### Intelligent Shipping Calculator (4-Tier Fallback)

Flora uses a multi-tier fallback chain to ensure checkout never fails:

1. **Tier 1: Sendle API** - Real-time quotes via Sendle API (sandbox mode)
2. **Tier 2: Google Distance Matrix** - Distance-based calculation using Google API
3. **Tier 3: Database Zones** - Melbourne postcode coverage with zone pricing
4. **Tier 4: Hardcoded Fallback** - $8.99 standard shipping (guarantees checkout works)

**Benefits:**
- ✅ Checkout never fails (critical for revenue)
- ✅ Reduces external API dependency
- ✅ Gradual feature rollout via feature flags
- ✅ Accurate pricing even when APIs unavailable

### Automated Tracking System

**Tracking Number Generation:**
- Format: `FLR{timestamp}{random}` (e.g., `FLR1704123456789ABC`)
- Created automatically on order confirmation

**Dual Update Mechanism:**
- **Webhooks** (primary) - Instant updates from Sendle
- **Cron polling** (backup) - GitHub Actions every 30 minutes

**Status Progression:**
```
PROCESSING → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
```

**Features:**
- Email notifications on status changes (via Resend)
- Complete audit trail in WebhookLog table
- Manual refresh option for customers

### Customer Tracking UI

**Tracking Page** (`/tracking/:orderId`):
- Timeline view with status history
- 6 color-coded status badges with icons
- Manual refresh button
- Mobile-responsive (320px - 1920px)

**Integration:**
- Links in Order History page
- Links in Order Confirmation page
- Email tracking links

---

## Technical Architecture

### Backend Services

Located in `apps/backend/src/services/delivery/`:

- **shippingCalculator.ts** - Orchestrates 4-tier fallback pricing logic
- **googleDistanceService.ts** - Distance calculation, geocoding, coordinate caching
- **sendleService.ts** - Sendle API integration (quotes, orders, tracking)
- **deliveryService.ts** - Main coordinator for all delivery operations

### Tracking Infrastructure

- **update-tracking.ts** script - Polls Sendle API for status updates (cron job)
- **GitHub Actions workflow** - Runs every 30 minutes (`*/30 * * * *`)
- **Webhook endpoint** - `POST /api/webhooks/sendle` for instant updates
- **EmailService extension** - Styled tracking update notifications

### API Endpoints

```
GET  /api/tracking/:orderId          # Get tracking information
GET  /api/tracking/:orderId/events   # Get timeline events
POST /api/tracking/:orderId/refresh  # Manual refresh from Sendle
POST /api/webhooks/sendle            # Receive Sendle webhooks
```

### Frontend Components

Located in `apps/frontend/src/pages/` and `apps/frontend/src/components/`:

- **OrderTracking.tsx** - Main tracking page with parallel API loading
- **StatusBadge.tsx** - Color-coded status indicators
- **TrackingTimeline.tsx** - Vertical timeline with pulsing animations

### Database Models

See `apps/backend/prisma/schema.prisma` for complete schema:

- **DeliveryTracking** - Tracking records with Sendle references
- **TrackingEvent** - Timeline events for customer visibility
- **WebhookLog** - Audit trail of all Sendle webhooks
- **DeliveryZone** - Melbourne postcode coverage with pricing

---

## Feature Flags

Control delivery features via environment variables:

```bash
# .env (apps/backend/.env)
ENABLE_GOOGLE_DISTANCE=false  # Distance-based pricing
ENABLE_SENDLE_QUOTES=false    # Sendle quote API
ENABLE_SENDLE_TRACKING=false  # Sendle tracking API
```

**Strategy:**
- All disabled by default (risk mitigation)
- Hardcoded fallback ensures checkout works
- Enable per environment (dev, staging, prod)
- Gradual rollout support

---

## Multi-Date Delivery Support

Flora supports different delivery dates per item in the cart:

**How it works:**
1. Customer selects different dates for each cart item
2. Backend groups items by delivery date
3. Shipping cost calculated separately per delivery date
4. Total shipping = sum of all delivery date charges

**Example:**
```
Cart:
- Roses (Jan 15) → $8.99 shipping
- Lilies (Jan 20) → $8.99 shipping
Total shipping: $17.98
```

---

## API Integrations

### Google Distance Matrix API

**Purpose:** Calculate distance-based shipping costs

**Free Tier:** 40,000 requests/month

**Features:**
- Geocode addresses to coordinates
- Calculate distance between origin and destination
- Cache coordinates by postcode (reduces quota usage)
- Estimate delivery time based on distance

### Sendle API (Sandbox Mode)

**Purpose:** Real-time shipping quotes and tracking

**Sandbox Mode:** Unlimited requests, no real shipments

**Features:**
- Get shipping quotes
- Create sandbox orders
- Track shipment status
- Webhook notifications

**Important:** Always use sandbox mode (never create real shipments)

---

## Testing

### Test Mode
- Sendle sandbox enabled (no real delivery costs)
- Test tracking data generator included
- All TypeScript compilation passes (0 errors)

### Test Commands

```bash
# View delivery logs
docker logs flora-backend --tail 50 | grep -E "delivery|tracking|sendle"

# Manually trigger tracking update (via GitHub Actions)
# Go to: Actions → Update Delivery Tracking → Run workflow

# View webhook logs
npx prisma studio  # Check WebhookLog table
```

See **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** for comprehensive testing documentation.

---

## GitHub Actions Cron Job

**Workflow:** `.github/workflows/update-tracking.yml`

**Schedule:** Every 30 minutes (`*/30 * * * *`)

**Purpose:** Poll Sendle API for tracking updates (backup to webhooks)

**Script:** `apps/backend/src/scripts/update-tracking.ts`

**Workflow:**
```
1. Fetch active orders with Sendle tracking
2. Poll Sendle API for status updates
3. Update DeliveryTracking records
4. Create TrackingEvent records
5. Send email if status changed
```

---

## Common Issues

### Checkout fails with "Shipping calculation error"
- **Cause**: All 4 tiers failed (unlikely)
- **Fix**: Check API keys, database connection, fallback logic

### Tracking not updating
- **Cause**: Webhooks not configured or cron job not running
- **Fix**: Verify webhook URL, check GitHub Actions logs

### "Invalid postcode"
- **Cause**: Postcode not in Melbourne metro coverage
- **Fix**: Add postcode to DeliveryZone table or expand coverage

For more troubleshooting, see **[TESTING_GUIDE.md](./TESTING_GUIDE.md)**.

---

## Integration Points

The delivery system integrates with:

- **OrderService** - Shipping cost calculation during checkout
- **EmailService** - Tracking update notifications (via Resend)
- **Sendle API** - Quotes, orders, tracking
- **Google Distance Matrix API** - Distance calculation
- **GitHub Actions** - Automated tracking updates

See **[DATABASE.md](./DATABASE.md)** for schema and **[DOCKER_GUIDE.md](./DOCKER_GUIDE.md)** for development workflow.
