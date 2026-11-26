/**
 * Cloudflare Email Worker for Celebrare Direct UPI Bank Email Intake.
 *
 * Receives incoming emails via Cloudflare Email Routing, extracts headers,
 * SPF/DKIM/DMARC authentication results, and UPI transaction fields, signs the
 * payload with HMAC-SHA256 + timestamp, and forwards it to the Celebrare backend.
 *
 * SECURITY NOTE:
 * Email authentication (SPF/DKIM/DMARC) + worker HMAC proves mail-domain origin
 * and worker authenticity; it is NOT a substitute for live bank settlement APIs.
 */

export default {
  async email(message, env, ctx) {
    try {
      const rawEmail = await new Response(message.raw).text();
      const fromHeader = message.headers.get("from") || message.from || "";
      const toHeader = message.headers.get("to") || message.to || "";
      const subject = message.headers.get("subject") || "";
      const messageId =
        message.headers.get("message-id") ||
        `<cf-${Date.now()}-${Math.random().toString(36).slice(2)}@cloudflare>`;
      const authHeader =
        message.headers.get("authentication-results") ||
        message.headers.get("arc-authentication-results") ||
        "";

      const emailAuthResults = parseAuthenticationResults(authHeader);
      const bodyText = extractPlainBody(rawEmail);
      const parsedFields = extractUpiTransactionFields(`${subject}\n${bodyText}`);

      const payload = {
        from: fromHeader,
        sender: message.from,
        to: toHeader,
        subject,
        emailMessageId: messageId,
        emailAuthResults: {
          ...emailAuthResults,
          rawHeader: authHeader,
        },
        textBody: bodyText.slice(0, 4000),
        utr: parsedFields.utr,
        amount: parsedFields.amount,
        payeeUpiId: parsedFields.payeeUpiId,
        paymentReference: parsedFields.paymentReference,
        transactionStatus: parsedFields.transactionStatus,
        transactionTimestamp:
          message.headers.get("date") || new Date().toISOString(),
        isDemo: false,
      };

      const bodyString = JSON.stringify(payload);
      const timestamp = String(Date.now());
      const signature = await signHmacSha256(
        env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET,
        `${timestamp}.${bodyString}`
      );

      const response = await fetch(env.BACKEND_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CF-Timestamp": timestamp,
          "X-CF-Worker-Signature": `sha256=${signature}`,
          "X-CF-Worker-Id": env.WORKER_ID || "celebrare-cf-email-worker",
        },
        body: bodyString,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(
          `Celebrare webhook returned ${response.status}: ${errText}`
        );
      }
    } catch (err) {
      console.error("Cloudflare Email Worker error:", err?.message || err);
    }
  },
};

function parseAuthenticationResults(header = "") {
  const lower = header.toLowerCase();
  const extract = (mech) => {
    const match = lower.match(new RegExp(`${mech}\\s*=\\s*([a-z]+)`));
    return match ? match[1] : "none";
  };
  return {
    spf: extract("spf"),
    dkim: extract("dkim"),
    dmarc: extract("dmarc"),
    trustedForwarder: true,
  };
}

function extractPlainBody(raw = "") {
  const splitIdx = raw.search(/\r?\n\r?\n/);
  const body = splitIdx >= 0 ? raw.slice(splitIdx + 2) : raw;
  return body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractUpiTransactionFields(text = "") {
  const utrMatch = text.match(
    /(?:UTR|Ref(?:erence)?\s*(?:No|ID)?|Txn\s*ID)\s*[:#-]?\s*([A-Za-z0-9-]{6,40})/i
  );
  const amountMatch = text.match(
    /(?:INR|Rs\.?|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/i
  );
  const payeeMatch = text.match(
    /(?:to\s*VPA|Payee\s*UPI|credited\s*to)\s*[:#-]?\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+)/i
  );
  const refMatch = text.match(/\b(CLB-[A-Z0-9]{6,20})\b/i);

  const isFailed = /\b(failed|declined|reversed|debited)\b/i.test(text);
  return {
    utr: utrMatch ? utrMatch[1].trim() : "",
    amount: amountMatch ? Number(amountMatch[1]) : 0,
    payeeUpiId: payeeMatch ? payeeMatch[1].trim().toLowerCase() : "",
    paymentReference: refMatch ? refMatch[1].trim().toUpperCase() : "",
    transactionStatus: isFailed ? "FAILED" : "SUCCESS",
  };
}

async function signHmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret || ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(message)
  );
  return [...new Uint8Array(sigBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
