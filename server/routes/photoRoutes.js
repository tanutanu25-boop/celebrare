import express from "express";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import { randomUUID } from "crypto";
import Payment from "../models/Payment.js";
import Photo from "../models/Photo.js";
import Event from "../models/Event.js";
import Photographer from "../models/Photographer.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import {
  ORIGINALS_DIR,
  buildWatermarkedPreviewWrapper,
  ensureStorageDirectories,
  resolveOriginalFilePath,
} from "../services/photoStorageService.js";
import { createSignedDownloadToken } from "../services/downloadTokenService.js";
import { syncPaymentExpiry } from "../services/paymentVerificationService.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureStorageDirectories();
    cb(null, ORIGINALS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".svg"].includes(ext)
      ? ext
      : ".jpg";
    cb(null, `${randomUUID()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image uploads are allowed"));
    }
  },
});

// Upload a private photograph file to an event (protected storage)
router.post(
  "/upload",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    try {
      const { eventId, title, price } = req.body;
      if (!eventId || !req.file) {
        return res.status(400).json({
          success: false,
          message: "eventId and image file are required",
        });
      }

      const event = await Event.findOne({ eventId: String(eventId).trim() });
      if (!event) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(404).json({
          success: false,
          message: "Event not found",
        });
      }

      if (
        req.user.role !== "admin" &&
        event.photographerId !== req.user.photographerId
      ) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(403).json({
          success: false,
          message: "Forbidden: you do not own this event",
        });
      }

      const lastPhoto = await Photo.findOne({ eventId: event.eventId }).sort({
        photoId: -1,
      });
      const nextPhotoId = lastPhoto ? lastPhoto.photoId + 1 : 1;
      const numericPrice = Number(price || event.defaultPrice || 20);
      if (!Number.isFinite(numericPrice) || numericPrice < 1) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          success: false,
          message: "Photo price must be at least ₹1",
        });
      }

      const newPhoto = await Photo.create({
        photoId: nextPhotoId,
        photographerId: event.photographerId,
        eventId: event.eventId,
        title: title ? String(title).trim() : `Photo ${nextPhotoId}`,
        storageKey: req.file.filename,
        thumbnailPath: `/api/photos/preview/${event.eventId}/${nextPhotoId}`,
        price: numericPrice,
        metadata: {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        },
        isActive: true,
      });

      return res.status(201).json({
        success: true,
        message: "Photo uploaded to protected storage",
        photo: sanitizePublicPhoto(newPhoto),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Add photo by URL (supports authenticated photographer dashboard + legacy compat)
router.post("/add", optionalAuth, async (req, res) => {
  try {
    const { eventId, photoUrl, title, price } = req.body;

    if (!eventId || !photoUrl) {
      return res.status(400).json({
        success: false,
        message: "Event ID and Photo URL are required",
      });
    }

    try {
      const parsedUrl = new URL(photoUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid URL protocol");
      }
    } catch {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid image URL",
      });
    }

    const event = await Event.findOne({ eventId: String(eventId).trim() });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (
      req.user &&
      req.user.role !== "admin" &&
      event.photographerId !== req.user.photographerId
    ) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: you do not own this event",
      });
    }

    const lastPhoto = await Photo.findOne({ eventId: event.eventId }).sort({
      photoId: -1,
    });
    const nextPhotoId = lastPhoto ? lastPhoto.photoId + 1 : 1;
    const numericPrice = Number(price || event.defaultPrice || 20);

    const newPhoto = await Photo.create({
      photoId: nextPhotoId,
      photographerId: event.photographerId,
      eventId: event.eventId,
      title: title ? String(title).trim() : `Photo ${nextPhotoId}`,
      photoUrl,
      thumbnailPath: `/api/photos/preview/${event.eventId}/${nextPhotoId}`,
      price: numericPrice > 0 ? numericPrice : 20,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Photo added successfully",
      photo: sanitizePublicPhoto(newPhoto),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update per-photo price (owner or admin)
router.put("/:eventId/:photoId/price", requireAuth, async (req, res) => {
  try {
    const { eventId, photoId } = req.params;
    const numericPrice = Number(req.body.price);
    if (!Number.isFinite(numericPrice) || numericPrice < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid price (>= ₹1) is required",
      });
    }

    const photo = await Photo.findOne({
      eventId,
      photoId: Number(photoId),
    });
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }
    if (
      req.user.role !== "admin" &&
      photo.photographerId !== req.user.photographerId
    ) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: cannot modify another photographer's photo price",
      });
    }

    photo.price = numericPrice;
    await photo.save();

    return res.status(200).json({
      success: true,
      photo: sanitizePublicPhoto(photo),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to update photo price",
    });
  }
});

// Protected watermarked preview endpoint (NEVER exposes unwatermarked private original!)
router.get("/preview/:eventId/:photoId", async (req, res) => {
  try {
    const { eventId, photoId } = req.params;
    const photo = await Photo.findOne({
      eventId,
      photoId: Number(photoId),
      isActive: true,
    });
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    const [event, photographer] = await Promise.all([
      Event.findOne({ eventId: photo.eventId }).lean(),
      Photographer.findOne({ photographerId: photo.photographerId }).lean(),
    ]);

    // If stored as an SVG original locally, render watermarked preview SVG dynamically
    if (photo.storageKey && photo.storageKey.endsWith(".svg")) {
      const fullPath = resolveOriginalFilePath(photo.storageKey);
      if (fullPath) {
        const rawSvg = await fs.readFile(fullPath, "utf8").catch(() => null);
        if (rawSvg) {
          const watermarkOverlay = `<g opacity="0.3" transform="rotate(-24 600 400)">
            <text x="140" y="230" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff" letter-spacing="5">CELEBRARE PREVIEW • UNPAID</text>
            <text x="180" y="420" font-family="Arial, sans-serif" font-size="48" font-weight="800" fill="#ffffff" letter-spacing="6">WATERMARKED PREVIEW</text>
            <text x="140" y="610" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#ffffff" letter-spacing="5">PAY VIA UPI TO DOWNLOAD ORIGINAL</text>
          </g></svg>`;
          const watermarkedSvg = rawSvg.replace("</svg>", watermarkOverlay);
          res.setHeader("Content-Type", "image/svg+xml");
          res.setHeader("Cache-Control", "public, max-age=300");
          return res.send(watermarkedSvg);
        }
      }
    }

    // For uploaded raster images or external URLs, serve a watermarked SVG preview card (never raw original file path)
    // If an uploaded raster image exists, we can still avoid leaking raw unwatermarked high-res by embedding or serving SVG preview
    const previewSvg = buildWatermarkedPreviewWrapper({
      title: photo.title || `Photo ${photo.photoId}`,
      photographerName: photographer?.name || "Celebrare Studio",
      eventName: event?.eventName || photo.eventId,
      photoId: photo.photoId,
    });
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(previewSvg);
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to render photo preview",
    });
  }
});

// Get all active photos of a particular event (public safe view - no original storageKey)
router.get("/event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const photos = await Photo.find({ eventId, isActive: true })
      .sort({ photoId: 1 })
      .select("-__v");

    return res.status(200).json({
      success: true,
      eventId,
      count: photos.length,
      photos: photos.map(sanitizePublicPhoto),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get photos unlocked by a verified PAID payment (issues short-lived signed download URLs)
router.get("/unlocked/:paymentRequestId", async (req, res) => {
  try {
    const { paymentRequestId } = req.params;
    const payment = await syncPaymentExpiry(paymentRequestId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment request not found",
      });
    }

    if (payment.status !== "PAID") {
      return res.status(403).json({
        success: false,
        message: `Photos are locked. Current payment status: ${payment.status}.`,
      });
    }

    const photos = await Photo.find({
      eventId: payment.eventId,
      photographerId: payment.photographerId,
      photoId: { $in: payment.selectedPhotoIds },
      isActive: true,
    }).sort({ photoId: 1 });

    const unlockedPhotos = photos.map((photo) => {
      const { token, expiresAt } = createSignedDownloadToken({
        orderId: payment.orderId,
        paymentRequestId: payment.paymentRequestId,
        eventId: payment.eventId,
        photographerId: payment.photographerId,
        photoId: photo.photoId,
      });

      return {
        ...sanitizePublicPhoto(photo),
        downloadUrl: `/api/downloads/${token}`,
        downloadExpiresAt: expiresAt,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Unlocked photos retrieved successfully",
      orderId: payment.orderId,
      guestId: payment.guestId,
      guestEmail: payment.guestEmail,
      eventId: payment.eventId,
      photographerId: payment.photographerId,
      count: unlockedPhotos.length,
      photos: unlockedPhotos,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export function sanitizePublicPhoto(photo) {
  return {
    _id: photo._id,
    photoId: photo.photoId,
    eventId: photo.eventId,
    photographerId: photo.photographerId,
    title: photo.title || `Photo ${photo.photoId}`,
    price: photo.price || 20,
    previewUrl: `/api/photos/preview/${photo.eventId}/${photo.photoId}`,
    isActive: photo.isActive,
    createdAt: photo.createdAt,
  };
}

export default router;
