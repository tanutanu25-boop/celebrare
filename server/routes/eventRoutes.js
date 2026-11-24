
import express from "express";
import Event from "../models/Event.js";
import Photographer from "../models/Photographer.js";

const router = express.Router();

// Register a new event
router.post("/register", async (req, res) => {
  try {
    const { eventId, eventName, photographerId, eventDate, description } =
      req.body;

    if (!eventId || !eventName || !photographerId) {
      return res.status(400).json({
        success: false,
        message: "Event ID, event name and photographer ID are required",
      });
    }

    const photographer = await Photographer.findOne({ photographerId });

    if (!photographer) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    const existingEvent = await Event.findOne({ eventId });

    if (existingEvent) {
      return res.status(409).json({
        success: false,
        message: "Event ID already exists",
      });
    }

    const event = await Event.create({
      eventId,
      eventName,
      photographerId,
      eventDate,
      description,
    });

    return res.status(201).json({
      success: true,
      message: "Event registered successfully",
      event,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Get all events of a photographer
router.get("/photographer/:photographerId", async (req, res) => {
  try {
    const events = await Event.find({
      photographerId: req.params.photographerId,
    });

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
