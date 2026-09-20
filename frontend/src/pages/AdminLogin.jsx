import { useState } from "react";
import { Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "../api.js";

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

export default function AdminLogin({ onLogin, onLoginSuccess }) {
  // Step 1: Identity verification state
  const [identityTab, setIdentityTab] = useState("phone"); // "phone" | "google"
  const [phoneInput, setPhoneInput] = useState("");
  const [googleEmailInput, setGoogleEmailInput] = useState("");
  const [verifiedIdentity, setVerifiedIdentity] = useState(null); // { type: "phone" | "google", value: string }

  // Step 2: Single combined Admin ID + Password state
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Error state
  const [error, setError] = useState("");

  // Handle Step 1: Confirming Phone Identity
  function handleConfirmPhone(e) {
    e?.preventDefault();
    setError("");
    const cleanPhone = phoneInput.trim();
    if (!cleanPhone) {
      setError("Please enter your registered mobile number.");
      return;
    }
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setVerifiedIdentity({ type: "phone", value: cleanPhone });
    setPassword("");
  }

  // Handle Step 1: Google OAuth Success
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
    setVerifiedIdentity({ type: "google", value: email });
    setPassword("");
  }

  // Handle Step 1: Manual Email Fallback (for testing / official officer email)
  function handleConfirmGoogleEmail(e) {
    e?.preventDefault();
    setError("");
    const cleanEmail = googleEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid official officer email address.");
      return;
    }
    setVerifiedIdentity({ type: "google", value: cleanEmail });
    setPassword("");
  }

  // Reset Identity to switch method
  function handleResetIdentity() {
    setVerifiedIdentity(null);
    setAdminId("");
    setPassword("");
    setError("");
  }

  // Handle Step 2: Combined Login Submission (Admin ID + Password)
  async function handleLoginSubmit(e) {
    e?.preventDefault();
    setError("");

    if (!verifiedIdentity) {
      setError("Please complete Step 1 identity verification first.");
      return;
    }

    const cleanId = adminId.trim().toUpperCase();
    if (!cleanId || !password) {
      setError("Invalid Admin ID or Password.");
      return;
    }

    setLoggingIn(true);

    try {
      const data = await api.loginAdmin({
        adminId: cleanId,
        password,
        identityType: verifiedIdentity.type,
        identityValue: verifiedIdentity.value,
        phone: verifiedIdentity.type === "phone" ? verifiedIdentity.value : undefined,
        email: verifiedIdentity.type === "google" ? verifiedIdentity.value : undefined,
      });

      if (onLogin && data?.token) {
        onLogin(data.token);
      }
      if (onLoginSuccess && data?.token) {
        onLoginSuccess(data.token);
      }
    } catch (err) {
      setError(err.message || "Invalid Admin ID or Password.");
    } finally {
      setLoggingIn(false);
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
        {/* Officer portal header badge */}
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
            OFFICER PORTAL
          </span>
          <span style={{ fontSize: 12, opacity: 0.8, fontFamily: "var(--font-mono)" }}>
            RESTRICTED ACCESS
          </span>
        </div>

        <h2 style={{ fontSize: 24, marginBottom: 8, color: "var(--paper)" }}>
          Centre Admin Login
        </h2>
        <p style={{ fontSize: 14, color: "rgba(251, 246, 236, 0.75)", marginBottom: 24, marginTop: 0, lineHeight: 1.4 }}>
          Manage live mandi queues, advance farmer verification stages, and update procurement loads.
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
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--wheat)", marginBottom: 12 }}>
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
                📱 Phone Login
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
                🌐 Google Login
              </button>
            </div>

            {/* Phone Verification Input */}
            {identityTab === "phone" ? (
              <div>
                <div className="field-row" style={{ marginBottom: 12 }}>
                  <label htmlFor="admin-phone-verify" style={{ color: "var(--paper)" }}>
                    Registered Mobile Number <span style={{ color: "var(--wheat)" }}>*</span>
                  </label>
                  <input
                    id="admin-phone-verify"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      if (error) setError("");
                    }}
                    style={{ background: "#fff", color: "var(--ink)" }}
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
                <div style={{ textAlign: "center", fontSize: 11, opacity: 0.65, margin: "8px 0" }}>
                  — OR ENTER OFFICIAL OFFICER EMAIL —
                </div>
                <div className="field-row" style={{ marginBottom: 12 }}>
                  <input
                    type="email"
                    placeholder="officer@tn.gov.in or gmail.com"
                    value={googleEmailInput}
                    onChange={(e) => {
                      setGoogleEmailInput(e.target.value);
                      if (error) setError("");
                    }}
                    style={{ background: "#fff", color: "var(--ink)" }}
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
              <div style={{ fontSize: 11, color: "rgba(251, 246, 236, 0.7)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Step 1: Verified Identity
              </div>
              <div style={{ fontSize: 14, color: "#72E385", fontWeight: 700, marginTop: 2 }}>
                ✓ {verifiedIdentity.type === "google" ? "Google Account" : "Mobile Number"}: {verifiedIdentity.value}
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

        {/* STEP 2: ADMIN ID + PASSWORD (Single Combined Form) */}
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
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--wheat)", marginBottom: 16 }}>
                Step 2 — Officer Credentials
              </div>

              <div className="field-row" style={{ marginBottom: 14 }}>
                <label htmlFor="admin-id" style={{ color: "var(--paper)" }}>
                  Admin ID <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="admin-id"
                  type="text"
                  required
                  placeholder="e.g. VPM-CA26-3522001"
                  value={adminId}
                  onChange={(e) => {
                    setAdminId(e.target.value.toUpperCase());
                    if (error) setError("");
                  }}
                  style={{
                    background: "#fff",
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                  autoFocus
                />
              </div>

              <div className="field-row" style={{ marginBottom: 18 }}>
                <label htmlFor="admin-password" style={{ color: "var(--paper)" }}>
                  Password <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  style={{ background: "#fff", color: "var(--ink)" }}
                />
              </div>

              <button
                className="btn"
                type="submit"
                disabled={loggingIn || !adminId.trim() || !password}
                style={{
                  width: "100%",
                  background: "var(--wheat)",
                  color: "var(--ink)",
                  fontWeight: 700,
                  padding: "10px 16px",
                  fontSize: 14,
                }}
              >
                {loggingIn ? "Logging in..." : "Login"}
              </button>
            </div>
          </form>
        )}

        {/* Error display */}
        {error && (
          <div
            className="error-text"
            style={{
              color: "#FFA89B",
              background: "rgba(162, 59, 46, 0.25)",
              border: "1px solid rgba(162, 59, 46, 0.4)",
              padding: "10px 12px",
              borderRadius: 4,
              marginTop: 16,
              fontSize: 13,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Existing footer link to Register Admin Details */}
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
          New Centre Officer?{" "}
          <Link
            to="/admin/register"
            style={{
              color: "var(--wheat)",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Register Admin Details →
          </Link>
        </div>
      </div>
    </div>
  );
}
