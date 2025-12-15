// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config();

import express, { Application } from "express";

// Middleware
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";

// Routes
import productRoutes from "./routes/products";
import categoryRoutes from "./routes/categories";
import orderRoutes from "./routes/orders";
import subscriptionRoutes from "./routes/subscriptions";
import paymentRoutes from "./routes/payments";
import webhookRoutes from "./routes/webhooks";
import deliveryInfoRoutes from "./routes/deliveryInfo";
import trackingRoutes from "./routes/tracking";
import userRoutes from "./routes/users";
import aiRoutes from "./routes/ai";

// Initialize Express app
const app: Application = express();

// Middleware
app.use(corsMiddleware);

// Webhook route MUST come before express.json() to preserve raw body
app.use("/api/webhooks", webhookRoutes);

// JSON parsing for all other routes
app.use(express.json());

// NOTE: Static /images route removed - images now served from Cloudinary

// Routes
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/delivery", deliveryInfoRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ai", aiRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    message: "Flora API is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🌸 Welcome to Flora - Flowers & Plants Marketplace API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      products: "/api/products",
      categories: "/api/categories",
      orders: "/api/orders",
      subscriptions: "/api/subscriptions",
      payments: "/api/payments",
      webhooks: "/api/webhooks",
      users: "/api/users",
      ai: "/api/ai",
      delivery: "/api/delivery",
      tracking: "/api/tracking/:orderId",
    },
  });
});

// Error Handling Middleware
app.use("*", notFoundHandler);
app.use(errorHandler);

// Export the Express app (no .listen() for serverless compatibility)
export default app;
