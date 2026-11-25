
import { useEffect, useState } from "react";
import "./App.css";

import Navbar from "./components/Navbar";
import Dashboard from "./components/Dashboard";
import GuestGallery from "./components/GuestGallery";
import ManagePhotos from "./components/ManagePhotos";
import PaymentSection from "./components/PaymentSection";

const API_URL = "http://localhost:5000/api";

function App() {
  const photographerId = "photo101";
  const guestId = "guest105";
  const pricePerPhoto = 20;

  const [activeTab, setActiveTab] = useState("dashboard");

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");

  const [photos, setPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);

  const [photoUrl, setPhotoUrl] = useState("");
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [paymentRequestId, setPaymentRequestId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [unlockedPhotos, setUnlockedPhotos] = useState([]);
  const [showPayment, setShowPayment] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedEvent = events.find(
    (event) => event.eventId === selectedEventId
  );

  const totalAmount = selectedPhotos.length * pricePerPhoto;

  // Fetch events
  useEffect(() => {
    async function fetchEvents() {
      try {
        const response = await fetch(
          `${API_URL}/events/photographer/${photographerId}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load events");
        }

        setEvents(data.events);

        if (data.events.length > 0) {
          setSelectedEventId(data.events[0].eventId);
        }
      } catch (err) {
        setError(err.message);
      }
    }

    fetchEvents();
  }, []);

  // Fetch photos
  useEffect(() => {
    if (!selectedEventId) {
      setPhotos([]);
      return;
    }

    async function fetchPhotos() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/photos/event/${selectedEventId}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load photos");
        }

        setPhotos(data.photos);
        setSelectedPhotos([]);
      } catch (err) {
        setError(err.message);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    }

    fetchPhotos();
  }, [selectedEventId]);

  // Refresh photos
  async function refreshPhotos() {
    if (!selectedEventId) return;

    const response = await fetch(
      `${API_URL}/photos/event/${selectedEventId}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Could not refresh photos");
    }

    setPhotos(data.photos);
  }

  // Add photo
  async function addPhoto(event) {
    event.preventDefault();

    if (!selectedEventId || !photoUrl.trim()) {
      setError("Please select an event and enter an image URL");
      return;
    }

    setAddingPhoto(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(`${API_URL}/photos/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: selectedEventId,
          photoUrl: photoUrl.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not add photo");
      }

      setPhotoUrl("");
      setSuccessMessage("Photo added successfully!");

      await refreshPhotos();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingPhoto(false);
    }
  }

  // Select or unselect photo
  function togglePhoto(photoId) {
    setSelectedPhotos((previous) =>
      previous.includes(photoId)
        ? previous.filter((id) => id !== photoId)
        : [...previous, photoId]
    );
  }

  // Create payment request (demo only)
  async function createPaymentRequest() {
    if (selectedPhotos.length === 0) {
      setError("Please select at least one photo!");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          photographerId,
          eventId: selectedEventId,
          guestId,
          amount: totalAmount,
          selectedPhotoIds: selectedPhotos,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Payment request failed");
      }

      setPaymentRequestId(data.payment.paymentRequestId);
      setPaymentStatus(data.payment.status);
      setUnlockedPhotos([]);
      setShowPayment(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch unlocked photos
  async function getUnlockedPhotos() {
    const response = await fetch(
      `${API_URL}/photos/unlocked/${paymentRequestId}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Could not unlock photos");
    }

    setUnlockedPhotos(data.photos);
  }

  // Check payment status
  async function checkPaymentStatus() {
    if (!paymentRequestId) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/payments/${paymentRequestId}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not check payment");
      }

      setPaymentStatus(data.payment.status);

      if (data.payment.status === "paid") {
        await getUnlockedPhotos();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Navigation
  function changeTab(tab) {
    setActiveTab(tab);
    setShowPayment(false);
    setSelectedPhotos([]);
    setError("");
    setSuccessMessage("");
  }

  function openGallery(eventId) {
    setSelectedEventId(eventId);
    setSelectedPhotos([]);
    setShowPayment(false);
    setError("");
    setActiveTab("gallery");
  }

  return (
    <div className="app">
      <Navbar
        activeTab={activeTab}
        onChangeTab={changeTab}
      />

      <main className="main">
        <header className="topbar">
          <div>
            <p className="welcome">WELCOME TO CELEBRARE</p>

            <h1>
              {activeTab === "dashboard"
                ? "Photographer Dashboard"
                : activeTab === "manage"
                ? "Manage Photos"
                : showPayment
                ? "Payment Status"
                : "Guest Photo Gallery"}
            </h1>
          </div>

          <div className="top-profile">
            <span>🔔</span>
            <div className="avatar">P</div>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <Dashboard
            events={events}
            photos={photos}
            pricePerPhoto={pricePerPhoto}
            onOpenGallery={openGallery}
            onManagePhotos={() => changeTab("manage")}
          />
        )}

        {activeTab === "manage" && (
          <ManagePhotos
            events={events}
            selectedEventId={selectedEventId}
            setSelectedEventId={setSelectedEventId}
            selectedEvent={selectedEvent}
            photos={photos}
            photoUrl={photoUrl}
            setPhotoUrl={setPhotoUrl}
            addPhoto={addPhoto}
            addingPhoto={addingPhoto}
            successMessage={successMessage}
          />
        )}

        {activeTab === "gallery" && (
          showPayment ? (
            <PaymentSection
              photographerId={photographerId}
              selectedEventId={selectedEventId}
              selectedEvent={selectedEvent}
              selectedPhotos={selectedPhotos}
              pricePerPhoto={pricePerPhoto}
              totalAmount={totalAmount}
              paymentRequestId={paymentRequestId}
              paymentStatus={paymentStatus}
              loading={loading}
              onBack={() => setShowPayment(false)}
              onCheckPayment={checkPaymentStatus}
              unlockedPhotos={unlockedPhotos}
              error={error}
            />
          ) : (
            <GuestGallery
              events={events}
              selectedEventId={selectedEventId}
              setSelectedEventId={setSelectedEventId}
              selectedEvent={selectedEvent}
              photos={photos}
              selectedPhotos={selectedPhotos}
              togglePhoto={togglePhoto}
              pricePerPhoto={pricePerPhoto}
              totalAmount={totalAmount}
              onContinue={createPaymentRequest}
              loading={loading}
            />
          )
        )}

        {error && activeTab !== "gallery" && (
          <p className="error-message">{error}</p>
        )}
      </main>
    </div>
  );
}

export default App;
