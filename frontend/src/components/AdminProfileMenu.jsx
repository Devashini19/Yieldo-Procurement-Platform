import { useState, useRef, useEffect } from "react";
import { api } from "../api.js";

function formatDateTime(timestamp) {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return String(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

export default function AdminProfileMenu({ adminToken, adminUser, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState(adminUser || null);
  const [loading, setLoading] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef(null);

  // Fetch or refresh admin profile directly from backend
  const fetchProfile = async () => {
    if (!adminToken) return;
    try {
      setLoading(true);
      const res = await api.getAdminProfile(adminToken);
      if (res && res.admin) {
        setProfile(res.admin);
      }
    } catch (err) {
      console.warn("Failed to load admin profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [adminToken]);

  // Refresh profile whenever dropdown or modal is opened
  useEffect(() => {
    if (isOpen || showRecordsModal) {
      fetchProfile();
    }
  }, [isOpen, showRecordsModal]);

  // Close on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (showRecordsModal) {
          setShowRecordsModal(false);
        } else {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showRecordsModal]);

  function handleLogoutClick() {
    setIsOpen(false);
    setShowRecordsModal(false);
    if (onLogout) onLogout();
  }

  function handleOpenRecordsModal() {
    setShowRecordsModal(true);
    setIsOpen(false);
  }

  const displayName = profile?.name || "Admin Officer";
  const initial = (displayName.trim()[0] || "A").toUpperCase();
  const phoneDisplay = profile?.phone || "Not provided";
  const emailDisplay = profile?.email || "Not provided";
  const districtDisplay = profile?.district || "Not provided";
  const centreDisplay = profile?.procurementCentreName || "Not provided";
  const adminIdDisplay = profile?.adminId || "OFFICER";

  // Procurements Handled: derived from admin's own list, fetched from backend
  const records = Array.isArray(profile?.procurementsHandled)
    ? profile.procurementsHandled
    : [];
  const handledCount = records.length;

  // Real-time search filter for Farmer ID (case-insensitive)
  const cleanSearch = searchQuery.trim().toLowerCase();
  const filteredRecords = records.filter((rec) => {
    if (!cleanSearch) return true;
    const fid = (rec.farmerId || "").toLowerCase();
    const tid = (rec.tokenId || "").toLowerCase();
    return fid.includes(cleanSearch) || tid.includes(cleanSearch);
  });

  return (
    <>
      <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
        {/* Top-right Avatar / Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: isOpen ? "rgba(201, 138, 43, 0.25)" : "rgba(255, 255, 255, 0.12)",
            border: isOpen ? "1.5px solid var(--wheat)" : "1px solid rgba(255, 255, 255, 0.25)",
            borderRadius: 24,
            padding: "4px 12px 4px 4px",
            cursor: "pointer",
            transition: "all 0.18s ease",
            color: "var(--paper, #ffffff)",
            fontFamily: "var(--font-body)",
          }}
        >
          {/* Avatar circle with initial */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--wheat)",
              color: "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 15,
              fontFamily: "var(--font-mono)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            {initial}
          </div>

          <div style={{ textAlign: "left", lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 700, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 10, opacity: 0.75, fontFamily: "var(--font-mono)" }}>
              OFFICER
            </div>
          </div>

          <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 2 }}>
            {isOpen ? "▲" : "▼"}
          </span>
        </button>

        {/* Admin Profile Dropdown */}
        {isOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 320,
              background: "var(--field, #1f3d2b)",
              color: "var(--paper, #ffffff)",
              border: "1px solid var(--field-light, rgba(255, 255, 255, 0.2))",
              borderRadius: 10,
              boxShadow: "0 12px 36px rgba(0, 0, 0, 0.35)",
              zIndex: 1000,
              padding: "18px 20px",
              animation: "fadeIn 0.15s ease-out",
            }}
          >
            {/* Header with Officer Portal Badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  background: "var(--wheat)",
                  color: "var(--ink)",
                  padding: "2px 6px",
                  borderRadius: 3,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                }}
              >
                OFFICER PORTAL
              </span>
              <span style={{ fontSize: 11, opacity: 0.75, fontFamily: "var(--font-mono)" }}>
                {adminIdDisplay}
              </span>
            </div>

            {/* Profile Identity Summary */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid rgba(255, 255, 255, 0.12)" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--wheat)",
                  color: "var(--ink)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 20,
                  fontFamily: "var(--font-mono)",
                  flexShrink: 0,
                }}
              >
                {initial}
              </div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--paper)" }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 12, color: "var(--wheat)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {adminIdDisplay}
                </div>
              </div>
            </div>

            {/* Profile Details List */}
            <div style={{ padding: "14px 0", fontSize: 13, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Phone Number
                </div>
                <div style={{ fontWeight: 600, marginTop: 2, color: "var(--paper)" }}>
                  {phoneDisplay}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Mail ID
                </div>
                <div style={{ fontWeight: 600, marginTop: 2, color: "var(--paper)", wordBreak: "break-all" }}>
                  {emailDisplay}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    District
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 2, color: "var(--paper)" }}>
                    {districtDisplay}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Procurement Centre Name
                </div>
                <div style={{ fontWeight: 600, marginTop: 2, color: "var(--paper)" }}>
                  {centreDisplay}
                </div>
              </div>

              {/* Requirement 6: Procurements Handled Count & View Records Link */}
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  marginTop: 4,
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--wheat)" }}>
                  Procurements Handled
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <span
                    id="procurements-handled-count"
                    onClick={handleOpenRecordsModal}
                    style={{
                      fontWeight: 800,
                      fontSize: 16,
                      color: "var(--wheat)",
                      fontFamily: "var(--font-mono)",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                    title="Click to view records"
                  >
                    {handledCount}
                  </span>
                  <button
                    type="button"
                    id="view-procurement-records-btn"
                    onClick={handleOpenRecordsModal}
                    style={{
                      background: "rgba(201, 138, 43, 0.2)",
                      border: "1px solid var(--wheat)",
                      color: "var(--wheat)",
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    View Records →
                  </button>
                </div>
              </div>
            </div>

            {/* Logout Action */}
            <div style={{ paddingTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.12)" }}>
              <button
                type="button"
                onClick={handleLogoutClick}
                className="btn"
                style={{
                  width: "100%",
                  background: "rgba(162, 59, 46, 0.25)",
                  color: "#FFA89B",
                  border: "1px solid rgba(162, 59, 46, 0.5)",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "8px 12px",
                  borderRadius: 4,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                ⎋ Admin Logout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Requirement 7: Procurements Handled View Records + Real-time Search Modal */}
      {showRecordsModal && (
        <div
          id="procurements-handled-modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target.id === "procurements-handled-modal-backdrop") {
              setShowRecordsModal(false);
            }
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 640,
              width: "100%",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              background: "var(--field, #1f3d2b)",
              color: "var(--paper, #ffffff)",
              border: "1px solid var(--field-light, rgba(255, 255, 255, 0.2))",
              borderRadius: 12,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
              padding: "24px 28px",
              boxSizing: "border-box",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      background: "var(--wheat)",
                      color: "var(--ink)",
                      padding: "2px 6px",
                      borderRadius: 3,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                    }}
                  >
                    OFFICER PORTAL
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.75, fontFamily: "var(--font-mono)" }}>
                    {adminIdDisplay}
                  </span>
                </div>
                <h3 style={{ fontSize: 20, margin: 0, color: "var(--paper)" }}>
                  🌾 Procurements Handled ({handledCount})
                </h3>
                <p style={{ fontSize: 12, color: "rgba(251, 246, 236, 0.75)", margin: "4px 0 0 0" }}>
                  Verified produce procurements completed by Officer {displayName} ({adminIdDisplay}).
                </p>
              </div>

              <button
                type="button"
                id="close-procurement-records-btn"
                onClick={() => setShowRecordsModal(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "none",
                  borderRadius: 6,
                  width: 32,
                  height: 32,
                  color: "var(--paper)",
                  fontSize: 16,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={{ position: "absolute", left: 12, opacity: 0.6, fontSize: 14 }}>
                  🔍
                </span>
                <input
                  id="procurement-search-input"
                  type="text"
                  placeholder="Search by Farmer ID (e.g. VPM-F-000045)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 38px 10px 36px",
                    borderRadius: 6,
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    background: "rgba(0, 0, 0, 0.25)",
                    color: "var(--paper)",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    style={{
                      position: "absolute",
                      right: 10,
                      background: "transparent",
                      border: "none",
                      color: "rgba(255, 255, 255, 0.6)",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 4,
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Records List Body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                background: "rgba(0, 0, 0, 0.15)",
                minHeight: 180,
              }}
            >
              {records.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(251, 246, 236, 0.65)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>No procurements handled yet.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    When you verify produce and release digital receipts in the queue, records will appear here.
                  </div>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(251, 246, 236, 0.65)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--wheat)" }}>No records found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    No procurements match "{searchQuery}".
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    style={{
                      marginTop: 12,
                      background: "rgba(255, 255, 255, 0.1)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      color: "var(--paper)",
                      padding: "6px 12px",
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: "rgba(0, 0, 0, 0.3)",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "var(--wheat)",
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        <th style={{ padding: "10px 14px", width: 36 }}>#</th>
                        <th style={{ padding: "10px 14px" }}>Farmer ID</th>
                        <th style={{ padding: "10px 14px" }}>Farmer Identity</th>
                        <th style={{ padding: "10px 14px" }}>Crop</th>
                        <th style={{ padding: "10px 14px" }}>Complete Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((item, idx) => (
                        <tr
                          key={item.tokenId || item.farmerId || idx}
                          style={{
                            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                            background: idx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.02)",
                          }}
                        >
                          <td style={{ padding: "10px 14px", opacity: 0.6, fontSize: 12 }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--wheat)" }}>
                              {item.farmerId}
                            </div>
                            {item.farmerName && (
                              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>
                                {item.farmerName}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            {item.identityType === "google" || item.email ? (
                              <span title="Google Identity">
                                🌐 {item.email || item.identityValue}
                              </span>
                            ) : (
                              <span title="Phone Identity">
                                📱 {item.phone || item.identityValue}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span
                              style={{
                                background: "rgba(255, 255, 255, 0.08)",
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {item.crop || "Paddy"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12, opacity: 0.9 }}>
                            {formatDateTime(item.completedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Read-Only Notice Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 14,
                marginTop: 14,
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                fontSize: 12,
                color: "rgba(251, 246, 236, 0.65)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>🔒</span>
                <span>Read-only official verification log linked to Digital Receipt release.</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRecordsModal(false)}
                className="btn secondary"
                style={{
                  padding: "6px 16px",
                  fontSize: 12,
                  background: "rgba(255, 255, 255, 0.12)",
                  color: "var(--paper)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
