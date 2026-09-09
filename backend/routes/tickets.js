import { Router } from "express";
import store, { TICKET_TYPES, TICKET_STATUS } from "../data/store.js";
import { sendSMS } from "../utils/sms.js";

const router = Router();

// GET /api/tickets/types - Get structured ticket categories and subcategories
router.get("/tickets/types", (req, res) => {
  res.json({ types: TICKET_TYPES });
});

// POST /api/tickets - Create a new support ticket
router.post("/tickets", (req, res) => {
  const {
    farmerPhone,
    farmerEmail,
    farmerIdentifier,
    farmerName,
    ticketType,
    ticketSubtype,
    description,
    state = "Tamil Nadu",
    district,
    village,
    pincode,
  } = req.body;

  const phone = farmerPhone || (farmerIdentifier && /^\d{10}$/.test(farmerIdentifier) ? farmerIdentifier : null);
  const email = farmerEmail || (farmerIdentifier && farmerIdentifier.includes("@") ? farmerIdentifier : null);

  // Validation
  if (!farmerName || (!phone && !email) || !ticketType || !ticketSubtype || !description || !district || !village || !pincode) {
    return res.status(400).json({ error: "Farmer contact (phone or email) and all ticket details are required" });
  }

  let cleanPhone = null;
  if (phone) {
    cleanPhone = String(phone).replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: "A valid 10-digit mobile number is required" });
    }
  }

  const cleanPincode = String(pincode).replace(/\D/g, "");
  if (cleanPincode.length !== 6) {
    return res.status(400).json({ error: "A valid 6-digit pincode is required" });
  }

  if (String(description).trim().length < 5) {
    return res.status(400).json({ error: "Description must be at least 5 characters long" });
  }

  // Validate ticketType exists
  if (!TICKET_TYPES[ticketType]) {
    return res.status(400).json({
      error: `Invalid ticket type '${ticketType}'. Allowed types: ${Object.keys(TICKET_TYPES).join(", ")}`,
    });
  }

  // Validate ticketSubtype belongs to ticketType
  const allowedSubtypes = TICKET_TYPES[ticketType];
  if (!allowedSubtypes.includes(ticketSubtype)) {
    return res.status(400).json({
      error: `Invalid subtype '${ticketSubtype}' for type '${ticketType}'. Allowed: ${allowedSubtypes.join(", ")}`,
    });
  }

  const ticket = store.createTicket({
    farmerPhone: cleanPhone,
    farmerEmail: email ? String(email).trim() : null,
    farmerName: farmerName.trim(),
    ticketType: ticketType.trim(),
    ticketSubtype: ticketSubtype.trim(),
    description: description.trim(),
    state: (state || "Tamil Nadu").trim(),
    district: district.trim(),
    village: village.trim(),
    pincode: cleanPincode,
  });

  // Notify farmer via SMS if phone is available
  if (cleanPhone) {
    sendSMS(
      cleanPhone,
      `Hi ${ticket.farmerName}, your support ticket ${ticket.id} (${ticket.ticketType} - ${ticket.ticketSubtype}) has been registered. Our mandi support team will review and update you shortly.`
    );
  }

  res.status(201).json({
    success: true,
    ticket,
  });
});

// GET /api/tickets/by-identifier/:identifier - Get tickets by phone or email
router.get("/tickets/by-identifier/:identifier", (req, res) => {
  const { identifier } = req.params;
  const tickets = store.getTicketsByIdentifier(identifier);
  res.json(tickets);
});

// GET /api/tickets/by-phone/:phone - Backward-compatible alias
router.get("/tickets/by-phone/:phone", (req, res) => {
  const { phone } = req.params;
  const tickets = store.getTicketsByIdentifier(phone);
  res.json(tickets);
});

// GET /api/admin/tickets - Admin: Get all tickets
router.get("/admin/tickets", (req, res) => {
  const tickets = store.getAllTickets();
  res.json(tickets);
});

// PATCH /api/admin/tickets/:id/status - Admin: Update ticket status
router.patch("/admin/tickets/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = Object.values(TICKET_STATUS);
  const clean = String(status || "").trim().toLowerCase().replace(/\s+/g, "_");
  const statusMap = {
    open: TICKET_STATUS.OPEN,
    in_progress: TICKET_STATUS.IN_PROGRESS,
    resolved: TICKET_STATUS.RESOLVED,
    closed: TICKET_STATUS.CLOSED,
    reopened: TICKET_STATUS.REOPENED,
    reopen: TICKET_STATUS.REOPENED,
  };
  const targetStatus = statusMap[clean] || (validStatuses.includes(status) ? status : null);

  if (!targetStatus) {
    return res.status(400).json({
      error: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
    });
  }

  const updatedTicket = store.updateTicketStatus(id, targetStatus);
  if (!updatedTicket) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  // Send SMS update to farmer on status change
  if (updatedTicket.farmerPhone) {
    sendSMS(
      updatedTicket.farmerPhone,
      `Hi ${updatedTicket.farmerName}, status for your ticket ${updatedTicket.id} has been updated to: ${updatedTicket.status.toUpperCase()}.`
    );
  }

  res.json({
    success: true,
    ticket: updatedTicket,
  });
});

export default router;
