import AuditLog from "../models/AuditLog.js";

/**
 * Record an immutable audit log entry without throwing on non-critical logging failures.
 */
export async function recordAuditLog({
  action,
  actorType = "system",
  actorId = "system",
  targetType = "",
  targetId = "",
  photographerId = "",
  details = {},
  ipAddress = "",
}) {
  try {
    return await AuditLog.create({
      action,
      actorType,
      actorId,
      targetType,
      targetId,
      photographerId,
      details,
      ipAddress,
    });
  } catch (err) {
    console.error("Audit log error:", err.message);
    return null;
  }
}
