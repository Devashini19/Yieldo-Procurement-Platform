import { useState, useRef, useEffect } from "react";
import { useLanguage } from "../i18n.js";

// Web Audio API programmatically generated 2-tone chime (zero external audio dependency)
export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.25);

    // Tone 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // Gracefully ignore audio restrictions if any
  }
}

export default function NotificationBell({
  notifications = [],
  onMarkRead,
  onMarkAllRead,
}) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function formatTime(timestamp) {
    if (!timestamp) return "";
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 45) return t("notif_just_now");
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} ${t("notif_min_ago")}`;
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={t("notif_panel_title")}
        style={{
          background: isOpen ? "rgba(201, 138, 43, 0.15)" : "transparent",
          border: "1px solid var(--line)",
          borderRadius: "50%",
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
          fontSize: 16,
          color: "var(--ink)",
        }}
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              background: "var(--danger)",
              color: "#fff",
              borderRadius: 10,
              minWidth: 18,
              height: 18,
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 360,
            maxWidth: "90vw",
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
            zIndex: 1000,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: "var(--field)",
              color: "var(--paper)",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t("notif_panel_title")}</span>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: "var(--wheat)",
                    color: "var(--ink)",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: 10,
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onMarkAllRead) onMarkAllRead();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--wheat-light)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                {t("notif_mark_all_read")}
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div
            style={{
              maxHeight: 360,
              overflowY: "auto",
              background: "var(--paper)",
            }}
          >
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "32px 20px",
                  textAlign: "center",
                  color: "#8A8368",
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 6 }}>📭</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", marginBottom: 4 }}>
                  {t("notif_empty")}
                </div>
                <div style={{ fontSize: 12 }}>{t("notif_empty_sub")}</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!item.read && onMarkRead) onMarkRead(item.id);
                    }}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--line)",
                      background: item.read ? "#fff" : "rgba(201, 138, 43, 0.08)",
                      borderLeft: item.read ? "4px solid transparent" : "4px solid var(--wheat)",
                      cursor: item.read ? "default" : "pointer",
                      transition: "background 0.2s ease",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 3,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: "var(--font-mono)",
                            fontWeight: 700,
                            color: item.read ? "#8A8368" : "var(--field)",
                          }}
                        >
                          {item.tokenId ? `Token ${item.tokenId}` : item.title}
                        </span>
                        <span style={{ fontSize: 11, color: "#8A8368" }}>
                          {formatTime(item.timestamp)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: item.read ? 400 : 600,
                          color: "var(--ink)",
                          lineHeight: 1.35,
                        }}
                      >
                        {item.message}
                      </div>
                    </div>

                    {!item.read && onMarkRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead(item.id);
                        }}
                        title={t("notif_mark_read_btn")}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--field)",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "2px 4px",
                        }}
                      >
                        ✓
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
