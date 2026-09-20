import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";
import AdminChatbot from "../components/AdminChatbot.jsx";
import AdminAnalytics from "./AdminAnalytics.jsx";

const NEXT_STATUS = {
  in_queue: "quality_check",
  quality_check: "procured",
  procured: "payment_initiated",
  payment_initiated: "paid",
};

const NEXT_LABEL = {
  in_queue: "Start Quality Check",
  quality_check: "Mark Procured",
  procured: "Initiate Payment",
  payment_initiated: "Mark Paid",
};

function formatReceiptDateTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return String(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

export default function Admin({ onLogout, adminToken }) {
  const { t = (k) => k } = useLanguage() || {};
  const [adminTab, setAdminTab] = useState("queues"); // "queues" | "tickets"
  const [queueTab, setQueueTab] = useState("live"); // "live" | "today" | "upcoming"
  const [overview, setOverview] = useState([]);
  const [centreId, setCentreId] = useState("C01");
  const [liveQueue, setLiveQueue] = useState([]);
  const [todaySlots, setTodaySlots] = useState([]);
  const [upcomingSlots, setUpcomingSlots] = useState({});
  const [expandedDates, setExpandedDates] = useState({});
  const [error, setError] = useState("");
  const [alertToast, setAlertToast] = useState("");
  const [sendingAlertFor, setSendingAlertFor] = useState(null);

  // Tickets management state
  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [updatingTicketId, setUpdatingTicketId] = useState(null);

  // Admin Slot Cancellation Modal State
  const [cancellingFarmer, setCancellingFarmer] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Produce Weighment & Quality Verification Modal State
  const [verifyingFarmer, setVerifyingFarmer] = useState(null);
  const [verifyForm, setVerifyForm] = useState({
    verifiedQuantity: "",
    verifiedUnit: "bags",
    varietySelection: "Common",
    discrepancyReason: "",
  });
  const [verifySubmitting, setVerifySubmitting] = useState(false);

  // Review & Release Payment Receipt Modal State
  const [reviewingReceiptFarmer, setReviewingReceiptFarmer] = useState(null);
  const [releasingReceipt, setReleasingReceipt] = useState(false);
  const [releaseAdjustmentReason, setReleaseAdjustmentReason] = useState("");

  useEffect(() => {
    if (reviewingReceiptFarmer) {
      setReleaseAdjustmentReason(
        reviewingReceiptFarmer.receipt?.adjustmentReason ||
        reviewingReceiptFarmer.adjustmentReason ||
        reviewingReceiptFarmer.receipt?.discrepancyReason ||
        reviewingReceiptFarmer.quantityDiscrepancyReason ||
        reviewingReceiptFarmer.discrepancyReason ||
        ""
      );
    } else {
      setReleaseAdjustmentReason("");
    }
  }, [reviewingReceiptFarmer]);

  // Permanent Procurement Records (Audit Snapshots) State
  const [recordsResult, setRecordsResult] = useState({
    records: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [recordFilters, setRecordFilters] = useState({
    farmerName: "",
    tokenId: "",
    crop: "",
    centreId: "",
    dateFrom: "",
    dateTo: "",
  });
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedSnapshotReceipt, setSelectedSnapshotReceipt] = useState(null);

  const fetchRecords = useCallback(
    async (page = 1, currentFilters = recordFilters) => {
      setRecordsLoading(true);
      setError("");
      try {
        const res = await api.getAdminProcurementRecords({
          ...currentFilters,
          page,
          limit: 10,
        });
        setRecordsResult(res);
      } catch (err) {
        setError(err.message);
      } finally {
        setRecordsLoading(false);
      }
    },
    [recordFilters]
  );

  const loadData = useCallback(async () => {
    try {
      if (adminTab === "queues") {
        const [ov, lq, ts, us] = await Promise.all([
          api.getAdminOverview(),
          api.getAdminLiveQueue(centreId),
          api.getAdminTodaySlots(centreId),
          api.getAdminUpcomingSlots(centreId),
        ]);
        setOverview(ov);
        setLiveQueue(lq || []);
        setTodaySlots(ts || []);
        setUpcomingSlots(us || {});
      } else if (adminTab === "tickets") {
        const tkts = await api.getAdminTickets();
        setTickets(tkts || []);
      } else if (adminTab === "records") {
        await fetchRecords(recordsResult.page);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [adminTab, centreId, fetchRecords, recordsResult.page]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function advance(id, status) {
    try {
      await api.advanceFarmer(id, status);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAdvanceClick(farmer, nextStatus) {
    if (nextStatus === "procured") {
      const defaultUnit = farmer.declaredUnit || "bags";
      const bagWeight = farmer.crop === "Paddy" || farmer.crop === "Groundnut" ? 40 : 50;
      const defaultQty = farmer.declaredQuantity !== undefined && farmer.declaredQuantity !== null
        ? farmer.declaredQuantity
        : (farmer.quantityKg ? Math.round((farmer.quantityKg / bagWeight) * 10) / 10 : "");

      setVerifyForm({
        verifiedQuantity: defaultQty,
        verifiedUnit: defaultUnit,
        varietySelection: farmer.variety || "Common",
        discrepancyReason: "",
      });
      setVerifyingFarmer(farmer);
    } else {
      advance(farmer.id, nextStatus);
    }
  }

  async function handleConfirmVerification(e) {
    e.preventDefault();
    if (!verifyingFarmer || !verifyForm.verifiedQuantity) return;

    setVerifySubmitting(true);
    setError("");
    try {
      await api.advanceFarmer(verifyingFarmer.id, "procured", {
        verifiedQuantity: Number(verifyForm.verifiedQuantity),
        verifiedUnit: verifyForm.verifiedUnit,
        varietySelection: verifyingFarmer.crop === "Paddy" ? verifyForm.varietySelection : null,
        discrepancyReason: verifyForm.discrepancyReason ? verifyForm.discrepancyReason.trim() : "",
        adminName: "Centre Admin",
      });
      setAlertToast(`Produce weighment verified & marked PROCURED for ${verifyingFarmer.name} (${verifyingFarmer.id})`);
      setTimeout(() => setAlertToast(""), 6000);
      setVerifyingFarmer(null);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifySubmitting(false);
    }
  }

  async function handleReleaseReceipt(farmerId) {
    if (!reviewingReceiptFarmer) return;
    const verifiedKg = Number(
      reviewingReceiptFarmer.receipt?.verifiedQuantityKg ??
      reviewingReceiptFarmer.verifiedQuantityKg ??
      reviewingReceiptFarmer.quantityKg ??
      0
    );
    const declaredKg = Number(
      reviewingReceiptFarmer.declaredQuantityKg ??
      reviewingReceiptFarmer.quantityKg ??
      0
    );
    const hasQuantityMismatch = Math.abs(verifiedKg - declaredKg) > 0.01;

    if (hasQuantityMismatch && !releaseAdjustmentReason.trim()) {
      setError("Verified quantity differs from declared quantity. Please provide a reason for adjustment before releasing receipt.");
      return;
    }

    setReleasingReceipt(true);
    setError("");
    try {
      await api.releaseFarmerReceipt(
        farmerId,
        {
          adminName: "Centre Admin",
          adjustmentReason: hasQuantityMismatch ? releaseAdjustmentReason.trim() : (releaseAdjustmentReason.trim() || undefined),
        },
        adminToken
      );
      setAlertToast(`Payment receipt released to farmer (${farmerId}). Farmer notified via SMS and App.`);
      setTimeout(() => setAlertToast(""), 6000);
      setReviewingReceiptFarmer(null);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setReleasingReceipt(false);
    }
  }

  function renderFarmerQuantity(f) {
    const bagWeight = f.crop === "Paddy" || f.crop === "Groundnut" ? 40 : 50;
    const unit = f.declaredUnit || "bags";

    if (f.verifiedQuantity !== null && f.verifiedQuantity !== undefined) {
      const hasDiff = f.declaredQuantityKg !== undefined && f.verifiedQuantityKg !== undefined && Math.abs(f.declaredQuantityKg - f.verifiedQuantityKg) > 0.01;
      return (
        <div>
          <div style={{ fontWeight: 600, color: "var(--ink)" }}>
            {f.crop} {f.variety ? `(${f.variety})` : ""}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: hasDiff ? "#B45309" : "var(--field)", marginTop: 2 }}>
            ✓ {f.verifiedQuantity} {f.verifiedUnit || unit} verified
          </div>
          {hasDiff && (
            <div style={{ fontSize: 11, color: "#8A8368", marginTop: 1 }}>
              Booked: {f.declaredQuantity || (f.quantityKg / bagWeight)} {unit}
            </div>
          )}
        </div>
      );
    }

    const declaredVal = f.declaredQuantity !== undefined && f.declaredQuantity !== null ? f.declaredQuantity : f.quantityKg;
    return (
      <div>
        <span style={{ fontWeight: 600 }}>{f.crop}</span> · {declaredVal} {f.declaredQuantity !== undefined ? unit : "kg"}
      </div>
    );
  }

  async function handleTicketStatusChange(ticketId, newStatus) {
    setUpdatingTicketId(ticketId);
    setError("");
    try {
      await api.updateAdminTicketStatus(ticketId, newStatus);
      const updated = await api.getAdminTickets();
      setTickets(updated || []);
      setAlertToast(`Ticket ${ticketId} status updated to ${newStatus.toUpperCase()}`);
      setTimeout(() => setAlertToast(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingTicketId(null);
    }
  }

  async function handleSendDelayAlert(e, centre) {
    e.stopPropagation();
    const message = window.prompt(
      `Enter delay alert message for farmers in queue at ${centre.name}:`,
      "Procurement paused for 30 minutes due to equipment issue"
    );
    if (!message || !message.trim()) return;

    setSendingAlertFor(centre.id);
    setError("");
    try {
      const res = await api.sendCentreDelayAlert(centre.id, message.trim());
      setAlertToast(`Alert sent to ${res.notifiedCount} farmer${res.notifiedCount === 1 ? "" : "s"} at ${centre.name}`);
      setTimeout(() => setAlertToast(""), 6000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingAlertFor(null);
    }
  }

  async function handleConfirmAdminCancel(e) {
    e.preventDefault();
    if (!cancellingFarmer || !cancelReason.trim()) return;

    setCancelSubmitting(true);
    setError("");
    try {
      await api.cancelAdminFarmerWithReason(cancellingFarmer.id, cancelReason.trim());
      setAlertToast(
        `Slot for ${cancellingFarmer.name} (${cancellingFarmer.id}) cancelled. SMS notification dispatched.`
      );
      setTimeout(() => setAlertToast(""), 6000);
      setCancellingFarmer(null);
      setCancelReason("");
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelSubmitting(false);
    }
  }

  const openTicketsCount = tickets.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length;

  const filteredTickets = tickets.filter((t) => {
    if (ticketFilter === "all") return true;
    return t.status === ticketFilter;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 22 }}>Admin Control Panel</h2>
        {onLogout && (
          <button
            onClick={onLogout}
            className="btn secondary"
            style={{ fontSize: 13, padding: "7px 16px" }}
          >
            Admin Logout
          </button>
        )}
      </div>

      {/* Admin Tabs */}
      <div
        style={{
          display: "flex",
          gap: 12,
          borderBottom: "2px solid var(--line)",
          paddingBottom: 8,
          marginBottom: 24,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setAdminTab("queues");
            setError("");
          }}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 15,
            fontWeight: adminTab === "queues" ? 700 : 500,
            color: adminTab === "queues" ? "var(--field)" : "#8A8368",
            borderBottom: adminTab === "queues" ? "3px solid var(--field)" : "3px solid transparent",
            padding: "8px 16px",
            cursor: "pointer",
            marginBottom: -10,
            transition: "all 0.15s ease",
          }}
        >
          🏛️ Centre Queues & Load
        </button>

        <button
          type="button"
          onClick={() => {
            setAdminTab("tickets");
            setError("");
            api.getAdminTickets().then(setTickets).catch(() => {});
          }}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 15,
            fontWeight: adminTab === "tickets" ? 700 : 500,
            color: adminTab === "tickets" ? "var(--field)" : "#8A8368",
            borderBottom: adminTab === "tickets" ? "3px solid var(--field)" : "3px solid transparent",
            padding: "8px 16px",
            cursor: "pointer",
            marginBottom: -10,
            transition: "all 0.15s ease",
          }}
        >
          🎫 Support & Grievance Tickets{" "}
          {openTicketsCount > 0 && (
            <span
              style={{
                fontSize: 11,
                background: "var(--danger)",
                color: "#fff",
                padding: "2px 7px",
                borderRadius: 10,
                marginLeft: 4,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
              }}
            >
              {openTicketsCount} open
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setAdminTab("records");
            setError("");
            fetchRecords(1);
          }}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 15,
            fontWeight: adminTab === "records" ? 700 : 500,
            color: adminTab === "records" ? "var(--field)" : "#8A8368",
            borderBottom: adminTab === "records" ? "3px solid var(--field)" : "3px solid transparent",
            padding: "8px 16px",
            cursor: "pointer",
            marginBottom: -10,
            transition: "all 0.15s ease",
          }}
        >
          📜 Procurement Records
          {recordsResult.total > 0 && (
            <span
              style={{
                fontSize: 11,
                background: "var(--field)",
                color: "#fff",
                padding: "2px 7px",
                borderRadius: 10,
                marginLeft: 6,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
              }}
            >
              {recordsResult.total}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setAdminTab("analytics");
            setError("");
          }}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 15,
            fontWeight: adminTab === "analytics" ? 700 : 500,
            color: adminTab === "analytics" ? "var(--field)" : "#8A8368",
            borderBottom: adminTab === "analytics" ? "3px solid var(--field)" : "3px solid transparent",
            padding: "8px 16px",
            cursor: "pointer",
            marginBottom: -10,
            transition: "all 0.15s ease",
          }}
        >
          📊 Analytics Dashboard
        </button>
      </div>

      {alertToast && (
        <div
          style={{
            background: "rgba(31, 61, 43, 0.12)",
            border: "1px solid var(--field)",
            color: "var(--field)",
            padding: "10px 16px",
            borderRadius: 6,
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>📢 {alertToast}</span>
          <button
            onClick={() => setAlertToast("")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--field)", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Tab 1: Centre Queues & Load */}
      {adminTab === "queues" && (
        <>
          <div className="overview-grid">
            {overview.map((o) => {
              const dot = o.crowdStatus === "high" ? "🔴" : o.crowdStatus === "medium" ? "🟡" : "🟢";
              return (
                <div
                  key={o.centre.id}
                  className="overview-card"
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    border: o.centre.id === centreId ? "2px solid var(--field)" : "1px solid var(--line)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                  onClick={() => setCentreId(o.centre.id)}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div className="n">{o.queueLength}</div>
                      <span className={`status-pill crowd-${o.crowdStatus || "low"}`}>
                        {dot} {(o.crowdStatus || "low").toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span>{dot}</span>
                      <span>{o.centre.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#8A8368", marginBottom: 6 }}>
                      {o.queueLength} waiting
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        fontSize: 12,
                        paddingTop: 6,
                        borderTop: "1px dashed var(--line)",
                      }}
                    >
                      <div>
                        <span style={{ color: "#8A8368" }}>Static baseline: </span>
                        <strong>{o.centre.avgProcessMinutes} min</strong>
                      </div>
                      <div style={{ color: "var(--field)", fontWeight: 600 }}>
                        <span>Live pace: </span>
                        <span>
                          {o.liveAvgMinutes} min/farmer
                          {o.hasLivePace && (
                            <span
                              style={{
                                fontSize: 10,
                                marginLeft: 6,
                                background: "rgba(31, 61, 43, 0.12)",
                                color: "var(--field)",
                                padding: "1px 6px",
                                borderRadius: 8,
                                fontWeight: 700,
                              }}
                            >
                              AI Live
                            </span>
                          )}
                        </span>
                      </div>
                      {o.bestTimeToVisit && (
                        <div style={{ fontSize: 11, color: "#4A4636", marginTop: 2 }}>
                          💡 Best time: <strong>{o.bestTimeToVisit}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                    <button
                      className="btn secondary"
                      style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}
                      onClick={(e) => handleSendDelayAlert(e, o.centre)}
                      disabled={sendingAlertFor === o.centre.id}
                    >
                      {sendingAlertFor === o.centre.id ? "Sending Alert..." : "📢 Send Delay Alert"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3 Queue Tabs */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 24,
              marginBottom: 16,
              borderBottom: "2px solid var(--line)",
              paddingBottom: 2,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setQueueTab("live")}
              style={{
                padding: "10px 18px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                background: queueTab === "live" ? "var(--field)" : "#FFFFFF",
                color: queueTab === "live" ? "#FFFFFF" : "var(--ink)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: queueTab === "live" ? "0 2px 6px rgba(31,61,43,0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <span>⚡ Live Queue (Walk-in)</span>
              <span
                style={{
                  background: queueTab === "live" ? "rgba(255,255,255,0.25)" : "rgba(31,61,43,0.1)",
                  color: queueTab === "live" ? "#FFFFFF" : "var(--field)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {liveQueue.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setQueueTab("today")}
              style={{
                padding: "10px 18px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                background: queueTab === "today" ? "var(--field)" : "#FFFFFF",
                color: queueTab === "today" ? "#FFFFFF" : "var(--ink)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: queueTab === "today" ? "0 2px 6px rgba(31,61,43,0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <span>📅 Today's Slots (Pre-booked)</span>
              <span
                style={{
                  background: queueTab === "today" ? "rgba(255,255,255,0.25)" : "rgba(31,61,43,0.1)",
                  color: queueTab === "today" ? "#FFFFFF" : "var(--field)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {todaySlots.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setQueueTab("upcoming")}
              style={{
                padding: "10px 18px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                background: queueTab === "upcoming" ? "var(--field)" : "#FFFFFF",
                color: queueTab === "upcoming" ? "#FFFFFF" : "var(--ink)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: queueTab === "upcoming" ? "0 2px 6px rgba(31,61,43,0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <span>🗓️ Upcoming Slots (Other Days)</span>
              <span
                style={{
                  background: queueTab === "upcoming" ? "rgba(255,255,255,0.25)" : "rgba(31,61,43,0.1)",
                  color: queueTab === "upcoming" ? "#FFFFFF" : "var(--field)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {Object.values(upcomingSlots).reduce((sum, list) => sum + list.length, 0)}
              </span>
            </button>
          </div>

          {/* VIEW 1: DAILY LIVE QUEUE */}
          {queueTab === "live" && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 18, margin: 0 }}>
                    ⚡ Daily Live Queue — Centre {centreId}
                  </h2>
                  <p style={{ fontSize: 12, color: "#8A8368", marginTop: 4, margin: 0 }}>
                    Real-time walk-in arrival queue. Position and dynamic ETA update live as tokens are served.
                  </p>
                </div>
                <span className="status-pill" style={{ background: "rgba(31,61,43,0.1)", color: "var(--field)", fontWeight: 700 }}>
                  {liveQueue.length} Walk-in{liveQueue.length === 1 ? "" : "s"} Active
                </span>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Token</th>
                    <th>Farmer</th>
                    <th>Crop / Qty</th>
                    <th>Arrival</th>
                    <th>Live ETA</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {liveQueue.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span
                          style={{
                            background: f.position === 1 ? "var(--field)" : "rgba(35, 41, 31, 0.08)",
                            color: f.position === 1 ? "#FFFFFF" : "var(--ink)",
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        >
                          #{f.position}
                        </span>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {f.id}
                        {f.rescheduledCount > 0 && (
                          <div style={{ fontSize: 11, color: "#B45309", fontWeight: 600, marginTop: 2 }}>
                            🕒 {f.rescheduledCount}x delayed
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{f.name}</div>
                        <div style={{ fontSize: 12, color: "#8A8368", marginTop: 2 }}>
                          {f.phone ? `📞 ${f.phone}` : `✉️ ${f.email || "Google Auth"}`}
                        </div>
                      </td>
                      <td>
                        {renderFarmerQuantity(f)}
                      </td>
                      <td>
                        {f.checkedIn ? (
                          <span
                            style={{
                              background: "rgba(31, 61, 43, 0.12)",
                              color: "var(--field)",
                              border: "1px solid var(--field)",
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            ✅ Checked In
                          </span>
                        ) : (
                          <span
                            style={{
                              background: "rgba(138, 131, 104, 0.1)",
                              color: "#8A8368",
                              border: "1px solid var(--line)",
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            🚗 En route
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--field)" }}>
                          ~{f.estimatedWaitMinutes || 0} min
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${f.status === "paid" ? "paid" : ""} ${f.status === "cancelled" ? "cancelled" : ""}`}>
                          {f.status}
                        </span>
                        {f.cancellationReason && (
                          <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, fontWeight: 500 }}>
                            Reason: {f.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {NEXT_STATUS[f.status] && (
                            <button
                              className="btn secondary"
                              onClick={() => handleAdvanceClick(f, NEXT_STATUS[f.status])}
                              style={{ padding: "6px 10px", fontSize: 12 }}
                            >
                              {NEXT_LABEL[f.status]}
                            </button>
                          )}
                          {f.status === "paid" && (
                            f.receipt?.receiptStatus === "released" ? (
                              <button
                                className="btn secondary"
                                onClick={() => setReviewingReceiptFarmer(f)}
                                style={{
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  color: "#15803d",
                                  borderColor: "#86efac",
                                  background: "rgba(34, 197, 94, 0.08)",
                                  fontWeight: 600,
                                }}
                              >
                                ✅ {t("receipt_released_badge") || "Released (View)"}
                              </button>
                            ) : (
                              <button
                                className="btn primary"
                                onClick={() => setReviewingReceiptFarmer(f)}
                                style={{
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  background: "#D97706",
                                  borderColor: "#D97706",
                                  color: "#fff",
                                  fontWeight: 600,
                                }}
                              >
                                🧾 {t("admin_review_release_btn") || "Review & Release Receipt"}
                              </button>
                            )
                          )}
                          {f.status !== "cancelled" && f.status !== "paid" && (
                            <button
                              type="button"
                              className="btn secondary danger"
                              onClick={() => {
                                setCancellingFarmer(f);
                                setCancelReason("");
                              }}
                              style={{ padding: "6px 10px", fontSize: 12 }}
                            >
                              🚫 Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {liveQueue.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ color: "#8A8368", textAlign: "center", padding: "24px 0" }}>
                        No farmers currently in today's live walk-in queue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW 2: TODAY'S SLOTTED QUEUE */}
          {queueTab === "today" && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 18, margin: 0 }}>
                    📅 Today's Pre-Booked Slots — Centre {centreId}
                  </h2>
                  <p style={{ fontSize: 12, color: "#8A8368", marginTop: 4, margin: 0 }}>
                    Farmers who pre-booked a slot specifically for today. Processed by scheduled slot window.
                  </p>
                </div>
                <span className="status-pill" style={{ background: "rgba(31,61,43,0.1)", color: "var(--field)", fontWeight: 700 }}>
                  {todaySlots.length} Booked Today
                </span>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Time Slot</th>
                    <th>Token</th>
                    <th>Farmer</th>
                    <th>Crop / Qty</th>
                    <th>Slot Status</th>
                    <th>Arrival</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {todaySlots.map((f) => {
                    const slotStatusBadge =
                      f.slotStatus === "completed" ? (
                        <span style={{ background: "#DCFCE7", color: "#166534", padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                          ✅ Completed
                        </span>
                      ) : f.slotStatus === "active" ? (
                        <span style={{ background: "#FEF3C7", color: "#92400E", padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                          🟢 Active Now
                        </span>
                      ) : (
                        <span style={{ background: "#F3F4F6", color: "#4B5563", padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                          ⏳ Upcoming
                        </span>
                      );

                    return (
                      <tr key={f.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: "var(--field)", fontSize: 13 }}>
                            ⏰ {f.slotTime || "8:00 AM - 10:00 AM"}
                          </div>
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                          {f.id}
                          {f.rescheduledCount > 0 && (
                            <div style={{ fontSize: 11, color: "#B45309", fontWeight: 600, marginTop: 2 }}>
                              🕒 {f.rescheduledCount}x delayed
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{f.name}</div>
                          <div style={{ fontSize: 12, color: "#8A8368", marginTop: 2 }}>
                            {f.phone ? `📞 ${f.phone}` : `✉️ ${f.email || "Google Auth"}`}
                          </div>
                        </td>
                        <td>
                          {renderFarmerQuantity(f)}
                        </td>
                        <td>{slotStatusBadge}</td>
                        <td>
                          {f.checkedIn ? (
                            <span
                              style={{
                                background: "rgba(31, 61, 43, 0.12)",
                                color: "var(--field)",
                                border: "1px solid var(--field)",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              ✅ Checked In
                            </span>
                          ) : (
                            <span
                              style={{
                                background: "rgba(138, 131, 104, 0.1)",
                                color: "#8A8368",
                                border: "1px solid var(--line)",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              🚗 En route
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill ${f.status === "paid" ? "paid" : ""} ${f.status === "cancelled" ? "cancelled" : ""}`}>
                            {f.status}
                          </span>
                          {f.cancellationReason && (
                            <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, fontWeight: 500 }}>
                              Reason: {f.cancellationReason}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            {NEXT_STATUS[f.status] && (
                              <button
                                className="btn secondary"
                                onClick={() => handleAdvanceClick(f, NEXT_STATUS[f.status])}
                                style={{ padding: "6px 10px", fontSize: 12 }}
                              >
                                {NEXT_LABEL[f.status]}
                              </button>
                            )}
                            {f.status === "paid" && (
                              f.receipt?.receiptStatus === "released" ? (
                                <button
                                  className="btn secondary"
                                  onClick={() => setReviewingReceiptFarmer(f)}
                                  style={{
                                    padding: "6px 10px",
                                    fontSize: 12,
                                    color: "#15803d",
                                    borderColor: "#86efac",
                                    background: "rgba(34, 197, 94, 0.08)",
                                    fontWeight: 600,
                                  }}
                                >
                                  ✅ {t("receipt_released_badge") || "Released (View)"}
                                </button>
                              ) : (
                                <button
                                  className="btn primary"
                                  onClick={() => setReviewingReceiptFarmer(f)}
                                  style={{
                                    padding: "6px 10px",
                                    fontSize: 12,
                                    background: "#D97706",
                                    borderColor: "#D97706",
                                    color: "#fff",
                                    fontWeight: 600,
                                  }}
                                >
                                  🧾 {t("admin_review_release_btn") || "Review & Release Receipt"}
                                </button>
                              )
                            )}
                            {f.status !== "cancelled" && f.status !== "paid" && (
                              <button
                                type="button"
                                className="btn secondary danger"
                                onClick={() => {
                                  setCancellingFarmer(f);
                                  setCancelReason("");
                                }}
                                style={{ padding: "6px 10px", fontSize: 12 }}
                              >
                                🚫 Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {todaySlots.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ color: "#8A8368", textAlign: "center", padding: "24px 0" }}>
                        No pre-booked slots for today at this centre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW 3: UPCOMING / FUTURE DAYS' SLOTTED QUEUE */}
          {queueTab === "upcoming" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <h2 style={{ fontSize: 18, margin: 0 }}>
                  🗓️ Upcoming Slots (Other Days) — Centre {centreId}
                </h2>
                <p style={{ fontSize: 12, color: "#8A8368", marginTop: 4, margin: 0 }}>
                  Booked for future dates. Records automatically roll over into "Today's Slots" at midnight when their date arrives.
                </p>
              </div>

              {Object.keys(upcomingSlots).length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "#8A8368" }}>
                  No upcoming future bookings registered for this centre.
                </div>
              ) : (
                Object.keys(upcomingSlots)
                  .sort()
                  .map((dateStr) => {
                    const dateFarmers = upcomingSlots[dateStr] || [];
                    const isExpanded = expandedDates[dateStr] !== false; // expanded by default

                    return (
                      <div key={dateStr} className="card" style={{ padding: 0, overflow: "hidden" }}>
                        <div
                          onClick={() =>
                            setExpandedDates((prev) => ({
                              ...prev,
                              [dateStr]: prev[dateStr] === false ? true : false,
                            }))
                          }
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "14px 18px",
                            background: "rgba(35, 41, 31, 0.04)",
                            borderBottom: isExpanded ? "1px solid var(--line)" : "none",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 14 }}>{isExpanded ? "▼" : "▶"}</span>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
                              📅 {dateStr}
                            </span>
                            <span
                              style={{
                                background: "var(--field)",
                                color: "#FFFFFF",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {dateFarmers.length} farmer{dateFarmers.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          <span style={{ fontSize: 12, color: "#8A8368" }}>
                            {isExpanded ? "Click to collapse" : "Click to expand"}
                          </span>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: "0 18px 18px" }}>
                            <table>
                              <thead>
                                <tr>
                                  <th>Time Slot</th>
                                  <th>Token</th>
                                  <th>Farmer</th>
                                  <th>Crop / Qty</th>
                                  <th>Slot Status</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dateFarmers.map((f) => (
                                  <tr key={f.id}>
                                    <td style={{ fontWeight: 700, color: "var(--field)", fontSize: 13 }}>
                                      ⏰ {f.slotTime || "8:00 AM - 10:00 AM"}
                                    </td>
                                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                                      {f.id}
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{f.name}</div>
                                      <div style={{ fontSize: 12, color: "#8A8368", marginTop: 2 }}>
                                        {f.phone ? `📞 ${f.phone}` : `✉️ ${f.email || "Google Auth"}`}
                                      </div>
                                    </td>
                                    <td>
                                      {renderFarmerQuantity(f)}
                                    </td>
                                    <td>
                                      <span style={{ background: "#F3F4F6", color: "#4B5563", padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                                        ⏳ Upcoming
                                      </span>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="btn secondary danger"
                                        onClick={() => {
                                          setCancellingFarmer(f);
                                          setCancelReason("");
                                        }}
                                        style={{ padding: "6px 10px", fontSize: 12 }}
                                      >
                                        🚫 Cancel (Admin)
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </>
      )}

      {/* Tab 2: Support & Grievance Tickets */}
      {adminTab === "tickets" && (
        <div>
          {/* Filter Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["all", "open", "in_progress", "resolved", "closed"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTicketFilter(f)}
                  style={{
                    background: ticketFilter === f ? "var(--field)" : "#fff",
                    color: ticketFilter === f ? "var(--paper)" : "var(--ink)",
                    border: "1px solid var(--line)",
                    padding: "5px 12px",
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {f === "all" ? "All" : f.replace("_", " ")}{" "}
                  ({f === "all" ? tickets.length : tickets.filter((t) => t.status === f).length})
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={async () => {
                const tkts = await api.getAdminTickets();
                setTickets(tkts || []);
              }}
            >
              🔄 Refresh List
            </button>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "#8A8368" }}>
              No support tickets found in this filter category.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {filteredTickets.map((tkt) => {
                const statusKey = tkt.status || "open";
                const isResolved = statusKey === "resolved";
                const isClosed = statusKey === "closed";
                const isInProgress = statusKey === "in_progress";
                const isUpdating = updatingTicketId === tkt.id;

                let pillStyle = {
                  background: "rgba(201, 138, 43, 0.18)",
                  color: "#8C590E",
                  border: "1px solid rgba(201, 138, 43, 0.3)",
                };
                if (isResolved) {
                  pillStyle = {
                    background: "rgba(31, 61, 43, 0.12)",
                    color: "var(--field)",
                    border: "1px solid var(--field)",
                  };
                } else if (isClosed) {
                  pillStyle = {
                    background: "rgba(138, 131, 104, 0.15)",
                    color: "#6A6553",
                    border: "1px solid var(--line)",
                  };
                } else if (isInProgress) {
                  pillStyle = {
                    background: "rgba(43, 108, 176, 0.12)",
                    color: "#2B6CB0",
                    border: "1px solid rgba(43, 108, 176, 0.3)",
                  };
                }

                const createdDate = tkt.createdAt
                  ? new Date(tkt.createdAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                return (
                  <div
                    key={tkt.id}
                    className="card"
                    style={{
                      padding: "20px 24px",
                      borderLeft: `4px solid ${
                        isResolved
                          ? "var(--field)"
                          : isInProgress
                          ? "#2B6CB0"
                          : isClosed
                          ? "#8A8368"
                          : "var(--wheat)"
                      }`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        gap: 12,
                        borderBottom: "1px solid var(--line)",
                        paddingBottom: 12,
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              fontSize: 16,
                              color: "var(--field)",
                            }}
                          >
                            {tkt.id}
                          </span>
                          <span
                            className="status-pill"
                            style={{
                              ...pillStyle,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "2px 10px",
                            }}
                          >
                            {statusKey.replace("_", " ")}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                          {tkt.ticketType} ➔ {tkt.ticketSubtype}
                        </div>
                      </div>

                      {/* Status Transition Action Buttons */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 600 }}>
                          Update:
                        </span>
                        {statusKey !== "in_progress" && statusKey !== "resolved" && statusKey !== "closed" && (
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ fontSize: 11, padding: "4px 8px" }}
                            disabled={isUpdating}
                            onClick={() => handleTicketStatusChange(tkt.id, "in_progress")}
                          >
                            ⏳ In Progress
                          </button>
                        )}
                        {statusKey !== "resolved" && (
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: 11, padding: "4px 8px", background: "var(--field)" }}
                            disabled={isUpdating}
                            onClick={() => handleTicketStatusChange(tkt.id, "resolved")}
                          >
                            ✓ Mark Resolved
                          </button>
                        )}
                        {statusKey !== "closed" && (
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ fontSize: 11, padding: "4px 8px" }}
                            disabled={isUpdating}
                            onClick={() => handleTicketStatusChange(tkt.id, "closed")}
                          >
                            🔒 Close
                          </button>
                        )}
                        {(statusKey === "resolved" || statusKey === "closed") && (
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ fontSize: 11, padding: "4px 8px" }}
                            disabled={isUpdating}
                            onClick={() => handleTicketStatusChange(tkt.id, "open")}
                          >
                            🔄 Reopen
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
                        Issue Description:
                      </div>
                      <p style={{ fontSize: 14, color: "#23291F", margin: 0, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                        {tkt.description}
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        color: "#6A6553",
                        paddingTop: 8,
                        borderTop: "1px dashed var(--line)",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div>
                        📍 {tkt.village}, {tkt.district}, {tkt.state} ({tkt.pincode})
                      </div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          👤 <strong>{tkt.farmerName}</strong> (📞 {tkt.farmerPhone})
                        </span>
                        <span style={{ color: "#8A8368", fontSize: 11 }}>📅 {createdDate}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Permanent Procurement Records (Audit Snapshots) */}
      {adminTab === "records" && (
        <div>
          {/* Search & Filter Header */}
          <div
            className="card"
            style={{
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "16px 18px",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 17, margin: 0, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📜</span>
                  <span>Permanent Procurement History & Audit Snapshots</span>
                </h3>
                <p style={{ fontSize: 12, color: "#6A6553", margin: "3px 0 0 0" }}>
                  Immutable point-in-time official records across all centres. These records never change on profile updates.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => fetchRecords(recordsResult.page)}
                >
                  🔄 Refresh
                </button>
              </div>
            </div>

            {/* Filter Form Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A4636", display: "block", marginBottom: 4 }}>
                  Farmer Name / ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. Arun or FID-98..."
                  value={recordFilters.farmerName}
                  onChange={(e) => setRecordFilters((f) => ({ ...f, farmerName: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--line)" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A4636", display: "block", marginBottom: 4 }}>
                  Final Token ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. TNJ-001 or VPM-009"
                  value={recordFilters.tokenId}
                  onChange={(e) => setRecordFilters((f) => ({ ...f, tokenId: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--line)" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A4636", display: "block", marginBottom: 4 }}>
                  Crop
                </label>
                <select
                  value={recordFilters.crop}
                  onChange={(e) => setRecordFilters((f) => ({ ...f, crop: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--line)" }}
                >
                  <option value="">All Crops</option>
                  <option value="Paddy">Paddy</option>
                  <option value="Wheat">Wheat</option>
                  <option value="Pulses">Pulses</option>
                  <option value="Groundnut">Groundnut</option>
                  <option value="Cotton">Cotton</option>
                  <option value="Sugarcane">Sugarcane</option>
                  <option value="Millets">Millets</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A4636", display: "block", marginBottom: 4 }}>
                  Procurement Centre
                </label>
                <select
                  value={recordFilters.centreId}
                  onChange={(e) => setRecordFilters((f) => ({ ...f, centreId: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--line)" }}
                >
                  <option value="">All Centres</option>
                  {overview.map((o) => (
                    <option key={o.centre.id} value={o.centre.id}>
                      {o.centre.code} — {o.centre.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A4636", display: "block", marginBottom: 4 }}>
                  From Date
                </label>
                <input
                  type="date"
                  value={recordFilters.dateFrom}
                  onChange={(e) => setRecordFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--line)" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A4636", display: "block", marginBottom: 4 }}>
                  To Date
                </label>
                <input
                  type="date"
                  value={recordFilters.dateTo}
                  onChange={(e) => setRecordFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--line)" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={() => {
                  const reset = { farmerName: "", tokenId: "", crop: "", centreId: "", dateFrom: "", dateTo: "" };
                  setRecordFilters(reset);
                  fetchRecords(1, reset);
                }}
              >
                Reset Filters
              </button>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: "5px 16px" }}
                onClick={() => fetchRecords(1)}
              >
                Apply Filters
              </button>
            </div>
          </div>

          {/* Records Table Card */}
          {recordsLoading ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "#8A8368" }}>
              Loading procurement snapshot records...
            </div>
          ) : recordsResult.records.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "#8A8368" }}>
              No permanent procurement records found matching your filter criteria.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--line)" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(35, 41, 31, 0.05)", borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                      <th style={{ padding: "10px 14px" }}>Token & Receipt</th>
                      <th style={{ padding: "10px 14px" }}>Payment Date</th>
                      <th style={{ padding: "10px 14px" }}>Farmer</th>
                      <th style={{ padding: "10px 14px" }}>Centre</th>
                      <th style={{ padding: "10px 14px" }}>Crop & Variety</th>
                      <th style={{ padding: "10px 14px" }}>Verified Quantity</th>
                      <th style={{ padding: "10px 14px" }}>Rate / Qtl</th>
                      <th style={{ padding: "10px 14px" }}>Total Paid (₹)</th>
                      <th style={{ padding: "10px 14px", textAlign: "center" }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordsResult.records.map((r, idx) => {
                      const pDate = r.paymentDate ? r.paymentDate.split("T")[0] : "—";
                      const qty = r.quantity || {};
                      const rate = r.finalRatePerQuintal || (r.finalRatePerKg ? r.finalRatePerKg * 100 : 0);
                      const isEven = idx % 2 === 0;

                      return (
                        <tr
                          key={r.id || idx}
                          style={{
                            background: isEven ? "#fff" : "rgba(35, 41, 31, 0.015)",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--field)" }}>
                              {r.tokenId}
                            </div>
                            <div style={{ fontSize: 11, color: "#8A8368", fontFamily: "var(--font-mono)" }}>
                              {r.receiptId || "—"}
                            </div>
                          </td>

                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 600 }}>{pDate}</div>
                            <div style={{ fontSize: 11, color: "#8A8368" }}>
                              {r.slotTime || "—"}
                            </div>
                          </td>

                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.farmerName}</div>
                            <div style={{ fontSize: 11, color: "#6A6553" }}>📞 {r.phone || "—"}</div>
                            {r.acreage !== null && r.acreage !== undefined && (
                              <div style={{ fontSize: 10, color: "#8A8368" }}>🌾 {r.acreage} acres (snapshot)</div>
                            )}
                          </td>

                          <td style={{ padding: "10px 14px", maxWidth: 160 }}>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.centreName || r.centreId}</div>
                            <div style={{ fontSize: 10, color: "#8A8368" }}>ID: {r.centreId}</div>
                          </td>

                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontWeight: 600 }}>{r.crop}</div>
                            <div style={{ fontSize: 11, color: "var(--field)", fontWeight: 600 }}>
                              {r.variety || "Common"}
                            </div>
                          </td>

                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontWeight: 700, color: "var(--field)" }}>
                              {qty.kg ? `${qty.kg.toLocaleString("en-IN")} KG` : "—"}
                            </div>
                            <div style={{ fontSize: 11, color: "#6A6553" }}>
                              {qty.quintal ? `${qty.quintal} Qtl` : ""} {qty.verifiedQuantity ? `(${qty.verifiedQuantity} ${qty.unit || "bags"})` : ""}
                            </div>
                            {(r.adjustmentReason || r.receipt?.adjustmentReason) && (
                              <div style={{ fontSize: 10, color: "#B45309", marginTop: 2, fontWeight: 600 }} title={r.adjustmentReason || r.receipt?.adjustmentReason}>
                                ⚠️ Adjusted: {r.adjustmentReason || r.receipt?.adjustmentReason}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 600 }}>₹{rate.toFixed(2)}</div>
                            {r.stateIncentive > 0 && (
                              <div style={{ fontSize: 10, color: "var(--field)" }}>
                                +₹{r.stateIncentive} bonus
                              </div>
                            )}
                          </td>

                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 800, color: "var(--field)", fontSize: 14 }}>
                              ₹{(r.totalAmountPaid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </div>
                            <span className="status-pill paid" style={{ fontSize: 10, padding: "1px 6px" }}>
                              ✓ Paid
                            </span>
                          </td>

                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <button
                              type="button"
                              className="btn secondary"
                              style={{ fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap" }}
                              onClick={() => setSelectedSnapshotReceipt(r)}
                            >
                              🧾 View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "rgba(35, 41, 31, 0.03)",
                  borderTop: "1px solid var(--line)",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, color: "#6A6553" }}>
                  Showing <strong>{recordsResult.records.length}</strong> of <strong>{recordsResult.total}</strong> total permanent records
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    disabled={recordsResult.page <= 1}
                    onClick={() => fetchRecords(recordsResult.page - 1)}
                  >
                    ◀ Previous
                  </button>

                  <span style={{ fontSize: 12, fontWeight: 700, padding: "0 6px" }}>
                    Page {recordsResult.page} of {recordsResult.totalPages}
                  </span>

                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    disabled={recordsResult.page >= recordsResult.totalPages}
                    onClick={() => fetchRecords(recordsResult.page + 1)}
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Analytics Dashboard */}
      {adminTab === "analytics" && (
        <AdminAnalytics />
      )}

      {/* Point-in-Time Snapshot Receipt Modal */}
      {selectedSnapshotReceipt && (() => {
        const r = selectedSnapshotReceipt;
        const receipt = r.receipt || {};
        const qty = r.quantity || {};
        const pDate = r.paymentDate ? r.paymentDate.split("T")[0] : "—";
        const totalAmount = r.totalAmountPaid || receipt.totalAmount || 0;
        const rateKg = r.finalRatePerKg || (r.finalRatePerQuintal ? r.finalRatePerQuintal / 100 : 0);
        const rateQtl = r.finalRatePerQuintal || (rateKg * 100);

        return (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: 16,
            }}
          >
            <div
              className="card"
              style={{
                maxWidth: 520,
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                margin: "0 auto",
                background: "#fff",
                borderRadius: 10,
                boxShadow: "0 20px 45px rgba(0, 0, 0, 0.32)",
                padding: "24px 26px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 18, margin: 0, color: "var(--field)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🧾</span>
                    <span>Permanent Procurement Snapshot Receipt</span>
                  </h3>
                  <p style={{ fontSize: 12, color: "#6A6553", margin: "2px 0 0 0" }}>
                    Immutable historical record created upon payment completion
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSnapshotReceipt(null)}
                  style={{ background: "none", border: "none", fontSize: 18, color: "#8A8368", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              <div className="receipt-stub" style={{ margin: 0, boxShadow: "none" }}>
                <div className="receipt-header">
                  <div>
                    <div className="receipt-title">Govt. Direct Purchase Receipt</div>
                    <div className="receipt-sub">MSP Procurement (Point-in-Time Snapshot)</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="status-pill paid" style={{ fontSize: 12, padding: "3px 8px" }}>
                      ✓ PAID
                    </span>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#6A6553", marginTop: 4 }}>
                      {r.receiptId}
                    </div>
                  </div>
                </div>

                <div className="receipt-grid">
                  <div className="receipt-item">
                    <span className="receipt-item-label">Token ID</span>
                    <span className="receipt-item-val" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {r.tokenId}
                    </span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">Farmer Name</span>
                    <span className="receipt-item-val">{r.farmerName}</span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">Crop & Variety</span>
                    <span className="receipt-item-val">{r.crop} ({r.variety})</span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">Payment Date</span>
                    <span className="receipt-item-val">{pDate}</span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">Verified Produce</span>
                    <span className="receipt-item-val" style={{ color: "var(--field)", fontWeight: 700 }}>
                      {qty.kg ? `${qty.kg.toLocaleString("en-IN")} KG` : "—"} ({qty.quintal || (qty.kg / 100)} Qtl)
                    </span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">Final MSP Rate</span>
                    <span className="receipt-item-val">
                      ₹{rateKg.toFixed(2)}/kg (₹{rateQtl.toFixed(2)}/qtl)
                    </span>
                  </div>
                  <div className="receipt-item" style={{ gridColumn: "1 / -1" }}>
                    <span className="receipt-item-label">Procurement Centre</span>
                    <span className="receipt-item-val">{r.centreName || r.centreId}</span>
                  </div>
                  {(receipt.adjustmentReason || r.adjustmentReason || receipt.discrepancyReason) && (
                    <div className="receipt-item" style={{ gridColumn: "1 / -1", background: "rgba(201, 138, 43, 0.08)", padding: "8px 10px", borderRadius: 6 }}>
                      <span className="receipt-item-label" style={{ color: "#B45309", fontWeight: 700 }}>
                        Reason for Adjustment:
                      </span>
                      <span className="receipt-item-val" style={{ color: "#78350F" }}>
                        "{receipt.adjustmentReason || r.adjustmentReason || receipt.discrepancyReason}"
                      </span>
                    </div>
                  )}
                </div>

                <div className="receipt-total-box">
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--field)", textTransform: "uppercase" }}>
                      Total Amount Credited
                    </div>
                    <div style={{ fontSize: 11, color: "#6A6553" }}>
                      {qty.kg} kg × ₹{rateKg.toFixed(2)}/kg
                    </div>
                  </div>
                  <div className="receipt-total-amount">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(totalAmount)}
                  </div>
                </div>

                <div
                  className="receipt-process-completed"
                  style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: "1px dashed var(--line)",
                    fontSize: 12,
                    color: "#6A6553",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                  }}
                >
                  Process Completed: {formatReceiptDateTime(receipt.releasedAt || receipt.processCompletedAt || r.paymentTimestamp || r.procurementTimestamp || r.paymentDate || r.procurementDate)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                  style={{ flex: 1, padding: "8px 14px", fontSize: 13 }}
                >
                  🖨️ Print Receipt
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setSelectedSnapshotReceipt(null)}
                  style={{ padding: "8px 14px", fontSize: 13 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Produce Weighment & Variety Verification Modal */}
      {verifyingFarmer && (() => {
        const bagWeight = (verifyingFarmer.crop === "Paddy" || verifyingFarmer.crop === "Groundnut") ? 40 : 50;
        const bookedUnit = verifyingFarmer.declaredUnit || "bags";
        const bookedDeclaredQty = verifyingFarmer.declaredQuantity !== undefined && verifyingFarmer.declaredQuantity !== null
          ? verifyingFarmer.declaredQuantity
          : (verifyingFarmer.quantityKg ? Math.round((verifyingFarmer.quantityKg / bagWeight) * 10) / 10 : 0);

        const declaredKg = verifyingFarmer.declaredQuantityKg !== undefined && verifyingFarmer.declaredQuantityKg !== null
          ? verifyingFarmer.declaredQuantityKg
          : (verifyingFarmer.crop === "Paddy" || verifyingFarmer.crop === "Groundnut" ? bookedDeclaredQty * 40 : bookedDeclaredQty * 50);

        const vQty = Number(verifyForm.verifiedQuantity) || 0;
        const vUnit = verifyForm.verifiedUnit || "bags";

        let verifiedKg = vQty;
        if (vUnit === "bags") verifiedKg = vQty * bagWeight;
        else if (vUnit === "tons") verifiedKg = vQty * 1000;
        else if (vUnit === "quintals") verifiedKg = vQty * 100;

        const diffKg = Math.abs(declaredKg - verifiedKg);
        const diffPercent = declaredKg > 0 ? (diffKg / declaredKg) * 100 : 0;
        const roundedDiffPercent = Math.round(diffPercent * 10) / 10;
        const isAboveThreshold = diffPercent > 15;
        const hasDiff = diffKg > 0.01;

        // Calculate rate and estimated total payout preview
        let previewRatePerKg = 23.69;
        if (verifyingFarmer.crop === "Paddy") {
          previewRatePerKg = (verifyForm.varietySelection === "Fine" || verifyForm.varietySelection === "Grade A") ? 24.00 : 23.69;
        } else if (verifyingFarmer.crop === "Wheat") {
          previewRatePerKg = 25.85;
        } else if (verifyingFarmer.crop === "Maize") {
          previewRatePerKg = 24.00;
        } else if (verifyingFarmer.crop === "Pulses") {
          previewRatePerKg = 80.00;
        } else if (verifyingFarmer.crop === "Groundnut") {
          previewRatePerKg = 67.83;
        } else if (verifyingFarmer.crop === "Cotton") {
          previewRatePerKg = 77.10;
        }
        const previewTotalPayout = Math.round(verifiedKg * previewRatePerKg * 100) / 100;

        const isFormValid = vQty > 0 && (!isAboveThreshold || (verifyForm.discrepancyReason && verifyForm.discrepancyReason.trim().length > 0));

        return (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: 16,
            }}
          >
            <div
              className="card"
              style={{
                maxWidth: 540,
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                margin: "0 auto",
                background: "#fff",
                borderRadius: 10,
                boxShadow: "0 20px 45px rgba(0, 0, 0, 0.32)",
                padding: "24px 26px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 20, margin: 0, color: "var(--field)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>⚖️</span>
                    <span>Produce Weighment & Verification</span>
                  </h3>
                  <p style={{ fontSize: 13, color: "#6A6553", marginTop: 4, margin: 0 }}>
                    Confirm actual weighment at the centre. Receipt & payment calculation will strictly derive from this verified amount.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVerifyingFarmer(null)}
                  style={{ background: "none", border: "none", fontSize: 18, color: "#8A8368", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {/* Farmer Booking Reference Card */}
              <div
                style={{
                  background: "rgba(35, 41, 31, 0.04)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                    Token: {verifyingFarmer.id}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "var(--field)" }}>
                    {verifyingFarmer.name}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#4A4636" }}>
                  <span>Crop: <strong>{verifyingFarmer.crop}</strong></span>
                  <span style={{ margin: "0 6px" }}>·</span>
                  <span>Declared at Booking: <strong>{bookedDeclaredQty} {bookedUnit}</strong> ({declaredKg} KG / {(declaredKg / 100).toFixed(2)} Quintals)</span>
                </div>
              </div>

              <form onSubmit={handleConfirmVerification}>
                {/* Paddy Variety Selection */}
                {verifyingFarmer.crop === "Paddy" && (
                  <div className="field-row">
                    <label htmlFor="modal-paddy-variety">
                      Paddy Variety Confirmation (Correction if required):
                    </label>
                    <select
                      id="modal-paddy-variety"
                      value={verifyForm.varietySelection || "Common"}
                      onChange={(e) => setVerifyForm((f) => ({ ...f, varietySelection: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)" }}
                    >
                      <option value="Common">Common — MSP ₹2,300 + State Incentive ₹69 = ₹2,369 / Quintal (₹23.69 / KG)</option>
                      <option value="Fine">Grade A / Fine — MSP ₹2,320 + State Incentive ₹80 = ₹2,400 / Quintal (₹24.00 / KG)</option>
                    </select>
                  </div>
                )}

                {/* Actual Verified Quantity & Unit */}
                <div className="field-row">
                  <label htmlFor="modal-verified-qty">
                    Actual Verified Quantity at Weighbridge: *
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="modal-verified-qty"
                      type="number"
                      step="any"
                      min="0.1"
                      required
                      placeholder="e.g. 58"
                      value={verifyForm.verifiedQuantity}
                      onChange={(e) => setVerifyForm((f) => ({ ...f, verifiedQuantity: e.target.value }))}
                      style={{ flex: 2, padding: "9px 12px", fontSize: 15, fontWeight: 700 }}
                    />
                    <select
                      value={verifyForm.verifiedUnit}
                      onChange={(e) => setVerifyForm((f) => ({ ...f, verifiedUnit: e.target.value }))}
                      style={{ flex: 1, minWidth: 120, padding: "9px 10px" }}
                    >
                      <option value="bags">Bags ({bagWeight} KG/bag)</option>
                      <option value="quintals">Quintals (100 KG)</option>
                      <option value="tons">Tons (1,000 KG)</option>
                      <option value="kg">KG</option>
                    </select>
                  </div>
                </div>

                {/* Live Computed Weights & Discrepancy Breakdown */}
                <div
                  style={{
                    background: isAboveThreshold
                      ? "rgba(162, 59, 46, 0.08)"
                      : hasDiff
                      ? "rgba(201, 138, 43, 0.08)"
                      : "rgba(31, 61, 43, 0.06)",
                    border: `1px solid ${
                      isAboveThreshold ? "var(--danger)" : hasDiff ? "var(--wheat)" : "var(--field)"
                    }`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    marginBottom: 18,
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", textTransform: "uppercase" }}>
                      Computed Weighment
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: isAboveThreshold ? "var(--danger)" : hasDiff ? "#B45309" : "var(--field)",
                      }}
                    >
                      {isAboveThreshold ? "⚠️ High Discrepancy" : hasDiff ? "🟡 Adjusted" : "🟢 Perfect Match"}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>
                    Verified Produce Weight: <strong>{verifiedKg.toLocaleString("en-IN")} KG</strong> ({(verifiedKg / 100).toFixed(2)} Quintals / ~{(verifiedKg / bagWeight).toFixed(1)} Bags)
                  </div>

                  <div style={{ fontSize: 13, color: isAboveThreshold ? "var(--danger)" : "#4A4636", fontWeight: isAboveThreshold ? 700 : 500 }}>
                    Difference vs Declared: {hasDiff ? `${diffKg.toLocaleString("en-IN")} KG (${roundedDiffPercent}% difference)` : "0 KG (0% difference)"}
                  </div>

                  {verifiedKg > 0 && (
                    <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(35, 41, 31, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Applicable Rate: <strong>₹{previewRatePerKg.toFixed(2)}/KG</strong> (₹{(previewRatePerKg * 100).toFixed(2)}/Qtl)</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--field)" }}>
                        Estimated Payout: {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(previewTotalPayout)}
                      </span>
                    </div>
                  )}

                  {isAboveThreshold && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px dashed rgba(162, 59, 46, 0.3)",
                        fontSize: 12,
                        color: "var(--danger)",
                        fontWeight: 700,
                      }}
                    >
                      ⚠️ Discrepancy is {roundedDiffPercent}% (exceeds the 15% threshold). A justification reason is mandatory.
                    </div>
                  )}
                </div>

                {/* Discrepancy Reason Field */}
                <div className="field-row">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <label htmlFor="modal-discrepancy-reason" style={{ margin: 0 }}>
                      Discrepancy Justification Reason: {isAboveThreshold && <span style={{ color: "var(--danger)" }}>* (Required)</span>}
                    </label>
                    {isAboveThreshold && (
                      <span style={{ fontSize: 11, background: "rgba(162, 59, 46, 0.12)", color: "var(--danger)", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                        Mandatory
                      </span>
                    )}
                  </div>
                  <textarea
                    id="modal-discrepancy-reason"
                    rows={2}
                    required={isAboveThreshold}
                    placeholder={
                      isAboveThreshold
                        ? "e.g. Quality check - moisture rejection 8%, foreign matter deduction, under-delivery by farmer"
                        : "Optional note e.g. Bag tare deduction, quality test verified"
                    }
                    value={verifyForm.discrepancyReason}
                    onChange={(e) => setVerifyForm((f) => ({ ...f, discrepancyReason: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: isAboveThreshold && !verifyForm.discrepancyReason.trim() ? "1.5px solid var(--danger)" : "1px solid var(--line)",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      resize: "vertical",
                    }}
                  />

                  {/* Preset quick buttons for admin */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {[
                      "Quality check - moisture rejection",
                      "Foreign matter / dust deduction",
                      "Under-delivery by farmer",
                      "Damaged produce deduction",
                      "Bag tare adjustment",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setVerifyForm((f) => ({ ...f, discrepancyReason: preset }))}
                        style={{
                          background: verifyForm.discrepancyReason === preset ? "var(--field)" : "#F3F4F6",
                          color: verifyForm.discrepancyReason === preset ? "#fff" : "#4B5563",
                          border: "1px solid var(--line)",
                          borderRadius: 12,
                          padding: "2px 8px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                  <button
                    type="submit"
                    className="btn"
                    disabled={!isFormValid || verifySubmitting}
                    style={{ flex: 1, padding: "11px 16px", fontSize: 14 }}
                  >
                    {verifySubmitting ? "Submitting..." : "✓ Confirm Verification & Mark Procured"}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={verifySubmitting}
                    onClick={() => setVerifyingFarmer(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Admin Slot Cancellation Reason Modal */}
      {cancellingFarmer && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 480,
              width: "100%",
              margin: "0 auto",
              background: "#fff",
              borderRadius: 8,
              boxShadow: "0 16px 36px rgba(0, 0, 0, 0.28)",
            }}
          >
            <h3 style={{ fontSize: 19, marginBottom: 6, color: "var(--danger)" }}>
              🚫 Cancel Farmer Slot (Admin)
            </h3>
            <p style={{ fontSize: 13, color: "#6A6553", marginBottom: 14 }}>
              Cancelling token <strong>{cancellingFarmer.id}</strong> for{" "}
              <strong>{cancellingFarmer.name}</strong> (
              {cancellingFarmer.crop} · {cancellingFarmer.quantityKg}kg)
            </p>

            <form onSubmit={handleConfirmAdminCancel}>
              <div className="field-row">
                <label htmlFor="admin-cancel-reason">
                  Cancellation Reason (will be sent to the farmer via SMS & In-App alert): *
                </label>
                <textarea
                  id="admin-cancel-reason"
                  required
                  rows={3}
                  placeholder="e.g. Moisture testing lab downtime, centre closed for holiday, temporary power outage"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  className="btn secondary danger"
                  type="submit"
                  disabled={cancelSubmitting || !cancelReason.trim()}
                  style={{ flex: 1 }}
                >
                  {cancelSubmitting ? "Cancelling..." : "Confirm Cancellation & Notify Farmer"}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setCancellingFarmer(null);
                    setCancelReason("");
                  }}
                  disabled={cancelSubmitting}
                >
                  Dismiss
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review & Release Payment Receipt Modal */}
      {reviewingReceiptFarmer && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(10, 15, 10, 0.65)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 580,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 24px 48px rgba(0,0,0,0.3)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: "24px",
              background: "#ffffff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 19, margin: 0, color: "var(--ink)" }}>
                  🧾 {reviewingReceiptFarmer.receipt?.receiptStatus === "released"
                    ? "Payment Receipt (Released)"
                    : t("admin_review_receipt_modal_title") || "Review & Release Payment Receipt"}
                </h3>
                <p style={{ fontSize: 12, color: "#6A6553", margin: "4px 0 0" }}>
                  {reviewingReceiptFarmer.receipt?.receiptStatus === "released"
                    ? `Receipt #${reviewingReceiptFarmer.receipt?.receiptId} is released to the farmer.`
                    : t("admin_review_receipt_modal_sub") || "Verify procurement, weighment, and MSP calculation before releasing to the farmer."}
                </p>
              </div>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: reviewingReceiptFarmer.receipt?.receiptStatus === "released" ? "rgba(34, 197, 94, 0.15)" : "rgba(217, 119, 6, 0.15)",
                  color: reviewingReceiptFarmer.receipt?.receiptStatus === "released" ? "#15803d" : "#b45309",
                  border: `1px solid ${reviewingReceiptFarmer.receipt?.receiptStatus === "released" ? "#86efac" : "#fcd34d"}`,
                }}
              >
                {reviewingReceiptFarmer.receipt?.receiptStatus === "released" ? "✅ RELEASED" : "⏳ PENDING RELEASE"}
              </span>
            </div>

            {/* Receipt Details Box */}
            <div
              style={{
                background: "rgba(245, 240, 225, 0.45)",
                border: "1px dashed var(--line)",
                borderRadius: 10,
                padding: "16px",
                marginBottom: 18,
                fontSize: 13,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 600 }}>Farmer Name</div>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{reviewingReceiptFarmer.name}</div>
                  <div style={{ fontSize: 11, color: "#6A6553" }}>Phone: {reviewingReceiptFarmer.phone}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 600 }}>Token / Centre</div>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{reviewingReceiptFarmer.id}</div>
                  <div style={{ fontSize: 11, color: "#6A6553" }}>{reviewingReceiptFarmer.receipt?.centreName || reviewingReceiptFarmer.centreId}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 600 }}>Crop & Variety</div>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                    {reviewingReceiptFarmer.crop} {reviewingReceiptFarmer.variety ? `(${reviewingReceiptFarmer.variety})` : ""}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 600 }}>MSP Rate</div>
                  <div style={{ fontWeight: 600, color: "var(--field)" }}>
                    ₹{reviewingReceiptFarmer.receipt?.ratePerKg || reviewingReceiptFarmer.ratePerKg || 0} / kg
                    <span style={{ fontSize: 11, color: "#6A6553", fontWeight: 400, marginLeft: 4 }}>
                      (₹{((reviewingReceiptFarmer.receipt?.ratePerQuintal || (reviewingReceiptFarmer.receipt?.ratePerKg || 0) * 100))?.toLocaleString("en-IN")}/q)
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#8A8368" }}>Verified Quantity</div>
                    <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                      {reviewingReceiptFarmer.receipt?.verifiedQuantityKg ?? reviewingReceiptFarmer.verifiedQuantityKg ?? reviewingReceiptFarmer.quantityKg} kg
                      <span style={{ fontSize: 12, color: "#6A6553", fontWeight: 500, marginLeft: 4 }}>
                        ({reviewingReceiptFarmer.receipt?.quintals ?? (((reviewingReceiptFarmer.receipt?.verifiedQuantityKg ?? reviewingReceiptFarmer.quantityKg) / 100).toFixed(2))} quintals)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#8A8368" }}>Declared Quantity</div>
                    <div style={{ color: "#6A6553" }}>
                      {reviewingReceiptFarmer.declaredQuantityKg ?? reviewingReceiptFarmer.quantityKg} kg ({reviewingReceiptFarmer.declaredQuantity ?? (reviewingReceiptFarmer.quantityKg / 40)} {reviewingReceiptFarmer.declaredUnit || "bags"})
                    </div>
                  </div>
                </div>
                {(() => {
                  const verifiedKg = Number(
                    reviewingReceiptFarmer.receipt?.verifiedQuantityKg ??
                    reviewingReceiptFarmer.verifiedQuantityKg ??
                    reviewingReceiptFarmer.quantityKg ??
                    0
                  );
                  const declaredKg = Number(
                    reviewingReceiptFarmer.declaredQuantityKg ??
                    reviewingReceiptFarmer.quantityKg ??
                    0
                  );
                  const hasMismatch = Math.abs(verifiedKg - declaredKg) > 0.01;
                  const isReleased = reviewingReceiptFarmer.receipt?.receiptStatus === "released";

                  if (hasMismatch) {
                    if (isReleased) {
                      return (
                        <div style={{ marginTop: 10, fontSize: 12, color: "#B45309", background: "rgba(245, 158, 11, 0.1)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                          <strong>Reason for Adjustment:</strong> {reviewingReceiptFarmer.receipt?.adjustmentReason || reviewingReceiptFarmer.adjustmentReason || reviewingReceiptFarmer.receipt?.discrepancyReason || reviewingReceiptFarmer.quantityDiscrepancyReason || "Weighment adjustment"}
                        </div>
                      );
                    }
                    return (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
                        <label htmlFor="adjustment-reason-input" style={{ fontSize: 12, fontWeight: 700, color: "#B45309", display: "block", marginBottom: 4 }}>
                          Reason for Adjustment *
                        </label>
                        <p style={{ fontSize: 11, color: "#6A6553", margin: "0 0 6px 0", lineHeight: 1.4 }}>
                          Verified quantity differs from declared quantity. Please specify the reason (e.g. moisture content, foreign matter, quality grade mismatch, weighing discrepancy).
                        </p>
                        <textarea
                          id="adjustment-reason-input"
                          rows={2}
                          value={releaseAdjustmentReason}
                          onChange={(e) => setReleaseAdjustmentReason(e.target.value)}
                          placeholder="Enter reason for adjustment (required)..."
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 6,
                            border: `1px solid ${!releaseAdjustmentReason.trim() ? "#e11d48" : "var(--line)"}`,
                            fontSize: 12,
                            fontFamily: "inherit",
                            resize: "vertical",
                            boxSizing: "border-box",
                            background: "#fff",
                          }}
                          required
                        />
                        {!releaseAdjustmentReason.trim() && (
                          <div style={{ fontSize: 11, color: "#e11d48", marginTop: 3 }}>
                            * Reason is required to release receipt when quantities differ.
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div
                style={{
                  borderTop: "1px solid var(--line)",
                  paddingTop: 12,
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 600 }}>Total Disbursed Amount</div>
                  <div style={{ fontSize: 11, color: "#6A6553", fontStyle: "italic" }}>
                    {reviewingReceiptFarmer.receipt?.amountInWords || ""}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--field)" }}>
                  ₹{(reviewingReceiptFarmer.receipt?.totalAmount ?? reviewingReceiptFarmer.totalAmount ?? 0).toLocaleString("en-IN")}
                </div>
              </div>

              {reviewingReceiptFarmer.receipt?.paymentRef && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#6A6553" }}>
                  Payment Ref: <code>{reviewingReceiptFarmer.receipt.paymentRef}</code>
                </div>
              )}

              {reviewingReceiptFarmer.receipt?.receiptStatus === "released" && (
                <div
                  className="receipt-process-completed"
                  style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: "1px dashed var(--line)",
                    fontSize: 12,
                    color: "#6A6553",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                  }}
                >
                  Process Completed: {formatReceiptDateTime(reviewingReceiptFarmer.receipt.releasedAt || reviewingReceiptFarmer.receipt.processCompletedAt)}
                </div>
              )}
            </div>

            {reviewingReceiptFarmer.receipt?.receiptStatus === "released" ? (
              <div>
                <div style={{ fontSize: 12, color: "#15803d", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>✓</span>
                  <span>
                    Released on {new Date(reviewingReceiptFarmer.receipt.releasedAt || Date.now()).toLocaleString("en-IN")} by {reviewingReceiptFarmer.receipt.releasedBy || "Centre Admin"}.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setReviewingReceiptFarmer(null)}
                    style={{ flex: 1 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6A6553",
                    marginBottom: 16,
                    background: "rgba(217, 119, 6, 0.08)",
                    border: "1px solid rgba(217, 119, 6, 0.2)",
                    borderRadius: 6,
                    padding: "10px",
                  }}
                >
                  📢 <strong>Note for Admin:</strong> Releasing this receipt makes it immediately accessible to the farmer on their Status & History pages, triggers an SMS/App notification, and stores a permanent immutable procurement audit record.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {(() => {
                    const verifiedKg = Number(
                      reviewingReceiptFarmer.receipt?.verifiedQuantityKg ??
                      reviewingReceiptFarmer.verifiedQuantityKg ??
                      reviewingReceiptFarmer.quantityKg ??
                      0
                    );
                    const declaredKg = Number(
                      reviewingReceiptFarmer.declaredQuantityKg ??
                      reviewingReceiptFarmer.quantityKg ??
                      0
                    );
                    const hasMismatch = Math.abs(verifiedKg - declaredKg) > 0.01;
                    const isBlocked = releasingReceipt || (hasMismatch && !releaseAdjustmentReason.trim());

                    return (
                      <button
                        className="btn primary"
                        type="button"
                        id="admin-release-receipt-btn"
                        disabled={isBlocked}
                        onClick={() => handleReleaseReceipt(reviewingReceiptFarmer.id)}
                        style={{
                          flex: 1,
                          background: isBlocked ? "#9ca3af" : "var(--field)",
                          borderColor: isBlocked ? "#9ca3af" : "var(--field)",
                          cursor: isBlocked ? "not-allowed" : "pointer",
                          opacity: isBlocked ? 0.7 : 1,
                        }}
                        title={hasMismatch && !releaseAdjustmentReason.trim() ? "Please enter a reason for adjustment before releasing receipt" : ""}
                      >
                        {releasingReceipt ? "Releasing Receipt..." : `🚀 ${t("admin_release_receipt_btn") || "Release Receipt to Farmer"}`}
                      </button>
                    );
                  })()}
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setReviewingReceiptFarmer(null)}
                    disabled={releasingReceipt}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Operations AI Chatbot */}
      <AdminChatbot />
    </div>
  );
}
