import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";

const DISTRICT_CENTRES = {
  Thanjavur: [
    "Thanjavur Main Regulated Market",
    "Kumbakonam Grain Procurement Centre",
    "Papanasam Agricultural Centre",
    "Orathanadu Direct Purchase Centre",
    "Pattukkottai Coastal Centre",
  ],
  Villupuram: [
    "Villupuram Central Market",
    "Tindivanam Regulated Market",
    "Gingee Agricultural Marketing Centre",
    "Kallakurichi Main Paddy Centre",
    "Vikravandi Pulse & Grain Centre",
  ],
  Cuddalore: [
    "Cuddalore Coastal Grain Centre",
    "Panruti Pulse & Millet Centre",
    "Chidambaram Paddy Purchase Centre",
    "Vridhachalam Grain & Oilseed Centre",
    "Kattumannarkoil Regulated Centre",
  ],
};

export default function AdminRegister() {
  const navigate = useNavigate();

  // Signup method: "phone" | "google"
  const [signupMethod, setSignupMethod] = useState("phone");

  // Form state
  const [form, setForm] = useState({
    name: "",
    dob: "",
    district: "Thanjavur",
    procurementCentreName: DISTRICT_CENTRES["Thanjavur"][0],
    alternatePhone: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registeredAdmin, setRegisteredAdmin] = useState(null);
  const [copied, setCopied] = useState(false);

  // Update procurement centre list when district changes
  function handleDistrictChange(newDistrict) {
    const defaultCentre = DISTRICT_CENTRES[newDistrict]?.[0] || "";
    setForm((f) => ({
      ...f,
      district: newDistrict,
      procurementCentreName: defaultCentre,
    }));
    if (error) setError("");
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (error) setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Client-side validations for mandatory fields
    if (!form.name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!form.dob) {
      setError("Date of Birth is required.");
      return;
    }
    if (!form.district.trim()) {
      setError("District is mandatory. Please select Thanjavur, Villupuram, or Cuddalore.");
      return;
    }
    if (!form.procurementCentreName.trim()) {
      setError("Procurement Centre Name is mandatory.");
      return;
    }
    if (!form.password) {
      setError("Password is required.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!form.confirmPassword) {
      setError("Confirm Password is required.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Confirm Password does not match.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: form.name.trim(),
        dob: form.dob,
        district: form.district.trim(),
        procurementCentreName: form.procurementCentreName.trim(),
        // Alternate Phone Number is optional - send trimmed string or empty
        alternatePhone: form.alternatePhone ? form.alternatePhone.trim() : "",
        phone: form.phone ? form.phone.trim() : undefined,
        email: form.email ? form.email.trim().toLowerCase() : undefined,
        signupMethod,
        password: form.password,
        confirmPassword: form.confirmPassword,
      };

      const res = await api.registerAdminAccount(payload);
      if (res && res.admin) {
        setRegisteredAdmin(res.admin);
      }
    } catch (err) {
      setError(err.message || "Failed to register Centre Admin details.");
    } finally {
      setLoading(false);
    }
  }

  function copyAdminId() {
    if (registeredAdmin?.adminId) {
      navigator.clipboard.writeText(registeredAdmin.adminId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "36px auto", padding: "0 16px" }}>
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
          Centre Admin Details
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "rgba(251, 246, 236, 0.75)",
            marginBottom: 20,
            marginTop: 0,
            lineHeight: 1.4,
          }}
        >
          Collect Mandi Officer verification details to generate an official Centre Admin ID.
        </p>

        {registeredAdmin ? (
          /* Registration Success Screen */
          <div
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 8,
              padding: "24px 20px",
              marginTop: 10,
            }}
          >
            <div
              style={{
                display: "inline-block",
                background: "rgba(76, 175, 80, 0.2)",
                color: "#72E385",
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              ✓ REGISTRATION SUCCESSFUL
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Official Admin ID
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  fontFamily: "var(--font-mono)",
                  color: "var(--wheat)",
                  marginTop: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span>{registeredAdmin.adminId}</span>
                <button
                  type="button"
                  onClick={copyAdminId}
                  style={{
                    background: "rgba(255, 255, 255, 0.15)",
                    border: "none",
                    color: "var(--paper)",
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px 16px",
                fontSize: 13,
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                paddingTop: 16,
                marginBottom: 20,
              }}
            >
              <div>
                <span style={{ opacity: 0.65 }}>Name:</span>{" "}
                <strong>{registeredAdmin.name}</strong>
              </div>
              <div>
                <span style={{ opacity: 0.65 }}>DOB:</span>{" "}
                <strong>{registeredAdmin.dob}</strong>
              </div>
              <div>
                <span style={{ opacity: 0.65 }}>District:</span>{" "}
                <strong>{registeredAdmin.district}</strong>
              </div>
              <div>
                <span style={{ opacity: 0.65 }}>Centre:</span>{" "}
                <strong>{registeredAdmin.procurementCentreName}</strong>
              </div>
              {registeredAdmin.alternatePhone && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={{ opacity: 0.65 }}>Alternate Phone:</span>{" "}
                  <strong>{registeredAdmin.alternatePhone}</strong>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn"
                type="button"
                onClick={() => navigate("/admin")}
                style={{
                  flex: 1,
                  background: "var(--wheat)",
                  color: "var(--ink)",
                  fontWeight: 700,
                }}
              >
                Proceed to Admin Login →
              </button>
              <button
                type="button"
                onClick={() => {
                  setRegisteredAdmin(null);
                  setForm({
                    name: "",
                    dob: "",
                    district: "Thanjavur",
                    procurementCentreName: DISTRICT_CENTRES["Thanjavur"][0],
                    alternatePhone: "",
                    phone: "",
                    email: "",
                    password: "",
                    confirmPassword: "",
                  });
                }}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "var(--paper)",
                  padding: "0 16px",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Register Another
              </button>
            </div>
          </div>
        ) : (
          /* Centre Admin Details Form */
          <>
            {/* Signup Method Selection Tabs */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 20,
                background: "rgba(0, 0, 0, 0.18)",
                padding: 4,
                borderRadius: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setSignupMethod("phone")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  background: signupMethod === "phone" ? "var(--wheat)" : "transparent",
                  color: signupMethod === "phone" ? "var(--ink)" : "var(--paper)",
                  transition: "all 0.15s ease",
                }}
              >
                📱 Phone Signup
              </button>
              <button
                type="button"
                onClick={() => setSignupMethod("google")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  background: signupMethod === "google" ? "var(--wheat)" : "transparent",
                  color: signupMethod === "google" ? "var(--ink)" : "var(--paper)",
                  transition: "all 0.15s ease",
                }}
              >
                🌐 Google Signup
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Primary Identity Field based on Signup Method */}
              {signupMethod === "phone" ? (
                <div className="field-row">
                  <label htmlFor="admin-phone" style={{ color: "var(--paper)" }}>
                    Primary Mobile Number
                  </label>
                  <input
                    id="admin-phone"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    style={{ background: "#fff", color: "var(--ink)" }}
                  />
                </div>
              ) : (
                <div className="field-row">
                  <label htmlFor="admin-email" style={{ color: "var(--paper)" }}>
                    Google / Official Officer Email
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    placeholder="officer@tn.gov.in or gmail.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    style={{ background: "#fff", color: "var(--ink)" }}
                  />
                </div>
              )}

              {/* 1. Name */}
              <div className="field-row">
                <label htmlFor="admin-name" style={{ color: "var(--paper)" }}>
                  Full Name <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="admin-name"
                  type="text"
                  required
                  placeholder="Enter officer full name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  style={{ background: "#fff", color: "var(--ink)" }}
                />
              </div>

              {/* 2. Date of Birth */}
              <div className="field-row">
                <label htmlFor="admin-dob" style={{ color: "var(--paper)" }}>
                  Date of Birth <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="admin-dob"
                  type="date"
                  required
                  value={form.dob}
                  onChange={(e) => update("dob", e.target.value)}
                  style={{ background: "#fff", color: "var(--ink)" }}
                />
              </div>

              {/* 3. District */}
              <div className="field-row">
                <label htmlFor="admin-district" style={{ color: "var(--paper)" }}>
                  District <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <select
                  id="admin-district"
                  required
                  value={form.district}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#fff",
                    color: "var(--ink)",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                  }}
                >
                  <option value="Thanjavur">Thanjavur (THJ)</option>
                  <option value="Villupuram">Villupuram (VPM)</option>
                  <option value="Cuddalore">Cuddalore (CDL)</option>
                </select>
              </div>

              {/* 4. Procurement Centre Name */}
              <div className="field-row">
                <label htmlFor="admin-centre" style={{ color: "var(--paper)" }}>
                  Procurement Centre Name <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <select
                  id="admin-centre"
                  required
                  value={form.procurementCentreName}
                  onChange={(e) => update("procurementCentreName", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#fff",
                    color: "var(--ink)",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                  }}
                >
                  {(DISTRICT_CENTRES[form.district] || []).map((centre) => (
                    <option key={centre} value={centre}>
                      {centre}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Alternate Phone Number (optional) - Placed directly AFTER Procurement Centre Name */}
              <div className="field-row">
                <label htmlFor="admin-alt-phone" style={{ color: "var(--paper)" }}>
                  Alternate Phone Number (optional)
                </label>
                <input
                  id="admin-alt-phone"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={form.alternatePhone}
                  onChange={(e) => update("alternatePhone", e.target.value)}
                  style={{ background: "#fff", color: "var(--ink)" }}
                />
                <span
                  style={{
                    fontSize: 11,
                    opacity: 0.7,
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  Optional secondary contact for administrative notifications and verification.
                </span>
              </div>

              {/* 6. Create Password */}
              <div className="field-row">
                <label htmlFor="admin-password" style={{ color: "var(--paper)" }}>
                  Create Password <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  style={{ background: "#fff", color: "var(--ink)" }}
                />
              </div>

              {/* 7. Confirm Password */}
              <div className="field-row">
                <label htmlFor="admin-confirm-password" style={{ color: "var(--paper)" }}>
                  Confirm Password <span style={{ color: "var(--wheat)" }}>*</span>
                </label>
                <input
                  id="admin-confirm-password"
                  type="password"
                  required
                  placeholder="Enter password"
                  value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  style={{ background: "#fff", color: "var(--ink)" }}
                />
              </div>

              <button
                className="btn"
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  marginTop: 16,
                  background: "var(--wheat)",
                  color: "var(--ink)",
                  fontWeight: 700,
                  padding: "12px",
                }}
              >
                {loading ? "Registering & Generating ID..." : "Register Centre Admin & Generate ID"}
              </button>

              {error && (
                <div
                  className="error-text"
                  style={{
                    color: "#FFA89B",
                    background: "rgba(162, 59, 46, 0.25)",
                    padding: "10px 12px",
                    borderRadius: 4,
                    marginTop: 14,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              <div
                style={{
                  textAlign: "center",
                  marginTop: 20,
                  fontSize: 13,
                  opacity: 0.85,
                }}
              >
                Already have credentials?{" "}
                <Link
                  to="/admin"
                  style={{
                    color: "var(--wheat)",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  Go to Admin Login →
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
