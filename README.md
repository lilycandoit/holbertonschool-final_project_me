# 🌸 Flora - Flowers Marketplace

**Team:** Anthony, Bevan, Xiaoling, and Lily | **Holberton Final Project**

_Flora - Where every purchase blooms into joy_ 🌸

<br>

<div align="center">
  <img src="docs/images/flora-hero.png" alt="Flora Marketplace Screenshot" width="100%" />
</div>

<br>

Flora is a modern flowers and plants marketplace featuring flexible purchasing options including one-time purchases and subscription services. Built with React + TypeScript, Node.js/Express, Prisma, PostgreSQL, and Docker.

---

## 📸 Demo

### 🌐 Live Application

**👉 [Live URL](https://flora-me.vercel.app/)**

**Try these features:**

- 🔍 Search with auto-suggestions (try "rose" or "lily")
- 🎨 Filter products by color, mood, occasion, or price
- 🛒 Add items to cart and explore guest checkout
- 🔐 Login with Google/Credentials to try subscription features
- 📅 Schedule deliveries for different dates
- 🤖 Generate AI-powered gift messages
- 📦 Check Order History and see Track Order

<!-- Add screenshots/GIFs here after deployment -->

---

## ✨ Features

### Core Shopping Experience

- 🛍️ **Product Browsing** - Intelligent Search and Multi-Criteria Filtering
- 🎁 **Guest Checkout** - No account required for one-time purchases
- 🔐 **User Authentication** - Secure login with Auth0 (email/password + Google)
- 🤖 **AI Gift Messages** - Generate personalized messages with Gemini AI based on keywords and tone

### Purchase Options

- **One-Time Purchase** - Single delivery with instant checkout
- **Recurring Subscription** - Regular deliveries (weekly/fortnightly/monthly) with savings
- **Spontaneous Subscription** - Surprise deliveries at random times with frequency of weekly/fortnightly/monthly.

### 💳 Checkout & Delivery

- **Stripe Payment Integration** - Secure payment processing with multiple payment methods
- **Flexible Delivery Scheduling** - Choose different dates for each item with smart shipping breakdown
- **Melbourne Metro Coverage** - 100+ postcodes with validation (expansion-ready infrastructure)
- **Order Tracking** - Real-time delivery status updates with timeline view and email notifications
- **Order Confirmation** - Detailed summary page with automated email notifications

### User Account Management

- 📊 **Profile Dashboard** - View orders, subscriptions, and total spending
- 📦 **Order History** - Browse past purchases with pagination
- ⚙️ **Subscription Control** - Pause, resume, or cancel active subscriptions

---

## 🔄 Subscription System (Advanced Feature)

Production-ready recurring billing with automated renewals, payment handling, and intelligent retry logic.

**Key Capabilities:**
- Unified checkout (mixed one-time + subscription items)
- Stripe off-session billing with automatic payment method saving
- Automated renewals via GitHub Actions cron jobs
- Smart retry system (3 attempts over 7 days)
- Dynamic pricing (current product prices, not locked-in rates)
- User controls (pause, resume, cancel)

**Why Off-Session Billing?**
Uses PaymentIntent (not Stripe Subscriptions API) to support dynamic pricing, multi-vendor scenarios, and flexible product changes.

See **[docs/SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md)** for technical architecture, renewal workflow, and testing details.

---

## 📦 Delivery & Tracking System (Advanced Feature)

Hybrid delivery system with real-time tracking, intelligent pricing fallbacks, and automated status updates.

**Key Capabilities:**
- 4-tier fallback pricing (Sendle → Google Distance → Database → Hardcoded)
- Automated tracking with dual updates (webhooks + cron polling every 30 min)
- Customer tracking UI with timeline view
- Multi-date delivery support (different dates per cart item)
- Email notifications on status changes

**Why 4-Tier Fallback?**
Guarantees checkout never fails by cascading through multiple pricing sources. Even if all APIs are down, hardcoded fallback ($8.99) ensures customers can complete purchases.

See **[docs/DELIVERY.md](docs/DELIVERY.md)** for technical architecture, API integrations, and feature flag configuration.

---

## 🛠️ Tech Stack

**Frontend**

- React 19 + TypeScript
- Vite (development & build tool)
- React Router (routing)
- Auth0 React SDK (authentication)
- Stripe React (payment UI)
- date-fns (date handling)
- Custom CSS styling

**Backend**

- Node.js + Express + TypeScript
- Prisma ORM + PostgreSQL
- Auth0 JWT authentication
- Stripe payment processing (PaymentIntent + off-session billing)
- Google Gemini AI (gift message generation)
- Resend (email service)
- Google Distance Matrix API (delivery distance calculation)
- Sendle API (shipping quotes & tracking)

**DevOps**

- Docker containerization (local development)
- pnpm workspaces (monorepo)
- GitHub Actions CI/CD (automated testing + cron jobs)
- 80 automated tests with Jest
- Vercel (frontend & backend deployment)

---

## 📁 Project Structure

```
holbertonschool-final_project/
├── apps/
│   ├── frontend/              # React + TypeScript + Vite
│   │   ├── src/
│   │   │   ├── components/    # Reusable UI components
│   │   │   ├── pages/         # Page components
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   └── services/      # API communication
│   │   └── package.json
│   └── backend/               # Node.js + Express API
│       ├── src/
│       │   ├── controllers/   # HTTP request handlers
│       │   ├── services/      # Business logic
│       │   ├── routes/        # API endpoints
│       │   ├── middleware/    # Auth, validation
│       │   └── config/        # Configuration
│       ├── prisma/
│       │   ├── schema.prisma  # Database schema
│       │   └── seed.ts        # Sample data
│       └── package.json
├── docs/                      # Documentation
├── .github/workflows/         # CI/CD automation
└── docker-compose*.yml        # Docker configuration
```

## 🔄 Workflow Overview

```
┌───────────────┐
│   Visitor     │
└──────┬────────┘
       │ Browse & discover in React app
       ▼
┌───────────────┐
│ Product pages │
└──────┬────────┘
       │ Add to cart / choose subscription
       ▼
┌───────────────┐
│ Shopping cart │
└──────┬────────┘
       │ Checkout details & delivery scheduling
       ▼
┌───────────────┐        Auth & tokens       ┌───────────────┐
│ Checkout flow │ ─────────────────────────▶ │ Auth0         │
└──────┬────────┘                            └───────────────┘
       │ Orders, AI messages, delivery info
       ▼
┌───────────────┐        Payments            ┌───────────────┐
│ Express API   │ ─────────────────────────▶ │ Stripe        │
│  (Node + TS)  │                            └───────────────┘
└──────┬────────┘
       │ Order records, subscriptions, analytics
       ▼
┌───────────────┐        Emails & updates    ┌───────────────┐
│ PostgreSQL    │ ─────────────────────────▶ │ Email service │
│  via Prisma   │                            └───────────────┘
└───────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** (recommended) or Node.js 18+
- **pnpm** package manager: `npm install -g pnpm`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Aldore-88/holbertonschool-final_project.git
cd holbertonschool-final_project

# 2. Build Docker containers (first time only)
pnpm docker:dev:build

# 3. Setup database (migrations + sample data)
pnpm docker:setup

# 4. Start development servers (in background)
pnpm docker:dev:bg

# 5. Restock products (optional - for testing checkout)
docker exec flora-backend pnpm restock
```

**Note:** The restock command sets all products with low stock (`< 10 units`) to 100 units. Useful for testing checkout flows.

### Access the Application

- **Frontend:** http://localhost:5173
  (_Check frontend logs: `docker logs flora-frontend` or `pnpm docker:logs frontend --tail 10`_)
- **Backend API:** http://localhost:3001 (_Check backend logs:
  `docker logs flora-backend --tail 10` or `pnpm docker:logs backend --tail 5`_)
