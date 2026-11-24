import mongoose from "mongoose";

const photographerSchema = new mongoose.Schema(
  {
    photographerId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    upiId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/,
    },
  },
  {
    timestamps: true,
  }
);

const Photographer = mongoose.model(
  "Photographer",
  photographerSchema
);

export default Photographer;