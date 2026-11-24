
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    paymentRequestId: {
      type: String,
      required: true,
      unique: true,
    },

    photographerId: {
      type: String,
      required: true,
      trim: true,
    },

    eventId: {
      type: String,
      required: true,
      trim: true,
    },

    guestId: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    selectedPhotoIds: {
      type: [Number],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "expired"],
      default: "pending",
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
