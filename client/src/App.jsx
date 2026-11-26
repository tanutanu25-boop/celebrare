import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE, apiRequest, getAuthToken, setAuthToken } from "./api";
import Navbar from "./components/Navbar";
import GuestGallery from "./components/GuestGallery";
import PaymentSection from "./components/PaymentSection";
import Dashboard from "./components/Dashboard";
import AdminReview from "./components/AdminReview";
import DemoLab from "./components/DemoLab";
import { ToastContainer } from "./components/Toast";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("gallery");
  const [demoMode, setDemoMode] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventPhotographer, setEventPhotographer] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [guestEmail, setGuestEmail] = useState("guest@celebrare.demo");

  const [showPayment, setShowPayment] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  const [activePayment, setActivePayment] = useState(null);
  const [paymentPhotographer, setPaymentPhotographer] = useState(null);
  const [paymentEvent, setPaymentEvent] = useState(null);
  const [downloads, setDownloads] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);

  const socketRef = useRef(null);

  const notify = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Load health/demo mode & restore auth session + active events
  useEffect(() => {
    apiRequest("/health")
      .then((h) => setDemoMode(Boolean(h.demoMode)))
      .catch(() => {});

    if (getAuthToken()) {
      apiRequest("/auth/me")
        .then((res) => setCurrentUser(res.user))
        .catch(() => setAuthToken(""));
    }

    apiRequest("/events")
      .then((res) => {
        setEvents(res.events || []);
        if (res.events?.length > 0) {
          setSelectedEventId((prev) => prev || res.events[0].eventId);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  // Load gallery when selectedEventId changes
  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    apiRequest(`/events/${selectedEventId}/gallery`)
      .then((data) => {
        if (cancelled) return;
        setError("");
        setSelectedEvent(data.event);
        setEventPhotographer(data.photographer);
        setPhotos(data.photos || []);
        setSelectedPhotos([]);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  const fetchSignedDownloads = useCallback(async (orderId) => {
    if (!orderId) return;
    try {
      const data = await apiRequest(`/orders/${orderId}/downloads`, {
        method: "POST",
      });
      setDownloads(data.downloads || []);
    } catch {
      // Locked until PAID
    }
  }, []);

  const syncPaymentStatus = useCallback(
    async (requestId) => {
      const id = requestId || activePayment?.paymentRequestId;
      if (!id) return;
      try {
        const data = await apiRequest(`/payment-requests/${id}/status`);
        setActivePayment(data.payment);
        setActiveOrder(data.order);
        if (data.photographer) setPaymentPhotographer(data.photographer);
        if (data.event) setPaymentEvent(data.event);
        if (data.payment?.status === "PAID" && data.order?.orderId) {
          await fetchSignedDownloads(data.order.orderId);
        }
      } catch (err) {
        setError(err.message);
      }
    },
    [activePayment?.paymentRequestId, fetchSignedDownloads]
  );

  // Socket.IO connection for real-time order updates + reliable polling fallback
  useEffect(() => {
    const socket = io(API_BASE, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("payment:status", (payload) => {
      if (payload?.paymentRequestId) {
        syncPaymentStatus(payload.paymentRequestId);
        notify(
          `Payment update: ${payload.status}`,
          payload.status === "PAID" ? "success" : "info"
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [syncPaymentStatus, notify]);

  useEffect(() => {
    const reqId = activePayment?.paymentRequestId;
    if (!reqId || !socketRef.current) return;

    socketRef.current.emit("join:order", reqId);
    const poll = setInterval(() => {
      if (activePayment?.status === "PENDING") {
        syncPaymentStatus(reqId);
      }
    }, 5000);

    return () => {
      socketRef.current?.emit("leave:order", reqId);
      clearInterval(poll);
    };
  }, [activePayment?.paymentRequestId, activePayment?.status, syncPaymentStatus]);

  function togglePhoto(photoId) {
    setSelectedPhotos((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  }

  async function handleCreateOrder() {
    if (selectedPhotos.length === 0) {
      notify("Select at least one photo", "error");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          eventId: selectedEventId,
          selectedPhotoIds: selectedPhotos,
          guestEmail,
        }),
      });
      setActiveOrder(data.order);
      setActivePayment(data.payment);
      setPaymentPhotographer(data.photographer);
      setPaymentEvent(data.event);
      setDownloads([]);
      setShowPayment(true);
      notify("5-minute UPI payment request created", "success");
    } catch (err) {
      setError(err.message);
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateNewRequest() {
    if (!activePayment?.paymentRequestId) return;
    setLoading(true);
    try {
      const data = await apiRequest(
        `/payment-requests/${activePayment.paymentRequestId}/new-request`,
        { method: "POST" }
      );
      setActiveOrder(data.order);
      setActivePayment(data.payment);
      setDownloads([]);
      notify("Created a fresh 5-minute payment request", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickCreateDemoOrder(eventId) {
    try {
      const data = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          eventId,
          selectedPhotoIds: [1, 2],
          guestEmail: "demo.guest@celebrare.demo",
        }),
      });
      setActiveOrder(data.order);
      setActivePayment(data.payment);
      setPaymentPhotographer(data.photographer);
      setPaymentEvent(data.event);
      setDownloads([]);
      notify(`Created order ${data.order.orderId} for ${eventId}`, "success");
      return data.payment.paymentRequestId;
    } catch (err) {
      notify(err.message, "error");
      return null;
    }
  }

  function handleAuthSuccess(token, user) {
    setAuthToken(token);
    setCurrentUser(user);
  }

  function handleLogout() {
    setAuthToken("");
    setCurrentUser(null);
    notify("Signed out", "info");
  }

  return (
    <div className="app">
      <Navbar
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          setError("");
        }}
        currentUser={currentUser}
        demoMode={demoMode}
        onLogout={handleLogout}
      />

      <main className="main">
        {demoMode && (
          <div className="demo-banner" role="status">
            <strong>DEMO MODE — No real money is being transferred.</strong>
            <span>
              Use Demo Scenario Lab (A–E) to send simulated bank emails through
              the live verification pipeline.
            </span>
          </div>
        )}

        <header className="topbar">
          <div>
            <p className="welcome">CELEBRARE DIRECT UPI PHOTO MARKETPLACE</p>
            <h1>
              {activeTab === "gallery"
                ? showPayment
                  ? "Direct UPI Checkout & Verification"
                  : "Event Photo Gallery"
                : activeTab === "dashboard"
                ? "Photographer Studio Dashboard"
                : activeTab === "admin"
                ? "Admin Payment Review & Audit"
                : "Demo Scenario Lab (A–E)"}
            </h1>
          </div>
        </header>

        {activeTab === "gallery" &&
          (showPayment ? (
            <PaymentSection
              payment={activePayment}
              order={activeOrder}
              photographer={paymentPhotographer}
              event={paymentEvent}
              downloads={downloads}
              loading={loading}
              onBack={() => setShowPayment(false)}
              onRefreshStatus={() => syncPaymentStatus()}
              onCreateNewRequest={handleCreateNewRequest}
              onRequestDownloads={() =>
                fetchSignedDownloads(activeOrder?.orderId)
              }
              onNotify={notify}
              error={error}
            />
          ) : (
            <GuestGallery
              events={events}
              selectedEventId={selectedEventId}
              setSelectedEventId={setSelectedEventId}
              selectedEvent={selectedEvent}
              photographer={eventPhotographer}
              photos={photos}
              selectedPhotos={selectedPhotos}
              togglePhoto={togglePhoto}
              clearSelection={() => setSelectedPhotos([])}
              guestEmail={guestEmail}
              setGuestEmail={setGuestEmail}
              onCreateOrder={handleCreateOrder}
              loading={loading}
            />
          ))}

        {activeTab === "dashboard" && (
          <Dashboard
            currentUser={currentUser}
            demoMode={demoMode}
            onAuthSuccess={handleAuthSuccess}
            onNotify={notify}
            onOpenGallery={(evId) => {
              setSelectedEventId(evId);
              setShowPayment(false);
              setActiveTab("gallery");
            }}
          />
        )}

        {activeTab === "admin" && (
          <AdminReview
            currentUser={currentUser}
            demoMode={demoMode}
            onAuthSuccess={handleAuthSuccess}
            onNotify={notify}
          />
        )}

        {activeTab === "demo" && demoMode && (
          <DemoLab
            activePayment={activePayment}
            events={events}
            onSyncPayment={syncPaymentStatus}
            onOpenPaymentTab={async (reqId) => {
              await syncPaymentStatus(reqId);
              setShowPayment(true);
              setActiveTab("gallery");
            }}
            onSelectEventAndCreateDemoOrder={handleQuickCreateDemoOrder}
            onNotify={notify}
          />
        )}

        {error && activeTab !== "gallery" && (
          <p className="error-message">{error}</p>
        )}
      </main>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }
      />
    </div>
  );
}

export default App;
