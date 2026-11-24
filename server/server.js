
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";

import photographerRoutes from "./routes/photographerRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";

dotenv.config();

const app = express();

app.use(cors());

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
// Photographer API Routes
app.use("/api/photographers", photographerRoutes);

// Payment API Routes
app.use("/api/payments", paymentRoutes);

app.use("/api/events", eventRoutes);

// Photo API Routes
app.use("/api/photos", photoRoutes);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully!"))
  .catch((err) => console.log("MongoDB Error:", err.message));

// Home Route
app.get("/", (req, res) => {
  res.send("Celebrare Backend is Running!");
});

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Celebrare API is working!"
  });
});

// Test API
app.get("/api/test", (req, res) => {
  res.json({
    project: "Celebrare",
    message: "Backend is connected and responding."
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
