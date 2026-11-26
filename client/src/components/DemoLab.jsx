import { useState } from "react";
import { FlaskConical, Play, ShieldAlert } from "lucide-react";
import { API_URL, apiRequest } from "../api";

function DemoLab({
  activePayment,
  onSyncPayment,
  onOpenPaymentTab,
  onNotify,
  events,
  onSelectEventAndCreateDemoOrder,
}) {
  const [paymentRequestId, setPaymentRequestId] = useState(
    activePayment?.paymentRequestId || ""
  );
  const [runningScenario, setRunningScenario] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const effectiveRequestId =
    paymentRequestId || activePayment?.paymentRequestId || "";

  async function runSimulation(scenario) {
    if (!effectiveRequestId) {
      onNotify(
        "Create a payment request first (or click Quick Setup above)",
        "error"
      );
      return;
    }
    setRunningScenario(scenario);
    try {
      const res = await fetch(`${API_URL}/demo/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRequestId: effectiveRequestId,
          scenario,
        }),
      });
      const data = await res.json();
      setLastResult({ httpStatus: res.status, ...data });
      await onSyncPayment(effectiveRequestId);
      onNotify(
        `Scenario "${scenario}" → ${data.outcome} (${data.message})`,
        data.success ? "success" : "info"
      );
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setRunningScenario("");
    }
  }

  async function runCrossPhotographerAttack() {
    setRunningScenario("cross_photographer");
    try {
      // Create an order for Photographer A, then attempt to verify it using Photographer B's UPI ID!
      const eventA =
        events.find((e) => e.photographerId === "aarav-photo") || events[0];
      if (!eventA) {
        onNotify("No Photographer A event loaded", "error");
        return;
      }
      const orderRes = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          eventId: eventA.eventId,
          selectedPhotoIds: [1],
          guestEmail: "scenario-b@celebrare.demo",
        }),
      });
      const reqId = orderRes.payment.paymentRequestId;
      setPaymentRequestId(reqId);

      // Submit a transaction claiming Photographer B's UPI ID (mountainlens.demo@upi) against Photographer A's order
      const simRes = await fetch(`${API_URL}/demo/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRequestId: reqId,
          scenario: "wrong_upi",
        }),
      });
      const data = await simRes.json();
      setLastResult({ httpStatus: simRes.status, ...data });
      await onSyncPayment(reqId);
      onNotify(
        `Cross-photographer isolation verified: ${data.outcome}`,
        "info"
      );
    } catch (err) {
      onNotify(err.message, "error");
    } finally {
      setRunningScenario("");
    }
  }

  return (
    <section className="stack-gap">
      <div className="dashboard-header-bar card-surface">
        <div>
          <span className="status-pill status-active">
            <FlaskConical size={13} /> DEMO TRANSACTION SIMULATOR
          </span>
          <h2>Required Demonstration Scenarios (A – E)</h2>
          <p className="muted-text">
            Every test button below dispatches a realistic bank email event
            through the <strong>real backend verification pipeline</strong>{" "}
            (sender trust, SPF/DKIM/DMARC, UTR idempotency, 5-min expiry, and
            deterministic matching).
          </p>
        </div>
      </div>

      <div className="card-surface stacked-form">
        <label>Target Payment Request ID</label>
        <div className="inline-row">
          <input
            type="text"
            value={effectiveRequestId}
            onChange={(e) => setPaymentRequestId(e.target.value)}
            placeholder="Create an order in Guest Gallery or use Quick Setup"
          />
          <button
            type="button"
            className="secondary-btn"
            onClick={async () => {
              const createdId = await onSelectEventAndCreateDemoOrder(
                "navratri-night-2026"
              );
              if (createdId) setPaymentRequestId(createdId);
            }}
          >
            Quick Create Order (Photographer A)
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={async () => {
              const createdId = await onSelectEventAndCreateDemoOrder(
                "solan-marathon-2026"
              );
              if (createdId) setPaymentRequestId(createdId);
            }}
          >
            Quick Create Order (Photographer B)
          </button>
        </div>
        {effectiveRequestId && (
          <button
            type="button"
            className="back-btn"
            onClick={() => onOpenPaymentTab(effectiveRequestId)}
          >
            Open Live Guest Payment View for this Request →
          </button>
        )}
      </div>

      <div className="scenario-grid">
        <div className="card-surface scenario-card">
          <h3>Scenario A — Trusted Payment Success</h3>
          <p className="muted-text">
            Sends a trusted HDFC bank email with SPF/DKIM/DMARC pass, exact UPI
            ID, exact amount, and matching CLB reference within 5 minutes.
          </p>
          <button
            type="button"
            className="primary-btn"
            disabled={!!runningScenario}
            onClick={() => runSimulation("success")}
          >
            <Play size={14} /> Run Scenario A (Trusted Paid)
          </button>
        </div>

        <div className="card-surface scenario-card">
          <h3>Scenario B — Multi-Photographer Isolation</h3>
          <p className="muted-text">
            Creates an order for Photographer A (<code>aarav.demo@upi</code>)
            and verifies that a payment to another UPI ID cannot unlock A&apos;s
            photos.
          </p>
          <button
            type="button"
            className="secondary-btn"
            disabled={!!runningScenario}
            onClick={runCrossPhotographerAttack}
          >
            <ShieldAlert size={14} /> Run Scenario B (Cross-Photographer Deny)
          </button>
        </div>

        <div className="card-surface scenario-card">
          <h3>Scenario C — Untrusted / Invalid Emails</h3>
          <p className="muted-text">
            Test untrusted sender (spoofed display name), failed SPF/DKIM/DMARC,
            wrong amount, or missing reference.
          </p>
          <div className="scenario-btn-stack">
            <button
              type="button"
              className="secondary-btn"
              disabled={!!runningScenario}
              onClick={() => runSimulation("untrusted_sender")}
            >
              Untrusted Sender (REJECTED)
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={!!runningScenario}
              onClick={() => runSimulation("auth_failure")}
            >
              SPF/DKIM/DMARC Fail (REJECTED)
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={!!runningScenario}
              onClick={() => runSimulation("wrong_amount")}
            >
              Wrong Amount (REJECTED)
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={!!runningScenario}
              onClick={() => runSimulation("missing_reference")}
            >
              Missing Reference (REVIEW_REQUIRED)
            </button>
          </div>
        </div>

        <div className="card-surface scenario-card">
          <h3>Scenario D — Duplicate Transaction Replay</h3>
          <p className="muted-text">
            Replays the same UTR / Message-ID a second time. Proves idempotency
            (HTTP 409) and zero double unlocks.
          </p>
          <button
            type="button"
            className="secondary-btn"
            disabled={!!runningScenario}
            onClick={() => runSimulation("duplicate")}
          >
            <Play size={14} /> Run Scenario D (Replay Duplicate UTR)
          </button>
        </div>

        <div className="card-surface scenario-card">
          <h3>Scenario E — Late Payment (Past 5 Min)</h3>
          <p className="muted-text">
            Advances controlled demo clock past the 5-minute expiry and submits
            a bank email. Marks <code>LATE_PAYMENT</code> without unlocking.
          </p>
          <button
            type="button"
            className="secondary-btn"
            disabled={!!runningScenario}
            onClick={() => runSimulation("late_payment")}
          >
            <Play size={14} /> Run Scenario E (After 5-Min Expiry)
          </button>
        </div>
      </div>

      {lastResult && (
        <div className="card-surface">
          <h3>Last Pipeline Verification Output (HTTP {lastResult.httpStatus})</h3>
          <pre className="json-preview">
            {JSON.stringify(
              {
                scenario: lastResult.scenario,
                outcome: lastResult.outcome,
                duplicate: lastResult.duplicate,
                message: lastResult.message,
                simulatedPayload: lastResult.simulatedPayload,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </section>
  );
}

export default DemoLab;
