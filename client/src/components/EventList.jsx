
function EventList({ events, onOpenGallery }) {
  if (events.length === 0) {
    return <p className="empty-state">No events found.</p>;
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <div className="event-card" key={event.eventId}>
          <div className="event-card-top">
            <span className="status">● Active Event</span>
            <span className="event-emoji">📸</span>
          </div>

          <div className="event-info">
            <h3>{event.eventName}</h3>

            <p>{event.description || "Photography collection"}</p>

            <div className="event-meta">
              <span>
                🗓️{" "}
                {event.eventDate
                  ? new Date(event.eventDate).toLocaleDateString()
                  : "Date not available"}
              </span>

              <span>ID: {event.eventId}</span>
            </div>

            <button
              className="primary-btn"
              onClick={() => onOpenGallery(event.eventId)}
            >
              View Gallery →
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default EventList;