- **Health Check:** http://localhost:3001/api/health
- **Database GUI:** Run `npx prisma studio`

### Environment Setup

Create `.env` files in both `apps/frontend/` and `apps/backend/` directories. See `.env.example` files for required variables.

**Key environment variables:**

- Auth0 credentials (Domain, Client ID, Audience)
- Database connection string
- Stripe API keys
- Email service credentials

---

## 🧪 Running Tests

```bash
# Run all backend tests
docker exec flora-backend pnpm test

# Run specific test suites
docker exec flora-backend pnpm test:auth
docker exec flora-backend pnpm test:order
docker exec flora-backend pnpm test:payment

# View test coverage
docker exec flora-backend pnpm test:coverage
```

**All tests must pass before merging to main.** CI/CD pipeline automatically runs tests on every push.

---

## 📚 Documentation

Detailed guides for development, testing, and system architecture:

- **[Subscription System](docs/SUBSCRIPTIONS.md)** - Renewal workflow, off-session billing, retry logic
- **[Delivery & Tracking](docs/DELIVERY.md)** - 4-tier fallback, API integrations, tracking automation
- **[Docker Setup Guide](docs/DOCKER_GUIDE.md)** - Daily workflow, Docker commands, troubleshooting
- **[Database Guide](docs/DATABASE.md)** - Prisma migrations, schema changes, seeding
- **[Testing and CI/CD Guide](docs/TESTING_GUIDE.md)** - Comprehensive testing documentation, CI/CD pipeline

---

## 🚀 Future Roadmap

Features planned for future development:

**User Experience:**

- 👤 User preferences and saved favorites
- ⭐ Product reviews and ratings

**Platform Features:**

- 🛠️ Admin dashboard for platform management
- 🏪 Seller dashboard for vendor management (multi-vendor marketplace expansion)
- 🤖 AI-powered product description generator for sellers

---

## 👥 Team

_Flora Team:_

- **Bevan** - [GitHub](https://github.com/Aldore-88)
- **Anthony**
- **Xiaoling**
- **Lily**

---

## 📄 License

MIT License - This project is for educational and demonstration purposes.

---

**Holberton School Final Project | Flora Team | 2025**
