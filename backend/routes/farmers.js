import { Router } from "express";
import store from "../data/store.js";
import { sendSMS } from "../utils/sms.js";
import {
  normalizeIndianMobile,
  validateIndianMobile,
  INDIAN_MOBILE_ERROR_MSG,
} from "../utils/phone.js";

const router = Router();

// GET /api/centres
router.get("/centres", (req, res) => {
  const { district, crop } = req.query;

  if (district || crop) {
    return res.json(store.getCentresByCropAndDistrict(crop, district));
  }

  res.json(store.getCentresEnriched());
});

// GET /api/centres/suggestions - Smart suggestions based on crop, crowd levels, and proximity
router.get("/centres/suggestions", (req, res) => {
  const { crop, lat, lng, limit } = req.query;

  const suggestions = store.getSuggestedCentres({
    crop: crop ? String(crop).trim() : null,
    lat: lat ? parseFloat(lat) : null,
    lng: lng ? parseFloat(lng) : null,
    limit: limit ? parseInt(limit, 10) : 4,
  });

  res.json({ suggestions });
});

// GET /api/centres/:id/public-queue - Public read-only live board (anonymized)
router.get("/centres/:id/public-queue", (req, res) => {
  const { id } = req.params;
  const centre = store.getCentre(id);
  if (!centre) return res.status(404).json({ error: "Centre not found" });

  const activeQueue = store.getQueueForCentre(id);

  // Find token currently being served (furthest along in active pipeline)
  const nowServingToken =
    activeQueue.find((f) => f.status === store.STATUS.PAYMENT_INITIATED) ||
    activeQueue.find((f) => f.status === store.STATUS.PROCURED) ||
    activeQueue.find((f) => f.status === store.STATUS.QUALITY_CHECK) ||
    null;

  const sanitizedQueue = activeQueue.map((f, index) => ({
    position: index + 1,
    id: f.id,
    crop: f.crop,
    quantityKg: f.quantityKg,
    status: f.status,
    rescheduledCount: f.rescheduledCount || 0,
    isServing: nowServingToken ? f.id === nowServingToken.id : false,
  }));

  const nowServing = nowServingToken
    ? {
        id: nowServingToken.id,
        crop: nowServingToken.crop,
        quantityKg: nowServingToken.quantityKg,
        status: nowServingToken.status,
        rescheduledCount: nowServingToken.rescheduledCount || 0,
      }
    : null;

  res.json({
    centre: {
      id: centre.id,
      code: centre.code,
      name: centre.name,
      district: centre.district,
      crops: centre.crops,
      crowdStatus: store.getCrowdStatus(centre.id),
      liveAvgMinutes: store.getLiveAvgProcessMinutes(centre.id),
      hasLivePace: store.hasLivePace(centre.id),
      bestTimeToVisit: store.getBestTimeToVisit(centre.id),
    },
    nowServing,
    queue: sanitizedQueue,
    queueLength: sanitizedQueue.length,
    waitingCount: sanitizedQueue.filter((f) => f.status === store.STATUS.IN_QUEUE).length,
  });
});

// POST /api/farmers/register-account
router.post("/farmers/register-account", (req, res) => {
  const {
    name,
    phone,
    alternatePhone,
    email,
    district,
    area,
    village,
    crops,
    primaryCrop,
    preferredCentreId,
  } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: "Full Name and Primary Mobile Number are required." });
  }

  if (!district) {
    return res.status(400).json({ error: "District is mandatory. Please select Thanjavur, Villupuram, or Cuddalore." });
  }

  if (!store.resolveDistrictCode(district)) {
    return res.status(400).json({ error: "Invalid district. Please select Thanjavur, Villupuram, or Cuddalore." });
  }

  try {
    const registered = store.registerFarmerAccount({
      name,
      phone,
      alternatePhone,
      email,
      district,
      area,
      village,
      crops,
      primaryCrop,
      preferredCentreId,
    });

    const profile = store.getFarmerProfile(registered.farmerId, registered.name);

    return res.status(201).json({
      success: true,
      message: `Registration successful. Your official Farmer ID is ${registered.farmerId}`,
      farmer: registered,
      profile,
    });
  } catch (err) {
    if (err.status === 409 || err.code === "ALREADY_REGISTERED") {
      return res.status(409).json({
        error: err.message,
        code: "ALREADY_REGISTERED",
        existingFarmerId: err.existingFarmerId || null,
      });
    }
    return res.status(err.status || 400).json({ error: err.message || "Failed to register farmer account." });
  }
});

