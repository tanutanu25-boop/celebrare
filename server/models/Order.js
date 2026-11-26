import mongoose from "mongoose";

export const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "EXPIRED",
  "LATE_PAYMENT",
  "REJECTED",
  "REVIEW_REQUIRED",
];

const orderItemSchema = new mongoose.Schema(
  {
    photoId: { type: Number, required: true },
    title: { type: String, default: "" },
    price: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    eventId: {
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
    guestEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    guestId: {
      type: String,
      trim: true,
      default: "",
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "Order must contain at least one item",
      },
    },
    selectedPhotoIds: {
      type: [Number],
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    paymentRequestId: {
      type: String,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "PENDING",
      index: true,
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ photographerId: 1, status: 1 });
orderSchema.index({ guestEmail: 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);

export default Order;
