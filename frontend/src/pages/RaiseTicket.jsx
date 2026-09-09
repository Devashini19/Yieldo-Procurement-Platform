import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "../i18n.js";
import { api } from "../api.js";

const DEFAULT_TICKET_TYPES = {
  Operational: ["Slot Booking Issue", "Queue Delay", "Centre Not Listed", "Other"],
  Payment: ["Payment Not Received", "Incorrect Amount", "Receipt Issue", "Other"],
  Account: ["Login Issue", "Phone Number Change", "Profile Correction", "Other"],
  Information: ["MSP Rate Query", "Centre Details", "Crop Eligibility", "Other"],
  "Technical Issue": ["App Not Working", "Notification Not Received", "Voice/Chatbot Issue", "Other"],
  Complaint: ["Staff Behaviour", "Centre Condition", "Unfair Treatment", "Other"],
  Grievance: ["Procurement Dispute", "Quality Check Dispute", "Other"],
};

const DISTRICT_OPTIONS = ["Thanjavur", "Villupuram", "Cuddalore"];
const STATE_OPTIONS = ["Tamil Nadu"];

export default function RaiseTicket({ farmerUser }) {
  const { lang, t, tDistrict, tTicketType, tTicketSubtype, tTicketStatus } = useLanguage();

  const [activeTab, setActiveTab] = useState("raise"); // "raise" | "my"
  const [ticketTypesMap, setTicketTypesMap] = useState(DEFAULT_TICKET_TYPES);

  // Form state
  const [ticketType, setTicketType] = useState("");
  const [ticketSubtype, setTicketSubtype] = useState("");
  const [description, setDescription] = useState("");
  const [stateName, setStateName] = useState("Tamil Nadu");
  const [district, setDistrict] = useState("Thanjavur");
  const [village, setVillage] = useState("");
  const [pincode, setPincode] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);

  // My tickets state
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketsError, setTicketsError] = useState("");

  // Load ticket types from server if available
  useEffect(() => {
    api
      .getTicketTypes()
      .then((res) => {
        if (res?.types) setTicketTypesMap(res.types);
      })
      .catch(() => {
        // Fallback to static DEFAULT_TICKET_TYPES
      });
  }, []);

  const farmerIdentifier = farmerUser?.identifier || farmerUser?.phone || farmerUser?.email;

  // Fetch farmer's past tickets
  const loadMyTickets = useCallback(async () => {
    if (!farmerIdentifier) return;
    setLoadingTickets(true);
    setTicketsError("");
    try {
      const list = await api.getTicketsByIdentifier(farmerIdentifier);
      setMyTickets(list || []);
    } catch (err) {
      setTicketsError(err.message || t("err_load_tickets"));
    } finally {
      setLoadingTickets(false);
    }
  }, [farmerIdentifier, t]);

  useEffect(() => {
    if (activeTab === "my") {
      loadMyTickets();
    }
  }, [activeTab, loadMyTickets]);

  // Handle ticket type selection change (reset subtype)
  function handleTypeChange(e) {
    const selected = e.target.value;
    setTicketType(selected);
    setTicketSubtype("");
    if (error) setError("");
  }

  // Handle pincode numeric input (max 6 digits)
  function handlePincodeChange(e) {
    const clean = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPincode(clean);
    if (error) setError("");
  }

  // Handle ticket submission
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!ticketType) {
      setError(t("err_ticket_type_req"));
      return;
    }
    if (!ticketSubtype) {
      setError(t("err_ticket_subtype_req"));
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setError(t("err_ticket_desc_req"));
      return;
    }
    if (!district) {
      setError(t("err_ticket_district_req"));
      return;
    }
    if (!village.trim()) {
      setError(t("err_ticket_village_req"));
      return;
    }
    if (pincode.length !== 6) {
      setError(t("err_ticket_pincode_invalid"));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        farmerPhone: farmerUser?.phone || null,
        farmerEmail: farmerUser?.email || null,
        farmerIdentifier: farmerIdentifier || null,
        farmerName: farmerUser?.name || "",
        ticketType,
        ticketSubtype,
        description: description.trim(),
        state: stateName,
        district,
        village: village.trim(),
        pincode,
      };

      const res = await api.createTicket(payload);
      setCreatedTicket(res.ticket);
      // Reset form
      setTicketType("");
      setTicketSubtype("");
      setDescription("");
      setVillage("");
      setPincode("");
    } catch (err) {
      setError(err.message || "Failed to submit ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  const availableSubtypes = ticketType && ticketTypesMap[ticketType] ? ticketTypesMap[ticketType] : [];

  return (
    <div>
      {/* Hero Header */}
      <section className="hero" style={{ marginBottom: 36 }}>
        <div>
          <h1>{t("ticket_hero_title")}</h1>
          <p>{t("ticket_hero_sub")}</p>
        </div>
        <div className="hero-stub">
          <div className="stub-label">{t("ticket_hero_stub_label")}</div>
          <div className="stub-value">{t("ticket_hero_stub_value")}</div>
          <div className="stub-label">{t("ticket_hero_stub_sub")}</div>
        </div>
      </section>

      {/* Tab Switcher */}
      <div
        style={{
          display: "flex",
          gap: 12,
          borderBottom: "2px solid var(--line)",
          paddingBottom: 8,
          marginBottom: 28,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab("raise");
            setCreatedTicket(null);
          }}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 16,
            fontWeight: activeTab === "raise" ? 700 : 500,
            color: activeTab === "raise" ? "var(--field)" : "#8A8368",
            borderBottom: activeTab === "raise" ? "3px solid var(--field)" : "3px solid transparent",
            padding: "8px 16px",
            cursor: "pointer",
            marginBottom: -10,
            transition: "all 0.15s ease",
          }}
        >
          ✍️ {t("ticket_tab_raise")}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("my")}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 16,
            fontWeight: activeTab === "my" ? 700 : 500,
            color: activeTab === "my" ? "var(--field)" : "#8A8368",
            borderBottom: activeTab === "my" ? "3px solid var(--field)" : "3px solid transparent",
            padding: "8px 16px",
            cursor: "pointer",
            marginBottom: -10,
            transition: "all 0.15s ease",
          }}
        >
          📂 {t("ticket_tab_my")}{" "}
          {myTickets.length > 0 && (
            <span
              style={{
                fontSize: 12,
                background: "var(--field)",
                color: "var(--paper)",
                padding: "2px 7px",
                borderRadius: 10,
                marginLeft: 4,
                fontFamily: "var(--font-mono)",
              }}
            >
              {myTickets.length}
            </span>
          )}
        </button>
      </div>

      {/* View 1: Raise a Ticket */}
      {activeTab === "raise" && (
        <div style={{ maxWidth: 640 }}>
          {createdTicket ? (
            <div className="card token-stub" style={{ textAlign: "center", padding: "36px 28px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(31, 61, 43, 0.12)",
                  color: "var(--field)",
                  fontSize: 28,
                  marginBottom: 16,
                }}
              >
                ✓
              </div>
              <h2 style={{ fontSize: 22, color: "var(--field)", marginBottom: 8 }}>
                {t("ticket_success_title")}
              </h2>
              <p style={{ fontSize: 14, color: "#4A4636", marginBottom: 20 }}>
                {t("ticket_success_msg")}
              </p>

              <div
                style={{
                  background: "var(--paper)",
                  border: "1.5px dashed var(--line)",
                  borderRadius: 8,
                  padding: "16px 20px",
                  display: "inline-block",
                  margin: "0 auto 24px",
                }}
              >
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A8368" }}>
                  {t("ticket_success_token_badge")}
                </div>
                <div className="token-id" style={{ fontSize: 32, marginTop: 4 }}>
                  {createdTicket.id}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 6, fontWeight: 600 }}>
                  {tTicketType(createdTicket.ticketType)} · {tTicketSubtype(createdTicket.ticketSubtype)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreatedTicket(null)}
                >
                  ➕ {t("ticket_raise_another_btn")}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setActiveTab("my")}
                >
                  📋 {t("ticket_view_my_btn")}
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <h2 style={{ fontSize: 20, marginBottom: 20 }}>{t("ticket_card_title")}</h2>

              {/* Farmer session read-only info */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  background: "rgba(35, 41, 31, 0.04)",
                  padding: "12px 16px",
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                  marginBottom: 20,
                  fontSize: 13,
                }}
              >
                <div>
                  <span style={{ color: "#8A8368", display: "block", fontSize: 11, textTransform: "uppercase" }}>
                    {t("ticket_farmer_name_label")}
                  </span>
                  <strong style={{ color: "var(--ink)" }}>{farmerUser?.name || "—"}</strong>
                </div>
                <div>
                  <span style={{ color: "#8A8368", display: "block", fontSize: 11, textTransform: "uppercase" }}>
                    {farmerUser?.phone ? t("ticket_farmer_phone_label") : "Google Account"}
                  </span>
                  <strong style={{ color: "var(--ink)", fontFamily: farmerUser?.phone ? "var(--font-mono)" : "inherit" }}>
                    {farmerUser?.phone ? farmerUser.phone : farmerUser?.email || "—"}
                  </strong>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                {/* 1. Ticket Type */}
                <div className="field-row">
                  <label htmlFor="ticket-type">{t("ticket_type_label")} *</label>
                  <select
                    id="ticket-type"
                    required
                    value={ticketType}
                    onChange={handleTypeChange}
                  >
                    <option value="">{t("ticket_type_placeholder")}</option>
                    {Object.keys(ticketTypesMap).map((typeKey) => (
                      <option key={typeKey} value={typeKey}>
                        {tTicketType(typeKey)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Ticket Subtype (Dependent on Ticket Type) */}
                <div className="field-row">
                  <label htmlFor="ticket-subtype">{t("ticket_subtype_label")} *</label>
                  <select
                    id="ticket-subtype"
                    required
                    disabled={!ticketType}
                    value={ticketSubtype}
                    onChange={(e) => {
                      setTicketSubtype(e.target.value);
                      if (error) setError("");
                    }}
                  >
                    <option value="">{t("ticket_subtype_placeholder")}</option>
                    {availableSubtypes.map((subKey) => (
                      <option key={subKey} value={subKey}>
                        {tTicketSubtype(subKey)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Description */}
                <div className="field-row">
                  <label htmlFor="ticket-desc">{t("ticket_desc_label")} *</label>
                  <textarea
                    id="ticket-desc"
                    required
                    rows={4}
                    value={description}
                    placeholder={t("ticket_desc_placeholder")}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (error) setError("");
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid var(--line)",
                      borderRadius: 4,
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      background: "var(--paper)",
                      resize: "vertical",
                    }}
                  />
                </div>

                {/* Location group: State, District, Village, Pincode */}
                <div
                  style={{
                    borderTop: "1px dashed var(--line)",
                    paddingTop: 16,
                    marginTop: 8,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--field)", marginBottom: 12 }}>
                    📍 {t("ticket_location_label")}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field-row">
                      <label htmlFor="ticket-state">{t("ticket_state_label")} *</label>
                      <select
                        id="ticket-state"
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                      >
                        {STATE_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field-row">
                      <label htmlFor="ticket-district">{t("ticket_district_label")} *</label>
                      <select
                        id="ticket-district"
                        required
                        value={district}
                        onChange={(e) => {
                          setDistrict(e.target.value);
                          if (error) setError("");
                        }}
                      >
                        {DISTRICT_OPTIONS.map((dist) => (
                          <option key={dist} value={dist}>
                            {tDistrict(dist)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                    <div className="field-row">
                      <label htmlFor="ticket-village">{t("ticket_village_label")} *</label>
                      <input
                        id="ticket-village"
                        type="text"
                        required
                        value={village}
                        placeholder={t("ticket_village_placeholder")}
                        onChange={(e) => {
                          setVillage(e.target.value);
                          if (error) setError("");
                        }}
                      />
                    </div>

                    <div className="field-row">
                      <label htmlFor="ticket-pincode">{t("ticket_pincode_label")} *</label>
                      <input
                        id="ticket-pincode"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={pincode}
                        placeholder={t("ticket_pincode_placeholder")}
                        onChange={handlePincodeChange}
                      />
                    </div>
                  </div>
                </div>

                <button className="btn" type="submit" disabled={submitting} style={{ width: "100%" }}>
                  {submitting ? t("ticket_submit_loading") : t("ticket_submit_btn")}
                </button>

                {error && <div className="error-text">{error}</div>}
              </form>
            </div>
          )}
        </div>
      )}

      {/* View 2: My Tickets List */}
      {activeTab === "my" && (
        <div style={{ maxWidth: 840 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 20 }}>{t("ticket_my_title")}</h2>
              <p style={{ fontSize: 13, color: "#8A8368", marginTop: 2 }}>{t("ticket_my_sub")}</p>
            </div>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 13, padding: "6px 14px" }}
              onClick={loadMyTickets}
              disabled={loadingTickets}
            >
              {loadingTickets ? "..." : "🔄 Refresh"}
            </button>
          </div>

          {ticketsError && <div className="error-text" style={{ marginBottom: 16 }}>{ticketsError}</div>}

          {loadingTickets && myTickets.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "#8A8368" }}>
              Loading your tickets...
            </div>
          ) : myTickets.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
              <h3 style={{ fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>
                {t("ticket_my_empty_title")}
              </h3>
              <p style={{ fontSize: 14, color: "#8A8368", maxWidth: 440, margin: "0 auto 20px" }}>
                {t("ticket_my_empty_sub")}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => setActiveTab("raise")}
              >
                ✍️ {t("ticket_empty_btn")}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {myTickets.map((tkt) => {
                const statusKey = tkt.status || "open";
                const isResolved = statusKey === "resolved";
                const isClosed = statusKey === "closed";
                const isInProgress = statusKey === "in_progress";

                let pillColorStyle = {
                  background: "rgba(201, 138, 43, 0.18)",
                  color: "#8C590E",
                  border: "1px solid rgba(201, 138, 43, 0.3)",
                };
                if (isResolved) {
                  pillColorStyle = {
                    background: "rgba(31, 61, 43, 0.12)",
                    color: "var(--field)",
                    border: "1px solid var(--field)",
                  };
                } else if (isClosed) {
                  pillColorStyle = {
                    background: "rgba(138, 131, 104, 0.15)",
                    color: "#6A6553",
                    border: "1px solid var(--line)",
                  };
                } else if (isInProgress) {
                  pillColorStyle = {
                    background: "rgba(43, 108, 176, 0.12)",
                    color: "#2B6CB0",
                    border: "1px solid rgba(43, 108, 176, 0.3)",
                  };
                }

                const createdDate = tkt.createdAt
                  ? new Date(tkt.createdAt).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", {
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
                        gap: 10,
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
                              ...pillColorStyle,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "2px 10px",
                            }}
                          >
                            {tTicketStatus(tkt.status)}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>
                          {tTicketType(tkt.ticketType)} ➔ {tTicketSubtype(tkt.ticketSubtype)}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#8A8368", textAlign: "right" }}>
                        <div>{t("ticket_created_label")}:</div>
                        <strong style={{ color: "var(--ink)" }}>{createdDate}</strong>
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#8A8368", textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>
                        {t("ticket_desc_view_label")}
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
                        📍 {tkt.village}, {tDistrict(tkt.district)}, {tkt.state} ({tkt.pincode})
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                        {tkt.farmerPhone ? `📞 ${tkt.farmerPhone}` : `✉️ ${tkt.farmerEmail}`} · {tkt.farmerName}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
