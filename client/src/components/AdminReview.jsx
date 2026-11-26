import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiRequest, formatLocalTime } from "../api";
import { ConfirmDialog } from "./Toast";

function AdminReview({ currentUser, demoMode, onAuthSuccess, onNotify }) {
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeQueue, setActiveQueue] = useState("review"); // review | late | rejected | duplicate | expired | audit

  const [selectedTx, setSelectedTx] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    decision: "APPROVE",
    reason: "",
    paymentRequestId: "",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const loadQueue = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiRequest("/admin/payment-review");
      setData(res);
    } catch (err) {
      onNotify(err.message, "error");
    }
  }, [isAdmin, onNotify]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    apiRequest("/admin/payment-review")
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) onNotify(err.message, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, onNotify]);

  async function handleAdminLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });
      if (res.user?.role !== "admin") {
        onNotify("This account does not have Admin role permissions", "error");
        return;
      }
      onAuthSuccess(res.token, res.user);
      onNotify("Admin session authenticated", "success");
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoAdminLogin() {
    setLoading(true);
    try {
      const res = await apiRequest("/auth/demo-login", {
        method: "POST",
        body: JSON.stringify({ photographerId: "celebrare-admin" }),
      });
      onAuthSuccess(res.token, res.user);
      onNotify("Signed in as Demo Trust & Safety Admin", "success");
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function executeManualReview() {
    if (!selectedTx) return;
    setConfirmOpen(false);
    setLoading(true);
    try {
      await apiRequest(`/admin/transactions/${selectedTx.transactionRecordId}/review`, {
        method: "POST",
        body: JSON.stringify(reviewForm),
      });
      onNotify(
        `Transaction ${reviewForm.decision.toLowerCase()}d and recorded in Audit Log`,
        "success"
      );
      setSelectedTx(null);
      setReviewForm({ decision: "APPROVE", reason: "", paymentRequestId: "" });
      loadQueue();
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <section className="auth-panel card-surface">
        <div className="auth-header">
          <ShieldAlert size={22} />
          <div>
            <h2>Admin Payment Review Authentication</h2>
            <p className="muted-text">
              Reviewing unmatched, late, duplicate, and suspicious email
              transactions requires explicit Admin role authorization.
            </p>
          </div>
        </div>

        {demoMode && (
          <div className="demo-quick-box">
            <strong>Demo Admin Access</strong>
            <button
              type="button"
              className="primary-btn"
              onClick={handleDemoAdminLogin}
              disabled={loading}
            >
              Sign In as Demo Admin (admin@celebrare.demo)
            </button>
          </div>
        )}

        <form className="stacked-form" onSubmit={handleAdminLogin}>
          <label>Admin Email</label>
          <input
            type="email"
            value={loginForm.email}
            onChange={(e) =>
              setLoginForm({ ...loginForm, email: e.target.value })
            }
            placeholder="admin@celebrare.demo"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={loginForm.password}
            onChange={(e) =>
              setLoginForm({ ...loginForm, password: e.target.value })
            }
            required
          />
          <button type="submit" className="primary-btn" disabled={loading}>
            Authenticate Admin
          </button>
        </form>
      </section>
    );
  }

  const queues = data?.queues || {};
  const queueMap = {
    review: queues.reviewTransactions || [],
    late: queues.lateTransactions || [],
    rejected: queues.rejectedTransactions || [],
    duplicate: queues.duplicateTransactions || [],
  };

  return (
    <section className="stack-gap">
      <div className="dashboard-header-bar card-surface">
        <div>
          <span className="status-pill status-active">
            <ShieldCheck size={13} /> ADMIN TRUST &amp; SAFETY QUEUE
          </span>
          <h2>Payment Verification &amp; Exception Review</h2>
          <p className="muted-text">
            Every manual decision requires a documented reason and creates an
            immutable audit log entry.
          </p>
        </div>
        <button
          type="button"
          className="secondary-btn"
          onClick={loadQueue}
          disabled={loading}
        >
          <RefreshCw size={14} /> Refresh Queues
        </button>
      </div>

      <div className="subtab-bar">
        {[
          {
            id: "review",
            label: `Needs Review (${(queues.reviewTransactions || []).length})`,
          },
          {
            id: "late",
            label: `Late Payments (${(queues.lateTransactions || []).length})`,
          },
          {
            id: "rejected",
            label: `Suspicious / Rejected (${
              (queues.rejectedTransactions || []).length
            })`,
          },
          {
            id: "duplicate",
            label: `Duplicates (${
              (queues.duplicateTransactions || []).length
            })`,
          },
          {
            id: "expired",
            label: `Expired Requests (${(queues.expiredPayments || []).length})`,
          },
          {
            id: "audit",
            label: `Audit Log (${(data?.auditLogs || []).length})`,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeQueue === tab.id ? "pill-tab active" : "pill-tab"}
            onClick={() => setActiveQueue(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeQueue === "audit" ? (
        <div className="card-surface table-wrap">
          <h3>Immutable Audit Log</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {(data?.auditLogs || []).map((log) => (
                <tr key={log._id}>
                  <td>
                    <small>{formatLocalTime(log.createdAt)}</small>
                  </td>
                  <td>
                    <strong>{log.action}</strong>
                  </td>
                  <td>
                    {log.actorType}: {log.actorId}
                  </td>
                  <td>
                    <code>{log.targetId || "—"}</code>
                  </td>
                  <td>
                    <small>{JSON.stringify(log.details)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeQueue === "expired" ? (
        <div className="card-surface table-wrap">
          <h3>Expired &amp; Unsettled Payment Requests</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Reference</th>
                <th>Photographer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Expired At</th>
              </tr>
            </thead>
            <tbody>
              {(queues.expiredPayments || []).map((p) => (
                <tr key={p.paymentRequestId}>
                  <td>
                    <code>{p.paymentRequestId}</code>
                  </td>
                  <td>
                    <code>{p.uniquePaymentReference}</code>
                  </td>
                  <td>{p.photographerId}</td>
                  <td>₹{p.expectedAmount || p.amount}</td>
                  <td>
                    <span className={`badge badge-${p.status.toLowerCase()}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <small>{formatLocalTime(p.expiresAt)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-surface table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>UTR / Msg ID</th>
                <th>Sender &amp; Email Auth</th>
                <th>Payee / Amount</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(queueMap[activeQueue] || []).map((tx) => (
                <tr key={tx.transactionRecordId}>
                  <td>
                    <code>{tx.utr || "MISSING"}</code>
                    <br />
                    <small>{tx.emailMessageId || "no message-id"}</small>
                  </td>
                  <td>
                    <div>{tx.sender || "unknown"}</div>
                    {tx.displayName && (
                      <small className="muted-text">
                        Display (untrusted): {tx.displayName}
                      </small>
                    )}
                    <br />
                    <small>
                      SPF:{tx.emailAuthResults?.spf} DKIM:
                      {tx.emailAuthResults?.dkim} DMARC:
                      {tx.emailAuthResults?.dmarc}
                    </small>
                  </td>
                  <td>
                    <code>{tx.payeeUpiId || "—"}</code>
                    <br />
                    <strong>₹{tx.amount || 0}</strong>
                  </td>
                  <td>
                    <span
                      className={`badge badge-${tx.processingStatus.toLowerCase()}`}
                    >
                      {tx.processingStatus}
                    </span>
                    {tx.duplicateCount > 0 && (
                      <div>
                        <small>{tx.duplicateCount} replay(s)</small>
                      </div>
                    )}
                  </td>
                  <td>
                    <small>{tx.decisionReason}</small>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-btn small-btn"
                      onClick={() => {
                        setSelectedTx(tx);
                        setReviewForm({
                          decision: "APPROVE",
                          reason: "",
                          paymentRequestId: tx.matchedPaymentRequestId || "",
                        });
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
              {(queueMap[activeQueue] || []).length === 0 && (
                <tr>
                  <td colSpan="6" className="muted-text">
                    No transactions in this queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedTx && (
        <div className="card-surface review-drawer">
          <h3>Manual Review: {selectedTx.transactionRecordId}</h3>
          <p className="muted-text">
            UTR: <code>{selectedTx.utr || "None"}</code> • Sender:{" "}
            <code>{selectedTx.sender}</code> • Current Status:{" "}
            <strong>{selectedTx.processingStatus}</strong>
          </p>
          <div className="stacked-form">
            <label>Decision</label>
            <select
              value={reviewForm.decision}
              onChange={(e) =>
                setReviewForm({ ...reviewForm, decision: e.target.value })
              }
            >
              <option value="APPROVE">
                APPROVE (Confirm Payment &amp; Unlock Order Photos)
              </option>
              <option value="REJECT">
                REJECT (Keep Photos Locked &amp; Mark Rejected)
              </option>
            </select>

            <label>Payment Request ID (required to match/approve)</label>
            <input
              type="text"
              value={reviewForm.paymentRequestId}
              onChange={(e) =>
                setReviewForm({
                  ...reviewForm,
                  paymentRequestId: e.target.value,
                })
              }
              placeholder="UUID of PaymentRequest"
            />

            <label>Documented Audit Reason (min 5 chars)</label>
            <input
              type="text"
              value={reviewForm.reason}
              onChange={(e) =>
                setReviewForm({ ...reviewForm, reason: e.target.value })
              }
              placeholder="Verified manually against bank statement UTR..."
              required
            />

            <div className="checkout-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSelectedTx(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  if (reviewForm.reason.trim().length < 5) {
                    onNotify("Please provide a documented reason", "error");
                    return;
                  }
                  setConfirmOpen(true);
                }}
              >
                Submit Review Decision
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Confirm Manual ${reviewForm.decision}`}
        message={`Are you sure you want to ${reviewForm.decision} transaction ${selectedTx?.utr || selectedTx?.transactionRecordId}? This action is permanently logged.`}
        confirmLabel={`Confirm ${reviewForm.decision}`}
        danger={reviewForm.decision === "REJECT"}
        onConfirm={executeManualReview}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

export default AdminReview;
