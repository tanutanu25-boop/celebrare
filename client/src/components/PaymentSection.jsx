import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { API_BASE, formatLocalTime } from "../api";

const STATUS_META = {
  PENDING: {
    label: "PENDING",
    title: "Waiting for Payment Confirmation",
    copy: "Waiting for payment confirmation. Your payment is being verified.",
    className: "status-pending",
    Icon: Clock,
  },
  PAID: {
    label: "PAID",
    title: "Payment Verified",
    copy: "Payment confirmed! Your photos are now available.",
    className: "status-paid",
    Icon: CheckCircle2,
  },
  EXPIRED: {
    label: "EXPIRED",
    title: "Payment Request Expired",
    copy: "This payment request has expired. Create a new request to continue.",
    className: "status-expired",
    Icon: AlertTriangle,
  },
  LATE_PAYMENT: {
    label: "LATE_PAYMENT",
    title: "Late Payment Received",
    copy: "We received a payment notification after the payment request expired. Your order requires review.",
    className: "status-late",
    Icon: ShieldAlert,
  },
  REVIEW_REQUIRED: {
    label: "REVIEW_REQUIRED",
    title: "Manual Verification Required",
    copy: "We could not automatically verify this payment. It is under review.",
    className: "status-review",
    Icon: ShieldAlert,
  },
  REJECTED: {
    label: "REJECTED",
    title: "Payment Verification Failed",
    copy: "Payment verification failed. Please check the details or create a new request.",
    className: "status-rejected",
    Icon: XCircle,
  },
};

function PaymentSection({
  payment,
  order,
  photographer,
  event,
  downloads,
  loading,
  onBack,
  onRefreshStatus,
  onCreateNewRequest,
  onRequestDownloads,
  onNotify,
  error,
}) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  const status = (payment?.status || "PENDING").toUpperCase();
  const meta = STATUS_META[status] || STATUS_META.PENDING;
  const StatusIcon = meta.Icon;

  useEffect(() => {
    if (!payment?.expiresAt) return;

    const updateTimer = () => {
      const diffMs = new Date(payment.expiresAt).getTime() - Date.now();
      const secs = Math.max(0, Math.floor(diffMs / 1000));
      setSecondsLeft(secs);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [payment?.expiresAt]);

  // Trigger backend expiry sync once countdown hits 0 while still PENDING
  useEffect(() => {
    if (status === "PENDING" && payment?.expiresAt && secondsLeft === 0) {
      const diff = new Date(payment.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        onRefreshStatus?.();
      }
    }
  }, [secondsLeft, status, payment?.expiresAt, onRefreshStatus]);

  const formattedCountdown = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, [secondsLeft]);

  function copyValue(value, label) {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    onNotify?.(`${label} copied to clipboard`, "success");
  }

  if (!payment) {
    return (
      <section className="payment-card payment-section">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back to Gallery
        </button>
        <p className="empty-state">No active payment request selected.</p>
      </section>
    );
  }

  return (
    <section className="payment-card payment-section">
      <div className="payment-top-row">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back to Gallery
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={onRefreshStatus}
          disabled={loading}
        >
          <RefreshCw size={14} /> Refresh Status
        </button>
      </div>

      <div className={`status-banner ${meta.className}`}>
        <StatusIcon size={24} />
        <div>
          <div className="status-banner-head">
            <span className="status-code">{meta.label}</span>
            <strong>{meta.title}</strong>
          </div>
          <p>{meta.copy}</p>
          {payment.verificationSummary?.reason && status !== "PENDING" && (
            <small className="reason-note">
              Verification detail: {payment.verificationSummary.reason}
            </small>
          )}
        </div>
      </div>

      <div className="payment-grid">
        <div className="qr-panel">
          <div className="qr-wrapper">
            {payment.upiPaymentLink ? (
              <QRCodeSVG
                value={payment.upiPaymentLink}
                size={210}
                level="M"
                includeMargin={true}
              />
            ) : (
              <p>QR unavailable</p>
            )}
          </div>
          <p className="qr-caption">
            Scan with GPay, PhonePe, Paytm, or BHIM. Paying goes directly to{" "}
            <strong>{photographer?.name}</strong>.
          </p>
          <small className="qr-disclaimer">
            Note: Scanning or generating a QR code does not confirm payment.
            Unlocking occurs only after verified bank notification.
          </small>
        </div>

        <div className="payment-info-panel">
          <div className="countdown-box">
            <span>5-Minute Validity Countdown</span>
            <strong
              className={
                status === "PENDING" && secondsLeft <= 60 ? "urgent-timer" : ""
              }
            >
              {status === "PENDING" ? formattedCountdown : status}
            </strong>
            <small>Expires at: {formatLocalTime(payment.expiresAt)}</small>
          </div>

          <div className="payment-details">
            <div>
              <span>Photographer</span>
              <strong>{photographer?.name || payment.photographerId}</strong>
            </div>
            <div>
              <span>Event</span>
              <strong>{event?.eventName || payment.eventId}</strong>
            </div>
            <div>
              <span>Order ID</span>
              <code>{order?.orderId || payment.orderId}</code>
            </div>
            <div>
              <span>Request ID</span>
              <code>{payment.paymentRequestId}</code>
            </div>
            <div>
              <span>Payee UPI ID</span>
              <div className="copy-inline">
                <code>{payment.payeeUpiId}</code>
                <button
                  type="button"
                  className="icon-copy-btn"
                  onClick={() => copyValue(payment.payeeUpiId, "UPI ID")}
                  title="Copy UPI ID"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <div>
              <span>Payment Reference (Note)</span>
              <div className="copy-inline">
                <code>{payment.uniquePaymentReference}</code>
                <button
                  type="button"
                  className="icon-copy-btn"
                  onClick={() =>
                    copyValue(
                      payment.uniquePaymentReference,
                      "Payment reference"
                    )
                  }
                  title="Copy Payment Reference"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <div className="total-row">
              <span>Exact Amount</span>
              <strong>₹{payment.expectedAmount || payment.amount}</strong>
            </div>
          </div>

          {(status === "EXPIRED" || status === "REJECTED") && (
            <button
              type="button"
              className="primary-btn pay-btn"
              onClick={onCreateNewRequest}
              disabled={loading}
            >
              Create New Payment Request (5 Min) →
            </button>
          )}
        </div>
      </div>

      {status === "PAID" && (
        <div className="unlocked-section">
          <div className="unlocked-header">
            <div>
              <h3>Unlocked Original Photographs</h3>
              <p className="muted-text">
                Short-lived signed download URLs scoped strictly to order{" "}
                <code>{order?.orderId || payment.orderId}</code>.
              </p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={onRequestDownloads}
              disabled={loading}
            >
              Refresh Download Links
            </button>
          </div>

          {downloads && downloads.length > 0 ? (
            <div className="download-grid">
              {downloads.map((item) => (
                <div key={item.photoId} className="download-card">
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      Frame #{item.photoId} • Link expires{" "}
                      {formatLocalTime(item.expiresAt)}
                    </small>
                  </div>
                  <a
                    className="primary-btn small-btn"
                    href={`${API_BASE}${item.downloadUrl}`}
                    download
                  >
                    <Download size={14} /> Download Original
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="primary-btn"
              onClick={onRequestDownloads}
            >
              Generate Signed Download Links
            </button>
          )}
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
    </section>
  );
}

export default PaymentSection;
