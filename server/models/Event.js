import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    eventName: {
      type: String,
      required: true,
      trim: true,
    },
    photographerId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    eventDate: {
      type: Date,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "archived", "draft"],
      default: "active",
    },
    defaultPrice: {
      type: Number,
      default: 20,
      min: 1,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

eventSchema.index({ photographerId: 1, status: 1 });

const Event = mongoose.model("Event", eventSchema);

export default Event;
