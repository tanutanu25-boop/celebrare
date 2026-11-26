import express from "express";
import fs from "fs/promises";
import path from "path";
import Order from "../models/Order.js";
import Payment from "../models/Payment.js";
import Photo from "../models/Photo.js";
import Event from "../models/Event.js";
import Photographer from "../models/Photographer.js";
import { downloadLimiter, paymentCreateLimiter } from "../middleware/rateLimiter.js";
import {
  createOrderAndPaymentRequest,
  syncPaymentExpiry,
} from "../services/paymentVerificationService.js";
import {
  createSignedDownloadToken,
  verifySignedDownloadToken,
} from "../services/downloadTokenService.js";
import {
  buildDemoPhotoSvg,
  resolveOriginalFilePath,
} from "../services/photoStorageService.js";
import { recordAuditLog } from "../services/auditService.js";

const router = express.Router();

// Create an order and 5-minute payment request (server-side price calculation)
router.post("/", paymentCreateLimiter, async (req, res) => {
  try {
    const { eventId, selectedPhotoIds, guestEmail, guestId } = req.body;
    const result = await createOrderAndPaymentRequest({
      eventId,
      selectedPhotoIds,
      guestEmail,
      guestId,
      actorIp: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: "Order and 5-minute UPI payment request created",
      order: result.order,
      payment: result.payment,
      photographer: result.photographer,
      event: result.event,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to create order",
    });
  }
});

// Get order + synced payment request status
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id }).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const payment = order.paymentRequestId
      ? await syncPaymentExpiry(order.paymentRequestId)
      : null;
    const refreshedOrder = await Order.findOne({ orderId: order.orderId }).lean();
    const [photographer, event] = await Promise.all([
      Photographer.findOne({ photographerId: order.photographerId })
        .select("photographerId name upiId profileInfo")
        .lean(),
      Event.findOne({ eventId: order.eventId })
        .select("eventId eventName eventDate")
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      order: refreshedOrder,
      payment,
      photographer,
      event,
      serverTime: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch order",
    });
  }
});

// Generate short-lived signed download URLs ONLY for PAID orders & ONLY for purchased photos
router.post("/:id/downloads", downloadLimiter, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const payment = order.paymentRequestId
      ? await syncPaymentExpiry(order.paymentRequestId)
      : null;

    if (!payment || order.status !== "PAID" || payment.status !== "PAID") {
      await recordAuditLog({
        action: "DOWNLOAD_DENIED",
        actorType: "guest",
        actorId: order.guestEmail,
        targetType: "Order",
        targetId: order.orderId,
        photographerId: order.photographerId,
        details: {
          reason: `Order status is ${payment?.status || order.status}`,
        },
        ipAddress: req.ip,
      });

      return res.status(403).json({
        success: false,
        message: `Photos cannot be downloaded. Payment status is ${
          payment?.status || order.status
        }.`,
      });
    }

    // Never allow a guest to request photoIds outside their original paid order
    const requestedIds = req.body?.photoIds;
    if (Array.isArray(requestedIds) && requestedIds.length > 0) {
      const allowedSet = new Set(order.selectedPhotoIds);
      const unauthorized = requestedIds.filter((id) => !allowedSet.has(Number(id)));
      if (unauthorized.length > 0) {
        await recordAuditLog({
          action: "DOWNLOAD_DENIED",
          actorType: "guest",
          actorId: order.guestEmail,
          targetType: "Order",
          targetId: order.orderId,
          photographerId: order.photographerId,
          details: {
            reason: "Attempted access to unpaid photo IDs",
            unauthorizedPhotoIds: unauthorized,
          },
          ipAddress: req.ip,
        });

        return res.status(403).json({
          success: false,
          message: "Access denied: requested photos were not included in this paid order",
        });
      }
    }

    const targetPhotoIds =
      Array.isArray(requestedIds) && requestedIds.length > 0
        ? requestedIds.map(Number)
        : order.selectedPhotoIds;

    const photos = await Photo.find({
      eventId: order.eventId,
      photographerId: order.photographerId,
      photoId: { $in: targetPhotoIds },
      isActive: true,
    }).sort({ photoId: 1 });

    const downloads = photos.map((photo) => {
      const { token, expiresAt } = createSignedDownloadToken({
        orderId: order.orderId,
        paymentRequestId: payment.paymentRequestId,
        eventId: order.eventId,
        photographerId: order.photographerId,
        photoId: photo.photoId,
        ttlSeconds: 300,
      });

      return {
        photoId: photo.photoId,
        title: photo.title || `Photo ${photo.photoId}`,
        eventId: photo.eventId,
        downloadUrl: `/api/downloads/${token}`,
        expiresAt,
      };
    });

    await recordAuditLog({
      action: "DOWNLOAD_ISSUED",
      actorType: "guest",
      actorId: order.guestEmail,
      targetType: "Order",
      targetId: order.orderId,
      photographerId: order.photographerId,
      details: {
        photoIds: downloads.map((d) => d.photoId),
      },
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      orderId: order.orderId,
      downloads,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to generate download links",
    });
  }
});

// Signed file download handler (mounted at /api/downloads/:token in app.js)
export async function handleSignedDownload(req, res) {
  try {
    const verification = verifySignedDownloadToken(req.params.token);
    if (!verification) {
      return res.status(403).json({
        success: false,
        message: "Invalid download token",
      });
    }
    if (verification.expired) {
      return res.status(410).json({
        success: false,
        message: "Download link has expired. Request a new download link from your order.",
      });
    }

    const { orderId, paymentRequestId, eventId, photographerId, photoId } =
      verification.payload;

    const [order, payment, photo] = await Promise.all([
      Order.findOne({ orderId }),
      Payment.findOne({ paymentRequestId }),
      Photo.findOne({ eventId, photographerId, photoId, isActive: true }),
    ]);

    if (
      !order ||
      !payment ||
      !photo ||
      order.status !== "PAID" ||
      payment.status !== "PAID" ||
      order.photographerId !== photographerId ||
      order.eventId !== eventId ||
      !order.selectedPhotoIds.includes(photoId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Download authorization check failed",
      });
    }

    const safeTitle = (photo.title || `celebrare-photo-${photoId}`)
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .toLowerCase();

    if (photo.storageKey) {
      const filePath = resolveOriginalFilePath(photo.storageKey);
      if (filePath) {
        const fileStat = await fs.stat(filePath).catch(() => null);
        if (fileStat) {
          const ext = path.extname(filePath) || ".svg";
          const mimeType =
            photo.metadata?.mimeType ||
            (ext === ".svg" ? "image/svg+xml" : "application/octet-stream");
          res.setHeader("Content-Type", mimeType);
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${safeTitle}${ext}"`
          );
          res.setHeader("Cache-Control", "no-store");
          const data = await fs.readFile(filePath);
          return res.send(data);
        }
      }
    }

    // Fallback for URL-added photos without local disk storage: generate clean licensed download SVG or redirect safely
    if (photo.photoUrl && /^https?:\/\//i.test(photo.photoUrl)) {
      return res.redirect(photo.photoUrl);
    }

    const fallbackSvg = buildDemoPhotoSvg({
      title: photo.title || `Photo ${photo.photoId}`,
      eventName: photo.eventId,
      photographerName: photo.photographerId,
      photoNumber: photo.photoId,
      watermarked: false,
    });
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle}.svg"`
    );
    return res.send(fallbackSvg);
  } catch {
    return res.status(500).json({
      success: false,
      message: "Download failed",
    });
  }
}

export default router;
