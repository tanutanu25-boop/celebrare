import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: [
        "system",
        "admin",
        "photographer",
        "guest",
        "cloudflare_worker",
        "demo_simulator",
      ],
      required: true,
    },
    actorId: {
      type: String,
      default: "system",
    },
    targetType: {
      type: String,
      default: "",
    },
    targetId: {
      type: String,
      index: true,
      default: "",
    },
    photographerId: {
      type: String,
      index: true,
      default: "",
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
