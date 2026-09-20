import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";
import { useConnectivity } from "../context/ConnectivityContext.jsx";
import CentreLocationMap from "../components/CentreLocationMap.jsx";
import {
  normalizeIndianMobile,
  validateIndianMobile,
  getImmediatePhoneFeedback,
} from "../utils/phone.js";

const CROP_OPTIONS = ["Paddy", "Wheat", "Pulses", "Maize", "Groundnut", "Cotton"];

export default function Register({ farmerUser }) {
  const { lang, t, tCrop, tDistrict, tCentre } = useLanguage();
  const { isOnline, addPendingRegistration } = useConnectivity();
  const todayStr = new Date().toISOString().split("T")[0];

  const [regMode, setRegMode] = useState("slotted"); // "slotted" | "live"
  const [centres, setCentres] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [userCoords, setUserCoords] = useState(null);

  const [form, setForm] = useState({
    name: farmerUser?.name || "",
    phone: farmerUser?.phone || "",
    crop: "",
    variety: "Common",
    declaredQuantity: "",
    declaredUnit: "bags",
    quantityKg: "",
    centreId: "",
    slotDate: todayStr,
    slotTime: "",
  });

  const [slotAvailability, setSlotAvailability] = useState([]);
  const [loadingSlotAvailability, setLoadingSlotAvailability] = useState(false);
  const [dateRange, setDateRange] = useState([]);
  const [loadingDateRange, setLoadingDateRange] = useState(false);
  const [earliestBookableDate, setEarliestBookableDate] = useState(todayStr);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [offlineQueued, setOfflineQueued] = useState(null); // Saved offline booking data
  const navigate = useNavigate();

  useEffect(() => {
    if (farmerUser) {
      setForm((f) => ({
        ...f,
        name: f.name || farmerUser.name || "",
        phone: f.phone || farmerUser.phone || "",
      }));
    }
  }, [farmerUser]);

  // Request location on mount or when crop is picked for proximity suggestions
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          // Graceful fallback: crowd-based suggestions without distance
        },
        { timeout: 8000, maximumAge: 60000 }
      );
    }
  }, []);

  useEffect(() => {
    api.getCentres().then(setCentres).catch(() => {
      if (isOnline) setError(t("err_load_centres"));
    });
  }, [t, isOnline]);

  // Fetch smart suggestions when crop or location changes
  useEffect(() => {
    if (!form.crop || !isOnline) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    api
      .getSuggestedCentres({
        crop: form.crop,
        lat: userCoords?.lat,
        lng: userCoords?.lng,
        limit: 4,
      })
      .then((res) => {
        setSuggestions(res.suggestions || []);
      })
      .catch(() => {
        setSuggestions([]);
      })
      .finally(() => {
        setSuggestionsLoading(false);
      });
  }, [form.crop, userCoords, isOnline]);

  // Fetch live 7-day crowd range availability when centre changes
  const loadDateRange = useCallback(
    async (cId) => {
      if (!cId || !isOnline || regMode !== "slotted") {
        setDateRange([]);
        return;
      }
      setLoadingDateRange(true);
      try {
        const data = await api.getCentreDateRangeAvailability(cId, 7);
        setDateRange(data?.dates || []);
        const earliest = data?.earliestBookableDate || data?.dates?.[0]?.date || todayStr;
        setEarliestBookableDate(earliest);
        setForm((f) => {
          if (!f.slotDate || f.slotDate < earliest) {
            return { ...f, slotDate: earliest };
          }
          return f;
        });
      } catch {
        setDateRange([]);
      } finally {
        setLoadingDateRange(false);
      }
    },
    [isOnline, regMode, todayStr]
  );

  useEffect(() => {
    if (form.centreId && regMode === "slotted") {
      loadDateRange(form.centreId);
    } else {
      setDateRange([]);
    }
  }, [form.centreId, regMode, loadDateRange]);

  // Fetch live slot availability when centre or date changes
  const loadSlotAvailability = useCallback(
    async (cId, sDate) => {
      if (!cId || !isOnline) {
        setSlotAvailability([]);
        return;
      }
      const targetDate = regMode === "live" ? todayStr : (sDate || todayStr);
      setLoadingSlotAvailability(true);
      try {
        const data = await api.getCentreSlotAvailability(cId, targetDate);
        setSlotAvailability(data?.slots || []);
        if (data?.earliestBookableDate && regMode === "slotted") {
          setEarliestBookableDate(data.earliestBookableDate);
          setForm((f) => {
            if (!f.slotDate || f.slotDate < data.earliestBookableDate) {
              return { ...f, slotDate: data.earliestBookableDate };
            }
            return f;
          });
        }
      } catch {
        setSlotAvailability([]);
      } finally {
        setLoadingSlotAvailability(false);
      }
    },
    [isOnline, todayStr, regMode]
  );

  useEffect(() => {
    if (form.centreId) {
      const targetDate = regMode === "live" ? todayStr : form.slotDate;
      if (targetDate) {
        loadSlotAvailability(form.centreId, targetDate);
      } else {
        setSlotAvailability([]);
      }
    } else {
      setSlotAvailability([]);
    }
  }, [form.centreId, form.slotDate, regMode, todayStr, loadSlotAvailability]);

  // If currently selected slot is full or passed, automatically shift to the first available slot
  useEffect(() => {
    if (slotAvailability.length > 0) {
      const cur = slotAvailability.find((s) => s.slotTime === form.slotTime);
      if (!cur || cur.isFull || cur.isPast) {
        const firstAvailable = slotAvailability.find((s) => !s.isFull && !s.isPast);
        if (firstAvailable) {
          setForm((f) => ({ ...f, slotTime: firstAvailable.slotTime }));
        }
      }
    }
  }, [slotAvailability, form.slotTime]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleNameChange(e) {
    const cleanName = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setForm((f) => ({ ...f, name: cleanName }));
    if (error) setError("");
  }

  function handlePhoneChange(e) {
    let raw = e.target.value;
    let clean = raw.replace(/[^\d+\s\-]/g, "").slice(0, 15);
    if (clean.indexOf("+") > 0) {
      clean = clean[0] === "+" ? "+" + clean.slice(1).replace(/\+/g, "") : clean.replace(/\+/g, "");
    }
    setForm((f) => ({ ...f, phone: clean }));
    if (error) setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError(t("err_name_required"));
      return;
    }

    const hasEmail = Boolean(farmerUser?.email);
    let normalizedPhone = null;
    if (form.phone && form.phone.trim()) {
      const phoneValidation = validateIndianMobile(form.phone, t("err_phone_invalid"));
      if (!phoneValidation.isValid) {
        setError(phoneValidation.error);
        return;
      }
      normalizedPhone = phoneValidation.normalized;
    } else if (!hasEmail) {
      setError(t("err_phone_invalid"));
      return;
    }

    if (!form.crop) {
      setError("Please select a crop");
      return;
    }

    const bagWeight = form.crop === "Paddy" ? 40 : (form.crop === "Groundnut" ? 40 : 50);
    const rawDeclaredQty = form.declaredQuantity || form.quantityKg;
    const numDeclaredQty = Number(rawDeclaredQty);

    if (!rawDeclaredQty || numDeclaredQty <= 0) {
      setError("Please enter a valid quantity greater than 0");
      return;
    }
    if (!form.centreId) {
      setError("Please select a procurement centre");
      return;
    }

    const currentUnit = form.declaredUnit || "bags";
    let computedKg = numDeclaredQty;
    if (currentUnit === "bags") computedKg = numDeclaredQty * bagWeight;
    else if (currentUnit === "tons") computedKg = numDeclaredQty * 1000;
    else if (currentUnit === "quintals") computedKg = numDeclaredQty * 100;

    const registrationPayload = {
      name: trimmedName,
      phone: normalizedPhone,
      email: farmerUser?.email || null,
      crop: form.crop,
      variety: form.crop === "Paddy" ? (form.variety || "Common") : null,
      declaredQuantity: numDeclaredQty,
      declaredUnit: currentUnit,
      quantityKg: computedKg,
      centreId: form.centreId,
    };

    // OFFLINE PATH: Queue locally into localStorage
    const selectedSlotTime = form.slotTime || (slotAvailability.find((s) => !s.isPast && !s.isFull)?.slotTime || null);

    if (!isOnline) {
      const offlineEntry = addPendingRegistration({
        ...registrationPayload,
        queueType: regMode,
        slotDate: regMode === "live" ? todayStr : form.slotDate || todayStr,
        slotTime: selectedSlotTime,
      });

      setOfflineQueued(offlineEntry);
      setForm((f) => ({ ...f, crop: "", declaredQuantity: "", quantityKg: "", centreId: "" }));
      return;
    }

    // ONLINE PATH
    setSubmitting(true);
    try {
      if (regMode === "live") {
        // Walk-in Live Queue Registration
        const res = await api.joinLiveQueue({
          ...registrationPayload,
          slotDate: todayStr,
          slotTime: selectedSlotTime,
        });
        const fidParam = res.farmer?.farmerId ? `&fid=${encodeURIComponent(res.farmer.farmerId)}` : "";
        navigate(`/status?id=${res.farmer.id}&new=1${fidParam}`);
      } else {
        // Slotted Advance Booking
        const { farmer } = await api.registerFarmer({
          ...registrationPayload,
          queueType: "slotted",
          slotDate: form.slotDate || todayStr,
          slotTime: selectedSlotTime,
        });
        const fidParam = farmer?.farmerId ? `&fid=${encodeURIComponent(farmer.farmerId)}` : "";
        navigate(`/status?id=${farmer.id}&new=1${fidParam}`);
      }
    } catch (err) {
      setError(err.message || t("slot_full_error"));
      if (form.centreId) {
        const targetDate = regMode === "live" ? todayStr : form.slotDate;
        loadSlotAvailability(form.centreId, targetDate);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div>
          <h1>{t("reg_hero_title")}</h1>
          <p>{t("reg_hero_sub")}</p>
        </div>
        <div className="hero-stub">
          <div className="stub-label">{t("reg_hero_stub_label")}</div>
          <div className="stub-value">{t("reg_hero_stub_value")}</div>
          <div className="stub-label">{t("reg_hero_stub_pos")}</div>
        </div>
      </section>

      {/* Offline Queued Confirmation Card */}
      {offlineQueued ? (
        <div className="card token-stub" style={{ maxWidth: 540, margin: "0 auto 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
          <h2 style={{ fontSize: 20, color: "var(--field)", marginBottom: 8 }}>
            {t("offline_reg_success_title")}
          </h2>
          <p style={{ fontSize: 14, color: "#4A4636", lineHeight: 1.45, marginBottom: 16 }}>
            {t("offline_reg_success_msg")}
          </p>

          <div
            style={{
              background: "rgba(201, 138, 43, 0.1)",
              border: "1px solid rgba(201, 138, 43, 0.3)",
              borderRadius: 6,
              padding: "12px 16px",
              fontSize: 13,
              color: "#8C590E",
              marginBottom: 20,
              lineHeight: 1.4,
            }}
          >
            ℹ️ <strong>{t("offline_reg_notice_honest")}</strong>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              type="button"
              className="btn"
              onClick={() => setOfflineQueued(null)}
            >
              ➕ Book Another Slot
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => navigate("/status")}
            >
              📋 {t("nav_status")}
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
          {!isOnline && (
            <div
              style={{
                background: "rgba(162, 59, 46, 0.1)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                padding: "10px 14px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>⚡</span>
              <span>{t("offline_reg_banner")}</span>
            </div>
          )}

          <h2 style={{ fontSize: 20, marginBottom: 16 }}>{t("reg_card_title")}</h2>

          {/* Registration Mode Upfront Choice Toggle */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              background: "rgba(35, 41, 31, 0.06)",
              padding: 4,
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              onClick={() => setRegMode("slotted")}
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                border: "none",
                background: regMode === "slotted" ? "#FFFFFF" : "transparent",
                color: regMode === "slotted" ? "var(--field)" : "#6B7280",
                fontWeight: 700,
                fontSize: 13,
                boxShadow: regMode === "slotted" ? "0 2px 6px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>📅</span>
              <span>{lang === "ta" ? "முன்பதிவு (தேதி/நேரம்)" : "Book Slot in Advance"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRegMode("live");
                setForm((f) => ({ ...f, slotDate: todayStr }));
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                border: "none",
                background: regMode === "live" ? "#FFFFFF" : "transparent",
                color: regMode === "live" ? "var(--field)" : "#6B7280",
                fontWeight: 700,
                fontSize: 13,
                boxShadow: regMode === "live" ? "0 2px 6px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>⚡</span>
              <span>{lang === "ta" ? "நேரலை வரிசை (இன்று)" : "Join Today's Live Queue"}</span>
            </button>
          </div>

          {regMode === "live" && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: 6,
                padding: "10px 14px",
                fontSize: 13,
                color: "#065F46",
                marginBottom: 16,
                lineHeight: 1.4,
              }}
            >
              ⚡ <strong>{lang === "ta" ? "நேரடி வருகை வரிசை:" : "Walk-in Live Queue:"}</strong>{" "}
              {lang === "ta"
                ? "இன்றைய தேதிக்கான நேரலை டோக்கன் உடனே வழங்கப்படும். மையத்தில் வருகை வரிசைப்படி உங்கள் முறை அழைக்கப்படும்."
                : "Get an instant walk-in token for today. Position and wait time will update live based on arrivals and centre processing pace."}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field-row">
              <label htmlFor="name">{t("reg_name_label")}</label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={handleNameChange}
              />
            </div>

            <div className="field-row">
              <label htmlFor="phone">
                {t("reg_phone_label")} {farmerUser?.email ? "(Optional)" : ""}
              </label>
              <input
                id="phone"
                type="tel"
                maxLength={15}
                required={!farmerUser?.email}
                placeholder={farmerUser?.email ? "e.g. 9876543210 (Optional)" : (t("signup_phone_placeholder") || "e.g. 9876543210")}
                value={form.phone}
                onChange={handlePhoneChange}
                style={getImmediatePhoneFeedback(form.phone, t("err_phone_invalid")).error ? { borderColor: "var(--danger, #dc3545)" } : {}}
              />
              {getImmediatePhoneFeedback(form.phone, t("err_phone_invalid")).error && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--danger, #dc3545)",
                    display: "block",
                    marginTop: 4,
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {getImmediatePhoneFeedback(form.phone, t("err_phone_invalid")).error}
                </span>
              )}
              {farmerUser?.email && !form.phone && (
                <div style={{ fontSize: 11, color: "#8A8368", marginTop: 4 }}>
                  ✉️ Token notifications will be linked to your Google account: <strong>{farmerUser.email}</strong>
                </div>
              )}
            </div>

            <div className="field-row">
              <label htmlFor="crop">{t("reg_crop_label")}</label>
              <select id="crop" required value={form.crop} onChange={(e) => update("crop", e.target.value)}>
                <option value="">{t("reg_crop_placeholder")}</option>
                {CROP_OPTIONS.map((crop) => (
                  <option key={crop} value={crop}>{tCrop(crop)}</option>
                ))}
              </select>
            </div>

            {/* Smart Suggested Centres Panel (when online) */}
            {isOnline && form.crop && suggestions.length > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  background: "linear-gradient(135deg, rgba(201, 138, 43, 0.08) 0%, rgba(31, 61, 43, 0.04) 100%)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--field)" }}>
                    💡 {t("suggested_centres_title")}
                  </span>
                  <span style={{ fontSize: 11, color: "#8A8368" }}>
                    {t("suggested_click_to_select")}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#4A4636", marginBottom: 10 }}>
                  {t("suggested_centres_sub")}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 8,
                  }}
                >
                  {suggestions.map((item) => {
                    const isSelected = form.centreId === item.id;
                    const dot = item.crowdStatus === "high" ? "🔴" : item.crowdStatus === "medium" ? "🟡" : "🟢";
                    return (
                      <div
                        key={item.id}
                        onClick={() => update("centreId", item.id)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 6,
                          border: isSelected ? "2px solid var(--field)" : "1px solid var(--line)",
                          background: isSelected ? "rgba(31, 61, 43, 0.08)" : "#fff",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          boxShadow: isSelected ? "0 2px 6px rgba(31, 61, 43, 0.15)" : "none",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", lineHeight: 1.3 }}>
                            {tCentre(item)}
                          </div>
                          <div style={{ fontSize: 11, color: "#8A8368", marginTop: 2 }}>
                            {tDistrict(item.district)}
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 11,
                          }}
                        >
                          <span className={`status-pill crowd-${item.crowdStatus || "low"}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                            {dot} {t(`crowd_${item.crowdStatus || "low"}`)}
                          </span>
                          {item.distanceKm !== null && (
                            <span style={{ color: "var(--field)", fontWeight: 600 }}>
                              📍 {item.distanceKm} km {t("distance_away")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Paddy Variety Selection */}
            {form.crop === "Paddy" && (
              <div className="field-row">
                <label htmlFor="variety">{t("receipt_variety_label") || "Paddy Variety"}</label>
                <select
                  id="variety"
                  value={form.variety || "Common"}
                  onChange={(e) => update("variety", e.target.value)}
                >
                  <option value="Common">{t("admin_verify_variety_common") || "Common (₹2,369 / Quintal)"}</option>
                  <option value="Fine">{t("admin_verify_variety_fine") || "Grade A / Fine (₹2,400 / Quintal)"}</option>
                </select>
              </div>
            )}

            {/* Quantity and Unit Input */}
            <div className="field-row">
              <label htmlFor="declaredQuantity">{t("reg_quantity_label")}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="declaredQuantity"
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="e.g. 65"
                  style={{ flex: 2 }}
                  value={form.declaredQuantity || form.quantityKg || ""}
                  onChange={(e) => {
                    update("declaredQuantity", e.target.value);
                    update("quantityKg", e.target.value);
                  }}
                />
                <select
                  id="declaredUnit"
                  value={form.declaredUnit || "bags"}
                  onChange={(e) => update("declaredUnit", e.target.value)}
                  style={{ flex: 1, minWidth: 110 }}
                >
                  <option value="bags">{t("unit_bags") || "Bags"}</option>
                  <option value="quintals">{t("unit_quintals") || "Quintals"}</option>
                  <option value="tons">{t("unit_tons") || "Tons"}</option>
                  <option value="kg">{t("unit_kg") || "kg"}</option>
                </select>
              </div>

              {/* Live Weight and Bag Conversion Indicator */}
              {(() => {
                const rawQ = Number(form.declaredQuantity || form.quantityKg);
                if (!rawQ || rawQ <= 0) return null;
                const bagWeight = form.crop === "Paddy" ? 40 : (form.crop === "Groundnut" ? 40 : 50);
                const unit = form.declaredUnit || "bags";
                let kg = rawQ;
                if (unit === "bags") kg = rawQ * bagWeight;
                else if (unit === "tons") kg = rawQ * 1000;
                else if (unit === "quintals") kg = rawQ * 100;
                const quintals = Math.round((kg / 100) * 100) / 100;
                const bags = Math.round((kg / bagWeight) * 10) / 10;

                return (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "var(--field)",
                      background: "rgba(31, 61, 43, 0.06)",
                      padding: "6px 10px",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    <span>
                      ⚖️ <strong>{kg.toLocaleString("en-IN")} KG</strong> ({quintals} Quintals / ~{bags} Bags)
                    </span>
                    <span style={{ fontSize: 11, color: "#8A8368" }}>
                      1 Bag = {bagWeight} KG for {form.crop || "crop"}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="field-row">
              <label htmlFor="centre">{t("reg_centre_label")}</label>
              <select id="centre" required value={form.centreId} onChange={(e) => update("centreId", e.target.value)}>
                <option value="">{t("reg_centre_placeholder")}</option>
                {centres.map((c) => {
                  const dot = c.crowdStatus === "high" ? "🔴" : c.crowdStatus === "medium" ? "🟡" : "🟢";
                  return (
                    <option key={c.id} value={c.id}>
                      {dot} {tCentre(c)} {c.district ? `(${tDistrict(c.district)})` : ""}
                    </option>
                  );
                })}
              </select>
              {(() => {
                const selected = centres.find((c) => c.id === form.centreId);
                if (!selected) return null;
                return (
                  <>
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 12px",
                        background: "rgba(35, 41, 31, 0.04)",
                        border: "1px solid var(--line)",
                        borderRadius: 4,
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <span style={{ color: "#4A4636" }}>
                        💡 <strong>{t("best_time_label")}:</strong>{" "}
                        {selected.bestTimeToVisit || t("best_time_no_data")}
                      </span>
                      <span className={`status-pill crowd-${selected.crowdStatus || "low"}`}>
                        {selected.crowdStatus === "high" ? "🔴" : selected.crowdStatus === "medium" ? "🟡" : "🟢"}{" "}
                        {t(`crowd_${selected.crowdStatus || "low"}`)}
                      </span>
                    </div>

                    {/* Visual Procurement Centre Location Map */}
                    <CentreLocationMap centre={selected} userCoords={userCoords} />
                  </>
                );
              })()}
            </div>

            {/* Date and Slot selection only shown in Slotted Mode */}
            {regMode === "slotted" && (
              <>
                {/* 7-Day Crowd Comparison View */}
                {dateRange.length > 0 && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: "12px 14px",
                      background: "rgba(35, 41, 31, 0.03)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                        📊 {t("compare_dates_title")}
                      </span>
                      {loadingDateRange && (
                        <span style={{ fontSize: 11, color: "#8A8368", fontStyle: "italic" }}>
                          🔄 {t("slot_loading_availability")}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#6A6553", marginBottom: 12 }}>
                      {t("compare_dates_sub")}
                    </div>

                    {/* Horizontal scrollable date cards */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
                        gap: 8,
                      }}
                    >
                      {dateRange.map((d) => {
                        const isSelected = form.slotDate === d.date;
                        const isFull = d.crowdLevel === "full";
                        const dot =
                          d.crowdLevel === "high" || d.crowdLevel === "full"
                            ? "🔴"
                            : d.crowdLevel === "medium"
                            ? "🟡"
                            : "🟢";
                        const dayLabel = d.isToday
                          ? t("today_label")
                          : d.isTomorrow
                          ? t("tomorrow_label")
                          : new Date(d.date).toLocaleDateString(
                              lang === "ta" ? "ta-IN" : "en-US",
                              { weekday: "short" }
                            );
                        const dateFormatted = new Date(d.date).toLocaleDateString(
                          lang === "ta" ? "ta-IN" : "en-US",
                          { month: "short", day: "numeric" }
                        );

                        return (
                          <button
                            key={d.date}
                            type="button"
                            onClick={() => update("slotDate", d.date)}
                            style={{
                              padding: "10px 6px",
                              borderRadius: 8,
                              border: isSelected
                                ? "2px solid var(--field)"
                                : "1px solid var(--line)",
                              background: isSelected
                                ? "rgba(31, 61, 43, 0.09)"
                                : isFull
                                ? "#F9FAFB"
                                : "#FFFFFF",
                              cursor: "pointer",
                              textAlign: "center",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 2,
                              boxShadow: isSelected
                                ? "0 2px 8px rgba(31, 61, 43, 0.16)"
                                : "none",
                              position: "relative",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {d.isLowestCrowd && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: -7,
                                  background: "var(--field)",
                                  color: "#FFFFFF",
                                  fontSize: 8,
                                  fontWeight: 800,
                                  padding: "1px 5px",
                                  borderRadius: 6,
                                  letterSpacing: "0.02em",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ★ {t("lowest_crowd_badge")}
                              </span>
                            )}
                            <div
                              style={{
                                fontWeight: isSelected ? 800 : 700,
                                fontSize: 12,
                                color: isSelected ? "var(--field)" : "var(--ink)",
                              }}
                            >
                              {dayLabel}
                            </div>
                            <div style={{ fontSize: 11, color: "#6A6553" }}>
                              {dateFormatted}
                            </div>
                            <span
                              className={`status-pill crowd-${d.crowdLevel}`}
                              style={{ fontSize: 9, padding: "1px 5px", marginTop: 2 }}
                            >
                              {dot} {t(`crowd_${d.crowdLevel}`)}
                            </span>
                            <div
                              style={{
                                fontSize: 10,
                                color: isFull ? "var(--danger)" : "#8A8368",
                                marginTop: 2,
                                fontWeight: isFull ? 700 : 400,
                              }}
                            >
                              {isFull ? t("slot_full_label") : `${d.availableSpots} left`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inline Alert: Suggest low-crowd alternative dates when selected date is moderate/high */}
                {(() => {
                  const currentDayInfo = dateRange.find((d) => d.date === form.slotDate);
                  const isCrowded =
                    currentDayInfo &&
                    (currentDayInfo.crowdLevel === "medium" ||
                      currentDayInfo.crowdLevel === "high" ||
                      currentDayInfo.crowdLevel === "full");
                  if (!isCrowded) return null;

                  const alternatives = dateRange
                    .filter((d) => d.date !== form.slotDate && d.crowdLevel === "low")
                    .slice(0, 2);

                  if (alternatives.length === 0) return null;

                  return (
                    <div
                      style={{
                        background: "rgba(201, 138, 43, 0.08)",
                        border: "1px solid rgba(201, 138, 43, 0.35)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        marginBottom: 16,
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#8C590E",
                          marginBottom: 6,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>💡</span>
                        <span>{t("less_crowded_available")}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {alternatives.map((alt) => {
                          const dayName = alt.isToday
                            ? t("today_label")
                            : alt.isTomorrow
                            ? t("tomorrow_label")
                            : new Date(alt.date).toLocaleDateString(
                                lang === "ta" ? "ta-IN" : "en-US",
                                { weekday: "short", month: "short", day: "numeric" }
                              );
                          return (
                            <button
                              key={alt.date}
                              type="button"
                              onClick={() => update("slotDate", alt.date)}
                              className="btn secondary"
                              style={{
                                fontSize: 11,
                                padding: "4px 10px",
                                background: "#FFFFFF",
                                borderColor: "rgba(201, 138, 43, 0.5)",
                                color: "#8C590E",
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <span>📅 {dayName} (🟢 {t("crowd_low")})</span>
                              <span>→</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="field-row">
                  <label htmlFor="slot-date">{t("reg_slot_date_label")}</label>
                  <input
                    id="slot-date"
                    type="date"
                    required
                    min={earliestBookableDate || todayStr}
                    value={form.slotDate}
                    onChange={(e) => update("slotDate", e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="field-row">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <label style={{ margin: 0 }}>
                  {regMode === "live"
                    ? (lang === "ta" ? "இன்றைய நேர இடைவெளி" : "Today's Time Slot")
                    : t("reg_slot_time_label")}
                </label>
                    {loadingSlotAvailability ? (
                      <span style={{ fontSize: 11, color: "#8A8368", fontStyle: "italic" }}>
                        🔄 {t("slot_loading_availability")}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#8A8368" }}>
                        {t("slot_capacity_hint")}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 10,
                      marginTop: 4,
                    }}
                  >
                    {slotAvailability && slotAvailability.length > 0 ? (
                      slotAvailability.map((avail) => {
                        const slot = avail.slotTime;
                        const isPast = Boolean(avail?.isPast);
                        const isFull = Boolean(avail?.isFull);
                        const isDisabled = isPast || isFull;
                        const isSelected = form.slotTime === slot && !isDisabled;
                        const crowd = avail?.crowdLevel || "low";

                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => {
                              if (!isDisabled) update("slotTime", slot);
                            }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              padding: "12px 14px",
                              borderRadius: 8,
                              border: isSelected
                                ? "2px solid var(--field)"
                                : isDisabled
                                ? "1px solid #E5E7EB"
                                : "1px solid var(--line)",
                              background: isSelected
                                ? "rgba(31, 61, 43, 0.08)"
                                : isDisabled
                                ? "#F3F4F6"
                                : "#fff",
                              cursor: isDisabled ? "not-allowed" : "pointer",
                              opacity: isDisabled ? 0.6 : 1,
                              textAlign: "left",
                              transition: "all 0.15s ease",
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                width: "100%",
                                marginBottom: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: isSelected ? 700 : 600,
                                  fontSize: 13,
                                  color: isDisabled ? "#9CA3AF" : "var(--ink)",
                                }}
                              >
                                ⏰ {slot}
                              </span>
                              {isPast ? (
                                <span
                                  style={{
                                    background: "#E5E7EB",
                                    color: "#4B5563",
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "2px 6px",
                                    borderRadius: 10,
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  {t("slot_passed_badge") || "⏳ PASSED"}
                                </span>
                              ) : isFull ? (
                                <span
                                  style={{
                                    background: "#FEE2E2",
                                    color: "#DC2626",
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "2px 6px",
                                    borderRadius: 10,
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  {t("slot_full_badge")}
                                </span>
                              ) : (
                                <span
                                  className={`status-pill crowd-${crowd}`}
                                  style={{ fontSize: 10, padding: "2px 6px" }}
                                >
                                  {crowd === "high" || crowd === "full"
                                    ? "🔴"
                                    : crowd === "medium"
                                    ? "🟡"
                                    : "🟢"}{" "}
                                  {t(`slot_crowd_${crowd}`)}
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: isPast
                                  ? "#6B7280"
                                  : isFull
                                  ? "#DC2626"
                                  : isSelected
                                  ? "var(--field)"
                                  : "#6A6553",
                                fontWeight: isSelected ? 600 : 400,
                              }}
                            >
                              {isPast
                                ? `⏳ ${t("slot_passed_label") || "Slot Passed"}`
                                : isFull
                                ? `⛔ ${t("slot_full_label")}`
                                : avail
                                ? `✓ ${t("slot_spots_left").replace("{spots}", `${avail.availableSpots}/${avail.capacity}`)}`
                                : `ℹ️ ${t("slot_select_centre_prompt")}`}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div style={{ color: "#8A8368", fontSize: 13, fontStyle: "italic", padding: "12px 0" }}>
                        ℹ️ {t("slot_select_centre_prompt")}
                      </div>
                    )}
                  </div>
                </div>

            <button className="btn" type="submit" disabled={submitting} style={{ width: "100%", marginTop: 12 }}>
              {submitting
                ? t("reg_btn_submitting")
                : !isOnline
                ? t("offline_btn_submit")
                : regMode === "live"
                ? (lang === "ta" ? "⚡ நேரலை டோக்கன் பெறுக" : "⚡ Join Live Queue Now")
                : t("reg_btn")}
            </button>
            {error && <div className="error-text">{error}</div>}
          </form>
        </div>
      )}
    </>
  );
}
