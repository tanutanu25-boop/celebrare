
import PhotoCard from "./PhotoCard";

function GuestGallery({
  events,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  photos,
  selectedPhotos,
  togglePhoto,
  pricePerPhoto,
  totalAmount,
  onContinue,
  loading,
}) {
  return (
    <section className="gallery-content">
      <div className="gallery-heading">
        <div>
          <span className="status">● EVENT GALLERY</span>
          <h2>Find Your Favourite Moments</h2>
          <p>Select your favourite photographs from the event.</p>

          <select
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
            className="event-select"
          >
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventName}
              </option>
            ))}
          </select>
        </div>

        <div className="price-tag">
          ₹{pricePerPhoto} <span>/ photo</span>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <h2>{selectedEvent?.eventName || "Event Gallery"}</h2>
          <p>Your memories, all in one place.</p>
        </div>
      </div>

      <div className="selection-info">
        <span>{selectedPhotos.length} photos selected</span>
        <strong>Total: ₹{totalAmount}</strong>
      </div>

      {photos.length > 0 ? (
        <div className="photo-grid">
          {photos.map((photo) => (
            <PhotoCard
              key={photo._id}
              photo={photo}
              selected={selectedPhotos.includes(photo.photoId)}
              selectable={true}
              onClick={() => togglePhoto(photo.photoId)}
            />
          ))}
        </div>
      ) : (
        <p className="empty-state">No photos available for this event yet.</p>
      )}

      <div className="checkout-bar">
        <div>
          <strong>{selectedPhotos.length} Photos Selected</strong>
          <p>₹{totalAmount} total amount</p>
        </div>

        <button
          className="primary-btn"
          onClick={onContinue}
          disabled={loading || selectedPhotos.length === 0}
        >
          {loading ? "Creating..." : "Continue to Payment →"}
        </button>
      </div>
    </section>
  );
}

export default GuestGallery;
