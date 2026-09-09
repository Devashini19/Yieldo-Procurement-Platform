import { Router } from "express";
import store from "../data/store.js";
import { sendSMS } from "../utils/sms.js";

const router = Router();

// GET /api/admin/queue/:centreId (All active queue tokens)
router.get("/admin/queue/:centreId", (req, res) => {
  const queue = store.getQueueForCentre(req.params.centreId);
  res.json(queue);
});

// GET /api/admin/queue/live/:centreId (Only live walk-in queue tokens)
router.get("/admin/queue/live/:centreId", (req, res) => {
  const liveQueue = store.getDailyLiveQueue(req.params.centreId);
  res.json(liveQueue);
});

// GET /api/admin/queue/today-slots/:centreId (Today's pre-booked slotted queue)
router.get("/admin/queue/today-slots/:centreId", (req, res) => {
  const todaySlots = store.getTodaySlottedQueue(req.params.centreId);
  res.json(todaySlots);
});

// GET /api/admin/queue/upcoming-slots/:centreId (Future days' pre-booked slotted queue grouped by date)
router.get("/admin/queue/upcoming-slots/:centreId", (req, res) => {
  const upcomingSlots = store.getUpcomingSlottedQueue(req.params.centreId);
  res.json(upcomingSlots);
});

// GET /api/admin/overview - load across all centres, for the load-balancing view
router.get("/admin/overview", (req, res) => {
  const overview = store.getCentres().map((centre) => ({
    centre,
    queueLength: store.getQueueForCentre(centre.id).length,
    liveAvgMinutes: store.getLiveAvgProcessMinutes(centre.id),
    hasLivePace: store.hasLivePace(centre.id),
    crowdStatus: store.getCrowdStatus(centre.id),
    bestTimeToVisit: store.getBestTimeToVisit(centre.id),
  }));
  res.json(overview);
});

const STAGE_MESSAGES = {
  [store.STATUS.QUALITY_CHECK]: (f) => `${f.name}, your produce is now under quality check.`,
  [store.STATUS.PROCURED]: (f) => `${f.name}, your produce has been procured. Payment is being processed.`,
  [store.STATUS.PAYMENT_INITIATED]: (f) => `${f.name}, payment has been initiated for your procurement.`,
  [store.STATUS.PAID]: (f) => `${f.name}, payment credited. Thank you for using Yieldo.`,
};

// PATCH /api/admin/farmers/:id/advance  { status, verifiedQuantity, verifiedUnit, varietySelection, discrepancyReason, adminName }
router.patch("/admin/farmers/:id/advance", (req, res) => {
  const { status, verifiedQuantity, verifiedUnit, varietySelection, discrepancyReason, adminName } = req.body;
  if (!Object.values(store.STATUS).includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const existingFarmer = store.getFarmer(req.params.id);
  if (!existingFarmer) return res.status(404).json({ error: "Farmer not found" });

  let farmer;

  if (status === store.STATUS.PROCURED) {
    // When advancing from quality_check to procured, enforce produce weighment verification
    try {
      const result = store.verifyAndAdvanceFarmer(req.params.id, {
        verifiedQuantity,
        verifiedUnit,
        varietySelection,
        discrepancyReason,
        adminName,
      });
      farmer = result.farmer;

      // Dispatch customized discrepancy or matching confirmation notification
      let procuredSms = "";
      const unitLabel = farmer.verifiedUnit || farmer.declaredUnit || "bags";
      const bookedUnitLabel = farmer.declaredUnit || "bags";

      if (farmer.declaredQuantityKg !== undefined && farmer.verifiedQuantityKg !== undefined && Math.abs(farmer.declaredQuantityKg - farmer.verifiedQuantityKg) > 0.01) {
        const reasonText = farmer.quantityDiscrepancyReason ? ` Reason: ${farmer.quantityDiscrepancyReason}.` : "";
        procuredSms = `Hi ${farmer.name}, your produce has been verified at ${farmer.verifiedQuantity} ${unitLabel} (booked: ${farmer.declaredQuantity} ${bookedUnitLabel}).${reasonText} Final payment will be calculated on the verified amount.`;
      } else {
        procuredSms = `Hi ${farmer.name}, your produce has been procured - ${farmer.verifiedQuantity || farmer.declaredQuantity} ${unitLabel} verified, matching your booking.`;
      }

      if (farmer.phone) {
        sendSMS(farmer.phone, procuredSms);
      }

      return res.json(farmer);
    } catch (err) {
      return res.status(err.status || 400).json({
        error: err.message,
        discrepancyPercent: err.discrepancyPercent,
      });
    }
  } else {
    farmer = store.updateFarmerStatus(req.params.id, status);
    if (!farmer) return res.status(404).json({ error: "Farmer not found" });

    const messageFn = STAGE_MESSAGES[status];
    if (messageFn && farmer.phone) {
      sendSMS(farmer.phone, messageFn(farmer));
    }

    return res.json(farmer);
  }
});

// PATCH /api/admin/farmers/:id/release-receipt { adminName }
router.patch("/admin/farmers/:id/release-receipt", (req, res) => {
  const { id } = req.params;
  const { adminName } = req.body || {};

  const result = store.releaseFarmerReceipt(id, { adminName });
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  // Also send SMS confirmation if farmer has a phone number
  if (result.farmer && result.farmer.phone) {
    const totalAmount = result.receipt?.totalAmount || 0;
    const formattedAmount = totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 });
    sendSMS(
      result.farmer.phone,
      `Hi ${result.farmer.name}, your payment receipt for token ${result.farmer.id} has been released. Total amount: ₹${formattedAmount}. View and download on Yieldo.`
    );
  }

  res.json({
    success: true,
    farmer: result.farmer,
    receipt: result.receipt,
  });
});

