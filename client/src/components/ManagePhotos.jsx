
import PhotoCard from "./PhotoCard";

function ManagePhotos({
  events,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  photos,
  photoUrl,
  setPhotoUrl,
  addPhoto,
  addingPhoto,
  successMessage,
}) {
  return (
    <section className="manage-content">
      <div className="section-heading">
        <div>
          <h2>Manage Your Photos</h2>
          <p>Add and organize photographs for your events.</p>
        </div>
      </div>

      <div className="payment-card manage-form-card">
        <form onSubmit={addPhoto}>
          <label>Select Event</label>

          <select
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
            className="event-select"
            required
          >
            <option value="">Choose an event</option>

            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventName}
              </option>
            ))}
          </select>

          <label>Photo Image URL</label>

          <input
            type="url"
            placeholder="https://example.com/photo.jpg"
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            required
          />

          {photoUrl && (
            <div className="image-preview">
              <p>Image Preview</p>

              <img
                src={photoUrl}
                alt="Photo preview"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                onLoad={(event) => {
                  event.currentTarget.style.display = "block";
                }}
              />
            </div>
          )}

          <button
            className="primary-btn"
            type="submit"
            disabled={addingPhoto || !selectedEventId}
          >
            {addingPhoto ? "Adding Photo..." : "Add Photo +"}
          </button>
        </form>

        {successMessage && (
          <p className="success-message">{successMessage}</p>
        )}
      </div>

      <div className="section-heading">
        <div>
          <h2>Event Photos</h2>
          <p>{selectedEvent?.eventName || "Select an event"}</p>
        </div>

        <span className="event-count">{photos.length} Photos</span>
      </div>

      {photos.length > 0 ? (
        <div className="photo-grid">
          {photos.map((photo) => (
            <PhotoCard key={photo._id} photo={photo} />
          ))}
        </div>
      ) : (
        <p className="empty-state">No photos added to this event yet.</p>
      )}
    </section>
  );
}

export default ManagePhotos;
