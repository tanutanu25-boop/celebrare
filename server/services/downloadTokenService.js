import { createHmac, timingSafeEqual } from "crypto";

function getDownloadSecret() {
  return (
    process.env.DOWNLOAD_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    process.env.BANK_WEBHOOK_SECRET ||
    "celebrare-dev-download-secret-change-in-prod"
  );
}

/**
 * Issue a short-lived HMAC-signed download token bound to order, paymentRequest, event, photographer, and photoId.
 */
export function createSignedDownloadToken({
  orderId,
  paymentRequestId,
  eventId,
  photographerId,
  photoId,
  ttlSeconds = 300,
}) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = {
    orderId,
    paymentRequestId,
    eventId,
    photographerId,
    photoId,
    exp,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", getDownloadSecret())
    .update(encodedPayload)
    .digest("base64url");

  return {
    token: `${encodedPayload}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/**
 * Verify and decode a signed download token. Returns null if invalid or expired.
 */
export function verifySignedDownloadToken(token) {
  if (typeof token !== "string" || !token.includes(".")) {
    return null;
  }
  const [encodedPayload, receivedSig] = token.split(".");
  if (!encodedPayload || !receivedSig) {
    return null;
  }

  const expectedSig = createHmac("sha256", getDownloadSecret())
    .update(encodedPayload)
    .digest("base64url");

  const receivedBuf = Buffer.from(receivedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return { expired: true, payload };
    }
    return { expired: false, payload };
  } catch {
    return null;
  }
}
