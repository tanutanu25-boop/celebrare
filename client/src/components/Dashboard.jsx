
import EventList from "./EventList";

function Dashboard({
  events,
  photos,
  pricePerPhoto,
  onOpenGallery,
  onManagePhotos,
}) {
  return (
    <section className="dashboard-content">
      <div className="hero">
        <div className="hero-content">
          <span className="hero-label">YOUR PHOTOGRAPHY SPACE</span>

          <h2>
            Capture moments.
            <br />
            Keep memories.
          </h2>

          <p>
            Organize your events, manage your photographs and share
            beautiful memories with everyone.
          </p>

          <button className="primary-btn" onClick={onManagePhotos}>
            Manage Photos →
          </button>
        </div>

        <div className="hero-decoration">📸</div>
      </div>

      <div className="section-heading">
        <div>
          <h2>Overview</h2>
          <p>Here's what's happening in your workspace.</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-icon">🎉</div>
          <p>Total Events</p>
          <h2>{events.length}</h2>
          <small>Your registered events</small>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📷</div>
          <p>Event Photos</p>
          <h2>{photos.length}</h2>
          <small>Photos in selected event</small>
        </div>

        <div className="stat-card">
          <div className="stat-icon">₹</div>
          <p>Price Per Photo</p>
          <h2>₹{pricePerPhoto}</h2>
          <small>Your demo pricing</small>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <h2>Your Events</h2>
          <p>Explore your photography collections.</p>
        </div>

        <span className="event-count">{events.length} Events</span>
      </div>

      <EventList
        events={events}
        onOpenGallery={onOpenGallery}
      />
    </section>
  );
}

export default Dashboard;
