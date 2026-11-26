import http from "http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { setIo } from "./services/realtimeService.js";
import { verifyAuthToken } from "./middleware/auth.js";
import { expireAllStaleRequests } from "./services/paymentVerificationService.js";
import { ensureStorageDirectories } from "./services/photoStorageService.js";
import { seedDemoData } from "./seed/seedDemo.js";

dotenv.config();
function validateEnvironment() {
  const requiredVariables = [
    "MONGO_URI",
    "JWT_SECRET",
  ];

  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name]?.trim()
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}`
    );
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error(
      "JWT_SECRET must contain at least 32 characters"
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEMO_MODE === "true"
  ) {
    throw new Error(
      "DEMO_MODE must not be enabled in production"
    );
  }
}

const app = createApp();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
    methods: ["GET", "POST"],
  },
});

setIo(io);

io.on("connection", (socket) => {
  // Guests join strictly their specific paymentRequestId room
  socket.on("join:order", (paymentRequestId) => {
    if (typeof paymentRequestId === "string" && paymentRequestId.trim()) {
      socket.join(`order:${paymentRequestId.trim()}`);
    }
  });

  socket.on("leave:order", (paymentRequestId) => {
    if (typeof paymentRequestId === "string" && paymentRequestId.trim()) {
      socket.leave(`order:${paymentRequestId.trim()}`);
    }
  });

  // Photographers join their own room only after verifying JWT ownership
  socket.on("join:photographer", (payload) => {
    try {
      const token =
        typeof payload === "object" ? payload?.token : socket.handshake.auth?.token;
      const requestedId =
        typeof payload === "object" ? payload?.photographerId : payload;
      if (!token || typeof requestedId !== "string" || !requestedId.trim()) {
        return;
      }
      const decoded = verifyAuthToken(token);
      if (
        decoded.role === "admin" ||
        decoded.photographerId === requestedId.trim()
      ) {
        socket.join(`photographer:${requestedId.trim()}`);
      }
    } catch {
      // Ignore unauthorized room join attempts
    }
  });
});
async function startServer() {
  validateEnvironment();

  await ensureStorageDirectories();

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB Connected Successfully!");

  if (process.env.DEMO_MODE === "true") {
    await seedDemoData();
    console.log("Demo data seeded (DEMO_MODE=true)");
  }

  // Periodically sweep expired 5-minute payment requests every 15 seconds
  const expiryTimer = setInterval(() => {
    expireAllStaleRequests().catch((err) =>
      console.error("Expiry sweep error:", err.message)
    );
  }, 15_000);
  expiryTimer.unref();

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
