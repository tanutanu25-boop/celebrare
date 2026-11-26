import { randomBytes } from "crypto";
import { UPI_REGEX } from "../models/Photographer.js";

/**
 * Validate a UPI VPA (e.g. aarav.demo@upi).
 */
export function isValidUpiId(upiId) {
  return typeof upiId === "string" && UPI_REGEX.test(upiId.trim());
}

/**
 * Generate a short, collision-resistant payment reference suitable for UPI `tr` and `tn` fields.
 */
export function generateUniquePaymentReference() {
  const randomPart = randomBytes(4).toString("hex").toUpperCase();
  const timePart = Date.now().toString(36).slice(-4).toUpperCase();
  return `CLB-${timePart}${randomPart}`;
}

/**
 * Build an NPCI-compliant UPI payment deep link using server-verified payee UPI ID and exact amount.
 */
export function buildUpiPaymentLink({
  upiId,
  payeeName,
  amount,
  currency = "INR",
  uniquePaymentReference,
  eventName = "Celebrare Photos",
}) {
  if (!isValidUpiId(upiId)) {
    throw new Error("Photographer has not configured a valid UPI ID");
  }
  const normalizedAmount = Number(amount).toFixed(2);
  const note = `${uniquePaymentReference} ${eventName}`.slice(0, 50);

  return (
    `upi://pay?pa=${encodeURIComponent(upiId.trim().toLowerCase())}` +
    `&pn=${encodeURIComponent(payeeName.trim())}` +
    `&am=${encodeURIComponent(normalizedAmount)}` +
    `&cu=${encodeURIComponent(currency)}` +
    `&tr=${encodeURIComponent(uniquePaymentReference)}` +
    `&tn=${encodeURIComponent(note)}`
  );
}
