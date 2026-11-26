let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function getIo() {
  return ioInstance;
}

/**
 * Emit payment status updates strictly to the specific order room and owning photographer room.
 */
export function emitPaymentStatusUpdate(payload) {
  if (!ioInstance || !payload?.paymentRequestId) return;

  const safePayload = {
    paymentRequestId: payload.paymentRequestId,
    orderId: payload.orderId,
    eventId: payload.eventId,
    status: payload.status,
    reason: payload.reason || "",
    expiresAt: payload.expiresAt,
    paidAt: payload.paidAt || null,
    updatedAt: new Date().toISOString(),
  };

  ioInstance
    .to(`order:${payload.paymentRequestId}`)
    .emit("payment:status", safePayload);

  if (payload.photographerId) {
    ioInstance
      .to(`photographer:${payload.photographerId}`)
      .emit("photographer:payment-update", {
        ...safePayload,
        photographerId: payload.photographerId,
      });
  }
}
