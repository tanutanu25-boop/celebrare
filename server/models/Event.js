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
      trim: true,
    },

    eventDate: {
      type: Date,
    },

    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);

export default Event;