// POST /api/farmers/login
router.post("/farmers/login", (req, res) => {
  const { name, phone, email, farmerId, identityType, identityValue } = req.body;

  const authResult = store.authenticateFarmerLogin({ name, phone, email, farmerId, identityType, identityValue });

  if (!authResult.authenticated) {
    return res.status(401).json({
      error: authResult.error || "We couldn't find a registered farmer account matching these details.",
      invalidDetails: true,
      message: authResult.message || "We couldn't find a registered farmer account matching these details.",
    });
  }

  const { farmer, profile } = authResult;

  res.json({
    success: true,
    name: farmer.name || name || "Farmer",
    phone: farmer.phone || (phone ? String(phone).trim() : null),
    alternatePhone: farmer.alternatePhone || profile?.alternatePhone || null,
    email: farmer.email || (email ? String(email).trim() : null),
    farmerId: farmer.farmerId || profile?.farmerId || null,
    district: farmer.district || profile?.district || null,
    districtCode: farmer.districtCode || profile?.districtCode || null,
    area: farmer.area || profile?.area || null,
    village: farmer.village || profile?.village || null,
    crops: farmer.crops || profile?.crops || (farmer.primaryCrop ? [farmer.primaryCrop] : []),
    primaryCrop: farmer.primaryCrop || profile?.primaryCrop || null,
    preferredCentreId: farmer.preferredCentreId || profile?.preferredCentreId || null,
    preferredCentreName: farmer.preferredCentreName || profile?.preferredCentreName || null,
    profile,
  });
});

// GET /api/centres/:id/slot-availability?date=YYYY-MM-DD
router.get("/centres/:id/slot-availability", (req, res) => {
  const { id } = req.params;
  const { date } = req.query;

  const availability = store.getCentreSlotsAvailability(id, date);
  if (!availability) {
    return res.status(404).json({ error: "Centre not found" });
  }

  res.json(availability);
});

// GET /api/centres/:id/date-range-availability?days=7
router.get("/centres/:id/date-range-availability", (req, res) => {
  const { id } = req.params;
  const { days } = req.query;

  const data = store.getCentreDateRangeAvailability(id, days);
  if (!data) {
    return res.status(404).json({ error: "Centre not found" });
  }

  res.json(data);
});

