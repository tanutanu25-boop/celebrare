import mongoose from "mongoose";

const photoSchema = new mongoose.Schema(
  {
    photoId: {
      type: Number,
      required: true,
    },
    photographerId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    storageKey: {
      type: String,
      trim: true,
      default: "",
    },
    thumbnailPath: {
      type: String,
      trim: true,
      default: "",
    },
    photoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 1,
      default: 20,
    },
    metadata: {
      originalName: { type: String, default: "" },
      mimeType: { type: String, default: "image/svg+xml" },
      sizeBytes: { type: Number, default: 0 },
      width: { type: Number, default: 1200 },
      height: { type: Number, default: 800 },
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
photoSchema.index({ photographerId: 1, eventId: 1 });

const Photo = mongoose.model("Photo", photoSchema);

export default Photo;
