import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n.js";
import { api } from "../api.js";

export default function FarmerProfileMenu({ farmerUser, onLogout }) {
  const { lang, setLang, t, tCrop, tCentre } = useLanguage();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  const identifier = farmerUser?.identifier || farmerUser?.phone || farmerUser?.email;

  // Fetch or refresh profile details
  const fetchProfile = async () => {
    if (!identifier) return;
    try {
      setLoading(true);
      const data = await api.getFarmerProfile(identifier, farmerUser?.name);
      if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.warn("Failed to load farmer profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [identifier]);

  // Refresh profile whenever menu is opened
  useEffect(() => {
    if (isOpen) {
      fetchProfile();
    }
  }, [isOpen]);

  // Close on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleNavigate(path) {
    setIsOpen(false);
    navigate(path);
  }

  function handleLogoutClick() {
    setIsOpen(false);
    if (onLogout) onLogout();
  }

  // Format member since date
  const memberSinceFormatted = (() => {
    const raw = profile?.memberSince;
    if (!raw) return "—";
    try {
      const d = new Date(raw);
      return d.toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return String(raw).split("T")[0];
    }
  })();

  const displayName = profile?.name || farmerUser?.name || "Farmer";
  const displayIdentifier = profile?.identifier || identifier || "";
  const initial = (displayName.trim()[0] || "F").toUpperCase();
  const isGoogleAuth = profile?.loginMethod === "google" || farmerUser?.googleAuth || identifier?.includes("@");

  const totalTransactions = profile?.totalTransactions ?? 0;
  const totalQtyKg = profile?.totalQuantitySoldKg ?? 0;
  const totalEarned = profile?.totalAmountEarned ?? 0;
  const activeToken = profile?.activeToken;

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Profile Avatar / Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="profile-trigger-btn"
        title={t("profile_menu_title")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: isOpen ? "rgba(31, 61, 43, 0.12)" : "rgba(31, 61, 43, 0.05)",
          border: isOpen ? "1.5px solid var(--field)" : "1px solid var(--line)",
          borderRadius: 24,
          padding: "4px 10px 4px 4px",
          cursor: "pointer",
          transition: "all 0.18s ease",
          fontFamily: "var(--font-body)",
          color: "rgba(255, 255, 255, 0.92)",
        }}
      >
        {farmerUser?.picture ? (
          <img
            src={farmerUser.picture}
            alt={displayName}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1.5px solid var(--field)",
            }}
          />
        ) : (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--wheat)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
            }}
          >
            {initial}
          </div>
        )}

        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 110,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "rgba(255, 255, 255, 0.92)",
          }}
        >
          {displayName}
        </span>

        <span
          style={{
            fontSize: 10,
            color: "rgba(255, 255, 255, 0.70)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.18s ease",
          }}
        >
          ▼
        </span>
      </button>

      {/* Profile Dropdown Panel */}
      {isOpen && (
        <div
          className="farmer-profile-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 350,
            maxWidth: "92vw",
            background: "#ffffff",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.16)",
            zIndex: 1100,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header Section (Token-Stub Motif) */}
          <div
            style={{
              background: "linear-gradient(135deg, #1f3d2b 0%, #294d37 100%)",
              color: "#ffffff",
              padding: "16px 16px 14px 16px",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {farmerUser?.picture ? (
                <img
                  src={farmerUser.picture}
                  alt={displayName}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid var(--wheat)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                    flexShrink: 0,
                  }}
                />
              ) : (
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
                    fontSize: 18,
                    fontWeight: 800,
                    fontFamily: "var(--font-mono)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                    flexShrink: 0,
                  }}
                >
                  {initial}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#ffffff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 10,
                      background: isGoogleAuth ? "rgba(255, 255, 255, 0.2)" : "rgba(201, 138, 43, 0.35)",
                      color: isGoogleAuth ? "#fff" : "var(--wheat-light)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isGoogleAuth ? `🌐 ${t("profile_badge_google")}` : `📱 ${t("profile_badge_phone")}`}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255, 255, 255, 0.82)",
                    marginTop: 2,
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayIdentifier}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--wheat-light)",
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>📅</span>
                  <span>
                    {t("profile_member_since")}: <strong>{memberSinceFormatted}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Row (Reusing Procurement History card stats motif) */}
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(31, 61, 43, 0.02)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#6A6553",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              📊 {t("profile_stats_title")}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
              }}
            >
              {/* Stat 1: Transactions */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 6px",
                  textAlign: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ fontSize: 10, color: "#6A6553", fontWeight: 600 }}>
                  {t("profile_total_transactions")}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: "var(--field)",
                    fontFamily: "var(--font-mono)",
                    marginTop: 2,
                  }}
                >
                  {totalTransactions}
                </div>
              </div>

              {/* Stat 2: Quantity Sold */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 6px",
                  textAlign: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ fontSize: 10, color: "#6A6553", fontWeight: 600 }}>
                  {t("profile_total_sold")}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "var(--field)",
                    fontFamily: "var(--font-mono)",
                    marginTop: 2,
                  }}
                >
                  {totalQtyKg >= 1000 ? `${(totalQtyKg / 1000).toFixed(1)} T` : `${totalQtyKg} KG`}
                </div>
              </div>

              {/* Stat 3: Amount Earned */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 6px",
                  textAlign: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ fontSize: 10, color: "#6A6553", fontWeight: 600 }}>
                  {t("profile_total_earned")}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#8C590E",
                    fontFamily: "var(--font-mono)",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  ₹{totalEarned.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          </div>

          {/* Active Token Section */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--line)",
              background: activeToken ? "rgba(201, 138, 43, 0.05)" : "transparent",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6A6553", textTransform: "uppercase" }}>
                🎫 {t("profile_active_token")}
              </span>
              {activeToken && (
                <span className={`status-pill ${activeToken.status}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                  {activeToken.status.replace("_", " ")}
                </span>
              )}
            </div>

            {activeToken ? (
              <div
                onClick={() => handleNavigate(`/status?id=${encodeURIComponent(activeToken.id)}`)}
                style={{
                  background: "#ffffff",
                  border: "1.5px solid var(--field)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 13, color: "var(--field)" }}>
                    {activeToken.id} · <span style={{ fontWeight: 600, color: "var(--ink)" }}>{tCrop(activeToken.crop)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6A6553", marginTop: 2 }}>
                    📍 {tCentre(activeToken.centreName)}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--field)" }}>
                  {t("profile_quick_link")}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: "#8A8368",
                  padding: "4px 0",
                  fontStyle: "italic",
                }}
              >
                {t("profile_no_active_token")}
              </div>
            )}
          </div>

          {/* Quick Action Navigation Links */}
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
            {/* View Full History */}
            <button
              type="button"
              onClick={() => handleNavigate("/status?tab=history")}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: "8px 10px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(31, 61, 43, 0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>📜</span>
                <span>{t("profile_view_history")}</span>
              </div>
              <span style={{ color: "#8A8368", fontSize: 11 }}>→</span>
            </button>

            {/* Raise Support Ticket */}
            <button
              type="button"
              onClick={() => handleNavigate("/tickets")}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: "8px 10px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(31, 61, 43, 0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>🎫</span>
                <span>{t("profile_raise_ticket")}</span>
              </div>
              <span style={{ color: "#8A8368", fontSize: 11 }}>→</span>
            </button>
          </div>

          {/* Footer: Language Switcher & Logout */}
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(35, 41, 31, 0.03)",
              borderTop: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Language toggle inside panel */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                className={`lang-btn ${lang === "en" ? "active" : ""}`}
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => setLang("en")}
              >
                EN
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === "ta" ? "active" : ""}`}
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => setLang("ta")}
              >
                தமிழ்
              </button>
            </div>

            {/* Consolidated Logout Button */}
            <button
              type="button"
              onClick={handleLogoutClick}
              style={{
                background: "none",
                border: "1px solid rgba(162, 59, 46, 0.3)",
                color: "var(--danger)",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--danger)";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "var(--danger)";
              }}
            >
              <span>🚪</span>
              <span>{t("nav_logout")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
