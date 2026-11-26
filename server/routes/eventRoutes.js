import express from "express";
import { randomUUID } from "crypto";
import Event from "../models/Event.js";
import Photographer from "../models/Photographer.js";
import Photo from "../models/Photo.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = express.Router();

// List active events across all photographers (for Guest storefront discovery)
router.get("/", async (req, res) => {
  try {
    const filter = { status: "active" };
    if (req.query.photographerId) {
      filter.photographerId = String(req.query.photographerId).trim();
    }

    const events = await Event.find(filter).sort({ createdAt: -1 }).lean();
    const photographerIds = [...new Set(events.map((e) => e.photographerId))];
    const photographers = await Photographer.find({
      photographerId: { $in: photographerIds },
    })
      .select("photographerId name upiId profileInfo")
      .lean();

    const photogMap = new Map(photographers.map((p) => [p.photographerId, p]));
    const enriched = events.map((ev) => ({
      ...ev,
      photographer: photogMap.get(ev.photographerId) || null,
    }));

    return res.status(200).json({
      success: true,
      count: enriched.length,
      events: enriched,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load events",
    });
  }
});

// Create / Register Event (supports both POST /api/events and legacy /register)
async function handleCreateEvent(req, res) {
  try {
    const {
      eventId,
      eventName,
      photographerId,
      eventDate,
      description,
      defaultPrice,
      status,
    } = req.body;

    const targetPhotographerId = req.user
      ? req.user.role === "admin" && photographerId
        ? photographerId
        : req.user.photographerId
      : photographerId;

    if (!eventName || !targetPhotographerId) {
      return res.status(400).json({
        success: false,
        message: "Event name and photographer ID are required",
      });
    }

    const photographer = await Photographer.findOne({
      photographerId: targetPhotographerId,
    });
    if (!photographer) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    const finalEventId = (
      eventId || `evt-${randomUUID().slice(0, 8)}`
    ).trim();

    const existingEvent = await Event.findOne({ eventId: finalEventId });
    if (existingEvent) {
      return res.status(409).json({
        success: false,
        message: "Event ID already exists",
      });
    }

    const parsedPrice = Number(defaultPrice || 20);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      return res.status(400).json({
        success: false,
        message: "Default photo price must be at least ₹1",
      });
    }

    const event = await Event.create({
      eventId: finalEventId,
      eventName: String(eventName).trim(),
      photographerId: targetPhotographerId,
      eventDate: eventDate ? new Date(eventDate) : new Date(),
      description: description ? String(description).trim() : "",
      defaultPrice: parsedPrice,
      status: status || "active",
    });

    return res.status(201).json({
      success: true,
      message: "Event registered successfully",
      event,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Server error creating event",
    });
  }
}

router.post("/", requireAuth, handleCreateEvent);
router.post("/register", optionalAuth, handleCreateEvent);

// Get all events of a photographer
router.get("/photographer/:photographerId", async (req, res) => {
  try {
    const events = await Event.find({
      photographerId: req.params.photographerId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Get single event + safe photographer summary
router.get("/:id", async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.id }).lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }
    const photographer = await Photographer.findOne({
      photographerId: event.photographerId,
    })
      .select("photographerId name upiId profileInfo")
      .lean();

    return res.status(200).json({
      success: true,
      event,
      photographer,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Get public event gallery with watermarked preview URLs ONLY (never original storageKey!)
router.get("/:id/gallery", async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.id }).lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const [photographer, photos] = await Promise.all([
      Photographer.findOne({ photographerId: event.photographerId })
        .select("photographerId name upiId profileInfo")
        .lean(),
      Photo.find({ eventId: event.eventId, isActive: true })
        .sort({ photoId: 1 })
        .lean(),
    ]);

    const safePhotos = photos.map((p) => ({
      _id: p._id,
      photoId: p.photoId,
      eventId: p.eventId,
      photographerId: p.photographerId,
      title: p.title || `Photo ${p.photoId}`,
      price: p.price || event.defaultPrice || 20,
      previewUrl: `/api/photos/preview/${p.eventId}/${p.photoId}`,
      metadata: {
        width: p.metadata?.width || 1200,
        height: p.metadata?.height || 800,
      },
    }));

    return res.status(200).json({
      success: true,
      event,
      photographer,
      count: safePhotos.length,
      photos: safePhotos,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load event gallery",
    });
  }
});

// List photos of an event (alias for GET /api/events/:id/photos)
router.get("/:id/photos", async (req, res) => {
  try {
    const photos = await Photo.find({
      eventId: req.params.id,
      isActive: true,
    })
      .sort({ photoId: 1 })
      .lean();

    const safePhotos = photos.map((p) => ({
      _id: p._id,
      photoId: p.photoId,
      eventId: p.eventId,
      photographerId: p.photographerId,
      title: p.title || `Photo ${p.photoId}`,
      price: p.price || 20,
      previewUrl: `/api/photos/preview/${p.eventId}/${p.photoId}`,
    }));

    return res.status(200).json({
      success: true,
      eventId: req.params.id,
      count: safePhotos.length,
      photos: safePhotos,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load event photos",
    });
  }
});

export default router;
