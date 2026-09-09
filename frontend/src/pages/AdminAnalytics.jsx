import React, { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { api } from "../api.js";

// Curated harvest mandi palette aligned with Yieldo CSS tokens:
// --field (#1F3D2B), --wheat (#C98A2B), --field-light (#2E5940),
// --wheat-light (#E8C77E), --danger (#A23B2E), --line (#DCD2B8)
const CROP_COLORS = [
  "#1F3D2B", // Deep Harvest Green (Paddy)
  "#C98A2B", // Golden Wheat / Mustard
  "#2E5940", // Forest Sage (Pulses)
  "#D97706", // Burnt Amber (Millets)
  "#8A8368", // Dried Husk Brown (Groundnut)
  "#105B32", // Rich Emerald (Sugarcane)
  "#E8C77E", // Soft Corn / Maize
  "#7C2D12", // Terracotta Earth
];

const STATUS_COLORS = {
  in_queue: "#C98A2B", // Mustard / in-queue waiting
  quality_check: "#2E5940", // Foliage green
  procured: "#1F3D2B", // Deep harvest green
  payment_initiated: "#8C590E", // Deep amber
  paid: "#105B32", // Rich emerald paid
  cancelled: "#A23B2E", // Danger red
  booked: "#8A8368", // Slate / husk booked
};

const TICKET_COLORS = [
  "#1F3D2B", // Deep harvest green (Operational)
  "#C98A2B", // Mustard (Payment)
  "#2E5940", // Forest green (Account)
  "#A23B2E", // Alert red (Technical Issue)
  "#8A8368", // Husk brown (Information)
  "#D97706", // Amber (Complaint)
  "#7C2D12", // Earth brown (Grievance)
  "#4A4636", // Slate (Other)
];

const CROWD_COLORS = {
  low: "#1F3D2B", // Deep Harvest Green
  medium: "#C98A2B", // Warm Mustard Amber
  high: "#A23B2E", // Crimson Red / Overcrowded
};

// Custom Tooltip component for consistent Mandi-themed aesthetics
function CustomChartTooltip({ active, payload, labelSuffix = "" }) {
  if (active && payload && payload.length) {
    const data = payload[0];
    const name = data.name || data.payload?.name || "Category";
    const value = data.value !== undefined ? data.value : data.payload?.count || 0;
    const percentage = data.payload?.percentage;
    const color = data.color || data.payload?.fill || "#1F3D2B";

    return (
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "8px 12px",
          boxShadow: "0 4px 14px rgba(35, 41, 31, 0.12)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
          minWidth: 120,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: color,
            }}
          />
          <strong style={{ color: "var(--ink)", fontSize: 12 }}>{name}</strong>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--field)", fontWeight: 700 }}>
          {value.toLocaleString()} {labelSuffix}
          {percentage !== undefined && (
            <span style={{ fontSize: 11, color: "#8A8368", marginLeft: 6, fontWeight: 500 }}>
              ({percentage}%)
            </span>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getAdminAnalyticsSummary();
      setData(res);
      setLastRefreshed(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      console.error("[AdminAnalytics] Failed to fetch analytics summary:", err);
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = data?.summary || {};
  const cropBreakdown = data?.cropBreakdown || [];
  const statusBreakdown = data?.statusBreakdown || [];
  const ticketTypeBreakdown = data?.ticketTypeBreakdown || [];
  const crowdDistribution = data?.crowdDistribution || [];

  return (
    <div style={{ width: "100%" }}>
      {/* Top Header & Refresh Control */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 22,
              color: "var(--field)",
              fontFamily: "var(--font-display)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📊</span>
            <span>Mandi Operations Analytics</span>
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#6A6553" }}>
            Real-time aggregated intelligence across farmer bookings, queue lifecycle, support tickets, and centre load.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastRefreshed && (
            <span style={{ fontSize: 12, color: "#8A8368", fontFamily: "var(--font-mono)" }}>
              Updated: {lastRefreshed}
            </span>
          )}
          <button
            type="button"
            className="btn secondary"
            onClick={fetchAnalytics}
            disabled={loading}
            style={{
              fontSize: 13,
              padding: "7px 14px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{loading ? "⏳" : "🔄"}</span>
            <span>{loading ? "Refreshing..." : "Refresh Data"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="error-text" style={{ marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Top KPI Summary Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div
          className="overview-card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderLeft: "4px solid var(--field)",
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
            Total Tokens Tracked
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--field)" }}>
              {summary.totalFarmers !== undefined ? summary.totalFarmers : "—"}
            </span>
            <span style={{ fontSize: 12, color: "#6A6553" }}>all lifecycle tokens</span>
          </div>
        </div>

        <div
          className="overview-card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderLeft: "4px solid var(--wheat)",
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
            Active / Completed Bookings
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--wheat)" }}>
              {summary.activeCompletedBookings !== undefined ? summary.activeCompletedBookings : "—"}
            </span>
            <span style={{ fontSize: 12, color: "#6A6553" }}>non-cancelled</span>
          </div>
        </div>

        <div
          className="overview-card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderLeft: "4px solid var(--field-light)",
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
            Procurement Centres
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--field-light)" }}>
              {summary.totalCentres !== undefined ? summary.totalCentres : 15}
            </span>
            <span style={{ fontSize: 12, color: "#6A6553" }}>Tamil Nadu direct purchase</span>
          </div>
        </div>

        <div
          className="overview-card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderLeft: "4px solid var(--danger)",
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 11, color: "#8A8368", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
            Support & Grievances
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)" }}>
              {summary.totalTickets !== undefined ? summary.totalTickets : "—"}
            </span>
            <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
              {summary.openTickets ? `(${summary.openTickets} open)` : "(0 open)"}
            </span>
          </div>
        </div>
      </div>

      {/* 2x2 Grid with EXACT same fixed height for all 4 chart cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
          gap: 20,
          marginBottom: 30,
        }}
      >
        {/* =========================================================================
            CHART 1: Donut Chart - Farmers by Crop Type (Active + Completed Bookings)
            ========================================================================= */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "20px 22px",
            height: 440, // EXPLICIT FIXED HEIGHT
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            margin: 0,
          }}
        >
          {/* Card Header (Fixed Height) */}
          <div style={{ height: 60, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ fontSize: 16, color: "var(--field)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🌾</span>
                <span>Farmers by Crop Type</span>
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#6A6553" }}>
                Active & completed bookings across registered commodities
              </p>
            </div>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "rgba(31, 61, 43, 0.1)",
                color: "var(--field)",
                padding: "3px 8px",
                borderRadius: 12,
                fontWeight: 700,
              }}
            >
              {cropBreakdown.reduce((acc, c) => acc + c.value, 0)} Bookings
            </span>
          </div>

          {/* Chart Viewport (Flex 1, with Recharts ResponsiveContainer) */}
          <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
            {cropBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomChartTooltip labelSuffix="farmers" />} />
                  <Pie
                    data={cropBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="46%"
                    innerRadius={55}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {cropBreakdown.map((entry, index) => (
                      <Cell
                        key={`crop-cell-${index}`}
                        fill={CROP_COLORS[index % CROP_COLORS.length]}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{
                      fontSize: 11,
                      fontFamily: "var(--font-body)",
                      paddingTop: 8,
                      maxHeight: 56,
                      overflowY: "auto",
                      lineHeight: "18px",
                    }}
                    formatter={(value, entry) => (
                      <span style={{ color: "#4A4636", fontWeight: 500, marginRight: 8 }}>
                        {value}:{" "}
                        <strong style={{ color: "var(--ink)", fontFamily: "var(--font-mono)" }}>
                          {entry.payload?.value} ({entry.payload?.percentage}%)
                        </strong>
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8A8368",
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 28, marginBottom: 6 }}>🌾</span>
                <span>No crop booking data available yet</span>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            CHART 2: Donut Chart - Tokens by Status (Lifecycle Pipeline)
            ========================================================================= */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "20px 22px",
            height: 440, // EXPLICIT FIXED HEIGHT
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            margin: 0,
          }}
        >
          {/* Card Header (Fixed Height) */}
          <div style={{ height: 60, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ fontSize: 16, color: "var(--field)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🎫</span>
                <span>Tokens by Lifecycle Status</span>
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#6A6553" }}>
                Queue progression from arrival to MSP payment credit
              </p>
            </div>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "rgba(201, 138, 43, 0.15)",
                color: "#8C590E",
                padding: "3px 8px",
                borderRadius: 12,
                fontWeight: 700,
              }}
            >
              {statusBreakdown.reduce((acc, s) => acc + s.value, 0)} Tokens
            </span>
          </div>

          {/* Chart Viewport */}
          <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
            {statusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomChartTooltip labelSuffix="tokens" />} />
                  <Pie
                    data={statusBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="46%"
                    innerRadius={55}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {statusBreakdown.map((entry, index) => (
                      <Cell
                        key={`status-cell-${index}`}
                        fill={STATUS_COLORS[entry.key] || entry.color || "#8A8368"}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{
                      fontSize: 11,
                      fontFamily: "var(--font-body)",
                      paddingTop: 8,
                      maxHeight: 56,
                      overflowY: "auto",
                      lineHeight: "18px",
                    }}
                    formatter={(value, entry) => (
                      <span style={{ color: "#4A4636", fontWeight: 500, marginRight: 8 }}>
                        {value}:{" "}
                        <strong style={{ color: "var(--ink)", fontFamily: "var(--font-mono)" }}>
                          {entry.payload?.value}
                        </strong>
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8A8368",
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 28, marginBottom: 6 }}>🎫</span>
                <span>No tokens generated yet</span>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            CHART 3: Pie Chart - Support Tickets by Type
            ========================================================================= */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "20px 22px",
            height: 440, // EXPLICIT FIXED HEIGHT
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            margin: 0,
          }}
        >
          {/* Card Header (Fixed Height) */}
          <div style={{ height: 60, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ fontSize: 16, color: "var(--field)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <span>📑</span>
                <span>Support Tickets by Category</span>
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#6A6553" }}>
                Grievance distribution across operational, payment, and mandi queries
              </p>
            </div>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "rgba(162, 59, 46, 0.12)",
                color: "var(--danger)",
                padding: "3px 8px",
                borderRadius: 12,
                fontWeight: 700,
              }}
            >
              {ticketTypeBreakdown.reduce((acc, t) => acc + t.value, 0)} Tickets
            </span>
          </div>

          {/* Chart Viewport */}
          <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
            {ticketTypeBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomChartTooltip labelSuffix="tickets" />} />
                  <Pie
                    data={ticketTypeBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="46%"
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {ticketTypeBreakdown.map((entry, index) => (
                      <Cell
                        key={`ticket-cell-${index}`}
                        fill={TICKET_COLORS[index % TICKET_COLORS.length]}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{
                      fontSize: 11,
                      fontFamily: "var(--font-body)",
                      paddingTop: 8,
                      maxHeight: 56,
                      overflowY: "auto",
                      lineHeight: "18px",
                    }}
                    formatter={(value, entry) => (
                      <span style={{ color: "#4A4636", fontWeight: 500, marginRight: 8 }}>
                        {value}:{" "}
                        <strong style={{ color: "var(--ink)", fontFamily: "var(--font-mono)" }}>
                          {entry.payload?.value} ({entry.payload?.percentage}%)
                        </strong>
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8A8368",
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 28, marginBottom: 6 }}>📬</span>
                <span style={{ fontWeight: 600 }}>No support tickets registered yet</span>
                <span style={{ fontSize: 11, color: "#8A8368", marginTop: 2 }}>
                  Farmer tickets will automatically categorize here
                </span>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            CHART 4: Bar Chart - Crowd Status Distribution Across 15 Centres
            ========================================================================= */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "20px 22px",
            height: 440, // EXPLICIT FIXED HEIGHT
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            margin: 0,
          }}
        >
          {/* Card Header (Fixed Height) */}
          <div style={{ height: 60, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ fontSize: 16, color: "var(--field)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🏢</span>
                <span>Crowd Distribution Across Centres</span>
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#6A6553" }}>
                Current real-time traffic across all 15 regulated mandi purchase centres
              </p>
            </div>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "rgba(31, 61, 43, 0.1)",
                color: "var(--field)",
                padding: "3px 8px",
                borderRadius: 12,
                fontWeight: 700,
              }}
            >
              15 Centres
            </span>
          </div>

          {/* Chart Viewport */}
          <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
            {crowdDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={crowdDistribution}
                  margin={{ top: 16, right: 20, left: -10, bottom: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" opacity={0.6} />
                  <XAxis
                    dataKey="name"
                    stroke="#8A8368"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: "var(--line)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="#8A8368"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "var(--line)" }}
                  />
                  <Tooltip content={<CustomChartTooltip labelSuffix="centres" />} />
                  <Bar
                    dataKey="count"
                    name="Centres"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={64}
                  >
                    {crowdDistribution.map((entry, index) => (
                      <Cell
                        key={`crowd-bar-${index}`}
                        fill={CROWD_COLORS[entry.key] || entry.fill || "var(--field)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8A8368",
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 28, marginBottom: 6 }}>🏢</span>
                <span>No centre crowd metrics available</span>
              </div>
            )}
          </div>

          {/* Bottom Footnote for Crowd Status */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              paddingTop: 8,
              borderTop: "1px dashed var(--line)",
              fontSize: 11,
              color: "#6A6553",
            }}
          >
            <span>🟢 Low: &le;4 in queue</span>
            <span>🟡 Medium: 5–9 in queue</span>
            <span>🔴 High: 10+ in queue</span>
          </div>
        </div>
      </div>
    </div>
  );
}
