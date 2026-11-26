import express from "express";
import cors from "cors";
import photographerRoutes from "./routes/photographerRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";
import bankEmailRoutes from "./routes/bankEmailRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import orderRoutes, { handleSignedDownload } from "./routes/orderRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import demoRoutes from "./routes/demoRoutes.js";
import { downloadLimiter } from "./middleware/rateLimiter.js";
import { getBankReconciliationAdapter } from "./services/reconciliationAdapter.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  );

  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Auth
  app.use("/api/auth", authRoutes);

  // Photographers, Events, Photos
  app.use("/api/photographers", photographerRoutes);
  app.use("/api/events", eventRoutes);
  app.use("/api/photos", photoRoutes);

  // Orders & Protected Downloads
  app.use("/api/orders", orderRoutes);
  app.get("/api/downloads/:token", downloadLimiter, handleSignedDownload);

  // Payment Requests (both RESTful /api/payment-requests and legacy /api/payments)
  app.use("/api/payment-requests", paymentRoutes);
  app.use("/api/payments", paymentRoutes);

  // Inbound Email Webhooks (Cloudflare Email Worker + Demo Simulator)
  app.use("/api/webhooks", bankEmailRoutes);
  app.use("/api/bank-email", bankEmailRoutes);

  // Admin Review & Audit Logs
  app.use("/api/admin", adminRoutes);

  // Demo Scenarios (active only when DEMO_MODE === "true")
  app.use("/api/demo", demoRoutes);

  // Health & Config Inspection (never exposes secrets)
  app.get("/", (_req, res) => {
    res.send("Celebrare Direct UPI Backend is Running!");
  });

  app.get("/api/health", (_req, res) => {
    const adapter = getBankReconciliationAdapter();
    res.json({
      success: true,
      message: "Celebrare API is working!",
      demoMode: process.env.DEMO_MODE === "true",
      serverTime: new Date().toISOString(),
      reconciliationProvider: adapter.getProviderName(),
      reconciliationConfigured: adapter.isConfigured(),
    });
  });

  app.get("/api/test", (_req, res) => {
    res.json({
      project: "Celebrare",
      message: "Backend is connected and responding.",
      demoMode: process.env.DEMO_MODE === "true",
    });
  });

  // Global error handler (avoids leaking stack traces or secrets)
  app.use((err, _req, res, _next) => {
    console.error("Unhandled API error:", err.message);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  });

  return app;
}
