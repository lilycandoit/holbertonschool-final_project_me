# 🧪 Flora Testing Guide

Complete guide for running tests and understanding the test suite.

---

## 🎯 Quick Start

```bash
# Run all tests
docker exec flora-backend pnpm test

# Run specific test suites
docker exec flora-backend pnpm test:auth        # Authentication
docker exec flora-backend pnpm test:order       # Order processing
docker exec flora-backend pnpm test:payment     # Stripe payments
docker exec flora-backend pnpm test:email       # Email service
docker exec flora-backend pnpm test:ai          # AI gift messages
docker exec flora-backend pnpm test:delivery    # Delivery system
docker exec flora-backend pnpm test:subscription # Subscription billing

# Watch mode (auto-rerun on changes)
docker exec flora-backend pnpm test:watch

# Coverage report
docker exec flora-backend pnpm test:coverage
```

---

## 📋 Test Suite Overview

**Total: 156 passing tests, 5 skipped, 11 test suites**

| Category | Test Files | Tests | What's Tested |
|----------|------------|-------|---------------|
| **Core Features** | 5 files | 85 tests | Auth, Orders, Payments, Email, AI |
| **Delivery System** | 3 files | 117 tests | Google Distance, Sendle, Shipping Calculator |
| **Subscriptions** | 2 files | 10 tests | Renewal, Inventory Validation |
| **Full Integration** | 1 file | 5 tests (skipped) | End-to-end flow |

### Core Features (85 tests)
- `auth.test.ts` (20 tests) - Auth0 JWT validation, user authentication
- `order.test.ts` (20 tests) - Order creation, validation, status updates
- `payment.test.ts` (20 tests) - Stripe intents, refunds, webhooks
- `email.test.ts` (20 tests) - Resend API, order confirmations, templates
- `ai.test.ts` (5 tests) - Gemini AI gift message generation

### Delivery System (117 tests - 5 skipped)
- `googleDistance.test.ts` (21 tests) - Distance Matrix API, geocoding, caching
- `sendle.test.ts` (40 tests) - Sandbox quotes, orders, tracking, webhooks
- `shippingCalculator.test.ts` (56 tests) - 4-tier fallback pricing

### Subscriptions (10 tests)
- `renewal.test.ts` (7 tests) - Off-session billing, payment retries
- `inventoryValidator.test.ts` (3 tests) - Stock validation, partial fulfillment

### Full Integration (5 tests - all skipped)
- `full-integration.test.ts` (5 skipped) - End-to-end order flow

**Note:** Integration tests skipped - unit tests provide comprehensive coverage.

---

## ✅ Pre-Commit Checklist

**Run before pushing:**

```bash
# 1. Backend tests MUST pass
docker exec flora-backend pnpm test --silent

# 2. Frontend type-check (warnings OK)
docker exec flora-frontend pnpm type-check || echo "Warnings OK"

# 3. Production build (strict mode)
docker exec flora-frontend sh -c "CI=true pnpm build:prod"

# 4. Verify containers running
docker ps
```

**Expected:**
- ✅ 156 backend tests pass
- ✅ Frontend type-check runs (warnings allowed)
- ✅ Frontend builds with NO errors
- ✅ All containers running

---

## 🏗️ Build Modes

### Development (Fast)
```bash
docker exec flora-frontend pnpm build
```
- ⚡ Fast iteration
- ⚠️ Warnings allowed

### Production (Strict)
```bash
docker exec flora-frontend pnpm build:prod
# OR
docker exec flora-frontend sh -c "CI=true pnpm build"
```
- ❌ Fails on ANY warnings
- ✅ Deployment-ready
- 📦 Smaller bundle

**Why strict mode?** Catches deployment issues before cloud build, ensures clean code.

---

## 🔄 CI/CD Pipeline

**Triggers:** Every push to `main`, `li-dev`, `subscription`, `bevan-branch`, `xiaoling`

**GitHub Actions:** `.github/workflows/test.yml`

**Pipeline:**
```
Push/PR → Setup (Node 18, pnpm, PostgreSQL) → Install deps →
Backend tests (156 tests) → Coverage report → ✅/❌ Result
```

**Status:**
- ✅ Backend tests: ACTIVE (156 tests)
- ⏸️ Frontend tests: Disabled (local verification only)
- ⏸️ Type-check: Disabled (warnings allowed in dev)

**View results:** https://github.com/Aldore-88/holbertonschool-final_project/actions

---

## 🚨 Troubleshooting

| Error | Solution |
|-------|----------|
| Tests failed | `docker exec flora-backend pnpm test` locally |
| Build failed | `docker exec flora-backend pnpm build` |
| Database error | `pnpm docker:restart-backend && pnpm docker:setup` |
| No products | `docker exec flora-backend pnpm db:seed` |
| Module not found | `pnpm docker:dev:build` |

---

## 📈 Code Coverage

**Goals:** 80%+ statements, 75%+ branches

```bash
# Generate report
docker exec flora-backend pnpm test:coverage

# View in browser
open apps/backend/coverage/lcov-report/index.html
```

---

## 🎯 Test Standards

**All tests must:**
- ✅ Run independently (no order dependencies)
- ✅ Clean up after themselves (no DB pollution)
- ✅ Use realistic data (match production)
- ✅ Test success AND error cases
- ✅ Mock external services (Auth0, Stripe, Resend, Gemini, Sendle, Google)

**Code review:**
- ✅ New features include tests
- ✅ Tests cover edge cases
- ✅ No hardcoded secrets
- ✅ Tests are fast (< 1 second each)

---

## 🔒 Security Scanning

**Weekly automated scans:** `.github/workflows/security.yml`

**Manual checks:**
```bash
pnpm audit              # Check vulnerabilities
pnpm audit --fix        # Auto-fix issues
```

---

**Testing ensures code quality!** 🌸
