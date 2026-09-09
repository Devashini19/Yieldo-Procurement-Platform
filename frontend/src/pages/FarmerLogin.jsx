import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";

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
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Manual Form State
  const [form, setForm] = useState({ name: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleNameChange(e) {
    const cleanName = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setForm((f) => ({ ...f, name: cleanName }));
    if (error) setError("");
  }

  function handlePhoneChange(e) {
    const cleanPhone = e.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((f) => ({ ...f, phone: cleanPhone }));
    if (error) setError("");
  }

  // Handle manual Name + Phone login
  async function handleManualSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError(t("err_name_required"));
      return;
    }

    if (form.phone.length !== 10) {
      setError(t("err_phone_invalid"));
      return;
    }

    setLoading(true);
    try {
      const user = await api.loginFarmer({
        name: trimmedName,
        phone: form.phone,
      });
      if (onLogin) {
        onLogin({
          name: trimmedName,
          phone: form.phone,
          identifier: form.phone,
          isNewFarmer: user?.isNewFarmer,
        });
      }
      navigate("/");
    } catch (err) {
      setError(err.message || t("err_login_failed"));
    } finally {
      setLoading(false);
    }
  }

  // Handle Google OAuth Success (DIRECT LOGIN with Name + Email)
  async function handleGoogleSuccess(credentialResponse) {
    setError("");
    if (!credentialResponse?.credential) {
      setError(t("err_google_login_failed"));
      return;
    }

    const payload = decodeJwtCredential(credentialResponse.credential);
    if (!payload || !payload.email) {
      setError(t("err_google_login_failed"));
      return;
    }

    setLoading(true);
    try {
      const farmerName = payload.name || payload.given_name || "Farmer";
      const farmerEmail = payload.email.trim();

      // Optional backend sync
      const user = await api
        .loginFarmer({
          name: farmerName,
          email: farmerEmail,
        })
        .catch(() => null);

      if (onLogin) {
        onLogin({
          name: farmerName,
          email: farmerEmail,
          identifier: farmerEmail,
          picture: payload.picture || null,
          googleAuth: true,
          isNewFarmer: user?.isNewFarmer,
        });
      }
      navigate("/");
    } catch (err) {
      setError(err.message || t("err_google_login_failed"));
    } finally {
      setLoading(false);
    }
  }

  const isManualValid = form.name.trim().length > 0 && form.phone.length === 10;

  return (
    <>
      <section className="hero">
        <div>
          <h1>{t("login_hero_title")}</h1>
          <p>{t("login_hero_sub")}</p>
        </div>
        <div className="hero-stub">
          <div className="stub-label">{t("login_hero_stub_label1")}</div>
          <div className="stub-value" style={{ fontSize: 24 }}>{t("login_hero_stub_value")}</div>
          <div className="stub-label">{t("login_hero_stub_label2")}</div>
        </div>
      </section>

      <div className="card" style={{ maxWidth: 460, margin: "0 auto" }}>
        <h2 style={{ fontSize: 20, marginBottom: 18 }}>{t("login_card_title")}</h2>

        {/* Option A: Direct Google Sign-In */}
        <div style={{ marginBottom: 18, textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError(t("err_google_login_failed"))}
              useOneTap={false}
              theme="outline"
              size="large"
              shape="rectangular"
              text="signin_with"
              width="100%"
            />
          </div>
        </div>

        {/* Visual OR Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "18px 0",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: "#8A8368",
              letterSpacing: "0.05em",
            }}
          >
            {t("login_or_divider")}
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>

        {/* Option B: Standard Name + Phone Form */}
        <form onSubmit={handleManualSubmit}>
          <div className="field-row">
            <label htmlFor="login-name">{t("login_name_label")}</label>
            <input
              id="login-name"
              type="text"
              required
              placeholder={t("login_name_placeholder")}
              value={form.name}
              onChange={handleNameChange}
            />
          </div>

          <div className="field-row">
            <label htmlFor="login-phone">{t("login_phone_label")}</label>
            <input
              id="login-phone"
              type="tel"
              maxLength={10}
              required
              placeholder={t("login_phone_placeholder")}
              value={form.phone}
              onChange={handlePhoneChange}
            />
          </div>

          <button
            className="btn"
            type="submit"
            disabled={!isManualValid || loading}
            style={{ width: "100%", marginTop: 8 }}
          >
            {loading ? t("login_btn_loading") : t("login_btn")}
          </button>

          {error && <div className="error-text">{error}</div>}
        </form>
      </div>
    </>
  );
}
