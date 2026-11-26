import mongoose from "mongoose";

export const UPI_REGEX = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/;

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
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ["photographer", "admin"],
      default: "photographer",
    },
    upiId: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => !value || UPI_REGEX.test(value),
        message: "Invalid UPI ID format (expected handle@bank)",
      },
    },
    profileInfo: {
      studioName: { type: String, trim: true, default: "" },
      bio: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
    },
    allowedBankSenders: {
      type: [String],
      default: [
        "alerts@hdfcbank.net",
        "upi@icicibank.com",
        "alerts@sbi.co.in",
        "alerts@axisbank.com",
        "noreply@kotak.com",
      ],
    },
    inboundEmailAlias: {
      type: String,
      trim: true,
      lowercase: true,
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Photographer = mongoose.model("Photographer", photographerSchema);

export default Photographer;
