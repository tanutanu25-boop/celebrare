import { useState } from "react";
import { Calendar, CheckCircle2, Mail, ShoppingBag, User } from "lucide-react";
import PhotoCard from "./PhotoCard";
import { formatLocalTime } from "../api";

function GuestGallery({
  events,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  photographer,
  photos,
  selectedPhotos,
  togglePhoto,
  clearSelection,
  guestEmail,
  setGuestEmail,
  onCreateOrder,
  loading,
}) {
  const [step, setStep] = useState("gallery"); // "gallery" | "checkout"

  const selectedPhotoObjects = photos.filter((p) =>
    selectedPhotos.includes(p.photoId)
  );
  const estimatedTotal = selectedPhotoObjects.reduce(
    (sum, p) => sum + Number(p.price || selectedEvent?.defaultPrice || 20),
    0
  );

  function handleCheckoutSubmit(e) {
    e.preventDefault();
    onCreateOrder();
  }

  return (
    <section className="gallery-content">
      <div className="gallery-heading card-surface">
        <div className="gallery-heading-left">
          <span className="status-pill status-active">● LIVE EVENT GALLERY</span>
          <h2>Find &amp; Purchase Your Event Photographs</h2>
          <p>
            Payments go directly to the photographer&apos;s UPI account. Photos
            unlock automatically once verified.
          </p>

          <div className="gallery-controls">
            <label className="field-label" htmlFor="guest-event-select">
              Choose Event
            </label>
            <select
              id="guest-event-select"
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setStep("gallery");
              }}
              className="event-select"
            >
              {events.map((ev) => (
                <option key={ev.eventId} value={ev.eventId}>
                  {ev.eventName} — {ev.photographer?.name || ev.photographerId}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="photographer-badge-card">
          <div className="badge-row">
            <User size={16} />
            <strong>{photographer?.name || "Photographer"}</strong>
          </div>
          <p className="upi-chip">
            Direct UPI: <code>{photographer?.upiId || "Not configured"}</code>
          </p>
          {selectedEvent?.eventDate && (
            <small className="badge-date">
              <Calendar size={13} /> {formatLocalTime(selectedEvent.eventDate)}
            </small>
          )}
        </div>
      </div>

      {step === "gallery" ? (
        <>
          <div className="selection-info">
            <div>
              <strong>{selectedEvent?.eventName || "Event Gallery"}</strong>
              <p className="muted-text">
                {selectedEvent?.description ||
                  "Click any watermarked preview to select it for purchase."}
              </p>
            </div>
            <div className="selection-totals">
              <span>{selectedPhotos.length} selected</span>
              <strong>Total: ₹{estimatedTotal}</strong>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading event gallery...</div>
          ) : photos.length > 0 ? (
            <div className="photo-grid">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo._id || photo.photoId}
                  photo={photo}
                  selected={selectedPhotos.includes(photo.photoId)}
                  selectable={true}
                  onClick={() => togglePhoto(photo.photoId)}
                />
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No photographs uploaded to this event yet.
            </p>
          )}

          <div className="checkout-bar">
            <div>
              <strong>
                {selectedPhotos.length}{" "}
                {selectedPhotos.length === 1 ? "Photo" : "Photos"} Selected
              </strong>
              <p>
                Estimated total: ₹{estimatedTotal} (final price verified on
                server)
              </p>
            </div>

            <div className="checkout-actions">
              {selectedPhotos.length > 0 && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={clearSelection}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="primary-btn"
                onClick={() => setStep("checkout")}
                disabled={loading || selectedPhotos.length === 0}
              >
                Review Checkout ({selectedPhotos.length}) →
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="checkout-panel card-surface">
          <button
            type="button"
            className="back-btn"
            onClick={() => setStep("gallery")}
          >
            ← Back to Photo Selection
          </button>

          <div className="checkout-grid">
            <div>
              <h3>Order Breakdown</h3>
              <p className="muted-text">
                Event: <strong>{selectedEvent?.eventName}</strong> •
                Photographer: <strong>{photographer?.name}</strong>
              </p>

              <div className="breakdown-list">
                {selectedPhotoObjects.map((p) => (
                  <div key={p.photoId} className="breakdown-row">
                    <span>
                      <CheckCircle2 size={15} /> {p.title || `Photo ${p.photoId}`}
                    </span>
                    <strong>
                      ₹{p.price || selectedEvent?.defaultPrice || 20}
                    </strong>
                  </div>
                ))}
                <div className="breakdown-total">
                  <span>
                    Total ({selectedPhotoObjects.length}{" "}
                    {selectedPhotoObjects.length === 1 ? "photo" : "photos"})
                  </span>
                  <strong>₹{estimatedTotal}</strong>
                </div>
              </div>
            </div>

            <form className="checkout-form" onSubmit={handleCheckoutSubmit}>
              <h3>Guest Identification &amp; Direct UPI</h3>
              <p className="muted-text">
                Enter your email so your order and download access are linked to
                you.
              </p>

              <label htmlFor="guest-email-input">
                <Mail size={14} /> Guest Email Address
              </label>
              <input
                id="guest-email-input"
                type="email"
                placeholder="guest@example.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                required
              />

              <div className="trust-callout">
                <strong>Pay Directly to Photographer</strong>
                <p>
                  Recipient: <strong>{photographer?.name}</strong> (
                  <code>{photographer?.upiId}</code>)
                </p>
                <small>
                  Payment request expires strictly in 5 minutes. Celebrare does
                  not collect or hold funds.
                </small>
              </div>

              <button
                type="submit"
                className="primary-btn pay-btn"
                disabled={loading || selectedPhotoObjects.length === 0}
              >
                <ShoppingBag size={16} />{" "}
                {loading
                  ? "Creating 5-Min Payment Request..."
                  : `Create Payment Request (₹${estimatedTotal})`}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default GuestGallery;
