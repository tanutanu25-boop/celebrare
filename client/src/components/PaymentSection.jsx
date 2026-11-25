
import PhotoCard from "./PhotoCard";

function PaymentSection({
  photographerId,
  selectedEventId,
  selectedEvent,
  selectedPhotos,
  pricePerPhoto,
  totalAmount,
  paymentRequestId,
  paymentStatus,
  loading,
  onBack,
  onCheckPayment,
  unlockedPhotos,
  error,
}) {
  return (
    <section className="payment-card payment-section">
      <button className="back-btn" onClick={onBack}>
        ← Back to Gallery
      </button>

      <div className="payment-header">
        <div className="payment-icon">₹</div>
        <h2>Payment Summary</h2>
        <p>{selectedEvent?.eventName}</p>
      </div>

      <div className="payment-details">
        <div>
          <span>Selected Photos</span>
          <strong>{selectedPhotos.length}</strong>
        </div>

        <div>
          <span>Price Per Photo</span>
          <strong>₹{pricePerPhoto}</strong>
        </div>

        <div className="total-row">
          <span>Total Amount</span>
          <strong>₹{totalAmount}</strong>
        </div>
      </div>

      <div className="upi-note">
        <strong>Demo Payment Request</strong>
        <p>Photographer ID: {photographerId}</p>
        <p>Event ID: {selectedEventId}</p>
        <p>Amount: ₹{totalAmount}</p>
        <p>
          Request ID:
          <br />
          <small>{paymentRequestId}</small>
        </p>
      </div>

      <div className="upi-note">
        <strong>Payment Status</strong>
        <h3>{paymentStatus.toUpperCase()}</h3>

        {paymentStatus === "pending" && (
          <p>Waiting for demo verification.</p>
        )}

        {paymentStatus === "paid" && (
          <p>Demo payment successful (simulated)!</p>
        )}

        {paymentStatus === "expired" && (
          <p>This request has expired. Create a new request.</p>
        )}
      </div>

      <button
        className="primary-btn pay-btn"
        onClick={onCheckPayment}
        disabled={loading || paymentStatus === "expired"}
      >
        {loading ? "Checking..." : "Check Payment Status"}
      </button>

      {paymentStatus === "paid" && (
        <div className="unlocked-section">
          <h3>Unlocked Photos 🎉</h3>

          <div className="photo-grid">
            {unlockedPhotos.map((photo) => (
              <PhotoCard key={photo._id} photo={photo} />
            ))}
          </div>
        </div>
      )}

      {error && <p className="error-message">{error}</p>}

      <p className="demo-note">
        Demo only. No real payment is collected. Verification is simulated
        using the demo webhook.
      </p>
    </section>
  );
}

export default PaymentSection;
