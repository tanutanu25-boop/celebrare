import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  CreditCard,
  ImagePlus,
  Lock,
  RefreshCw,
} from "lucide-react";
import { apiRequest, formatLocalTime } from "../api";
import PhotoCard from "./PhotoCard";

const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/;

function Dashboard({
  currentUser,
  demoMode,
  onAuthSuccess,
  onNotify,
  onOpenGallery,
}) {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    upiId: "",
    city: "",
  });

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState("overview"); // overview | events | orders | logs

  // UPI & Profile settings
  const [upiInput, setUpiInput] = useState("");
  const [bankSendersInput, setBankSendersInput] = useState("");

  // New Event form
  const [eventForm, setEventForm] = useState({
    eventName: "",
    eventDate: "",
    description: "",
    defaultPrice: "50",
  });

  // Upload Photo form
  const [uploadEventId, setUploadEventId] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadPrice, setUploadPrice] = useState("50");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadUrl, setUploadUrl] = useState("");
  const [eventPhotos, setEventPhotos] = useState([]);

  const isPhotographerOrAdmin =
    currentUser &&
    (currentUser.role === "photographer" || currentUser.role === "admin");

  const applyDashboardData = useCallback((data) => {
    setDashboardData(data);
    setUpiInput(data.photographer?.upiId || "");
    setBankSendersInput(
      (data.photographer?.allowedBankSenders || []).join(", ")
    );
    if (data.events?.length > 0) {
      setUploadEventId((prev) => prev || data.events[0].eventId);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!isPhotographerOrAdmin) return;
    setLoading(true);
    try {
      const targetId =
        currentUser.role === "admin" ? "aarav-photo" : currentUser.photographerId;
      const data = await apiRequest(`/photographers/${targetId}/dashboard`);
      applyDashboardData(data);
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [currentUser, isPhotographerOrAdmin, onNotify, applyDashboardData]);

  useEffect(() => {
    if (!isPhotographerOrAdmin) return;
    let cancelled = false;
    const targetId =
      currentUser.role === "admin" ? "aarav-photo" : currentUser.photographerId;
    apiRequest(`/photographers/${targetId}/dashboard`)
      .then((data) => {
        if (!cancelled) applyDashboardData(data);
      })
      .catch((err) => {
        if (!cancelled) onNotify(err.message, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isPhotographerOrAdmin, onNotify, applyDashboardData]);

  useEffect(() => {
    if (!uploadEventId) return;
    let cancelled = false;
    apiRequest(`/photos/event/${uploadEventId}`)
      .then((d) => {
        if (!cancelled) setEventPhotos(d.photos || []);
      })
      .catch(() => {
        if (!cancelled) setEventPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [uploadEventId]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint =
        authMode === "register" ? "/auth/register" : "/auth/login";
      const data = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(authForm),
      });
      onAuthSuccess(data.token, data.user);
      onNotify(`Signed in as ${data.user.name}`, "success");
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(photographerId) {
    setLoading(true);
    try {
      const data = await apiRequest("/auth/demo-login", {
        method: "POST",
        body: JSON.stringify({ photographerId }),
      });
      onAuthSuccess(data.token, data.user);
      onNotify(`Demo studio active: ${data.user.name}`, "success");
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveUpi(e) {
    e.preventDefault();
    if (!UPI_PATTERN.test(upiInput.trim())) {
      onNotify("Enter a valid UPI ID (example: studio.name@okhdfcbank)", "error");
      return;
    }
    try {
      await apiRequest(`/photographers/${dashboardData.photographer.photographerId}/upi`, {
        method: "PUT",
        body: JSON.stringify({ upiId: upiInput.trim() }),
      });
      const senders = bankSendersInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await apiRequest(
        `/photographers/${dashboardData.photographer.photographerId}/profile`,
        {
          method: "PUT",
          body: JSON.stringify({ allowedBankSenders: senders }),
        }
      );
      onNotify("UPI ID & bank sender allowlist updated", "success");
      loadDashboard();
    } catch (err) {
      onNotify(err.message, "error");
    }
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    try {
      const data = await apiRequest("/events", {
        method: "POST",
        body: JSON.stringify({
          ...eventForm,
          photographerId: dashboardData.photographer.photographerId,
          defaultPrice: Number(eventForm.defaultPrice || 20),
        }),
      });
      onNotify(`Event "${data.event.eventName}" created`, "success");
      setEventForm({
        eventName: "",
        eventDate: "",
        description: "",
        defaultPrice: "50",
      });
      setUploadEventId(data.event.eventId);
      loadDashboard();
    } catch (err) {
      onNotify(err.message, "error");
    }
  }

  async function handleUploadPhoto(e) {
    e.preventDefault();
    if (!uploadEventId) {
      onNotify("Select an event first", "error");
      return;
    }
    try {
      if (uploadFile) {
        const formData = new FormData();
        formData.append("eventId", uploadEventId);
        formData.append("title", uploadTitle || uploadFile.name);
        formData.append("price", uploadPrice || "50");
        formData.append("photo", uploadFile);
        await apiRequest("/photos/upload", {
          method: "POST",
          body: formData,
        });
        setUploadFile(null);
      } else if (uploadUrl.trim()) {
        await apiRequest("/photos/add", {
          method: "POST",
          body: JSON.stringify({
            eventId: uploadEventId,
            title: uploadTitle || "Event Frame",
            price: Number(uploadPrice || 50),
            photoUrl: uploadUrl.trim(),
          }),
        });
        setUploadUrl("");
      } else {
        onNotify("Choose an image file or enter an image URL", "error");
        return;
      }

      setUploadTitle("");
      onNotify("Photo added to protected event storage", "success");
      const refreshed = await apiRequest(`/photos/event/${uploadEventId}`);
      setEventPhotos(refreshed.photos || []);
    } catch (err) {
      onNotify(err.message, "error");
    }
  }

  if (!isPhotographerOrAdmin) {
    return (
      <section className="auth-panel card-surface">
        <div className="auth-header">
          <Lock size={22} />
          <div>
            <h2>Photographer Studio Sign In</h2>
            <p className="muted-text">
              Manage your UPI ID, events, protected photo uploads, and verified
              payout logs. Photographers are strictly isolated from each
              other&apos;s data.
            </p>
          </div>
        </div>

        {demoMode && (
          <div className="demo-quick-box">
            <strong>1-Click Demo Photographer Sign In</strong>
            <div className="demo-btn-row">
              <button
                type="button"
                className="primary-btn"
                onClick={() => handleDemoLogin("aarav-photo")}
                disabled={loading}
              >
                Photographer A: Aarav Photography (aarav.demo@upi)
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handleDemoLogin("mountain-lens")}
                disabled={loading}
              >
                Photographer B: Mountain Lens Studio (mountainlens.demo@upi)
              </button>
            </div>
          </div>
        )}

        <div className="auth-tabs">
          <button
            type="button"
            className={authMode === "login" ? "pill-tab active" : "pill-tab"}
            onClick={() => setAuthMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={authMode === "register" ? "pill-tab active" : "pill-tab"}
            onClick={() => setAuthMode("register")}
          >
            Register New Studio
          </button>
        </div>

        <form className="stacked-form" onSubmit={handleAuthSubmit}>
          {authMode === "register" && (
            <>
              <label>Studio / Photographer Name</label>
              <input
                type="text"
                value={authForm.name}
                onChange={(e) =>
                  setAuthForm({ ...authForm, name: e.target.value })
                }
                required
              />
              <label>Direct UPI ID (e.g. studio@okicici)</label>
              <input
                type="text"
                value={authForm.upiId}
                onChange={(e) =>
                  setAuthForm({ ...authForm, upiId: e.target.value })
                }
                placeholder="name@upi"
              />
            </>
          )}
          <label>Email</label>
          <input
            type="email"
            value={authForm.email}
            onChange={(e) =>
              setAuthForm({ ...authForm, email: e.target.value })
            }
            placeholder="aarav@celebrare.demo"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={authForm.password}
            onChange={(e) =>
              setAuthForm({ ...authForm, password: e.target.value })
            }
            placeholder="Minimum 6 characters"
            required
          />
          <button type="submit" className="primary-btn" disabled={loading}>
            {authMode === "register" ? "Create Photographer Account" : "Sign In"}
          </button>
        </form>
      </section>
    );
  }

  const summary = dashboardData?.summary || {};
  const photog = dashboardData?.photographer || currentUser;

  return (
    <section className="dashboard-content">
      <div className="dashboard-header-bar card-surface">
        <div>
          <span className="status-pill status-active">
            ● PHOTOGRAPHER ACCOUNT ISOLATED
          </span>
          <h2>{photog.name}</h2>
          <p className="muted-text">
            Direct UPI: <code>{photog.upiId || "Not configured"}</code> •
            Inbound Alert Alias:{" "}
            <code>{photog.inboundEmailAlias || "Not set"}</code>
          </p>
        </div>
        <button
          type="button"
          className="secondary-btn"
          onClick={loadDashboard}
          disabled={loading}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {dashboardData?.warnings?.length > 0 && (
        <div className="warning-stack">
          {dashboardData.warnings.map((w, idx) => (
            <div key={idx} className="warning-banner">
              <AlertTriangle size={18} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stats-grid-4">
        <div className="stat-card">
          <p>Verified Revenue</p>
          <h2>₹{summary.verifiedRevenue || 0}</h2>
          <small>Counted from PAID transactions only</small>
        </div>
        <div className="stat-card">
          <p>Confirmed / Pending</p>
          <h2>
            {summary.paidCount || 0} / {summary.pendingCount || 0}
          </h2>
          <small>Orders settled vs active 5-min window</small>
        </div>
        <div className="stat-card">
          <p>Expired / Late / Review</p>
          <h2>
            {summary.expiredCount || 0} / {summary.lateCount || 0} /{" "}
            {summary.reviewRequiredCount || 0}
          </h2>
          <small>Unpaid or held for manual check</small>
        </div>
        <div className="stat-card">
          <p>Duplicates Blocked</p>
          <h2>{summary.duplicateLogsCount || 0}</h2>
          <small>Idempotent UTR protection</small>
        </div>
      </div>

      <div className="subtab-bar">
        {[
          { id: "overview", label: "UPI & Settings" },
          { id: "events", label: "Events & Photo Uploads" },
          { id: "orders", label: "Orders & Payment Requests" },
          { id: "logs", label: "Bank Email Verification Logs" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={subTab === tab.id ? "pill-tab active" : "pill-tab"}
            onClick={() => setSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === "overview" && (
        <div className="two-col-grid">
          <form className="card-surface stacked-form" onSubmit={handleSaveUpi}>
            <div className="card-title-row">
              <CreditCard size={18} />
              <h3>Direct UPI &amp; Bank Sender Trust Config</h3>
            </div>
            <label>Photographer UPI ID (VPA)</label>
            <input
              type="text"
              value={upiInput}
              onChange={(e) => setUpiInput(e.target.value)}
              placeholder="yourstudio@okicici"
              required
            />
            <label>Trusted Bank Alert Senders (comma-separated)</label>
            <input
              type="text"
              value={bankSendersInput}
              onChange={(e) => setBankSendersInput(e.target.value)}
              placeholder="alerts@hdfcbank.net, upi@icicibank.com"
            />
            <button type="submit" className="primary-btn">
              <CheckCircle2 size={15} /> Save UPI &amp; Trust Settings
            </button>
          </form>

          <form
            className="card-surface stacked-form"
            onSubmit={handleCreateEvent}
          >
            <div className="card-title-row">
              <CalendarPlus size={18} />
              <h3>Create New Event</h3>
            </div>
            <label>Event Name</label>
            <input
              type="text"
              value={eventForm.eventName}
              onChange={(e) =>
                setEventForm({ ...eventForm, eventName: e.target.value })
              }
              placeholder="Wedding Reception 2026"
              required
            />
            <label>Event Date</label>
            <input
              type="date"
              value={eventForm.eventDate}
              onChange={(e) =>
                setEventForm({ ...eventForm, eventDate: e.target.value })
              }
            />
            <label>Default Price Per Photo (₹)</label>
            <input
              type="number"
              min="1"
              value={eventForm.defaultPrice}
              onChange={(e) =>
                setEventForm({ ...eventForm, defaultPrice: e.target.value })
              }
              required
            />
            <label>Description</label>
            <input
              type="text"
              value={eventForm.description}
              onChange={(e) =>
                setEventForm({ ...eventForm, description: e.target.value })
              }
              placeholder="Event highlights and gallery notes"
            />
            <button type="submit" className="primary-btn">
              Create Event
            </button>
          </form>
        </div>
      )}

      {subTab === "events" && (
        <div className="stack-gap">
          <div className="event-list">
            {(dashboardData?.events || []).map((ev) => (
              <div key={ev.eventId} className="event-card">
                <div className="event-card-top">
                  <span className="status-pill status-active">● {ev.status}</span>
                  <span>Default ₹{ev.defaultPrice || 20}</span>
                </div>
                <h3>{ev.eventName}</h3>
                <p className="muted-text">{ev.description}</p>
                <div className="event-meta">
                  <span>ID: {ev.eventId}</span>
                  <span>
                    {ev.eventDate
                      ? new Date(ev.eventDate).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => onOpenGallery(ev.eventId)}
                >
                  Open Guest Gallery →
                </button>
              </div>
            ))}
          </div>

          <form
            className="card-surface stacked-form"
            onSubmit={handleUploadPhoto}
          >
            <div className="card-title-row">
              <ImagePlus size={18} />
              <h3>Upload Event Photograph (Protected Storage)</h3>
            </div>
            <div className="two-col-grid">
              <div>
                <label>Select Event</label>
                <select
                  value={uploadEventId}
                  onChange={(e) => setUploadEventId(e.target.value)}
                  required
                >
                  {(dashboardData?.events || []).map((ev) => (
                    <option key={ev.eventId} value={ev.eventId}>
                      {ev.eventName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Photo Price (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={uploadPrice}
                  onChange={(e) => setUploadPrice(e.target.value)}
                  required
                />
              </div>
            </div>
            <label>Photo Title</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Stage Couple Portrait"
            />
            <label>Upload Image File (Stored Privately, Watermarked in Gallery)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            />
            <label>Or Add External Image URL</label>
            <input
              type="url"
              value={uploadUrl}
              onChange={(e) => setUploadUrl(e.target.value)}
              placeholder="https://example.com/photo.jpg"
            />
            <button type="submit" className="primary-btn">
              Upload Protected Photo
            </button>
          </form>

          <div className="photo-grid">
            {eventPhotos.map((photo) => (
              <PhotoCard key={photo._id || photo.photoId} photo={photo} />
            ))}
          </div>
        </div>
      )}

      {subTab === "orders" && (
        <div className="card-surface table-wrap">
          <h3>Orders &amp; Payment Requests</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order / Ref</th>
                <th>Guest</th>
                <th>Photos</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Expires / Paid</th>
              </tr>
            </thead>
            <tbody>
              {(dashboardData?.payments || []).map((p) => (
                <tr key={p.paymentRequestId}>
                  <td>
                    <strong>{p.orderId}</strong>
                    <br />
                    <code>{p.uniquePaymentReference}</code>
                  </td>
                  <td>{p.guestEmail}</td>
                  <td>{p.selectedPhotoIds?.length || 0}</td>
                  <td>₹{p.expectedAmount || p.amount}</td>
                  <td>
                    <span className={`badge badge-${p.status.toLowerCase()}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <small>{formatLocalTime(p.paidAt || p.expiresAt)}</small>
                  </td>
                </tr>
              ))}
              {(!dashboardData?.payments ||
                dashboardData.payments.length === 0) && (
                <tr>
                  <td colSpan="6" className="muted-text">
                    No payment requests yet for this photographer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === "logs" && (
        <div className="card-surface table-wrap">
          <h3>Incoming Bank Email Verification Logs</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>UTR / Ref</th>
                <th>Sender &amp; Auth</th>
                <th>Amount / UPI</th>
                <th>Outcome</th>
                <th>Duplicates</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {(dashboardData?.transactions || []).map((tx) => (
                <tr key={tx.transactionRecordId}>
                  <td>
                    <code>{tx.utr || "—"}</code>
                    <br />
                    <small>{tx.paymentReference || "no ref"}</small>
                  </td>
                  <td>
                    <div>{tx.sender || "unknown"}</div>
                    <small>
                      SPF:{tx.emailAuthResults?.spf} DKIM:
                      {tx.emailAuthResults?.dkim} DMARC:
                      {tx.emailAuthResults?.dmarc}
                    </small>
                  </td>
                  <td>
                    ₹{tx.amount || 0}
                    <br />
                    <code>{tx.payeeUpiId || "—"}</code>
                  </td>
                  <td>
                    <span
                      className={`badge badge-${tx.processingStatus.toLowerCase()}`}
                    >
                      {tx.processingStatus}
                    </span>
                  </td>
                  <td>{tx.duplicateCount || 0}</td>
                  <td>
                    <small>{tx.decisionReason}</small>
                  </td>
                </tr>
              ))}
              {(!dashboardData?.transactions ||
                dashboardData.transactions.length === 0) && (
                <tr>
                  <td colSpan="6" className="muted-text">
                    No bank verification logs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default Dashboard;
