import express from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import Photographer from "../models/Photographer.js";
import { requireAuth, signAuthToken } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { isValidUpiId } from "../services/upiService.js";
import { recordAuditLog } from "../services/auditService.js";

const router = express.Router();

// Register a photographer account
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, upiId, studioName, city } = req.body;

    if (!name || !email || !password || String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and a password of at least 6 characters are required",
      });
    }

    if (upiId && !isValidUpiId(upiId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid UPI ID format (expected handle@bank)",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await Photographer.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const photographerId = `photog-${randomUUID().slice(0, 8)}`;

    const photographer = await Photographer.create({
      photographerId,
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role: "photographer",
      upiId: upiId ? String(upiId).trim().toLowerCase() : undefined,
      profileInfo: {
        studioName: studioName ? String(studioName).trim() : String(name).trim(),
        city: city ? String(city).trim() : "",
      },
      inboundEmailAlias: `payments+${photographerId}@celebrare.example`,
    });

    const token = signAuthToken(photographer);

    await recordAuditLog({
      action: "PHOTOGRAPHER_REGISTERED",
      actorType: "photographer",
      actorId: photographer.photographerId,
      targetType: "Photographer",
      targetId: photographer.photographerId,
      photographerId: photographer.photographerId,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      token,
      user: sanitizeAccount(photographer),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
});

// Login (Photographer or Admin)
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const account = await Photographer.findOne({
      email: String(email).trim().toLowerCase(),
    }).select("+passwordHash");

    if (!account || !account.passwordHash) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const valid = await bcrypt.compare(String(password), account.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = signAuthToken(account);
    return res.status(200).json({
      success: true,
      token,
      user: sanitizeAccount(account),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// Demo quick-login (DEMO_MODE only) so evaluators can switch Photographer A / B / Admin effortlessly
router.post("/demo-login", async (req, res) => {
  try {
    if (process.env.DEMO_MODE !== "true") {
      return res.status(403).json({
        success: false,
        message: "Demo login is only available in DEMO_MODE",
      });
    }
    const { photographerId } = req.body;
    if (!photographerId) {
      return res.status(400).json({
        success: false,
        message: "photographerId is required",
      });
    }
    const account = await Photographer.findOne({
      photographerId: String(photographerId).trim(),
      isDemo: true,
    });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Demo account not found",
      });
    }
    const token = signAuthToken(account);
    return res.status(200).json({
      success: true,
      token,
      user: sanitizeAccount(account),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Demo login failed",
    });
  }
});

// Get current authenticated user
router.get("/me", requireAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    user: sanitizeAccount(req.user),
  });
});

export function sanitizeAccount(doc) {
  return {
    photographerId: doc.photographerId,
    name: doc.name,
    email: doc.email,
    role: doc.role,
    upiId: doc.upiId || "",
    profileInfo: doc.profileInfo || {},
    allowedBankSenders: doc.allowedBankSenders || [],
    inboundEmailAlias: doc.inboundEmailAlias || "",
    isDemo: Boolean(doc.isDemo),
    createdAt: doc.createdAt,
  };
}

export default router;
