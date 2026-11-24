
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import "./App.css";

const photos = [
  {
    id: 1,
    name: "Wedding Ceremony",
    image:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=600",
  },
  {
    id: 2,
    name: "Beautiful Couple",
    image:
      "https://images.unsplash.com/photo-1537633552985-df8429e8048b?w=600",
  },
  {
    id: 3,
    name: "Wedding Celebration",
    image:
      "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=600",
  },
  {
    id: 4,
    name: "Special Moments",
    image:
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=600",
  },
  {
    id: 5,
    name: "Wedding Memories",
    image:
      "https://images.unsplash.com/photo-1507504031003-b417219a0fde?w=600",
  },
  {
    id: 6,
    name: "Celebration",
    image:
      "https://images.unsplash.com/photo-1519225421980-888cbf7a5b9e?w=600",
  },
];

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const pricePerPhoto = 20;
  const totalAmount = selectedPhotos.length * pricePerPhoto;

  // Demo photographer details
  const photographerUPI = "rahul@upi";
  const photographerName = "Rahul Photographer";

  // Generate UPI payment link
  const upiPaymentLink = `upi://pay?pa=${photographerUPI}&pn=${encodeURIComponent(
    photographerName
  )}&am=${totalAmount}&cu=INR&tn=Celebrare%20Photo%20Payment`;

  function togglePhoto(id) {
    setSelectedPhotos((previous) =>
      previous.includes(id)
        ? previous.filter((photoId) => photoId !== id)
        : [...previous, id]
    );
  }

  function openPayment() {
    if (selectedPhotos.length === 0) {
      alert("Please select at least one photo!");
      return;
    }

    setShowQR(false);
    setShowPayment(true);
    setActiveTab("gallery");
  }

  function generateQR() {
    if (totalAmount <= 0) {
      alert("Please select photos first!");
      return;
    }

    setShowQR(true);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="logo">
          Celebrare<span>.</span>
        </h2>

        <p className="menu-title">MENU</p>

        <button
          className={activeTab === "dashboard" ? "nav-item active" : "nav-item"}
          onClick={() => {
            setActiveTab("dashboard");
            setShowPayment(false);
            setShowQR(false);
          }}
        >
          ◫ Dashboard
        </button>

        <button
          className={activeTab === "gallery" ? "nav-item active" : "nav-item"}
          onClick={() => {
            setActiveTab("gallery");
            setShowPayment(false);
            setShowQR(false);
          }}
        >
          ▧ Photo Gallery
        </button>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">P</div>
            <div>
              <strong>Photographer</strong>
              <small>Pro Account</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="welcome">WELCOME TO CELEBRARE</p>
            <h1>
              {activeTab === "dashboard"
                ? "Photographer Dashboard"
                : showPayment
                ? "Complete Your Payment"
                : "Event Photo Gallery"}
            </h1>
          </div>

          <div className="top-profile">
            <span>🔔</span>
            <div className="avatar">P</div>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <section>
            <div className="hero">
              <div>
                <p className="hero-label">YOUR PHOTOGRAPHY BUSINESS</p>
                <h2>
                  Capture moments.
                  <br />
                  Share memories.
                </h2>
                <p>
                  Manage your events and let guests purchase
                  their favourite photos.
                </p>
                <button
                  className="primary-btn"
                  onClick={() => setActiveTab("gallery")}
                >
                  Explore Gallery →
                </button>
              </div>
              <div className="hero-decoration">📸</div>
            </div>

            <div className="section-heading">
              <div>
                <h2>Overview</h2>
                <p>Here is your event summary.</p>
              </div>
            </div>

            <div className="stats">
              <div className="stat-card">
                <span>📷</span>
                <p>Total Photos</p>
                <h2>248</h2>
              </div>

              <div className="stat-card">
                <span>🎉</span>
                <p>Total Events</p>
                <h2>12</h2>
              </div>

              <div className="stat-card">
                <span>🛒</span>
                <p>Photo Price</p>
                <h2>₹20</h2>
              </div>
            </div>

            <div className="section-heading">
              <div>
                <h2>Your Events</h2>
                <p>Manage your photography events.</p>
              </div>

              <button
                className="secondary-btn"
                onClick={() => setActiveTab("gallery")}
              >
                View Gallery
              </button>
            </div>

            <div className="event-card">
              <img src={photos[0].image} alt="Wedding event" />

              <div className="event-info">
                <span className="status">● Active Event</span>
                <h3>Wedding Celebration 2026</h3>
                <p>Event ID: CELEB001</p>
                <p>6 sample photos available</p>

                <button
                  className="primary-btn"
                  onClick={() => setActiveTab("gallery")}
                >
                  Open Event →
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "gallery" && (
          <section>
            {!showPayment ? (
              <>
                <div className="gallery-heading">
                  <div>
                    <span className="status">● Event Active</span>
                    <h2>Wedding Celebration 2026</h2>
                    <p>Select your favourite photos to continue.</p>
                  </div>

                  <div className="price-tag">₹20 / photo</div>
                </div>

                <div className="selection-info">
                  <span>{selectedPhotos.length} photos selected</span>
                  <strong>Total: ₹{totalAmount}</strong>
                </div>

                <div className="photo-grid">
                  {photos.map((photo) => (
                    <div
                      className={
                        selectedPhotos.includes(photo.id)
                          ? "photo-card selected"
                          : "photo-card"
                      }
                      key={photo.id}
                      onClick={() => togglePhoto(photo.id)}
                    >
                      <img src={photo.image} alt={photo.name} />

                      <div className="photo-caption">
                        <span>{photo.name}</span>
                        <span className="check">
                          {selectedPhotos.includes(photo.id) ? "✓" : "+"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="checkout-bar">
                  <div>
                    <strong>{selectedPhotos.length} Photos</strong>
                    <p>₹{totalAmount} total amount</p>
                  </div>

                  <button className="primary-btn" onClick={openPayment}>
                    Continue to Payment →
                  </button>
                </div>
              </>
            ) : (
              <div className="payment-card">
                <button
                  className="back-btn"
                  onClick={() => {
                    setShowPayment(false);
                    setShowQR(false);
                  }}
                >
                  ← Back to Gallery
                </button>

                <div className="payment-icon">₹</div>

                <h2>Payment Summary</h2>
                <p>Wedding Celebration 2026</p>

                <div className="payment-details">
                  <div>
                    <span>Selected Photos</span>
                    <strong>{selectedPhotos.length}</strong>
                  </div>

                  <div>
                    <span>Price per Photo</span>
                    <strong>₹{pricePerPhoto}</strong>
                  </div>

                  <div className="total-row">
                    <span>Total Amount</span>
                    <strong>₹{totalAmount}</strong>
                  </div>
                </div>

                <div className="upi-note">
                  <strong>Photographer UPI Details</strong>
                  <p>Photographer: {photographerName}</p>
                  <p>UPI ID: {photographerUPI}</p>
                  <p>Amount: ₹{totalAmount}</p>
                </div>

                {!showQR ? (
                  <button
                    className="primary-btn pay-btn"
                    onClick={generateQR}
                  >
                    Generate UPI QR Code
                  </button>
                ) : (
                  <div className="qr-section">
                    <h3>Scan UPI QR Code</h3>

                    <QRCodeSVG
                      value={upiPaymentLink}
                      size={220}
                      level="H"
                      includeMargin={true}
                    />

                    <h3>₹{totalAmount}</h3>

                    <p>Demo UPI payment request</p>

                    <button
                      className="back-btn"
                      onClick={() => setShowQR(false)}
                    >
                      ← Back to Payment Summary
                    </button>
                  </div>
                )}

                <small className="demo-note">
                  Demo only — no real payment verification or photo unlocking.
                  Do not scan or pay using this sample UPI ID.
                </small>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
