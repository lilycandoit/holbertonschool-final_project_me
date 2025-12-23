# Flora Subscription System

Flora implements a **production-ready subscription management system** with automated renewals, payment handling, and intelligent retry logic using Stripe off-session billing.

---

## Core Features

### Unified Checkout Flow
- **Mixed cart support** - One-time + subscription items in single transaction
- **Sequential payment processing** - PaymentIntent for first order + automatic payment method saving
- **Off-session billing** - Future renewals use saved payment methods (not Stripe Subscriptions API)

### Automated Renewal Engine
- **Background cron jobs** - Daily renewal processing via GitHub Actions
- **Inventory validation** - Checks stock before charging (handles out-of-stock gracefully)
- **Dynamic pricing** - Charges current product prices, not locked-in rates
- **Partial fulfillment** - Skips unavailable items, charges for rest

### Smart Retry System
- **3-attempt schedule** - Day 0 → Day 3 → Day 7
- **Auto-expiration** - After failed retries
- **Status management** - `ACTIVE` ↔ `PAUSED` → `CANCELLED` / `EXPIRED`

### User Controls
- **Real-time actions** - Pause, Resume, Cancel with status-aware visibility
- **Billing history** - Detailed event logs for all renewals
- **Email notifications** - Renewal success, payment failure, expiration

---

## Technical Architecture

### Backend Services

Located in `apps/backend/src/services/subscription/`:

- **RenewalService** - Orchestrates renewal workflow (inventory → pricing → payment → order creation)
- **BillingService** - Stripe off-session charging with error handling
- **RetryService** - Manages payment retry scheduling and failure notifications
- **InventoryValidator** - Validates product availability and stock

### API Endpoints

```
POST   /api/subscriptions                      # Create subscription
POST   /api/subscriptions/setup-intent         # Save payment method
PATCH  /api/subscriptions/:id/items            # Modify subscription items
PATCH  /api/subscriptions/:id/payment-method   # Update payment method
GET    /api/subscriptions/:id/billing-history  # View renewal history
POST   /api/subscriptions/:id/pause            # Pause subscription
POST   /api/subscriptions/:id/resume           # Resume subscription
DELETE /api/subscriptions/:id                  # Cancel subscription
```

### Database Models

See `apps/backend/prisma/schema.prisma` for complete schema:

- **Subscription** - Core record with Stripe payment method references
- **SubscriptionItem** - Products (dynamic pricing, no locked prices)
- **SubscriptionBillingEvent** - Audit trail of renewals, failures, retries

### Subscription Types

| Type | Frequency | Auto-Renewal | Use Case |
|------|-----------|--------------|----------|
| `RECURRING_WEEKLY` | 7 days | ✅ | Weekly flowers |
| `RECURRING_BIWEEKLY` | 14 days | ✅ | Bi-weekly arrangements |
| `RECURRING_MONTHLY` | 30 days | ✅ | Monthly centerpieces |
| `SPONTANEOUS` | Random | ❌ | Surprise deliveries |

---

## Architectural Decisions

### Why Off-Session Billing Instead of Stripe Subscriptions API?

**Problem with Stripe Subscriptions:**
- Requires fixed `Price` objects created in advance
- Doesn't support dynamic pricing (product prices change over time)
- Incompatible with multi-vendor scenarios (different sellers, variable commission)
- Cannot handle flexible product mix changes

**Our Solution:**
- Store payment method via Stripe SetupIntent (one-time setup)
- Calculate totals dynamically at renewal based on current prices
- Charge via PaymentIntent (same as one-time orders)
- Create Order records (preserves price history)
- Cron job triggers renewals (full control over timing)

**Benefits:**
- ✅ Dynamic pricing support
- ✅ Multi-vendor ready
- ✅ Flexible product changes (users can add/remove anytime)
- ✅ Full business logic control

---

## Renewal Workflow

### Daily Cron Job (GitHub Actions)

```
1. Find subscriptions where nextDeliveryDate <= today AND status = ACTIVE
2. For each subscription:
   a. Validate inventory (availableItems, skippedItems)
   b. Skip if ALL items unavailable
   c. Calculate total using CURRENT prices
   d. Charge off-session (stripe.paymentIntents.create)
   e. Create Order record
   f. Log SubscriptionBillingEvent
   g. Update nextDeliveryDate
   h. Send confirmation email (mention skipped items if any)
3. Handle payment failures: log error, schedule retry
```

### Payment Retry Schedule

| Attempt | Timing | Action on Failure |
|---------|--------|-------------------|
| 1 | Day 0 (renewal due date) | Schedule retry Day 3 |
| 2 | Day 3 | Schedule retry Day 7 |
| 3 | Day 7 | Mark subscription as EXPIRED |

---

## Testing

### Test Mode
- Fully functional with Stripe test cards: `4242 4242 4242 4242`
- Email notifications work in development
- No real flowers needed for demo

### Test Commands

```bash
# Run subscription tests
docker exec flora-backend pnpm test:subscriptions

# View subscription data
npx prisma studio

# Check backend logs
docker logs flora-backend --tail 50 | grep -E "subscription|renewal"
```

See **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** for comprehensive testing documentation.

---

## Integration Points

The subscription system integrates with:

- **OrderService** - All renewals create real orders
- **PaymentService** - Stripe off-session charging
- **EmailService** - Automated notifications (via Resend)
- **DeliveryService** - Tracking and fulfillment
- **Auth0** - JWT authentication for all operations

See **[DATABASE.md](./DATABASE.md)** for schema migrations and **[DOCKER_GUIDE.md](./DOCKER_GUIDE.md)** for development workflow.

---

## Common Issues

### "Subscription not found"
- **Cause**: Invalid subscription ID or unauthorized access
- **Fix**: Verify subscription belongs to authenticated user

### "Payment method required"
- **Cause**: No payment method saved for off-session billing
- **Fix**: Ensure checkout completed with payment method saving

### "All items unavailable"
- **Cause**: Products out of stock at renewal time
- **Fix**: Renewal automatically skips this cycle, reschedules next period

For more troubleshooting, see **[TESTING_GUIDE.md](./TESTING_GUIDE.md)**.