// POST /api/admin/centres/:id/delay-alert { message }
router.post("/admin/centres/:id/delay-alert", (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const centre = store.getCentre(id);
  if (!centre) return res.status(404).json({ error: "Centre not found" });

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Alert message is required" });
  }

  const activeQueue = store.getQueueForCentre(id).filter(
    (f) => f.status === store.STATUS.IN_QUEUE || f.status === store.STATUS.QUALITY_CHECK
  );

  activeQueue.forEach((farmer) => {
    sendSMS(farmer.phone, `[DELAY ALERT - ${centre.name}]: ${message.trim()}`);
  });

  res.json({
    success: true,
    centreId: id,
    centreName: centre.name,
    notifiedCount: activeQueue.length,
    message: message.trim(),
  });
});

// PATCH /api/admin/farmers/:id/cancel-with-reason { reason }
router.patch("/admin/farmers/:id/cancel-with-reason", (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: "A cancellation reason is required" });
  }

  const farmer = store.cancelFarmerWithReason(id, reason);
  if (!farmer) {
    return res.status(404).json({ error: "Farmer not found" });
  }

  const centre = store.getCentre(farmer.centreId);
  const centreName = centre ? centre.name : farmer.centreId;

  console.log(`[Admin Cancel] Farmer ${id} cancelled with reason: "${farmer.cancellationReason}"`);

  const recipient = farmer.phone || farmer.email || "farmer";
  const smsMessage = `Your slot on ${farmer.slotDate || "today"} at ${farmer.slotTime || "booked slot"} for ${centreName} has been cancelled: ${farmer.cancellationReason}. Please reschedule.`;

  console.log(`[Admin Cancel Notification -> ${recipient}] Dispatching notification...`);
  sendSMS(recipient, smsMessage);

  res.json({
    success: true,
    farmer,
  });
});

// GET /api/admin/procurement-records (Read-only permanent immutable procurement snapshots with filters & pagination)
router.get("/admin/procurement-records", (req, res) => {
  const result = store.getProcurementRecords(req.query);
  res.json(result);
});

