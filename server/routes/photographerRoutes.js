import express from "express";
import { randomUUID } from "crypto";
import Photographer from "../models/Photographer.js";
import Event from "../models/Event.js";
import Order from "../models/Order.js";
import Payment from "../models/Payment.js";
import BankTransaction from "../models/BankTransaction.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { isValidUpiId } from "../services/upiService.js";
import { recordAuditLog } from "../services/auditService.js";
import { expireAllStaleRequests } from "../services/paymentVerificationService.js";
import { sanitizeAccount } from "./authRoutes.js";

const router = express.Router();

// List public photographers (safe public fields only)
router.get("/", async (req, res) => {
  try {
    const photographers = await Photographer.find({ role: "photographer" })
      .select("photographerId name upiId profileInfo isDemo createdAt")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      photographers,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load photographers",
    });
  }
});

// Create / Register Photographer (supports both POST /api/photographers and legacy /register)
async function handleCreatePhotographer(req, res) {
  try {
    const { photographerId, name, email, upiId, profileInfo } = req.body;
    if (!name || !upiId) {
      return res.status(400).json({
        success: false,
        message: "Name and UPI ID are required",
      });
    }
    if (!isValidUpiId(upiId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid UPI ID format",
      });
    }

    const id = (photographerId || `photog-${randomUUID().slice(0, 8)}`).trim();
    const existing = await Photographer.findOne({ photographerId: id });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Photographer already exists",
      });
    }

    const photographer = await Photographer.create({
      photographerId: id,
      name: String(name).trim(),
      ...(email ? { email: String(email).trim().toLowerCase() } : {}),
      upiId: String(upiId).trim().toLowerCase(),
      profileInfo: profileInfo || {},
      inboundEmailAlias: `payments+${id}@celebrare.example`,
    });

    return res.status(201).json({
      success: true,
      message: "Photographer registered successfully",
      photographer: sanitizeAccount(photographer),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

router.post("/", handleCreatePhotographer);
router.post("/register", handleCreatePhotographer);

// Photographer private dashboard (orders, payment statuses, verification logs, verified revenue)
router.get("/:id/dashboard", requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user.role !== "admin" && req.user.photographerId !== targetId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: cannot access another photographer's payment data",
      });
    }

    await expireAllStaleRequests();

    const photographer = await Photographer.findOne({ photographerId: targetId });
    if (!photographer) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    const [events, orders, payments, transactions] = await Promise.all([
      Event.find({ photographerId: targetId }).sort({ createdAt: -1 }),
      Order.find({ photographerId: targetId }).sort({ createdAt: -1 }).limit(100),
      Payment.find({ photographerId: targetId }).sort({ createdAt: -1 }).limit(100),
      BankTransaction.find({ photographerId: targetId })
        .sort({ receivedAt: -1 })
        .limit(100),
    ]);

    const verifiedPayments = payments.filter((p) => p.status === "PAID");
    const verifiedRevenue = verifiedPayments.reduce(
      (sum, p) => sum + Number(p.expectedAmount || p.amount || 0),
      0
    );

    const summary = {
      totalEvents: events.length,
      totalOrders: orders.length,
      paidCount: payments.filter((p) => p.status === "PAID").length,
      pendingCount: payments.filter((p) => p.status === "PENDING").length,
      expiredCount: payments.filter((p) => p.status === "EXPIRED").length,
      lateCount: payments.filter((p) => p.status === "LATE_PAYMENT").length,
      rejectedCount: payments.filter((p) => p.status === "REJECTED").length,
      reviewRequiredCount: payments.filter((p) => p.status === "REVIEW_REQUIRED").length,
      duplicateLogsCount: transactions.reduce(
        (sum, t) => sum + Number(t.duplicateCount || 0),
        0
      ),
      verifiedRevenue,
    };

    const warnings = [];
    if (!isValidUpiId(photographer.upiId)) {
      warnings.push(
        "Missing or invalid UPI ID. Guests cannot generate payment QR codes until configured."
      );
    }
    if (
      !photographer.allowedBankSenders ||
      photographer.allowedBankSenders.length === 0
    ) {
      warnings.push(
        "No trusted bank email senders configured for automated payment verification."
      );
    }
    if (!process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET && !process.env.BANK_WEBHOOK_SECRET) {
      warnings.push(
        "Cloudflare email webhook secret is not configured in server environment."
      );
    }

    return res.status(200).json({
      success: true,
      photographer: sanitizeAccount(photographer),
      warnings,
      summary,
      events,
      orders,
      payments,
      transactions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load photographer dashboard",
    });
  }
});

// Update Photographer UPI ID (requires owner or admin auth)
router.put("/:id/upi", requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user.role !== "admin" && req.user.photographerId !== targetId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: cannot modify another photographer's UPI ID",
      });
    }

    const { upiId } = req.body;
    if (!isValidUpiId(upiId)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid UPI ID (example: studio.name@okhdfcbank)",
      });
    }

    const normalizedUpi = String(upiId).trim().toLowerCase();
    const updated = await Photographer.findOneAndUpdate(
      { photographerId: targetId },
      { $set: { upiId: normalizedUpi } },
      { returnDocument: "after" }   
     );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    await recordAuditLog({
      action: "UPI_UPDATED",
      actorType: req.user.role === "admin" ? "admin" : "photographer",
      actorId: req.user.photographerId,
      targetType: "Photographer",
      targetId,
      photographerId: targetId,
      details: { upiId: normalizedUpi },
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: "UPI ID updated successfully",
      photographer: sanitizeAccount(updated),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to update UPI ID",
    });
  }
});

// Update Photographer Profile & Allowed Bank Senders
router.put("/:id/profile", requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user.role !== "admin" && req.user.photographerId !== targetId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: cannot modify another photographer's profile",
      });
    }

    const { name, profileInfo, allowedBankSenders } = req.body;
    const updates = {};
    if (name && String(name).trim()) updates.name = String(name).trim();
    if (profileInfo && typeof profileInfo === "object") {
      updates.profileInfo = {
        studioName: String(profileInfo.studioName || "").trim(),
        bio: String(profileInfo.bio || "").trim(),
        city: String(profileInfo.city || "").trim(),
        phone: String(profileInfo.phone || "").trim(),
      };
    }
    if (Array.isArray(allowedBankSenders)) {
      updates.allowedBankSenders = allowedBankSenders
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    }

    const updated = await Photographer.findOneAndUpdate(
      { photographerId: targetId },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    return res.status(200).json({
      success: true,
      photographer: sanitizeAccount(updated),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
});

// Get Photographer by ID (returns full private settings only to owner/admin; safe profile publicly)
router.get("/:photographerId", optionalAuth, async (req, res) => {
  try {
    const photographer = await Photographer.findOne({
      photographerId: req.params.photographerId,
    }).select("-passwordHash -__v");

    if (!photographer) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    const isOwnerOrAdmin =
      req.user &&
      (req.user.role === "admin" ||
        req.user.photographerId === photographer.photographerId);

    if (isOwnerOrAdmin) {
      return res.status(200).json({
        success: true,
        photographer: sanitizeAccount(photographer),
      });
    }

    return res.status(200).json({
      success: true,
      photographer: {
        photographerId: photographer.photographerId,
        name: photographer.name,
        upiId: photographer.upiId,
        profileInfo: photographer.profileInfo,
        isDemo: photographer.isDemo,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
