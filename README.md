# 🌸 Flora - Flowers Marketplace

**Flora** is a modern flowers and plants marketplace that supports both **one-time purchases** and **recurring subscriptions**, designed to handle real-world e-commerce complexity such as dynamic pricing, delivery scheduling, and automated renewals.

👉 **Live Demo:** **[https://flora-me.vercel.app/](https://flora-me.vercel.app/)**

*Team: Anthony, Bevan, Xiaoling, Lily | Holberton School Final Project*

---

## 🌍 Why Flora?

Most online flower shops struggle with:

* Rigid subscription models
* Fragile delivery pricing
* Poor handling of recurring payments

**Flora was built to solve these problems** with:

* Flexible purchase options (one-time, recurring, surprise subscriptions)
* Resilient delivery pricing with fallback strategies
* Production-ready recurring billing without relying on Stripe Subscriptions API

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

### Checkout & Delivery

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
## 📸 Demo

<div align="center">
  <img src="docs/images/flora-hero.png" alt="Flora Marketplace Screenshot" width="100%" />
</div>

**Try these features:**

* Search/ filter products
* Create a subscription via Google login
* Schedule deliveries for different dates
* View order history and tracking

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
- 100+ automated tests with Jest
- Vercel (frontend & backend deployment)

---
## 🔄 Advanced Systems (Deep Dive)

### Subscription System

* Unified checkout (one-time + subscription)
* Off-session Stripe billing
* Automated renewals with retry logic
* Pause / resume / cancel support

📘 **Details:** [docs/SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md)

---

### Delivery & Tracking System

* 4-tier fallback pricing (API → DB → hardcoded)
* Multi-date delivery per cart
* Automated tracking updates (webhooks + cron)

📘 **Details:** [docs/DELIVERY.md](docs/DELIVERY.md)

---

## 🚀 Getting Started (Local Development - Developer Setup)

### Prerequisites

- **Docker Desktop** (recommended)
- **Node.js 18+**
- **pnpm** package manager: `npm install -g pnpm`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/lilycandoit/holbertonschool-final_project_me
cd holbertonschool-final_project_me

# 2. Create environment files (required before Docker build)
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp .env.example .env
# 👉 Update the values in .env files with your info

# 3. Build Docker containers
# Run this the first time, or when:
# - environment variables change
# - dependencies change
# - Docker configuration is updated
pnpm docker:dev:build

# 4. Setup database (migrations + sample data)
pnnm docker:setup

# 5. Start development servers (in background)
pnpm docker:dev:bg

# 6. Restock products (optional - when out of stock)
docker exec flora-backend pnpm restock
```
### Access the Application

* **Frontend:** [http://localhost:5173](http://localhost:5173)
  Logs:

  ```bash
  docker logs flora-frontend
  pnpm docker:logs frontend --tail 10
  ```

* **Backend API:** [http://localhost:3001](http://localhost:3001)
  Logs:

  ```bash
  docker logs flora-backend --tail 10
  pnpm docker:logs backend --tail 5
  ```

* **Health Check:**
  [http://localhost:3001/api/health](http://localhost:3001/api/health)

* **Database GUI:**

  ```bash
  npx prisma studio
  ```


---

## 🧪 Running Tests

```bash
# Run all backend tests
docker exec flora-backend pnpm test
```
* 100+ automated backend tests
* CI runs on every push to `main`
* See **[Testing and CI/CD Guide](docs/TESTING_GUIDE.md)** for more details

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

## 📄 License

MIT License - This project is for educational and demonstration purposes.

---
