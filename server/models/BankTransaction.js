import mongoose from "mongoose";

export const TRANSACTION_PROCESSING_STATUSES = [
  "MATCHED_PAID",
  "DUPLICATE",
  "LATE_PAYMENT",
  "REJECTED",
  "REVIEW_REQUIRED",
  "UNMATCHED",
  "MANUALLY_APPROVED",
  "MANUALLY_REJECTED",
];

const bankTransactionSchema = new mongoose.Schema(
  {
    transactionRecordId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    utr: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    amount: {
      type: Number,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    payerInfo: {
      name: { type: String, default: "" },
      upiId: { type: String, default: "" },
      accountMasked: { type: String, default: "" },
    },
    payeeUpiId: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    paymentReference: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    emailMessageId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    sender: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    displayName: {
      type: String,
      trim: true,
      default: "",
    },
    subject: {
      type: String,
      trim: true,
      default: "",
    },
    emailAuthResults: {
      spf: { type: String, default: "none" },
      dkim: { type: String, default: "none" },
      dmarc: { type: String, default: "none" },
      trustedForwarder: { type: Boolean, default: false },
      hmacVerified: { type: Boolean, default: false },
      rawHeader: { type: String, default: "" },
    },
    transactionStatus: {
      type: String,
      default: "UNKNOWN",
      uppercase: true,
    },
    transactionTimestamp: {
      type: Date,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    processingStatus: {
      type: String,
      enum: TRANSACTION_PROCESSING_STATUSES,
      required: true,
      index: true,
    },
    decisionReason: {
      type: String,
      required: true,
    },
    matchedPaymentRequestId: {
      type: String,
      index: true,
      default: null,
    },
    matchedOrderId: {
      type: String,
      index: true,
      default: null,
    },
    photographerId: {
      type: String,
      index: true,
      default: null,
    },
    duplicateCount: {
      type: Number,
      default: 0,
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
    rawMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    review: {
      reviewedBy: { type: String, default: "" },
      decision: { type: String, default: "" },
      reason: { type: String, default: "" },
      reviewedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

bankTransactionSchema.index({ processingStatus: 1, receivedAt: -1 });
bankTransactionSchema.index({ photographerId: 1, receivedAt: -1 });

const BankTransaction = mongoose.model("BankTransaction", bankTransactionSchema);

export default BankTransaction;
