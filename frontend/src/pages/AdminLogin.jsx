import { useState } from "react";
import { api } from "../api.js";

export default function AdminLogin({ onLogin }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (error) setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api.loginAdmin({
        username: form.username.trim(),
        password: form.password,
      });
      if (onLogin) {
        onLogin(data.token);
      }
    } catch (err) {
      setError(err.message || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: "40px auto" }}>
      <div
        className="card"
        style={{
          background: "var(--field)",
          color: "var(--paper)",
          border: "1px solid var(--field-light)",
          padding: "36px 32px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)",
        }}
      >
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
          <span style={{ fontSize: 12, opacity: 0.8, fontFamily: "var(--font-mono)" }}>RESTRICTED ACCESS</span>
        </div>

        <h2 style={{ fontSize: 24, marginBottom: 8, color: "var(--paper)" }}>
          Centre Admin Login
        </h2>
        <p style={{ fontSize: 14, color: "rgba(251, 246, 236, 0.75)", marginBottom: 24, marginTop: 0 }}>
          Manage live mandi queues, advance farmer verification stages, and update procurement loads.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <label htmlFor="admin-username" style={{ color: "var(--paper)" }}>
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              required
              placeholder="e.g. admin"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              style={{ background: "#fff", color: "var(--ink)" }}
            />
          </div>

          <div className="field-row">
            <label htmlFor="admin-password" style={{ color: "var(--paper)" }}>
              Password
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

          <button
            className="btn"
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 12,
              background: "var(--wheat)",
              color: "var(--ink)",
              fontWeight: 700,
            }}
          >
            {loading ? "Logging in..." : "Login"}
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
        </form>
      </div>
    </div>
  );
}
