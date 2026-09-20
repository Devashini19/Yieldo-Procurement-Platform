import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "../api.js";
import { validateIndianMobile } from "../utils/phone.js";

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

export default function FarmerLogin({ onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const incomingState = location.state || {};

  // Step 1: Identity verification state
  const [identityTab, setIdentityTab] = useState(
    incomingState.isGoogle ? "google" : "phone"
  ); // "phone" | "google"
  const [phoneInput, setPhoneInput] = useState(incomingState.phone || "");
  const [googleEmailInput, setGoogleEmailInput] = useState(incomingState.email || "");
  const [verifiedIdentity, setVerifiedIdentity] = useState(null); // { type: "phone" | "google", value: string, name?: string, picture?: string }

  // Step 2: Single Farmer ID state (NO password, NO name, NO separate phone field)
  const [farmerId, setFarmerId] = useState(incomingState.farmerId || "");
  const [loading, setLoading] = useState(false);

  // Error state
  const [error, setError] = useState("");

  // Update fields if redirected from registration
  useEffect(() => {
    if (incomingState.farmerId) {
      setFarmerId(incomingState.farmerId);
      if (incomingState.isGoogle) {
        setIdentityTab("google");
        if (incomingState.email) setGoogleEmailInput(incomingState.email);
      } else {
        setIdentityTab("phone");
        if (incomingState.phone) setPhoneInput(incomingState.phone);
      }
    }
  }, [incomingState]);

  // Step 1 Handler: Confirming Phone Identity
  function handleConfirmPhone(e) {
    e?.preventDefault();
    setError("");
    const cleanPhone = phoneInput.trim();
    if (!cleanPhone) {
      setError("Please enter your registered mobile number.");
      return;
    }
    const val = validateIndianMobile(cleanPhone);
    if (!val.isValid) {
      setError(val.error);
      return;
    }
    setVerifiedIdentity({ type: "phone", value: val.normalized });
  }

  // Step 1 Handler: Google OAuth Success
  function handleGoogleSuccess(credentialResponse) {
    setError("");
    if (!credentialResponse?.credential) {
      setError("Google identity verification failed. Please try again.");
      return;
    }
    const payload = decodeJwtCredential(credentialResponse.credential);
    if (!payload?.email) {
      setError("Google identity verification failed: email not found.");
      return;
    }
    const email = payload.email.trim().toLowerCase();
    setVerifiedIdentity({
      type: "google",
      value: email,
      name: payload.name || payload.given_name || "Farmer",
      picture: payload.picture || null,
    });
  }

  // Step 1 Handler: Manual Email Fallback (for testing / registered email)
  function handleConfirmGoogleEmail(e) {
    e?.preventDefault();
    setError("");
    const cleanEmail = googleEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid registered email address.");
      return;
    }
    setVerifiedIdentity({ type: "google", value: cleanEmail });
  }

  // Reset Identity to switch method
  function handleResetIdentity() {
    setVerifiedIdentity(null);
    setError("");
  }

  // Step 2 Handler: Login Submission (Farmer ID authenticated against verified identity)
  async function handleLoginSubmit(e) {
    e?.preventDefault();
    setError("");

    if (!verifiedIdentity) {
      setError("Please complete Step 1 identity verification first.");
      return;
    }

    const cleanId = farmerId.trim().toUpperCase();
    if (!cleanId) {
      setError("Please enter your Official Farmer ID.");
      return;
    }

    setLoading(true);

    try {
      const data = await api.loginFarmer({
        farmerId: cleanId,
        identityType: verifiedIdentity.type,
        identityValue: verifiedIdentity.value,
        phone: verifiedIdentity.type === "phone" ? verifiedIdentity.value : undefined,
        email: verifiedIdentity.type === "google" ? verifiedIdentity.value : undefined,
      });

      if (onLogin) {
        onLogin({
          name: data.name || verifiedIdentity.name || "Farmer",
          phone: data.phone || (verifiedIdentity.type === "phone" ? verifiedIdentity.value : null),
          alternatePhone: data.alternatePhone || null,
          email: data.email || (verifiedIdentity.type === "google" ? verifiedIdentity.value : null),
          identifier: data.phone || data.email || verifiedIdentity.value,
          farmerId: data.farmerId || cleanId,
          district: data.district,
          districtCode: data.districtCode,
          area: data.area || data.village || null,
          village: data.village || data.area || null,
          crops: data.crops || [],
          primaryCrop: data.primaryCrop || null,
          preferredCentreId: data.preferredCentreId || null,
          preferredCentreName: data.preferredCentreName || null,
          picture: verifiedIdentity.picture || null,
          googleAuth: verifiedIdentity.type === "google",
          profile: data.profile || null,
        });
      }

      // Open the existing Farmer Dashboard
      navigate("/");
    } catch (err) {
      setError(err.message || "We couldn't find a registered farmer account matching these details.");
    } finally {
      setLoading(false);
    }
  }

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

        <h2 style={{ fontSize: 24, marginBottom: 8, color: "var(--paper)" }}>
          Farmer Login
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
          Access your mandi queue tokens, slot bookings, and procurement receipts.
        </p>

        {/* STEP 1: IDENTITY VERIFICATION */}
        {!verifiedIdentity ? (
          <div
            style={{
              background: "rgba(0, 0, 0, 0.18)",
              padding: "16px",
              borderRadius: 8,
              marginBottom: 20,
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--wheat)",
                marginBottom: 12,
              }}
            >
              Step 1 — Identity Verification
            </div>

            {/* Identity Method Tabs */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                background: "rgba(0, 0, 0, 0.2)",
                padding: 4,
                borderRadius: 6,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIdentityTab("phone");
                  setError("");
                }}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  background: identityTab === "phone" ? "var(--wheat)" : "transparent",
                  color: identityTab === "phone" ? "var(--ink)" : "var(--paper)",
                  transition: "all 0.15s ease",
                }}
              >
                📱 Phone / Mobile Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdentityTab("google");
                  setError("");
                }}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  background: identityTab === "google" ? "var(--wheat)" : "transparent",
                  color: identityTab === "google" ? "var(--ink)" : "var(--paper)",
                  transition: "all 0.15s ease",
                }}
              >
                🌐 Google Account Login
              </button>
            </div>

            {/* Phone Verification Input */}
            {identityTab === "phone" ? (
              <div>
                <div className="field-row" style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="farmer-phone-verify"
                    style={{
                      color: "var(--paper)",
                      display: "block",
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Registered Mobile Number <span style={{ color: "var(--wheat)" }}>*</span>
                  </label>
                  <input
                    id="farmer-phone-verify"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      if (error) setError("");
                    }}
                    style={{
                      background: "#fff",
                      color: "var(--ink)",
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--line, #dcd2b8)",
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleConfirmPhone}
                  className="btn"
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
                  Verify Mobile →
                </button>
              </div>
            ) : (
              /* Google Verification Input */
              <div>
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google Sign In failed. Please try again.")}
                    useOneTap={false}
                    theme="outline"
                    size="large"
                    shape="rectangular"
                    text="signin_with"
                    width="100%"
                  />
                </div>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    opacity: 0.65,
                    margin: "8px 0",
                    color: "var(--paper)",
                  }}
                >
                  — OR ENTER REGISTERED GOOGLE EMAIL —
                </div>
                <div className="field-row" style={{ marginBottom: 12 }}>
                  <input
                    type="email"
                    placeholder="farmer@gmail.com"
                    value={googleEmailInput}
                    onChange={(e) => {
                      setGoogleEmailInput(e.target.value);
                      if (error) setError("");
                    }}
                    style={{
                      background: "#fff",
                      color: "var(--ink)",
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--line, #dcd2b8)",
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleConfirmGoogleEmail}
                  className="btn"
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
                  Verify Email →
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Verified Identity Indicator */
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(114, 227, 133, 0.12)",
              border: "1px solid rgba(114, 227, 133, 0.3)",
              borderRadius: 6,
              padding: "10px 14px",
              marginBottom: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(251, 246, 236, 0.7)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Step 1: Verified Identity
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#72E385",
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                ✓ {verifiedIdentity.type === "google" ? "Google Account" : "Mobile Number"}:{" "}
                {verifiedIdentity.value}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetIdentity}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--wheat)",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
                padding: "4px 8px",
              }}
            >
              Change
            </button>
          </div>
        )}

        {/* STEP 2: FARMER ID ENTRY (Single field: Official Farmer ID, NO password, NO name) */}
        {verifiedIdentity && (
          <form onSubmit={handleLoginSubmit}>
            <div
              style={{
                background: "rgba(0, 0, 0, 0.15)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 6,
                padding: "20px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--wheat)",
                  marginBottom: 16,
                }}
              >
                Step 2 — Farmer Identification
              </div>

              <div className="field-row" style={{ marginBottom: 18 }}>
                <label
                  htmlFor="farmer-id"
                  style={{
                    color: "var(--paper)",
                    display: "block",
                    marginBottom: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Official Farmer ID <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="farmer-id"
                  type="text"
                  required
                  placeholder="e.g. THJ-F-000001, CDL-F-000001, VPM-F-000001"
                  value={farmerId}
                  onChange={(e) => {
                    setFarmerId(e.target.value.toUpperCase());
                    if (error) setError("");
                  }}
                  style={{
                    background: "#fff",
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--line, #dcd2b8)",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                  autoFocus
                />
              </div>

              <button
                className="btn"
                type="submit"
                disabled={loading || !farmerId.trim()}
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
                {loading ? "Logging in..." : "Login"}
              </button>
            </div>
          </form>
        )}

        {/* Error / Denied Login display with link to register */}
        {error && (
          <div
            className="error-text"
            style={{
              color: "#FFA89B",
              background: "rgba(162, 59, 46, 0.25)",
              border: "1px solid rgba(162, 59, 46, 0.4)",
              padding: "14px 16px",
              borderRadius: 6,
              marginTop: 16,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, color: "#FFA89B" }}>
              ⚠️ {error}
            </div>
            <div>
              <Link
                to="/register-farmer"
                style={{
                  color: "var(--wheat)",
                  fontWeight: 700,
                  textDecoration: "underline",
                  fontSize: 13,
                }}
              >
                New farmer? Register here →
              </Link>
            </div>
          </div>
        )}

        {/* Footer link to Farmer Registration */}
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
          New farmer?{" "}
          <Link
            to="/register-farmer"
            style={{
              color: "var(--wheat)",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Register here →
          </Link>
        </div>
      </div>
    </div>
  );
}
