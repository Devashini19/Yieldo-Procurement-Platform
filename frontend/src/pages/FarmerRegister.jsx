import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";
import {
  normalizeIndianMobile,
  validateIndianMobile,
  getImmediatePhoneFeedback,
} from "../utils/phone.js";

// Lightweight JWT decoder for Google ID token credential
function decodeJwtCredential(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error("Failed to decode Google JWT:", err);
    return null;
  }
}

const DISTRICT_OPTIONS = [
  { name: "Thanjavur", code: "THJ" },
  { name: "Villupuram", code: "VPM" },
  { name: "Cuddalore", code: "CDL" },
];

const CROP_OPTIONS = [
  { name: "Paddy", icon: "🌾" },
  { name: "Wheat", icon: "🌾" },
  { name: "Pulses", icon: "🫘" },
  { name: "Millets", icon: "🌾" },
  { name: "Groundnut", icon: "🥜" },
  { name: "Sugarcane", icon: "🎋" },
  { name: "Maize", icon: "🌽" },
  { name: "Cotton", icon: "☁️" },
];

export default function FarmerRegister() {
  const { t, tCrop, tDistrict } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Prefill state if redirected from login
  const incomingState = location.state || {};

  const [isGoogleFlow, setIsGoogleFlow] = useState(
    Boolean(incomingState.googleAuth && incomingState.email)
  );
  const [googleUser, setGoogleUser] = useState(
    incomingState.googleAuth && incomingState.email
      ? {
          name: incomingState.name || "",
          email: incomingState.email || "",
          picture: incomingState.picture || null,
        }
      : null
  );

  const [form, setForm] = useState({
    name: incomingState.name || "",
    phone: incomingState.phone || "",
    alternatePhone: "",
    email: incomingState.email || "",
    district: incomingState.district || "",
    area: "",
    crops: incomingState.crops || (incomingState.primaryCrop ? [incomingState.primaryCrop] : []),
    preferredCentreId: incomingState.preferredCentreId || "",
  });

  const [centres, setCentres] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingFarmerId, setExistingFarmerId] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Load available centres for preferred centre selection
  useEffect(() => {
    let active = true;
    api.getCentres()
      .then((data) => {
        if (active && Array.isArray(data)) {
          setCentres(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Filter centres by currently selected district
  const filteredCentres = centres.filter((c) => {
    if (!form.district) return true;
    return (
      (c.district && c.district.toLowerCase() === form.district.toLowerCase()) ||
      (c.code && form.district && c.district === form.district)
    );
  });

  function handleNameChange(e) {
    const clean = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setForm((f) => ({ ...f, name: clean }));
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

  function handleAlternatePhoneChange(e) {
    let raw = e.target.value;
    let clean = raw.replace(/[^\d+\s\-]/g, "").slice(0, 15);
    if (clean.indexOf("+") > 0) {
      clean = clean[0] === "+" ? "+" + clean.slice(1).replace(/\+/g, "") : clean.replace(/\+/g, "");
    }
    setForm((f) => ({ ...f, alternatePhone: clean }));
    if (error) setError("");
  }

  function handleDistrictChange(e) {
    const dist = e.target.value;
    setForm((f) => ({
      ...f,
      district: dist,
      preferredCentreId: "", // Reset centre if district changes
    }));
    if (error) setError("");
  }

  function toggleCrop(cropName) {
    setForm((prev) => {
      const exists = prev.crops.includes(cropName);
      if (exists) {
        return { ...prev, crops: prev.crops.filter((c) => c !== cropName) };
      }
      if (prev.crops.length >= 3) {
        return prev; // Maximum 3 crops allowed
      }
      return { ...prev, crops: [...prev.crops, cropName] };
    });
    if (error) setError("");
  }

  // Handle Google Sign-Up button
  async function handleGoogleSignUpSuccess(credentialResponse) {
    setError("");
    setExistingFarmerId(null);

    if (!credentialResponse?.credential) {
      setError(t("err_google_login_failed"));
      return;
    }

    const payload = decodeJwtCredential(credentialResponse.credential);
    if (!payload || !payload.email) {
      setError(t("err_google_login_failed"));
      return;
    }

    const gName = payload.name || payload.given_name || "";
    const gEmail = payload.email.trim().toLowerCase();
    const gPicture = payload.picture || null;

    setGoogleUser({
      name: gName,
      email: gEmail,
      picture: gPicture,
    });
    setForm((f) => ({
      ...f,
      name: gName || f.name,
      email: gEmail,
      district: f.district || "",
    }));
    setIsGoogleFlow(true);
  }

  function handleCancelGoogleFlow() {
    setIsGoogleFlow(false);
    setGoogleUser(null);
    setError("");
    setForm((f) => ({
      ...f,
      email: "",
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setExistingFarmerId(null);

    const cleanName = form.name.trim();
    if (!cleanName) {
      setError(t("err_name_required"));
      return;
    }

    const phoneValidation = validateIndianMobile(form.phone, t("err_phone_invalid"));
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error);
      return;
    }

    // Optional alternate phone validation
    let cleanAlternate = null;
    if (form.alternatePhone && form.alternatePhone.trim()) {
      const altValidation = validateIndianMobile(form.alternatePhone);
      if (!altValidation.isValid) {
        setError(`Alternate phone: ${altValidation.error || t("err_phone_invalid")}`);
        return;
      }
      cleanAlternate = altValidation.normalized;
      if (cleanAlternate === phoneValidation.normalized) {
        setError("Alternate mobile number must be different from primary mobile number.");
        return;
      }
    }

    // District is MANDATORY
    if (!form.district) {
      setError(t("err_district_required"));
      return;
    }

    // Crops selection: 1, 2, or maximum 3 crops is MANDATORY
    if (!Array.isArray(form.crops) || form.crops.length === 0) {
      setError("Please select at least 1 crop (maximum 3 crops).");
      return;
    }
    if (form.crops.length > 3) {
      setError("You can select at most 3 crops.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.registerFarmerAccount({
        name: cleanName,
        phone: phoneValidation.normalized,
        alternatePhone: cleanAlternate,
        email: isGoogleFlow ? googleUser?.email : (form.email ? form.email.trim().toLowerCase() : null),
        district: form.district,
        area: form.area ? form.area.trim() : null,
        crops: form.crops,
        primaryCrop: form.crops[0],
        preferredCentreId: form.preferredCentreId || null,
      });

      const registered = res.farmer;
      const profile = res.profile;

      setSuccessData({
        farmerId: registered.farmerId,
        name: registered.name,
        phone: registered.phone,
        alternatePhone: registered.alternatePhone || null,
        email: registered.email || (isGoogleFlow ? googleUser?.email : null),
        district: registered.district,
        districtCode: registered.districtCode,
        area: registered.area || null,
        crops: registered.crops || form.crops,
        preferredCentreId: registered.preferredCentreId || null,
        preferredCentreName: registered.preferredCentreName || null,
        profile,
        isGoogleFlow,
      });
    } catch (err) {
      if (err.status === 409 || err.code === "ALREADY_REGISTERED") {
        setExistingFarmerId(err.existingFarmerId || err.data?.existingFarmerId || null);
        setError(err.message || "An account is already registered with this mobile number or email.");
      } else {
        setError(err.message || "Failed to register account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCopyFarmerId() {
    if (!successData?.farmerId) return;
    navigator.clipboard.writeText(successData.farmerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleProceedToLogin() {
    if (!successData) {
      navigate("/login");
      return;
    }
    navigate("/login", {
      state: {
        farmerId: successData.farmerId,
        phone: successData.phone,
        name: successData.name,
        email: successData.email || null,
        isGoogle: successData.isGoogleFlow,
      },
    });
  }

  const selectedDistObj = DISTRICT_OPTIONS.find((d) => d.name === form.district);
  const phoneFeedback = getImmediatePhoneFeedback(form.phone, t("err_phone_invalid"));
  const isPhoneValid = phoneFeedback.isValid;
  const phoneInlineError = phoneFeedback.error;

  const isFormValid =
    form.name.trim().length > 0 &&
    isPhoneValid &&
    Boolean(form.district) &&
    form.crops.length >= 1 &&
    form.crops.length <= 3;

  const inputStyle = {
    width: "100%",
    background: "#fff",
    color: "var(--ink)",
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid var(--line, #dcd2b8)",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const labelStyle = {
    color: "var(--paper)",
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
  };

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
      <div
        className="card"
        style={{
          background: "var(--field)",
          color: "var(--paper)",
          border: "1px solid var(--field-light)",
          padding: "36px 32px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)",
          borderRadius: 8,
        }}
      >
        {/* Farmer Portal Header Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              background: "var(--wheat)",
              color: "var(--ink)",
              padding: "3px 8px",
              borderRadius: 3,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            FARMER PORTAL
          </span>
          <span
            style={{
              fontSize: 12,
              opacity: 0.8,
              fontFamily: "var(--font-mono)",
              color: "var(--paper)",
            }}
          >
            YIELDO PROCUREMENT PLATFORM
          </span>
        </div>

        {/* SUCCESS SCREEN */}
        {successData ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(74, 222, 128, 0.15)",
                color: "#4ADE80",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                margin: "0 auto 16px",
                border: "2px solid rgba(74, 222, 128, 0.35)",
              }}
            >
              ✓
            </div>

            <h2 style={{ fontSize: 24, marginBottom: 8, color: "var(--paper)" }}>
              {t("signup_success_title")}
            </h2>
            <p style={{ color: "rgba(251, 246, 236, 0.75)", fontSize: 14, marginBottom: 20 }}>
              {t("signup_success_sub")}
            </p>

            {/* Generated Official Farmer ID Box */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.28)",
                border: "2px solid var(--wheat)",
                borderRadius: 8,
                padding: "18px 20px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(251, 246, 236, 0.7)",
                  marginBottom: 6,
                }}
              >
                {t("signup_id_label")}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  fontFamily: "var(--font-mono, monospace)",
                  color: "var(--wheat)",
                  letterSpacing: "0.06em",
                }}
              >
                {successData.farmerId}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  onClick={handleCopyFarmerId}
                  style={{
                    fontSize: 13,
                    padding: "6px 16px",
                    background: "rgba(255, 255, 255, 0.12)",
                    color: "var(--paper)",
                    border: "1px solid rgba(255, 255, 255, 0.25)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {copied ? `✓ ${t("signup_id_copied")}` : `📋 ${t("signup_copy_id")}`}
                </button>
              </div>
            </div>

            {/* Registered Account Summary */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.2)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                padding: "16px 20px",
                textAlign: "left",
                fontSize: 13,
                marginBottom: 20,
                lineHeight: "2",
                color: "var(--paper)",
              }}
            >
              <div>
                <span style={{ opacity: 0.75 }}>{t("signup_name_label")?.replace("*", "").trim()}:</span>{" "}
                <strong>{successData.name}</strong>
              </div>
              <div>
                <span style={{ opacity: 0.75 }}>{t("signup_phone_label")?.replace("*", "").trim()}:</span>{" "}
                <strong>{successData.phone}</strong>
              </div>
              {successData.alternatePhone && (
                <div>
                  <span style={{ opacity: 0.75 }}>{t("signup_alt_phone_label")}:</span>{" "}
                  <strong>{successData.alternatePhone}</strong>
                </div>
              )}
              {successData.email && (
                <div>
                  <span style={{ opacity: 0.75 }}>Google / Email:</span>{" "}
                  <strong>{successData.email}</strong>
                </div>
              )}
              <div>
                <span style={{ opacity: 0.75 }}>{t("signup_district_label")?.replace("*", "").trim()}:</span>{" "}
                <strong>
                  {tDistrict(successData.district)} ({successData.districtCode})
                </strong>
              </div>
              {successData.area && (
                <div>
                  <span style={{ opacity: 0.75 }}>{t("signup_area_label")}:</span>{" "}
                  <strong>{successData.area}</strong>
                </div>
              )}
              <div>
                <span style={{ opacity: 0.75 }}>{t("signup_crop_label")?.split("(")[0].trim()}:</span>{" "}
                {Array.isArray(successData.crops) && successData.crops.length > 0 ? (
                  <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", verticalAlign: "middle" }}>
                    {successData.crops.map((crop) => (
                      <span
                        key={crop}
                        style={{
                          background: "rgba(201, 138, 43, 0.2)",
                          color: "var(--wheat)",
                          border: "1px solid rgba(201, 138, 43, 0.4)",
                          borderRadius: 12,
                          padding: "1px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {tCrop(crop)}
                      </span>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </div>
              {successData.preferredCentreName && (
                <div>
                  <span style={{ opacity: 0.75 }}>{t("signup_centre_label")}:</span>{" "}
                  <strong>{successData.preferredCentreName}</strong>
                </div>
              )}
            </div>

            {/* Instruction Banner */}
            <div
              style={{
                background: "rgba(201, 138, 43, 0.15)",
                border: "1px solid rgba(201, 138, 43, 0.35)",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 20,
                fontSize: 13,
                color: "var(--wheat)",
                textAlign: "left",
                lineHeight: 1.5,
              }}
            >
              ℹ️ {successData.isGoogleFlow ? t("signup_success_instruction_google") : t("signup_success_instruction_phone")}
            </div>

            <button
              type="button"
              className="btn"
              onClick={handleProceedToLogin}
              style={{
                width: "100%",
                background: "var(--wheat)",
                color: "var(--ink)",
                fontWeight: 700,
                padding: "10px 16px",
                fontSize: 14,
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              Proceed to Login →
            </button>
          </div>
        ) : isGoogleFlow ? (
          /* GOOGLE DETAILS COLLECTION FORM */
          <>
            <h2 style={{ fontSize: 24, marginBottom: 8, color: "var(--paper)" }}>
              Farmer Sign Up
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "rgba(251, 246, 236, 0.75)",
                marginBottom: 24,
                marginTop: 0,
                lineHeight: 1.4,
              }}
            >
              Create a new account to get started
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "rgba(0, 0, 0, 0.22)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 8,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {googleUser?.picture ? (
                  <img
                    src={googleUser.picture}
                    alt="Google Profile"
                    style={{ width: 38, height: 38, borderRadius: "50%" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: "#4285F4",
                      color: "#fff",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    G
                  </div>
                )}
                <div style={{ fontSize: 13, textAlign: "left" }}>
                  <div style={{ fontWeight: 700, color: "var(--paper)" }}>
                    {googleUser?.name || "Google Farmer"}
                  </div>
                  <div style={{ color: "rgba(251, 246, 236, 0.7)", fontSize: 12 }}>
                    {googleUser?.email}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--wheat)",
                  background: "rgba(201, 138, 43, 0.18)",
                  border: "1px solid rgba(201, 138, 43, 0.35)",
                  padding: "3px 10px",
                  borderRadius: 12,
                }}
              >
                ✓ {t("signup_google_badge")}
              </span>
            </div>

            {error && (
              <div
                style={{
                  color: "#FFA89B",
                  background: "rgba(162, 59, 46, 0.25)",
                  border: "1px solid rgba(162, 59, 46, 0.4)",
                  padding: "14px 16px",
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600 }}>⚠️ {error}</div>
                {existingFarmerId && (
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    Official Farmer ID:{" "}
                    <span style={{ color: "var(--wheat)", fontFamily: "var(--font-mono)" }}>
                      {existingFarmerId}
                    </span>
                    .{" "}
                    <Link
                      to="/login"
                      state={{ farmerId: existingFarmerId }}
                      style={{ color: "var(--wheat)", fontWeight: 700, textDecoration: "underline" }}
                    >
                      Login here →
                    </Link>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Farmer Name */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="google-farmer-name" style={labelStyle}>
                  {t("signup_name_label")}{" "}
                  <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="google-farmer-name"
                  type="text"
                  required
                  placeholder={t("signup_name_placeholder")}
                  value={form.name}
                  onChange={handleNameChange}
                  style={inputStyle}
                />
              </div>

              {/* Primary Mobile */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="google-farmer-phone" style={labelStyle}>
                  {t("signup_phone_label")}{" "}
                  <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="google-farmer-phone"
                  type="tel"
                  maxLength={15}
                  required
                  placeholder={t("signup_phone_placeholder")}
                  value={form.phone}
                  onChange={handlePhoneChange}
                  style={{
                    ...inputStyle,
                    border: phoneInlineError
                      ? "2px solid #FFA89B"
                      : "1px solid var(--line, #dcd2b8)",
                  }}
                />
                {phoneInlineError && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "#FFA89B",
                      display: "block",
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {phoneInlineError}
                  </span>
                )}
              </div>

              {/* Alternate Mobile */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="google-farmer-alt-phone" style={labelStyle}>
                  {t("signup_alt_phone_label")}
                </label>
                <input
                  id="google-farmer-alt-phone"
                  type="tel"
                  maxLength={15}
                  placeholder={t("signup_alt_phone_placeholder")}
                  value={form.alternatePhone}
                  onChange={handleAlternatePhoneChange}
                  style={inputStyle}
                />
              </div>

              {/* Google Email (Read Only) */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="google-farmer-email" style={labelStyle}>
                  Google Account / Email
                </label>
                <input
                  id="google-farmer-email"
                  type="email"
                  readOnly
                  disabled
                  value={googleUser?.email || ""}
                  style={{
                    ...inputStyle,
                    background: "rgba(255, 255, 255, 0.85)",
                    opacity: 0.9,
                    color: "var(--ink)",
                    cursor: "not-allowed",
                  }}
                />
              </div>

              {/* District Selector (MANDATORY) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label htmlFor="google-farmer-district" style={{ ...labelStyle, marginBottom: 0 }}>
                    {t("signup_district_label")}{" "}
                    <span style={{ color: "var(--wheat)" }}>*</span>
                  </label>
                  {selectedDistObj && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: "rgba(0, 0, 0, 0.25)",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono, monospace)",
                        color: "var(--wheat)",
                        border: "1px solid rgba(201, 138, 43, 0.3)",
                      }}
                    >
                      Prefix: {selectedDistObj.code}-F
                    </span>
                  )}
                </div>
                <select
                  id="google-farmer-district"
                  value={form.district}
                  onChange={handleDistrictChange}
                  required
                  style={inputStyle}
                >
                  <option value="">{t("signup_district_placeholder")}</option>
                  {DISTRICT_OPTIONS.map((d) => (
                    <option key={d.code} value={d.name}>
                      {tDistrict(d.name)} ({d.code})
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(251, 246, 236, 0.65)",
                    display: "block",
                    marginTop: 4,
                  }}
                >
                  {t("signup_district_hint")}
                </span>
              </div>

              {/* Area / Village */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="google-farmer-area" style={labelStyle}>
                  {t("signup_area_label")}
                </label>
                <input
                  id="google-farmer-area"
                  type="text"
                  placeholder={t("signup_area_placeholder")}
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  style={inputStyle}
                />
              </div>

              {/* Selected Crops (1, 2, or Max 3 Crops) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    {t("signup_crop_label")}{" "}
                    <span style={{ color: "var(--wheat)" }}>*</span>
                  </label>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: form.crops.length > 0 ? "var(--wheat)" : "rgba(251, 246, 236, 0.6)",
                      background: "rgba(0, 0, 0, 0.25)",
                      padding: "2px 8px",
                      borderRadius: 10,
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    {form.crops.length}/3 {t("signup_crops_count", { count: form.crops.length })}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(251, 246, 236, 0.65)", marginBottom: 8 }}>
                  {t("signup_crops_hint")}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(115px, 1fr))",
                    gap: 8,
                  }}
                >
                  {CROP_OPTIONS.map((crop) => {
                    const isSelected = form.crops.includes(crop.name);
                    return (
                      <button
                        key={crop.name}
                        type="button"
                        onClick={() => toggleCrop(crop.name)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: isSelected ? "1px solid var(--wheat)" : "1px solid rgba(255, 255, 255, 0.15)",
                          background: isSelected ? "var(--wheat)" : "rgba(0, 0, 0, 0.22)",
                          color: isSelected ? "var(--ink)" : "var(--paper)",
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: 13,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          textAlign: "left",
                        }}
                      >
                        <span>{crop.icon}</span>
                        <span style={{ flex: 1 }}>{tCrop(crop.name)}</span>
                        {isSelected && <span style={{ fontSize: 12 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preferred Procurement Centre (Optional) */}
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="google-farmer-centre" style={labelStyle}>
                  {t("signup_centre_label")}
                </label>
                <select
                  id="google-farmer-centre"
                  value={form.preferredCentreId}
                  onChange={(e) => setForm({ ...form, preferredCentreId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">{t("signup_centre_placeholder")}</option>
                  {filteredCentres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({tDistrict(c.district)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn"
                type="submit"
                disabled={!isFormValid || loading}
                style={{
                  width: "100%",
                  background: "var(--wheat)",
                  color: "var(--ink)",
                  fontWeight: 700,
                  padding: "10px 16px",
                  fontSize: 14,
                  borderRadius: 6,
                  border: "none",
                  cursor: isFormValid && !loading ? "pointer" : "not-allowed",
                  opacity: isFormValid && !loading ? 1 : 0.6,
                  marginTop: 10,
                }}
              >
                {loading ? "Signing up..." : "Sign Up"}
              </button>

              <button
                type="button"
                onClick={handleCancelGoogleFlow}
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "var(--paper)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  padding: "10px 16px",
                  fontSize: 13,
                  borderRadius: 6,
                  cursor: "pointer",
                  marginTop: 10,
                }}
              >
                {t("signup_back_to_methods")}
              </button>
            </form>
          </>
        ) : (
          /* STANDARD PHONE REGISTRATION FORM (WITH GOOGLE SIGN-UP OPTION AT TOP) */
          <>
            <h2 style={{ fontSize: 24, marginBottom: 8, color: "var(--paper)" }}>
              Farmer Sign Up
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "rgba(251, 246, 236, 0.75)",
                marginBottom: 24,
                marginTop: 0,
                lineHeight: 1.4,
              }}
            >
              Create a new account to get started
            </p>

            {/* Fast Sign Up with Google */}
            <div style={{ marginBottom: 18, textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                <GoogleLogin
                  onSuccess={handleGoogleSignUpSuccess}
                  onError={() => setError(t("err_google_login_failed"))}
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  shape="rectangular"
                  text="signup_with"
                  width="100%"
                />
              </div>
            </div>

            {/* Divider matching FarmerLogin */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                margin: "20px 0",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, height: 1, background: "rgba(255, 255, 255, 0.15)" }} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: "var(--wheat)",
                  letterSpacing: "0.08em",
                }}
              >
                {t("login_or_divider")}
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(255, 255, 255, 0.15)" }} />
            </div>

            {error && (
              <div
                style={{
                  color: "#FFA89B",
                  background: "rgba(162, 59, 46, 0.25)",
                  border: "1px solid rgba(162, 59, 46, 0.4)",
                  padding: "14px 16px",
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600 }}>⚠️ {error}</div>
                {existingFarmerId && (
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    Official Farmer ID:{" "}
                    <span style={{ color: "var(--wheat)", fontFamily: "var(--font-mono)" }}>
                      {existingFarmerId}
                    </span>
                    .{" "}
                    <Link
                      to="/login"
                      state={{ farmerId: existingFarmerId }}
                      style={{ color: "var(--wheat)", fontWeight: 700, textDecoration: "underline" }}
                    >
                      Login here →
                    </Link>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Full Name */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="reg-farmer-name" style={labelStyle}>
                  {t("signup_name_label")}{" "}
                  <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="reg-farmer-name"
                  type="text"
                  required
                  placeholder={t("signup_name_placeholder")}
                  value={form.name}
                  onChange={handleNameChange}
                  style={inputStyle}
                />
              </div>

              {/* Primary Mobile */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="reg-farmer-phone" style={labelStyle}>
                  {t("signup_phone_label")}{" "}
                  <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="reg-farmer-phone"
                  type="tel"
                  maxLength={15}
                  required
                  placeholder={t("signup_phone_placeholder")}
                  value={form.phone}
                  onChange={handlePhoneChange}
                  style={{
                    ...inputStyle,
                    border: phoneInlineError
                      ? "2px solid #FFA89B"
                      : "1px solid var(--line, #dcd2b8)",
                  }}
                />
                {phoneInlineError && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "#FFA89B",
                      display: "block",
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {phoneInlineError}
                  </span>
                )}
              </div>

              {/* Alternate Mobile (Optional) */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="reg-farmer-alt-phone" style={labelStyle}>
                  {t("signup_alt_phone_label")}
                </label>
                <input
                  id="reg-farmer-alt-phone"
                  type="tel"
                  maxLength={15}
                  placeholder={t("signup_alt_phone_placeholder")}
                  value={form.alternatePhone}
                  onChange={handleAlternatePhoneChange}
                  style={inputStyle}
                />
              </div>

              {/* District Selector (MANDATORY) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label htmlFor="reg-farmer-district" style={{ ...labelStyle, marginBottom: 0 }}>
                    {t("signup_district_label")}{" "}
                    <span style={{ color: "var(--wheat)" }}>*</span>
                  </label>
                  {selectedDistObj && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: "rgba(0, 0, 0, 0.25)",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono, monospace)",
                        color: "var(--wheat)",
                        border: "1px solid rgba(201, 138, 43, 0.3)",
                      }}
                    >
                      Prefix: {selectedDistObj.code}-F
                    </span>
                  )}
                </div>
                <select
                  id="reg-farmer-district"
                  value={form.district}
                  onChange={handleDistrictChange}
                  required
                  style={inputStyle}
                >
                  <option value="" disabled>
                    {t("signup_district_placeholder")}
                  </option>
                  {DISTRICT_OPTIONS.map((d) => (
                    <option key={d.code} value={d.name}>
                      {tDistrict(d.name)} ({d.code})
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(251, 246, 236, 0.65)",
                    display: "block",
                    marginTop: 4,
                  }}
                >
                  {t("signup_district_hint")}
                </span>
              </div>

              {/* Area / Village (Optional) */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="reg-farmer-area" style={labelStyle}>
                  {t("signup_area_label")}
                </label>
                <input
                  id="reg-farmer-area"
                  type="text"
                  placeholder={t("signup_area_placeholder")}
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  style={inputStyle}
                />
              </div>

              {/* Selected Crops (1, 2, or Max 3 Crops) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    {t("signup_crop_label")}{" "}
                    <span style={{ color: "var(--wheat)" }}>*</span>
                  </label>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: form.crops.length > 0 ? "var(--wheat)" : "rgba(251, 246, 236, 0.6)",
                      background: "rgba(0, 0, 0, 0.25)",
                      padding: "2px 8px",
                      borderRadius: 10,
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    {form.crops.length}/3 {t("signup_crops_count", { count: form.crops.length })}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(251, 246, 236, 0.65)", marginBottom: 8 }}>
                  {t("signup_crops_hint")}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(115px, 1fr))",
                    gap: 8,
                  }}
                >
                  {CROP_OPTIONS.map((crop) => {
                    const isSelected = form.crops.includes(crop.name);
                    return (
                      <button
                        key={crop.name}
                        type="button"
                        onClick={() => toggleCrop(crop.name)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: isSelected ? "1px solid var(--wheat)" : "1px solid rgba(255, 255, 255, 0.15)",
                          background: isSelected ? "var(--wheat)" : "rgba(0, 0, 0, 0.22)",
                          color: isSelected ? "var(--ink)" : "var(--paper)",
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: 13,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          textAlign: "left",
                        }}
                      >
                        <span>{crop.icon}</span>
                        <span style={{ flex: 1 }}>{tCrop(crop.name)}</span>
                        {isSelected && <span style={{ fontSize: 12 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preferred Procurement Centre (Optional) */}
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="reg-farmer-centre" style={labelStyle}>
                  {t("signup_centre_label")}
                </label>
                <select
                  id="reg-farmer-centre"
                  value={form.preferredCentreId}
                  onChange={(e) => setForm({ ...form, preferredCentreId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">{t("signup_centre_placeholder")}</option>
                  {filteredCentres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({tDistrict(c.district)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn"
                type="submit"
                disabled={!isFormValid || loading}
                style={{
                  width: "100%",
                  background: "var(--wheat)",
                  color: "var(--ink)",
                  fontWeight: 700,
                  padding: "10px 16px",
                  fontSize: 14,
                  borderRadius: 6,
                  border: "none",
                  cursor: isFormValid && !loading ? "pointer" : "not-allowed",
                  opacity: isFormValid && !loading ? 1 : 0.6,
                  marginTop: 10,
                }}
              >
                {loading ? "Signing up..." : "Sign Up"}
              </button>
            </form>

            {/* Link to Login */}
            <div
              style={{
                textAlign: "center",
                marginTop: 22,
                paddingTop: 16,
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                fontSize: 13,
                color: "rgba(251, 246, 236, 0.75)",
              }}
            >
              Already have an account?{" "}
              <Link
                to="/login"
                style={{
                  color: "var(--wheat)",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Login →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
