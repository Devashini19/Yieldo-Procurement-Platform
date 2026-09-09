const BASE = "/api";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  loginFarmer: (payload) =>
    fetch(`${BASE}/farmers/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),

  getCentres: () => fetch(`${BASE}/centres`).then(handle),
  getSuggestedCentres: ({ crop, lat, lng, limit } = {}) => {
    const params = new URLSearchParams();
    if (crop) params.append("crop", crop);
    if (lat !== undefined && lat !== null) params.append("lat", lat);
    if (lng !== undefined && lng !== null) params.append("lng", lng);
    if (limit) params.append("limit", limit);
    return fetch(`${BASE}/centres/suggestions?${params.toString()}`).then(handle);
  },
  getCentrePublicQueue: (centreId) =>
    fetch(`${BASE}/centres/${centreId}/public-queue`).then(handle),
  getCentreSlotAvailability: (centreId, date) =>
    fetch(`${BASE}/centres/${centreId}/slot-availability?date=${encodeURIComponent(date || "")}`).then(handle),
  getCentreDateRangeAvailability: (centreId, days = 7) =>
    fetch(`${BASE}/centres/${centreId}/date-range-availability?days=${days}`).then(handle),

  registerFarmer: (payload) =>
    fetch(`${BASE}/farmers/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),

  joinLiveQueue: (payload) =>
    fetch(`${BASE}/farmers/join-live-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),

  getFarmerStatus: (id) => fetch(`${BASE}/farmers/${id}/status`).then(handle),
  getFarmerReceipt: (id) => fetch(`${BASE}/farmers/${id}/receipt`).then(handle),
  getFarmersByIdentifier: (identifier) =>
    fetch(`${BASE}/farmers/by-identifier/${encodeURIComponent(identifier)}`).then(handle),
  getFarmersByPhone: (phone) =>
    fetch(`${BASE}/farmers/by-identifier/${encodeURIComponent(phone)}`).then(handle),
  cancelFarmerToken: (id) =>
    fetch(`${BASE}/farmers/${id}/cancel`, {
      method: "DELETE",
    }).then(handle),
  rescheduleFarmerToken: (id, payload = {}) =>
    fetch(`${BASE}/farmers/${id}/reschedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
  checkInFarmerToken: (id) =>
    fetch(`${BASE}/farmers/${id}/check-in`, {
      method: "PATCH",
    }).then(handle),

  // Slot Swap API
  getAvailableSwapPartners: ({ centreId, crop, excludeTokenId } = {}) => {
    const params = new URLSearchParams();
    if (centreId) params.append("centreId", centreId);
    if (crop) params.append("crop", crop);
    if (excludeTokenId) params.append("excludeTokenId", excludeTokenId);
    return fetch(`${BASE}/farmers/available-swap-partners?${params.toString()}`).then(handle);
  },
  createSwapRequest: (payload) =>
    fetch(`${BASE}/farmers/swap-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
  getSwapRequests: (identifier) =>
    fetch(`${BASE}/farmers/swap-requests/${encodeURIComponent(identifier)}`).then(handle),
  respondSwapRequest: (id, response, responderIdentifier = null) =>
    fetch(`${BASE}/farmers/swap-requests/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, responderIdentifier }),
    }).then(handle),

  // Notifications API
  getFarmerNotifications: (identifier) =>
    fetch(`${BASE}/farmers/notifications/${encodeURIComponent(identifier)}`).then(handle),
  markNotificationRead: (id) =>
    fetch(`${BASE}/farmers/notifications/${id}/read`, {
      method: "PATCH",
    }).then(handle),
  markAllNotificationsRead: (identifier) =>
    fetch(`${BASE}/farmers/notifications/mark-all-read/${encodeURIComponent(identifier)}`, {
      method: "PATCH",
    }).then(handle),

  getAdminQueue: (centreId) => fetch(`${BASE}/admin/queue/${centreId}`).then(handle),
  getAdminLiveQueue: (centreId) => fetch(`${BASE}/admin/queue/live/${centreId}`).then(handle),
  getAdminTodaySlots: (centreId) => fetch(`${BASE}/admin/queue/today-slots/${centreId}`).then(handle),
  getAdminUpcomingSlots: (centreId) => fetch(`${BASE}/admin/queue/upcoming-slots/${centreId}`).then(handle),

  getAdminOverview: () => fetch(`${BASE}/admin/overview`).then(handle),

  loginAdmin: (payload) =>
    fetch(`${BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),

  advanceFarmer: (id, statusOrPayload, extra = {}) => {
    const payload = typeof statusOrPayload === "string" ? { status: statusOrPayload, ...extra } : statusOrPayload;
    return fetch(`${BASE}/admin/farmers/${id}/advance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle);
  },

  releaseFarmerReceipt: (id, payload = {}) =>
    fetch(`${BASE}/admin/farmers/${id}/release-receipt`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),

  cancelAdminFarmerWithReason: (id, reason) =>
    fetch(`${BASE}/admin/farmers/${id}/cancel-with-reason`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).then(handle),

  sendChatbotMessage: ({ message, language, history }) =>
    fetch(`${BASE}/chatbot/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, language, history }),
    }).then(handle),

  sendAdminChatbotMessage: ({ message, language, history }) =>
    fetch(`${BASE}/admin/chatbot/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, language, history }),
    }).then(handle),

  sendCentreDelayAlert: (centreId, message) =>
    fetch(`${BASE}/admin/centres/${centreId}/delay-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }).then(handle),

  // Support Tickets API
  getTicketTypes: () => fetch(`${BASE}/tickets/types`).then(handle),
  createTicket: (payload) =>
    fetch(`${BASE}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
  getTicketsByIdentifier: (identifier) =>
    fetch(`${BASE}/tickets/by-identifier/${encodeURIComponent(identifier)}`).then(handle),
  getTicketsByPhone: (phone) =>
    fetch(`${BASE}/tickets/by-identifier/${encodeURIComponent(phone)}`).then(handle),
  getAdminTickets: () => fetch(`${BASE}/admin/tickets`).then(handle),
  updateAdminTicketStatus: (id, status) =>
    fetch(`${BASE}/admin/tickets/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then(handle),

  // Permanent Procurement History Records API (Read-Only Snapshots)
  getFarmerProcurementHistory: (identifier) =>
    fetch(`${BASE}/farmers/procurement-history/${encodeURIComponent(identifier)}`).then(handle),
  getAdminProcurementRecords: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.append(k, v);
    });
    return fetch(`${BASE}/admin/procurement-records?${q.toString()}`).then(handle);
  },

  // Farmer Profile & Account Summary API
  getFarmerProfile: (identifier, name) => {
    const q = name ? `?name=${encodeURIComponent(name)}` : "";
    return fetch(`${BASE}/farmers/profile/${encodeURIComponent(identifier)}${q}`).then(handle);
  },

  // Admin Analytics Dashboard API
  getAdminAnalyticsSummary: () => fetch(`${BASE}/admin/analytics-summary`).then(handle),
};