// GET /api/admin/analytics-summary (Single aggregation endpoint for the Admin Analytics Dashboard)
router.get("/admin/analytics-summary", (req, res) => {
  try {
    const allFarmers = store.allFarmers() || [];
    const allCentres = store.getCentres() || [];
    const allTickets = store.getAllTickets() || [];

    // 1. Crop Breakdown (across all active + completed bookings)
    const nonCancelledFarmers = allFarmers.filter((f) => f.status !== store.STATUS.CANCELLED);
    const cropCounts = {};
    nonCancelledFarmers.forEach((f) => {
      const crop = (f.crop && String(f.crop).trim()) || "Other";
      cropCounts[crop] = (cropCounts[crop] || 0) + 1;
    });
    const totalActiveCompleted = nonCancelledFarmers.length;
    const cropBreakdown = Object.entries(cropCounts)
      .map(([name, count]) => ({
        name,
        value: count,
        percentage: totalActiveCompleted > 0 ? Number(((count / totalActiveCompleted) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // 2. Token Status Breakdown
    const STATUS_META = {
      [store.STATUS.BOOKED]: { label: "Booked (Scheduled)", color: "#8A8368" },
      [store.STATUS.IN_QUEUE]: { label: "In Queue (Waiting)", color: "#C98A2B" },
      [store.STATUS.QUALITY_CHECK]: { label: "Quality Check", color: "#2E5940" },
      [store.STATUS.PROCURED]: { label: "Procured", color: "#1F3D2B" },
      [store.STATUS.PAYMENT_INITIATED]: { label: "Payment Initiated", color: "#8C590E" },
      [store.STATUS.PAID]: { label: "Paid (Completed)", color: "#105B32" },
      [store.STATUS.CANCELLED]: { label: "Cancelled", color: "#A23B2E" },
    };

    const statusCounts = {};
    Object.values(store.STATUS).forEach((st) => {
      statusCounts[st] = 0;
    });
    allFarmers.forEach((f) => {
      const st = f.status || store.STATUS.IN_QUEUE;
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });

    const statusBreakdown = Object.entries(statusCounts)
      .filter(([_, count]) => count > 0)
      .map(([statusKey, count]) => ({
        key: statusKey,
        name: STATUS_META[statusKey]?.label || statusKey,
        value: count,
        color: STATUS_META[statusKey]?.color || "#8A8368",
        percentage: allFarmers.length > 0 ? Number(((count / allFarmers.length) * 100).toFixed(1)) : 0,
      }));

    // 3. Ticket Type Breakdown
    const ticketCounts = {};
    allTickets.forEach((t) => {
      const type = (t.ticketType && String(t.ticketType).trim()) || "Other";
      ticketCounts[type] = (ticketCounts[type] || 0) + 1;
    });
    const totalTickets = allTickets.length;
    const ticketTypeBreakdown = Object.entries(ticketCounts)
      .map(([name, count]) => ({
        name,
        value: count,
        percentage: totalTickets > 0 ? Number(((count / totalTickets) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // 4. Crowd Status Distribution across all 15 centres
    const crowdCounts = { low: 0, medium: 0, high: 0 };
    allCentres.forEach((c) => {
      const raw = (store.getCrowdStatus(c.id) || "low").toLowerCase();
      if (raw === "full" || raw === "high") {
        crowdCounts.high += 1;
      } else if (raw === "medium") {
        crowdCounts.medium += 1;
      } else {
        crowdCounts.low += 1;
      }
    });

    const totalCentresCount = allCentres.length || 1;
    const crowdDistribution = [
      {
        key: "low",
        name: "Low Crowd",
        count: crowdCounts.low,
        percentage: Number(((crowdCounts.low / totalCentresCount) * 100).toFixed(1)),
        fill: "#1F3D2B",
      },
      {
        key: "medium",
        name: "Medium Crowd",
        count: crowdCounts.medium,
        percentage: Number(((crowdCounts.medium / totalCentresCount) * 100).toFixed(1)),
        fill: "#C98A2B",
      },
      {
        key: "high",
        name: "High / Overcrowded",
        count: crowdCounts.high,
        percentage: Number(((crowdCounts.high / totalCentresCount) * 100).toFixed(1)),
        fill: "#A23B2E",
      },
    ];

    res.json({
      summary: {
        totalFarmers: allFarmers.length,
        activeCompletedBookings: totalActiveCompleted,
        totalCentres: allCentres.length,
        totalTickets,
        openTickets: allTickets.filter(
          (t) =>
            t.status === store.TICKET_STATUS.OPEN ||
            t.status === store.TICKET_STATUS.IN_PROGRESS ||
            t.status === store.TICKET_STATUS.REOPENED
        ).length,
      },
      cropBreakdown,
      statusBreakdown,
      ticketTypeBreakdown,
      crowdDistribution,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Admin Analytics Summary] Error:", err);
    res.status(500).json({ error: "Failed to generate analytics summary" });
  }
});

export default router;

