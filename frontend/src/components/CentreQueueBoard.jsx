import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";

export default function CentreQueueBoard({ centreId, myTokenId }) {
  const { t, tCrop, tDistrict, tCentre } = useLanguage();
  const [queueData, setQueueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadQueue = useCallback(async (id) => {
    if (!id) return;
    try {
      const data = await api.getCentrePublicQueue(id);
      setQueueData(data);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load live queue board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadQueue(centreId);
  }, [centreId, loadQueue]);

  // Auto-refresh every 8s alongside Status polling
  useEffect(() => {
    if (!centreId) return;
    const interval = setInterval(() => {
      loadQueue(centreId);
    }, 8000);
    return () => clearInterval(interval);
  }, [centreId, loadQueue]);

  if (!centreId) return null;

  const centre = queueData?.centre;
  const nowServing = queueData?.nowServing;
  const queue = queueData?.queue || [];
  const isNowServingMe = nowServing && myTokenId && nowServing.id === myTokenId;

  return (
    <div style={{ marginTop: 28 }}>
      {/* Centre Live Queue Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 16, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>📺</span>
            <span>
              {t("centre_queue_title")} — {centre ? tCentre(centre.name || centre.id) : ""}
            </span>
          </h3>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            color: "#1F3D2B",
            background: "rgba(31, 61, 43, 0.12)",
            padding: "2px 8px",
            borderRadius: 12,
            letterSpacing: "0.04em",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#2E5940",
              display: "inline-block",
            }}
          />
          {t("centre_queue_live_badge")}
        </span>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      {loading && !queueData && (
        <div className="card" style={{ textAlign: "center", padding: "20px", color: "#8A8368", fontSize: 13 }}>
          Loading centre live queue...
        </div>
      )}

      {queueData && (
        <div className="card" style={{ padding: "20px" }}>
          {/* NOW SERVING HERO BANNER */}
          <div
            style={{
              background: isNowServingMe
                ? "linear-gradient(135deg, rgba(31, 61, 43, 0.15) 0%, rgba(201, 138, 43, 0.15) 100%)"
                : "linear-gradient(135deg, rgba(201, 138, 43, 0.12) 0%, rgba(31, 61, 43, 0.05) 100%)",
              border: isNowServingMe ? "2px solid var(--field)" : "1.5px solid var(--wheat)",
              borderRadius: 6,
              padding: "16px",
              marginBottom: 16,
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--field)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                📢 {t("centre_queue_now_serving")}
              </div>
              {isNowServingMe && (
                <span
                  style={{
                    background: "var(--field)",
                    color: "var(--paper)",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  ★ YOUR TURN
                </span>
              )}
            </div>

            {nowServing ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 28,
                      fontWeight: 700,
                      color: "var(--field)",
                      letterSpacing: "0.04em",
                      lineHeight: 1.1,
                    }}
                  >
                    {nowServing.id}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#4A4636", marginTop: 3 }}>
                    {tCrop(nowServing.crop)} · {nowServing.quantityKg} kg
                  </div>
                </div>

                <div>
                  <span
                    className="status-pill"
                    style={{
                      background: "var(--field)",
                      color: "var(--paper)",
                      fontSize: 12,
                      padding: "4px 10px",
                      fontWeight: 600,
                    }}
                  >
                    {t(`stage_${nowServing.status}`) || nowServing.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "10px 0", color: "#8A8368", fontSize: 13 }}>
                {t("centre_queue_no_active")}
              </div>
            )}
          </div>

          {/* UP NEXT QUEUE LIST */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                {t("centre_queue_up_next")} ({queue.filter((f) => !f.isServing).length})
              </div>
              <div style={{ fontSize: 11, color: "#8A8368" }}>
                {t("centre_queue_anonymized_note")}
              </div>
            </div>

            {queue.filter((f) => !f.isServing).length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px", color: "#8A8368", fontSize: 13 }}>
                {t("centre_queue_empty_queue")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {queue
                  .filter((f) => !f.isServing)
                  .map((item, index) => {
                    const displayStatus = t(`stage_${item.status}`) || item.status.replace("_", " ");
                    const isMyToken = myTokenId && item.id === myTokenId;
                    const isNext = index === 0;

                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 6,
                          border: isMyToken
                            ? "2px solid var(--field)"
                            : isNext
                            ? "1.5px solid var(--wheat)"
                            : "1px solid var(--line)",
                          background: isMyToken
                            ? "rgba(31, 61, 43, 0.08)"
                            : isNext
                            ? "rgba(201, 138, 43, 0.06)"
                            : "#fff",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              fontSize: 12,
                              color: isMyToken ? "var(--field)" : isNext ? "var(--wheat)" : "#8A8368",
                              minWidth: 24,
                            }}
                          >
                            #{item.position}
                          </span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14 }}>
                                {item.id}
                              </span>
                              {isMyToken && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontFamily: "var(--font-mono)",
                                    background: "var(--field)",
                                    color: "var(--paper)",
                                    padding: "1px 6px",
                                    borderRadius: 3,
                                    fontWeight: 700,
                                  }}
                                >
                                  YOU
                                </span>
                              )}
                              {isNext && !isMyToken && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontFamily: "var(--font-mono)",
                                    background: "var(--wheat)",
                                    color: "var(--ink)",
                                    padding: "1px 5px",
                                    borderRadius: 3,
                                    fontWeight: 700,
                                  }}
                                >
                                  NEXT
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: "#4A4636", marginTop: 2 }}>
                              {tCrop(item.crop)} · {item.quantityKg} kg
                              {item.rescheduledCount > 0 && (
                                <span style={{ color: "#B45309", fontWeight: 600, marginLeft: 4 }}>
                                  · 🕒 {item.rescheduledCount}x
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <span className="status-pill" style={{ fontSize: 10 }}>
                            {displayStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
