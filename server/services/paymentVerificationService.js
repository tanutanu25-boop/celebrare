
import { randomUUID } from "crypto";
import Photographer from "../models/Photographer.js";
import Event from "../models/Event.js";
import Photo from "../models/Photo.js";
import Order from "../models/Order.js";
import Payment from "../models/Payment.js";
import BankTransaction from "../models/BankTransaction.js";
import {
  buildUpiPaymentLink,
  generateUniquePaymentReference,
  isValidUpiId,
} from "./upiService.js";
import { recordAuditLog } from "./auditService.js";
import { emitPaymentStatusUpdate } from "./realtimeService.js";
import { getBankReconciliationAdapter } from "./reconciliationAdapter.js";

export const PAYMENT_EXPIRY_MS = 5 * 60 * 1000;

export const DEFAULT_TRUSTED_BANK_SENDERS = [
  "alerts@hdfcbank.net",
  "upi@icicibank.com",
  "alerts@sbi.co.in",
  "alerts@axisbank.com",
  "noreply@kotak.com",
  "alerts@yesbank.in",
  "upi-alerts@okaxisbank.example",
];

function getTrustedSendersForPhotographer(photographer) {
  const envSenders = (process.env.ALLOWED_BANK_SENDERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const photographerSenders = Array.isArray(photographer?.allowedBankSenders)
    ? photographer.allowedBankSenders.map((s) => s.trim().toLowerCase())
    : [];

  return new Set([
    ...DEFAULT_TRUSTED_BANK_SENDERS,
    ...envSenders,
    ...photographerSenders,
  ]);
}

/**
 * Extract pure email address from headers like "HDFC Bank <alerts@hdfcbank.net>".
 * Never trusts display name.
 */
export function extractEmailAddress(fromHeader = "") {
  const str = String(fromHeader || "").trim();
  const angleMatch = str.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  if (angleMatch) {
    return angleMatch[1].toLowerCase();
  }
  const plainMatch = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return plainMatch ? plainMatch[1].toLowerCase() : "";
}

export function extractDisplayName(fromHeader = "") {
  const str = String(fromHeader || "").trim();
  const angleMatch = str.match(/^([^<]+)</);
  return angleMatch ? angleMatch[1].trim().replace(/^["']|["']$/g, "") : "";
}

/**
 * Parse raw email body/subject into structured UPI transaction details when fields aren't pre-extracted.
 */
export function parseRawBankEmail(payload = {}) {
  const text = `${payload.subject || ""}\n${payload.textBody || ""}\n${payload.body || ""}`;

  const utrMatch =
    payload.utr ||
    payload.transactionId ||
    text.match(/(?:UTR|Ref(?:erence)?\s*(?:No|ID)?|Txn\s*ID)\s*[:#-]?\s*([A-Za-z0-9-]{6,40})/i)?.[1] ||
    "";

  const amountMatch =
    payload.amount !== undefined && payload.amount !== null
      ? Number(payload.amount)
      : Number(
          text.match(/(?:INR|Rs\.?|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1] || 0
        );

  const payeeMatch =
    payload.payeeUpiId ||
    payload.recipientUpiId ||
    text.match(/(?:to\s*VPA|Payee\s*UPI|credited\s*to)\s*[:#-]?\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+)/i)?.[1] ||
    "";

  const refMatch =
    payload.paymentReference ||
    text.match(/\b(CLB-[A-Z0-9]{6,20})\b/i)?.[1] ||
    "";

  const senderEmail = extractEmailAddress(payload.sender || payload.from || "");
  const displayName =
    payload.displayName || extractDisplayName(payload.from || "");

  const auth = payload.emailAuthResults || {};
  const spf = String(auth.spf || payload.spf || "none").toLowerCase();
  const dkim = String(auth.dkim || payload.dkim || "none").toLowerCase();
  const dmarc = String(auth.dmarc || payload.dmarc || "none").toLowerCase();

  return {
    utr: String(utrMatch || "").trim(),
    amount: Number.isFinite(amountMatch) ? amountMatch : 0,
    currency: String(payload.currency || "INR").toUpperCase(),
    payeeUpiId: String(payeeMatch || "").trim().toLowerCase(),
    payerInfo: {
      name: String(payload.payerName || payload.payerInfo?.name || "").trim(),
      upiId: String(payload.payerUpiId || payload.payerInfo?.upiId || "")
        .trim()
        .toLowerCase(),
      accountMasked: String(
        payload.accountMasked || payload.payerInfo?.accountMasked || ""
      ).trim(),
    },
    paymentReference: String(refMatch || "").trim().toUpperCase(),
    paymentRequestId: String(payload.paymentRequestId || "").trim(),
    emailMessageId: String(payload.emailMessageId || payload.messageId || "").trim(),
    sender: senderEmail,
    displayName,
    subject: String(payload.subject || "").trim(),
    transactionStatus: String(
      payload.transactionStatus || payload.status || "SUCCESS"
    )
      .trim()
      .toUpperCase(),
    transactionTimestamp: payload.transactionTimestamp
      ? new Date(payload.transactionTimestamp)
      : payload.timestamp
      ? new Date(payload.timestamp)
      : null,
    emailAuthResults: {
      spf,
      dkim,
      dmarc,
      trustedForwarder: Boolean(auth.trustedForwarder ?? payload.trustedForwarder),
      hmacVerified: Boolean(payload.hmacVerified),
      rawHeader: String(auth.rawHeader || payload.authenticationResultsHeader || ""),
    },
    isDemo: Boolean(payload.isDemo),
  };
}

/**
 * Create an immutable Order and 5-minute PaymentRequest using server-side pricing.
 */
export async function createOrderAndPaymentRequest({
  eventId,
  selectedPhotoIds,
  guestEmail,
  guestId = "",
  now = new Date(),
  actorIp = "",
}) {
  if (!eventId || typeof eventId !== "string") {
    throw createHttpError(400, "Valid eventId is required");
  }
  if (
    !guestEmail ||
    typeof guestEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())
  ) {
    throw createHttpError(400, "A valid guest email is required");
  }
  if (
    !Array.isArray(selectedPhotoIds) ||
    selectedPhotoIds.length === 0 ||
    !selectedPhotoIds.every((id) => Number.isInteger(id) && id > 0)
  ) {
    throw createHttpError(400, "Select at least one valid photo");
  }

  const uniquePhotoIds = [...new Set(selectedPhotoIds)];
  if (uniquePhotoIds.length !== selectedPhotoIds.length) {
    throw createHttpError(400, "Duplicate photo IDs are not allowed");
  }

  const event = await Event.findOne({ eventId: eventId.trim(), status: "active" });
  if (!event) {
    throw createHttpError(404, "Active event not found");
  }

  const photographer = await Photographer.findOne({
    photographerId: event.photographerId,
  });
  if (!photographer) {
    throw createHttpError(404, "Event photographer not found");
  }
  if (!isValidUpiId(photographer.upiId)) {
    throw createHttpError(
      400,
      "Photographer has not configured a valid UPI ID yet"
    );
  }

  const photos = await Photo.find({
    eventId: event.eventId,
    photographerId: photographer.photographerId,
    photoId: { $in: uniquePhotoIds },
    isActive: true,
  }).sort({ photoId: 1 });

  if (photos.length !== uniquePhotoIds.length) {
    throw createHttpError(
      400,
      "Some selected photos are invalid or belong to another event"
    );
  }

  // Server-side price calculation ONLY (never trust client totals)
  const items = photos.map((photo) => ({
    photoId: photo.photoId,
    title: photo.title || `Photo ${photo.photoId}`,
    price: Number(photo.price || event.defaultPrice || 20),
  }));
  const totalAmount = items.reduce((sum, item) => sum + item.price, 0);

  const orderId = `ORD-${randomUUID().slice(0, 8).toUpperCase()}`;
  const paymentRequestId = randomUUID();
  const uniquePaymentReference = generateUniquePaymentReference();
  const createdAt = new Date(now);
  const expiresAt = new Date(createdAt.getTime() + PAYMENT_EXPIRY_MS);

  const upiPaymentLink = buildUpiPaymentLink({
    upiId: photographer.upiId,
    payeeName: photographer.name,
    amount: totalAmount,
    currency: event.currency || "INR",
    uniquePaymentReference,
    eventName: event.eventName,
  });

  const normalizedGuestEmail = guestEmail.trim().toLowerCase();

  const order = await Order.create({
    orderId,
    eventId: event.eventId,
    photographerId: photographer.photographerId,
    guestEmail: normalizedGuestEmail,
    guestId: guestId?.trim() || normalizedGuestEmail,
    items,
    selectedPhotoIds: items.map((i) => i.photoId),
    totalAmount,
    currency: event.currency || "INR",
    paymentRequestId,
    status: "PENDING",
  });

  const payment = await Payment.create({
    paymentRequestId,
    orderId,
    photographerId: photographer.photographerId,
    eventId: event.eventId,
    guestId: guestId?.trim() || normalizedGuestEmail,
    guestEmail: normalizedGuestEmail,
    expectedAmount: totalAmount,
    amount: totalAmount,
    currency: event.currency || "INR",
    payeeUpiId: photographer.upiId.toLowerCase(),
    uniquePaymentReference,
    selectedPhotoIds: items.map((i) => i.photoId),
    upiPaymentLink,
    status: "PENDING",
    expiresAt,
    createdAt,
  });

  await recordAuditLog({
    action: "PAYMENT_CREATED",
    actorType: "guest",
    actorId: normalizedGuestEmail,
    targetType: "PaymentRequest",
    targetId: paymentRequestId,
    photographerId: photographer.photographerId,
    details: {
      orderId,
      eventId: event.eventId,
      expectedAmount: totalAmount,
      payeeUpiId: photographer.upiId,
      uniquePaymentReference,
      expiresAt: expiresAt.toISOString(),
    },
    ipAddress: actorIp,
  });

  return {
    order,
    payment,
    photographer: {
      photographerId: photographer.photographerId,
      name: photographer.name,
      upiId: photographer.upiId,
      profileInfo: photographer.profileInfo,
    },
    event: {
      eventId: event.eventId,
      eventName: event.eventName,
      eventDate: event.eventDate,
    },
  };
}

/**
 * Create a fresh 5-minute payment request for an existing unpaid/expired/rejected order.
 */
export async function createReplacementPaymentRequest({
  previousPaymentRequestId,
  now = new Date(),
  actorIp = "",
}) {
  const previous = await Payment.findOne({
    paymentRequestId: previousPaymentRequestId,
  });
  if (!previous) {
    throw createHttpError(404, "Original payment request not found");
  }
  if (previous.status === "PAID") {
    throw createHttpError(409, "Order is already paid");
  }

  const order = await Order.findOne({ orderId: previous.orderId });
  if (!order) {
    throw createHttpError(404, "Order not found");
  }
  if (order.status === "PAID") {
    throw createHttpError(409, "Order is already paid");
  }

  const photographer = await Photographer.findOne({
    photographerId: order.photographerId,
  });
  const event = await Event.findOne({ eventId: order.eventId });
  if (!photographer || !event || !isValidUpiId(photographer.upiId)) {
    throw createHttpError(400, "Photographer UPI or event configuration invalid");
  }

  // Ensure previous request is expired if still pending
  if (previous.status === "PENDING") {
    await Payment.updateOne(
      { paymentRequestId: previous.paymentRequestId, status: "PENDING" },
      { $set: { status: "EXPIRED" } }
    );
  }

  const paymentRequestId = randomUUID();
  const uniquePaymentReference = generateUniquePaymentReference();
  const createdAt = new Date(now);
  const expiresAt = new Date(createdAt.getTime() + PAYMENT_EXPIRY_MS);

  const upiPaymentLink = buildUpiPaymentLink({
    upiId: photographer.upiId,
    payeeName: photographer.name,
    amount: order.totalAmount,
    currency: order.currency,
    uniquePaymentReference,
    eventName: event.eventName,
  });

  const payment = await Payment.create({
    paymentRequestId,
    orderId: order.orderId,
    photographerId: photographer.photographerId,
    eventId: event.eventId,
    guestId: order.guestId,
    guestEmail: order.guestEmail,
    expectedAmount: order.totalAmount,
    amount: order.totalAmount,
    currency: order.currency,
    payeeUpiId: photographer.upiId.toLowerCase(),
    uniquePaymentReference,
    selectedPhotoIds: order.selectedPhotoIds,
    upiPaymentLink,
    status: "PENDING",
    expiresAt,
    createdAt,
  });

  await Order.updateOne(
    { orderId: order.orderId, status: { $ne: "PAID" } },
    { $set: { paymentRequestId, status: "PENDING" } }
  );

  await recordAuditLog({
    action: "PAYMENT_RENEWED",
    actorType: "guest",
    actorId: order.guestEmail,
    targetType: "PaymentRequest",
    targetId: paymentRequestId,
    photographerId: photographer.photographerId,
    details: {
      previousPaymentRequestId,
      orderId: order.orderId,
      uniquePaymentReference,
      expiresAt: expiresAt.toISOString(),
    },
    ipAddress: actorIp,
  });

  return {
    order: await Order.findOne({ orderId: order.orderId }),
    payment,
    photographer: {
      photographerId: photographer.photographerId,
      name: photographer.name,
      upiId: photographer.upiId,
    },
    event: {
      eventId: event.eventId,
      eventName: event.eventName,
    },
  };
}

/**
 * Expire a single payment request if its 5-minute UTC window has passed.
 */
export async function syncPaymentExpiry(paymentRequestId, now = new Date()) {
  const expired = await Payment.findOneAndUpdate(
    {
      paymentRequestId,
      status: "PENDING",
      expiresAt: { $lte: now },
    },
    {
      $set: {
        status: "EXPIRED",
        "verificationSummary.reason": "Five-minute payment window elapsed",
      },
    },
    { returnDocument: "after" }
  );

  if (expired) {
    await Order.updateOne(
      { orderId: expired.orderId, status: "PENDING" },
      { $set: { status: "EXPIRED" } }
    );
    await recordAuditLog({
      action: "PAYMENT_EXPIRED",
      actorType: "system",
      targetType: "PaymentRequest",
      targetId: expired.paymentRequestId,
      photographerId: expired.photographerId,
      details: { orderId: expired.orderId, expiresAt: expired.expiresAt },
    });
    emitPaymentStatusUpdate({
      paymentRequestId: expired.paymentRequestId,
      orderId: expired.orderId,
      eventId: expired.eventId,
      photographerId: expired.photographerId,
      status: "EXPIRED",
      reason: "This payment request has expired.",
      expiresAt: expired.expiresAt,
    });
    return expired;
  }

  return Payment.findOne({ paymentRequestId });
}

/**
 * Background sweeper to expire all stale PENDING requests and notify connected guests.
 */
export async function expireAllStaleRequests(now = new Date()) {
  const stale = await Payment.find({
    status: "PENDING",
    expiresAt: { $lte: now },
  }).select("paymentRequestId");

  for (const item of stale) {
    await syncPaymentExpiry(item.paymentRequestId, now);
  }
  return stale.length;
}

/**
 * Core Email Verification & Deterministic Matching Pipeline.
 * Used by BOTH the Cloudflare Email Worker webhook and the Demo Transaction Simulator.
 */
export async function processInboundBankEmail(rawPayload, options = {}) {
  const {
    actorType = "cloudflare_worker",
    actorId = "email-worker",
    ipAddress = "",
    nowOverride = null,
    allowClockOverride = false,
  } = options;

  const effectiveNow =
    allowClockOverride && nowOverride ? new Date(nowOverride) : new Date();
  const parsed = parseRawBankEmail(rawPayload);

  // 1. Idempotency check BEFORE modifying anything (check UTR and emailMessageId)
  const dupConditions = [];
  if (parsed.utr) dupConditions.push({ utr: parsed.utr });
  if (parsed.emailMessageId) {
    dupConditions.push({ emailMessageId: parsed.emailMessageId });
  }

  if (dupConditions.length > 0) {
    const existingTx = await BankTransaction.findOne({ $or: dupConditions });
    if (existingTx) {
      return handleDuplicateTransaction(existingTx, parsed, {
        actorType,
        actorId,
        ipAddress,
      });
    }
  }

  // 2. Reserve BankTransaction record first to prevent concurrent race conditions on UTR/emailMessageId
  const transactionRecordId = randomUUID();
  let txDoc;
  try {
    txDoc = await BankTransaction.create({
      transactionRecordId,
      ...(parsed.utr ? { utr: parsed.utr } : {}),
      amount: parsed.amount || 0,
      currency: parsed.currency,
      payerInfo: parsed.payerInfo,
      payeeUpiId: parsed.payeeUpiId,
      paymentReference: parsed.paymentReference,
      ...(parsed.emailMessageId ? { emailMessageId: parsed.emailMessageId } : {}),
      sender: parsed.sender,
      displayName: parsed.displayName,
      subject: parsed.subject,
      emailAuthResults: parsed.emailAuthResults,
      transactionStatus: parsed.transactionStatus,
      transactionTimestamp: parsed.transactionTimestamp || effectiveNow,
      receivedAt: effectiveNow,
      processingStatus: "UNMATCHED",
      decisionReason: "Pending verification pipeline",
      isDemo: parsed.isDemo,
      rawMetadata: {
        paymentRequestIdHint: parsed.paymentRequestId || "",
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const existingTx = await BankTransaction.findOne({ $or: dupConditions });
      if (existingTx) {
        return handleDuplicateTransaction(existingTx, parsed, {
          actorType,
          actorId,
          ipAddress,
        });
      }
    }
    throw err;
  }

  // Helper to finalize non-paid transaction outcome cleanly
  const finalizeOutcome = async ({
    txStatus,
    reason,
    payment = null,
    order = null,
    newRequestStatus = null,
    auditAction = "VERIFICATION_REJECTED",
    httpStatus = 200,
  }) => {
    const updatedTx = await BankTransaction.findOneAndUpdate(
      { transactionRecordId },
      {
        $set: {
          processingStatus: txStatus,
          decisionReason: reason,
          matchedPaymentRequestId: payment?.paymentRequestId || null,
          matchedOrderId: order?.orderId || payment?.orderId || null,
          photographerId: payment?.photographerId || null,
        },
      },
       { returnDocument: "after" }

);

    if (payment && newRequestStatus) {
      await Payment.updateOne(
        {
          paymentRequestId: payment.paymentRequestId,
          status: { $in: ["PENDING", "EXPIRED"] },
        },
        {
          $set: {
            status: newRequestStatus,
            "verificationSummary.reason": reason,
            "verificationSummary.emailMessageId": parsed.emailMessageId,
            "verificationSummary.utr": parsed.utr,
          },
        }
      );

      if (order && order.status !== "PAID") {
        await Order.updateOne(
          { orderId: order.orderId, status: { $ne: "PAID" } },
          { $set: { status: newRequestStatus } }
        );
      }

      emitPaymentStatusUpdate({
        paymentRequestId: payment.paymentRequestId,
        orderId: payment.orderId,
        eventId: payment.eventId,
        photographerId: payment.photographerId,
        status: newRequestStatus,
        reason,
        expiresAt: payment.expiresAt,
      });
    }

    await recordAuditLog({
      action: auditAction,
      actorType,
      actorId,
      targetType: "BankTransaction",
      targetId: transactionRecordId,
      photographerId: payment?.photographerId || "",
      details: {
        utr: parsed.utr,
        emailMessageId: parsed.emailMessageId,
        sender: parsed.sender,
        processingStatus: txStatus,
        reason,
        paymentRequestId: payment?.paymentRequestId || null,
      },
      ipAddress,
    });

    return {
      httpStatus,
      outcome: txStatus,
      unlocked: false,
      duplicate: false,
      reason,
      transaction: updatedTx,
      payment: payment
        ? await Payment.findOne({ paymentRequestId: payment.paymentRequestId })
        : null,
    };
  };

  // 3. Match ONLY by unique payment reference.
  // Never fall back to paymentRequestId, amount, timestamp, or guest name.
  let candidatePayment = null;

  if (parsed.paymentReference) {
    candidatePayment = await Payment.findOne({
      uniquePaymentReference: parsed.paymentReference,
    });
  }

  const candidateOrder = candidatePayment
    ? await Order.findOne({ orderId: candidatePayment.orderId })
    : null;

  const candidatePhotographer = candidatePayment
    ? await Photographer.findOne({
        photographerId: candidatePayment.photographerId,
      })
    : null;

  // 4. Validate Email Authentication (SPF, DKIM, DMARC) & Sender Allowlist
  const trustedSenders = getTrustedSendersForPhotographer(candidatePhotographer);
  const authPass =
    parsed.emailAuthResults.spf === "pass" &&
    parsed.emailAuthResults.dkim === "pass" &&
    parsed.emailAuthResults.dmarc === "pass";

  if (!parsed.sender || !trustedSenders.has(parsed.sender)) {
    return finalizeOutcome({
      txStatus: "REJECTED",
      reason: `Untrusted email sender '${parsed.sender || "unknown"}'. Display names are never trusted.`,
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment?.status === "PENDING" ? "REJECTED" : null,
      auditAction: "UNTRUSTED_EMAIL_REJECTED",
      httpStatus: 403,
    });
  }

  if (!authPass) {
    return finalizeOutcome({
      txStatus: "REJECTED",
      reason: `Email authentication failed (SPF=${parsed.emailAuthResults.spf}, DKIM=${parsed.emailAuthResults.dkim}, DMARC=${parsed.emailAuthResults.dmarc}).`,
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment?.status === "PENDING" ? "REJECTED" : null,
      auditAction: "EMAIL_AUTH_FAILED",
      httpStatus: 403,
    });
  }

  // 5. Check mandatory bank transaction fields
  if (!parsed.utr) {
    return finalizeOutcome({
      txStatus: "REVIEW_REQUIRED",
      reason: "Bank transaction reference (UTR) missing from notification email.",
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment?.status === "PENDING" ? "REVIEW_REQUIRED" : null,
      auditAction: "FLAGGED_FOR_REVIEW",
      httpStatus: 202,
    });
  }

  if (parsed.transactionStatus !== "SUCCESS" && parsed.transactionStatus !== "CREDIT" && parsed.transactionStatus !== "CREDITED") {
    return finalizeOutcome({
      txStatus: "REJECTED",
      reason: `Bank transaction status '${parsed.transactionStatus}' is not a confirmed credit.`,
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment?.status === "PENDING" ? "REJECTED" : null,
      auditAction: "NON_SUCCESS_TX_REJECTED",
      httpStatus: 400,
    });
  }

  if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
    return finalizeOutcome({
      txStatus: "REJECTED",
      reason: "Invalid or non-positive transaction amount.",
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment?.status === "PENDING" ? "REJECTED" : null,
      auditAction: "INVALID_AMOUNT_REJECTED",
      httpStatus: 400,
    });
  }

  // 6. If no unique payment reference matched, place in REVIEW_REQUIRED queue
  if (!candidatePayment || !candidateOrder || !candidatePhotographer) {
    return finalizeOutcome({
      txStatus: "REVIEW_REQUIRED",
      reason: parsed.paymentReference
        ? `No payment request found matching reference '${parsed.paymentReference}'.`
        : "Missing unique payment reference in bank email; refusing to match by paymentRequestId or amount alone.",
      auditAction: "UNMATCHED_FLAGGED_FOR_REVIEW",
      httpStatus: 202,
    });
  }

  // 7. Verify Event ownership integrity
  const event = await Event.findOne({
    eventId: candidatePayment.eventId,
    photographerId: candidatePhotographer.photographerId,
  });
  if (!event || candidateOrder.photographerId !== candidatePhotographer.photographerId) {
    return finalizeOutcome({
      txStatus: "REJECTED",
      reason: "Cross-photographer or event ownership integrity mismatch.",
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment.status === "PENDING" ? "REJECTED" : null,
      auditAction: "OWNERSHIP_MISMATCH_REJECTED",
      httpStatus: 403,
    });
  }

  // 8. Verify Payee UPI ID (if missing in email -> REVIEW_REQUIRED; if mismatched -> REJECTED)
  if (!parsed.payeeUpiId) {
    return finalizeOutcome({
      txStatus: "REVIEW_REQUIRED",
      reason:
        "Payee UPI ID missing from bank email notification; manual review required before unlocking.",
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment.status === "PENDING" ? "REVIEW_REQUIRED" : null,
      auditAction: "FLAGGED_FOR_REVIEW",
      httpStatus: 202,
    });
  }

  if (
    parsed.payeeUpiId !== candidatePayment.payeeUpiId.toLowerCase() ||
    parsed.payeeUpiId !== String(candidatePhotographer.upiId || "").toLowerCase()
  ) {
    return finalizeOutcome({
      txStatus: "REJECTED",
      reason: `Payee UPI ID mismatch: received '${parsed.payeeUpiId}', expected '${candidatePayment.payeeUpiId}'.`,
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment.status === "PENDING" ? "REJECTED" : null,
      auditAction: "PAYEE_UPI_MISMATCH",
      httpStatus: 400,
    });
  }

  // 9. Verify exact expected amount
  if (Number(parsed.amount) !== Number(candidatePayment.expectedAmount)) {
    return finalizeOutcome({
      txStatus: "REJECTED",
      reason: `Amount mismatch: received ₹${parsed.amount}, expected ₹${candidatePayment.expectedAmount}.`,
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus:
        candidatePayment.status === "PENDING" ? "REJECTED" : null,
      auditAction: "AMOUNT_MISMATCH",
      httpStatus: 400,
    });
  }

  // 10. Check if already PAID by a different transaction
  if (candidatePayment.status === "PAID" || candidatePayment.matchedTransactionId) {
    return finalizeOutcome({
      txStatus: "REVIEW_REQUIRED",
      reason: `Payment request ${candidatePayment.paymentRequestId} was already settled by transaction ${candidatePayment.matchedTransactionId}.`,
      payment: candidatePayment,
      order: candidateOrder,
      auditAction: "CONFLICT_ALREADY_PAID",
      httpStatus: 409,
    });
  }

  // 11. Five-minute expiry check (server UTC time + transaction timestamp)
  const txTime = parsed.transactionTimestamp || effectiveNow;
  if (
    candidatePayment.status === "EXPIRED" ||
    candidatePayment.status === "LATE_PAYMENT" ||
    effectiveNow > candidatePayment.expiresAt ||
    txTime > candidatePayment.expiresAt
  ) {
    return finalizeOutcome({
      txStatus: "LATE_PAYMENT",
      reason: `Payment received after 5-minute expiry (${candidatePayment.expiresAt.toISOString()}). Photos remain locked pending admin review.`,
      payment: candidatePayment,
      order: candidateOrder,
      newRequestStatus: "LATE_PAYMENT",
      auditAction: "LATE_PAYMENT_DETECTED",
      httpStatus: 410,
    });
  }

  // 12. Optional Bank Reconciliation Adapter (honest status if not configured)
  const reconciliationAdapter = getBankReconciliationAdapter();
  const reconciliation = await reconciliationAdapter.reconcileTransaction({
    utr: parsed.utr,
    amount: parsed.amount,
    payeeUpiId: parsed.payeeUpiId,
    paymentReference: parsed.paymentReference,
  });

  // 13. Atomically transition PENDING -> PAID (concurrency-safe)
  const updatedPayment = await Payment.findOneAndUpdate(
    {
      paymentRequestId: candidatePayment.paymentRequestId,
      photographerId: candidatePhotographer.photographerId,
      expectedAmount: parsed.amount,
      payeeUpiId: parsed.payeeUpiId,
      status: "PENDING",
      expiresAt: { $gt: effectiveNow },
      matchedTransactionId: null,
    },
    {
      $set: {
        status: "PAID",
        matchedTransactionId: parsed.utr,
        transactionId: parsed.utr,
        paidAt: effectiveNow,
        verificationSummary: {
          reason: "Trusted bank email verified and matched all deterministic rules",
          verifiedAt: effectiveNow,
          emailMessageId: parsed.emailMessageId,
          utr: parsed.utr,
          manualReview: false,
        },
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedPayment) {
    return finalizeOutcome({
      txStatus: "REVIEW_REQUIRED",
      reason:
        "Concurrent state transition prevented automatic unlock; requires admin review.",
      payment: candidatePayment,
      order: candidateOrder,
      auditAction: "CONCURRENT_LOCK_REVIEW",
      httpStatus: 409,
    });
  }

  const updatedOrder = await Order.findOneAndUpdate(
    { orderId: candidateOrder.orderId, status: { $ne: "PAID" } },
    { $set: { status: "PAID", paidAt: effectiveNow } },
  { returnDocument: "after" }
);

  const finalTx = await BankTransaction.findOneAndUpdate(
    { transactionRecordId },
    {
      $set: {
        processingStatus: "MATCHED_PAID",
        decisionReason:
          "Verified bank email matched photographer UPI, amount, unique reference, and 5-minute validity window.",
        matchedPaymentRequestId: updatedPayment.paymentRequestId,
        matchedOrderId: candidateOrder.orderId,
        photographerId: candidatePhotographer.photographerId,
        "rawMetadata.reconciliation": reconciliation,
      },
    },
    { returnDocument: "after" }
  );

  await recordAuditLog({
    action: "PAYMENT_VERIFIED",
    actorType,
    actorId,
    targetType: "PaymentRequest",
    targetId: updatedPayment.paymentRequestId,
    photographerId: candidatePhotographer.photographerId,
    details: {
      orderId: candidateOrder.orderId,
      utr: parsed.utr,
      amount: parsed.amount,
      payeeUpiId: parsed.payeeUpiId,
      paymentReference: parsed.paymentReference,
      reconciliationConfigured: reconciliation.configured,
    },
    ipAddress,
  });

  emitPaymentStatusUpdate({
    paymentRequestId: updatedPayment.paymentRequestId,
    orderId: updatedPayment.orderId,
    eventId: updatedPayment.eventId,
    photographerId: updatedPayment.photographerId,
    status: "PAID",
    reason: "Payment confirmed! Your photos are now available.",
    expiresAt: updatedPayment.expiresAt,
    paidAt: updatedPayment.paidAt,
  });

  return {
    httpStatus: 200,
    outcome: "PAID",
    unlocked: true,
    duplicate: false,
    reason: "Payment verified and photos unlocked.",
    transaction: finalTx,
    payment: updatedPayment,
    order: updatedOrder,
  };
}

async function handleDuplicateTransaction(
  existingTx,
  parsed,
  { actorType, actorId, ipAddress }
) {
  const updatedExisting = await BankTransaction.findOneAndUpdate(
    { transactionRecordId: existingTx.transactionRecordId },
    { $inc: { duplicateCount: 1 } },
    { returnDocument: "after" }
  );

  await recordAuditLog({
    action: "DUPLICATE_DETECTED",
    actorType,
    actorId,
    targetType: "BankTransaction",
    targetId: existingTx.transactionRecordId,
    photographerId: existingTx.photographerId || "",
    details: {
      utr: parsed.utr || existingTx.utr,
      emailMessageId: parsed.emailMessageId || existingTx.emailMessageId,
      originalStatus: existingTx.processingStatus,
      duplicateCount: updatedExisting?.duplicateCount || 1,
    },
    ipAddress,
  });

  const existingPayment = existingTx.matchedPaymentRequestId
    ? await Payment.findOne({
        paymentRequestId: existingTx.matchedPaymentRequestId,
      })
    : null;

  return {
    httpStatus: 409,
    outcome: "DUPLICATE",
    unlocked: false,
    duplicate: true,
    originalProcessingStatus: existingTx.processingStatus,
    reason: `Duplicate transaction ignored (UTR '${existingTx.utr || "n/a"}' / Message-ID already processed).`,
    transaction: updatedExisting,
    payment: existingPayment,
  };
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}
