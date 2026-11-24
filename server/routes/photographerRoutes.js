
import express from "express";
import Photographer from "../models/Photographer.js";

const router = express.Router();

// Register Photographer
router.post("/register", async (req, res) => {
  try {
    const { photographerId, name, upiId } = req.body;

    if (!photographerId || !name || !upiId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingPhotographer = await Photographer.findOne({
      photographerId,
    });

    if (existingPhotographer) {
      return res.status(409).json({
        success: false,
        message: "Photographer already exists",
      });
    }

    const photographer = await Photographer.create({
      photographerId,
      name,
      upiId,
    });

    res.status(201).json({
      success: true,
      message: "Photographer registered successfully",
      photographer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get Photographer by ID
router.get("/:photographerId", async (req, res) => {
  try {
    const photographer = await Photographer.findOne({
      photographerId: req.params.photographerId,
    }).select("-__v");

    if (!photographer) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    res.status(200).json({
      success: true,
      photographer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