// POST /api/farmers/join-live-queue (Walk-in arrival queue)
router.post("/farmers/join-live-queue", (req, res) => {
  const { name, phone, email, crop, quantity, declaredQuantity, unit, declaredUnit, quantityKg, variety, centreId, slotDate, slotTime } = req.body;

  const rawQty = declaredQuantity !== undefined ? declaredQuantity : (quantity !== undefined ? quantity : quantityKg);

  if (!name || (!phone && !email) || !crop || rawQty === undefined || rawQty === null || rawQty === "" || !centreId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let normalizedLivePhone = null;
  if (phone) {
    const phoneValidation = validateIndianMobile(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error || INDIAN_MOBILE_ERROR_MSG });
    }
    normalizedLivePhone = phoneValidation.normalized;
  }

  const centre = store.getCentre(centreId);
  if (!centre) {
    return res.status(404).json({ error: "Centre not found" });
  }

  try {
    const farmer = store.registerFarmer({
      name: name.trim(),
      phone: normalizedLivePhone,
      email: email ? String(email).trim() : null,
      crop,
      quantity,
      declaredQuantity,
      unit,
      declaredUnit,
      quantityKg,
      variety,
      centreId,
      queueType: "live",
      slotDate: slotDate || store.getTodayDateString(),
      slotTime: slotTime ? String(slotTime).trim() : null,
    });

    const liveQueue = store.getDailyLiveQueue(centreId);
    const position = liveQueue.findIndex((f) => f.id === farmer.id) + 1;
    const waitMinutes = store.estimateWaitMinutes(farmer);

    if (farmer.phone) {
      const slotMsg = farmer.slotTime ? ` (Slot: ${farmer.slotTime})` : "";
      sendSMS(
        farmer.phone,
        `Hi ${name}, you have joined the LIVE queue at ${centre.name}${slotMsg}. ` +
          `Your token is ${farmer.id} (Position #${position || 1}). Estimated wait: ~${waitMinutes} min.`
      );
    }

    res.status(201).json({
      farmer,
      queuePosition: position || 1,
      estimatedWaitMinutes: waitMinutes,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/farmers/register (Slotted advance booking)
router.post("/farmers/register", (req, res) => {
  const {
    name,
    phone,
    email,
    crop,
    quantity,
    declaredQuantity,
    unit,
    declaredUnit,
    quantityKg,
    variety,
    centreId,
    queueType = "slotted",
    slotDate,
    slotTime,
  } = req.body;

  const rawQty = declaredQuantity !== undefined ? declaredQuantity : (quantity !== undefined ? quantity : quantityKg);

  if (!name || (!phone && !email) || !crop || rawQty === undefined || rawQty === null || rawQty === "" || !centreId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let normalizedSlottedPhone = null;
  if (phone) {
    const phoneValidation = validateIndianMobile(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error || INDIAN_MOBILE_ERROR_MSG });
    }
    normalizedSlottedPhone = phoneValidation.normalized;
  }

  if (!store.getCentre(centreId)) {
    return res.status(404).json({ error: "Centre not found" });
  }

  try {
    const farmer = store.registerFarmer({
      name: name.trim(),
      phone: normalizedSlottedPhone,
      email: email ? String(email).trim() : null,
      crop,
      quantity,
      declaredQuantity,
      unit,
      declaredUnit,
      quantityKg,
      variety,
      centreId,
      queueType,
      slotDate,
      slotTime,
    });
    const waitMinutes = store.estimateWaitMinutes(farmer);

    if (farmer.phone) {
      sendSMS(
        farmer.phone,
        `Hi ${name}, you're registered at ${store.getCentre(centreId).name} for ${farmer.slotDate} (${farmer.slotTime}). ` +
          `Your token is ${farmer.id}. Estimated wait: ~${waitMinutes} min. We'll text you as your turn nears.`
      );
    }

    res.status(201).json({ farmer, estimatedWaitMinutes: waitMinutes });
  } catch (err) {
    if (err.status === 409 || err.isFull) {
      return res.status(409).json({ error: err.message, isSlotFull: true });
    }
    if (err.status === 400 || err.isClosed || err.isPast) {
      return res.status(400).json({ error: err.message, isClosed: err.isClosed, isPast: err.isPast });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/farmers/:id/status
router.get("/farmers/:id/status", (req, res) => {
  const farmer = store.getFarmer(req.params.id);
  if (!farmer) return res.status(404).json({ error: "Farmer not found" });

  const centre = store.getCentre(farmer.centreId);
  const queue = store.getQueueForCentre(farmer.centreId);
  const position = queue.findIndex((f) => f.id === farmer.id);
  const queuePosition = position === -1 ? null : position + 1;
  const waitMinutes = store.estimateWaitMinutes(farmer);
  const crowdStatus = store.getCrowdStatus(farmer.centreId);

  // Trigger strict queue notifications (Position 5 and Position 1) if applicable
  store.checkAndTriggerQueueNotification(farmer, queuePosition);

  let safeFarmer = { ...farmer };
  if (farmer.receipt && farmer.receipt.receiptStatus !== "released") {
    safeFarmer.receipt = {
      receiptId: farmer.receipt.receiptId,
      receiptStatus: "pending_release",
    };
    safeFarmer.receiptStatus = "pending_release";
  }

  res.json({
    farmer: safeFarmer,
    centre,
    queuePosition,
    queueLength: queue.length,
    estimatedWaitMinutes: waitMinutes,
    crowdStatus,
  });
});

// GET /api/farmers/:id/receipt
router.get("/farmers/:id/receipt", (req, res) => {
  const farmer = store.getFarmer(req.params.id);
  if (!farmer) return res.status(404).json({ error: "Farmer not found" });

  if (farmer.status !== store.STATUS.PAID || !farmer.receipt || farmer.receipt.receiptStatus !== "released") {
    return res.status(403).json({
      error: "Payment receipt is currently being prepared and reviewed by the centre. It will be accessible once released by administration.",
      receiptStatus: farmer.receipt?.receiptStatus || "pending_release",
    });
  }

  res.json(farmer.receipt);
});

// PATCH /api/farmers/:id/check-in
router.patch("/farmers/:id/check-in", (req, res) => {
  const farmer = store.getFarmer(req.params.id);
  if (!farmer) return res.status(404).json({ error: "Farmer not found" });

  if (farmer.status !== store.STATUS.IN_QUEUE) {
    return res
      .status(400)
      .json({ error: "Only tokens currently in queue can be checked in" });
  }

  const result = store.checkInFarmer(farmer.id);
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  res.json({
    success: true,
    farmer: result.farmer,
  });
});

// Helper function to enrich farmer token list
function enrichFarmersList(farmerRecords) {
  return farmerRecords
    .map((f) => {
      const centre = store.getCentre(f.centreId);
      const isPendingReceipt = f.receipt && f.receipt.receiptStatus !== "released";
      let receiptData = f.receipt;
      if (isPendingReceipt) {
        receiptData = {
          receiptId: f.receipt.receiptId,
          receiptStatus: "pending_release",
        };
      }
      return {
        ...f,
        receipt: receiptData,
        receiptStatus: f.receipt?.receiptStatus || f.receiptStatus || (f.status === store.STATUS.PAID ? "pending_release" : null),
        centreName: centre ? centre.name : f.centreId,
        district: centre ? centre.district : "",
        crowdStatus: store.getCrowdStatus(f.centreId),
      };
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// GET /api/farmers/by-identifier/:identifier (Supports Phone or Email)
router.get("/farmers/by-identifier/:identifier", (req, res) => {
  const { identifier } = req.params;
  const farmerRecords = store.getFarmersByIdentifier(identifier);
  res.json(enrichFarmersList(farmerRecords));
});

// GET /api/farmers/by-phone/:phone (Backward-compatible alias)
router.get("/farmers/by-phone/:phone", (req, res) => {
  const { phone } = req.params;
  const farmerRecords = store.getFarmersByIdentifier(phone);
  res.json(enrichFarmersList(farmerRecords));
});

// PATCH /api/farmers/:id/reschedule
router.patch("/farmers/:id/reschedule", (req, res) => {
  const { newSlotDate, newSlotTime } = req.body || {};
  const farmer = store.getFarmer(req.params.id);
  if (!farmer) return res.status(404).json({ error: "Farmer not found" });

  const result = store.rescheduleFarmer(farmer.id, 2, newSlotDate, newSlotTime);
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  const updatedFarmer = result.farmer;
  const waitMinutes = store.estimateWaitMinutes(updatedFarmer);
  const queue = store.getQueueForCentre(updatedFarmer.centreId);
  const position = queue.findIndex((f) => f.id === updatedFarmer.id);

  if (updatedFarmer.phone) {
    sendSMS(
      updatedFarmer.phone,
      `Hi ${updatedFarmer.name}, your token ${updatedFarmer.id} has been rescheduled to ${updatedFarmer.slotDate} (${updatedFarmer.slotTime}). ` +
        `Position: ${position === -1 ? queue.length : position + 1} of ${queue.length}. Estimated wait: ~${waitMinutes} min.`
    );
  }

  res.json({
    success: true,
    farmer: updatedFarmer,
    queuePosition: position === -1 ? queue.length : position + 1,
    queueLength: queue.length,
    estimatedWaitMinutes: waitMinutes,
  });
});

// DELETE /api/farmers/:id/cancel
router.delete("/farmers/:id/cancel", (req, res) => {
  const farmer = store.getFarmer(req.params.id);
  if (!farmer) return res.status(404).json({ error: "Farmer not found" });

  if (farmer.status === store.STATUS.CANCELLED) {
    return res.status(400).json({ error: "Token is already cancelled" });
  }

  if (
    farmer.status !== store.STATUS.IN_QUEUE &&
    farmer.status !== store.STATUS.QUALITY_CHECK &&
    farmer.status !== store.STATUS.BOOKED
  ) {
    return res
      .status(400)
      .json({ error: "Cannot cancel token after procurement has started" });
  }

  store.cancelFarmer(farmer.id);

  sendSMS(
    farmer.phone,
    `Hi ${farmer.name}, your token ${farmer.id} has been cancelled.`
  );

  res.json({ success: true, farmer });
});

// GET /api/farmers/available-swap-partners & /api/available-swap-partners
const availableSwapPartnersHandler = (req, res) => {
  const { centreId, crop, excludeTokenId } = req.query;
  if (!centreId) {
    return res.status(400).json({ error: "centreId query parameter is required" });
  }
  const partners = store.getAvailableSwapPartners({ centreId, crop, excludeTokenId });
  res.json({ partners });
};
router.get("/available-swap-partners", availableSwapPartnersHandler);
router.get("/farmers/available-swap-partners", availableSwapPartnersHandler);

// POST /api/farmers/swap-requests & /api/swap-requests
const createSwapRequestHandler = (req, res) => {
  const { senderTokenId, receiverTokenId } = req.body || {};
  if (!senderTokenId || !receiverTokenId) {
    return res.status(400).json({ error: "senderTokenId and receiverTokenId are required" });
  }

  const result = store.createSwapRequest({ senderTokenId, receiverTokenId });
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  res.status(201).json(result);
};
router.post("/swap-requests", createSwapRequestHandler);
router.post("/farmers/swap-requests", createSwapRequestHandler);

// GET /api/farmers/swap-requests/:identifier & /api/swap-requests/:identifier
const getSwapRequestsHandler = (req, res) => {
  const { identifier } = req.params;
  const requests = store.getSwapRequestsForFarmer(identifier);
  res.json(requests);
};
router.get("/swap-requests/:identifier", getSwapRequestsHandler);
router.get("/farmers/swap-requests/:identifier", getSwapRequestsHandler);

// POST /api/farmers/swap-requests/:id/respond & /api/swap-requests/:id/respond
const respondSwapRequestHandler = (req, res) => {
  const { id } = req.params;
  const { response, responderIdentifier } = req.body || {};

  if (!response) {
    return res.status(400).json({ error: "response ('accept' or 'decline') is required" });
  }

  const result = store.respondSwapRequest({
    swapRequestId: id,
    response,
    responderIdentifier,
  });

  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  res.json(result);
};
router.post("/swap-requests/:id/respond", respondSwapRequestHandler);
router.post("/farmers/swap-requests/:id/respond", respondSwapRequestHandler);

// GET /api/farmers/notifications/:identifier & /api/notifications/:identifier
const getNotificationsHandler = (req, res) => {
  const { identifier } = req.params;
  const notifs = store.getNotificationsForFarmer(identifier);
  res.json(notifs);
};
router.get("/notifications/:identifier", getNotificationsHandler);
router.get("/farmers/notifications/:identifier", getNotificationsHandler);

// PATCH /api/farmers/notifications/:id/read & /api/notifications/:id/read
const markNotificationReadHandler = (req, res) => {
  const { id } = req.params;
  const notif = store.markNotificationRead(id);
  if (!notif) {
    return res.status(404).json({ error: "Notification not found" });
  }
  res.json({ success: true, notification: notif });
};
router.patch("/notifications/:id/read", markNotificationReadHandler);
router.patch("/farmers/notifications/:id/read", markNotificationReadHandler);

// PATCH /api/farmers/notifications/mark-all-read/:identifier & /api/notifications/mark-all-read/:identifier
const markAllNotificationsReadHandler = (req, res) => {
  const identifier = req.params.identifier || req.body?.identifier;
  const updated = store.markAllNotificationsRead(identifier);
  res.json({ success: true, count: updated.length });
};
router.patch("/notifications/mark-all-read", markAllNotificationsReadHandler);
router.patch("/farmers/notifications/mark-all-read", markAllNotificationsReadHandler);
router.patch("/notifications/mark-all-read/:identifier", markAllNotificationsReadHandler);
router.patch("/farmers/notifications/mark-all-read/:identifier", markAllNotificationsReadHandler);
router.post("/notifications/mark-all-read", markAllNotificationsReadHandler);
router.post("/farmers/notifications/mark-all-read", markAllNotificationsReadHandler);

// GET /api/farmers/procurement-history/:identifier & /api/procurement-history/:identifier
const getProcurementHistoryHandler = (req, res) => {
  const { identifier } = req.params;
  if (!identifier) {
    return res.status(400).json({ error: "Identifier parameter is required" });
  }
  const records = store.getProcurementHistoryForFarmer(identifier);
  res.json(records);
};
router.get("/procurement-history/:identifier", getProcurementHistoryHandler);
router.get("/farmers/procurement-history/:identifier", getProcurementHistoryHandler);

// GET /api/farmers/profile/:identifier & /api/profile/:identifier
const getProfileHandler = (req, res) => {
  const { identifier } = req.params;
  const { name } = req.query;
  if (!identifier) {
    return res.status(400).json({ error: "Identifier parameter is required" });
  }
  const profile = store.getFarmerProfile(identifier, name);
  if (!profile) {
    return res.status(404).json({ error: "Profile not found" });
  }
  res.json(profile);
};
router.get("/profile/:identifier", getProfileHandler);
router.get("/farmers/profile/:identifier", getProfileHandler);

export default router;

