
import mongoose from "mongoose";

const photoSchema = new mongoose.Schema(
  {
    photoId: {
      type: Number,
      required: true,
    },

    eventId: {
      type: String,
      required: true,
      trim: true,
    },

    photoUrl: {
      type: String,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

photoSchema.index({ eventId: 1, photoId: 1 }, { unique: true });

const Photo = mongoose.model("Photo", photoSchema);

export default Photo;
