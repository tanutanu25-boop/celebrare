import mongoose from "mongoose";
import { PAYMENT_STATUSES } from "./Order.js";

const paymentSchema = new mongoose.Schema(
  {
    paymentRequestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
      trim: true,
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
    guestId: {
      type: String,
      trim: true,
      default: "",
    },
    guestEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    expectedAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    payeeUpiId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    uniquePaymentReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    selectedPhotoIds: {
      type: [Number],
      required: true,
    },
    upiPaymentLink: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "PENDING",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    matchedTransactionId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    verificationSummary: {
      reason: { type: String, default: "" },
      verifiedAt: { type: Date },
      emailMessageId: { type: String, default: "" },
      utr: { type: String, default: "" },
      manualReview: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ photographerId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ payeeUpiId: 1, expectedAmount: 1, status: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
