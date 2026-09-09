// Lightweight persistent store for hackathon demo.
// Uses atomic file-based persistence (backend/data/persisted-store.json) with debouncing.
// Swap this for Postgres/Firebase later without touching route logic —
// every function here is the "data layer" boundary.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PERSISTENCE_FILE = path.join(__dirname, "persisted-store.json");

let centres = [
  // Thanjavur District (5 centres)
  { id: "C01", code: "TNJ", name: "Thanjavur Main Paddy Direct Purchase Centre", district: "Thanjavur", crops: ["Paddy"], avgProcessMinutes: 12, dailyCapacity: 50, lat: 10.7870, lng: 79.1378, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C02", code: "KMU", name: "Kumbakonam Grain & Pulse Centre", district: "Thanjavur", crops: ["Paddy", "Pulses"], avgProcessMinutes: 15, dailyCapacity: 40, lat: 10.9602, lng: 79.3845, operatingHours: { startTime: "07:00 AM", endTime: "05:00 PM" } },
  { id: "C03", code: "PNA", name: "Papanasam Paddy Regulated Market", district: "Thanjavur", crops: ["Paddy"], avgProcessMinutes: 10, dailyCapacity: 45, lat: 10.9250, lng: 79.2780, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C04", code: "PKT", name: "Pattukkottai Millet & Pulse Centre", district: "Thanjavur", crops: ["Pulses", "Millets"], avgProcessMinutes: 14, dailyCapacity: 35, lat: 10.4286, lng: 79.3200, operatingHours: { startTime: "08:00 AM", endTime: "04:00 PM" } },
  { id: "C05", code: "OND", name: "Orathanadu Direct Purchase Centre", district: "Thanjavur", crops: ["Paddy"], avgProcessMinutes: 12, dailyCapacity: 40, lat: 10.6274, lng: 79.2558, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },

  // Villupuram District (5 centres)
  { id: "C06", code: "VPM", name: "Villupuram Central Grain Mandi", district: "Villupuram", crops: ["Paddy", "Wheat"], avgProcessMinutes: 15, dailyCapacity: 40, lat: 11.9401, lng: 79.4861, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C07", code: "TMV", name: "Tindivanam Oilseed & Millet Centre", district: "Villupuram", crops: ["Millets", "Groundnut"], avgProcessMinutes: 12, dailyCapacity: 35, lat: 12.2330, lng: 79.6500, operatingHours: { startTime: "07:00 AM", endTime: "05:00 PM" } },
  { id: "C08", code: "GNG", name: "Gingee Agricultural Marketing Centre", district: "Villupuram", crops: ["Paddy", "Groundnut"], avgProcessMinutes: 14, dailyCapacity: 30, lat: 12.2530, lng: 79.4180, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C09", code: "KLK", name: "Kallakurichi Main Paddy Centre", district: "Villupuram", crops: ["Paddy"], avgProcessMinutes: 11, dailyCapacity: 45, lat: 11.7383, lng: 78.9639, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C10", code: "VKV", name: "Vikravandi Pulse & Grain Centre", district: "Villupuram", crops: ["Wheat", "Pulses"], avgProcessMinutes: 13, dailyCapacity: 35, lat: 12.0305, lng: 79.5532, operatingHours: { startTime: "08:00 AM", endTime: "04:00 PM" } },

  // Cuddalore District (5 centres)
  { id: "C11", code: "CDL", name: "Cuddalore Coastal Grain Centre", district: "Cuddalore", crops: ["Paddy"], avgProcessMinutes: 12, dailyCapacity: 45, lat: 11.7480, lng: 79.7714, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C12", code: "PRT", name: "Panruti Pulse & Millet Centre", district: "Cuddalore", crops: ["Pulses", "Millets"], avgProcessMinutes: 15, dailyCapacity: 35, lat: 11.7700, lng: 79.5500, operatingHours: { startTime: "07:00 AM", endTime: "05:00 PM" } },
  { id: "C13", code: "CDM", name: "Chidambaram Paddy Purchase Centre", district: "Cuddalore", crops: ["Paddy"], avgProcessMinutes: 10, dailyCapacity: 50, lat: 11.3992, lng: 79.6936, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C14", code: "VRI", name: "Vridhachalam Grain & Oilseed Centre", district: "Cuddalore", crops: ["Groundnut", "Pulses"], avgProcessMinutes: 14, dailyCapacity: 40, lat: 11.5300, lng: 79.3300, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
  { id: "C15", code: "KMK", name: "Kattumannarkoil Regulated Centre", district: "Cuddalore", crops: ["Paddy", "Sugarcane"], avgProcessMinutes: 12, dailyCapacity: 40, lat: 11.2750, lng: 79.5580, operatingHours: { startTime: "06:00 AM", endTime: "06:00 PM" } },
];

let farmers = []; // { id, name, phone, crop, quantityKg, centreId, status, position, createdAt, ... }
let centreCounters = {};
let tickets = []; // { id, farmerPhone, farmerName, ticketType, ticketSubtype, description, state, district, village, pincode, status, createdAt, updatedAt }
let ticketCounter = 1;
let swapRequests = []; // { id, senderTokenId, senderName, senderPhone, senderEmail, senderSlotDate, senderSlotTime, senderCrop, receiverTokenId, receiverName, receiverPhone, receiverEmail, receiverSlotDate, receiverSlotTime, receiverCrop, centreId, status, createdAt, respondedAt }
let swapCounter = 1;
let notifications = []; // { id, identifier, tokenId, title, message, timestamp, read }
let notificationCounter = 1;
let procurementHistoryRecords = []; // Permanent immutable point-in-time snapshots created at payment completion

let saveTimeout = null;

function saveToDisk() {
  try {
    const data = {
      farmers,
      centreCounters,
      tickets,
      ticketCounter,
      swapRequests,
      swapCounter,
      notifications,
      notificationCounter,
      procurementHistoryRecords,
      savedAt: new Date().toISOString(),
    };
    const tempFile = `${PERSISTENCE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, PERSISTENCE_FILE);
  } catch (err) {
    console.error("[Store Persistence] Error writing persisted-store.json:", err.message);
  }
}

function scheduleSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveToDisk();
    saveTimeout = null;
  }, 500);
}

function saveImmediately() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  saveToDisk();
}

function loadPersistedData() {
  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      const raw = fs.readFileSync(PERSISTENCE_FILE, "utf-8");
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.farmers)) {
          farmers = parsed.farmers;
        }
        if (parsed.centreCounters && typeof parsed.centreCounters === "object") {
          centreCounters = parsed.centreCounters;
        }
        if (Array.isArray(parsed.tickets)) {
          tickets = parsed.tickets;
        }
        if (typeof parsed.ticketCounter === "number") {
          ticketCounter = parsed.ticketCounter;
        }
        if (Array.isArray(parsed.swapRequests)) {
          swapRequests = parsed.swapRequests;
        }
        if (typeof parsed.swapCounter === "number") {
          swapCounter = parsed.swapCounter;
        }
        if (Array.isArray(parsed.notifications)) {
          notifications = parsed.notifications;
        }
        if (typeof parsed.notificationCounter === "number") {
          notificationCounter = parsed.notificationCounter;
        }
        if (Array.isArray(parsed.procurementHistoryRecords)) {
          procurementHistoryRecords = parsed.procurementHistoryRecords;
        }
        console.log(`[Store Persistence] Successfully restored ${farmers.length} farmers, ${tickets.length} tickets, ${swapRequests.length} swap requests, and ${procurementHistoryRecords.length} procurement history records from persisted-store.json`);
        return;
      }
    }
  } catch (err) {
    console.warn("[Store Persistence] Error reading persisted store, falling back to default seed data:", err.message);
  }
  console.log("[Store Persistence] Initialized with default seed data (first run).");
}

// Load persisted state on startup
loadPersistedData();

const STATUS = {
  BOOKED: "booked",
  IN_QUEUE: "in_queue",
  QUALITY_CHECK: "quality_check",
  PROCURED: "procured",
  PAYMENT_INITIATED: "payment_initiated",
  PAID: "paid",
  CANCELLED: "cancelled",
};

export function formatMinutesToTimeString(totalMinutes) {
  let mins = totalMinutes % (24 * 60);
  if (mins < 0) mins += 24 * 60;
  let hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const meridiem = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  const minStr = String(minutes).padStart(2, "0");
  return `${hours}:${minStr} ${meridiem}`;
}

export function generateSlotTimesForCentre(centreIdOrObj, slotDurationMinutes = 120) {
  const opHours = getCentreOperatingHours(centreIdOrObj);
  const start = opHours.startMinutes;
  const end = opHours.endMinutes;

  if (end <= start) {
    return [
      "6:00 AM - 8:00 AM",
      "8:00 AM - 10:00 AM",
      "10:00 AM - 12:00 PM",
      "12:00 PM - 2:00 PM",
      "2:00 PM - 4:00 PM",
      "4:00 PM - 6:00 PM",
    ];
  }

  const slots = [];
  let current = start;
  while (current < end) {
    const next = Math.min(current + slotDurationMinutes, end);
    const slotStr = `${formatMinutesToTimeString(current)} - ${formatMinutesToTimeString(next)}`;
    slots.push(slotStr);
    current = next;
  }
  return slots;
}

// Default fallback reference
export const SLOT_TIME_OPTIONS = generateSlotTimesForCentre();

export const TICKET_TYPES = {
  Operational: ["Slot Booking Issue", "Queue Delay", "Centre Not Listed", "Other"],
  Payment: ["Payment Not Received", "Incorrect Amount", "Receipt Issue", "Other"],
  Account: ["Login Issue", "Phone Number Change", "Profile Correction", "Other"],
  Information: ["MSP Rate Query", "Centre Details", "Crop Eligibility", "Other"],
  "Technical Issue": ["App Not Working", "Notification Not Received", "Voice/Chatbot Issue", "Other"],
  Complaint: ["Staff Behaviour", "Centre Condition", "Unfair Treatment", "Other"],
  Grievance: ["Procurement Dispute", "Quality Check Dispute", "Other"],
};

export const TICKET_STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
  REOPENED: "reopened",
};

export const DISCREPANCY_THRESHOLD_PERCENT = 15;

export const CROP_PROCUREMENT_CONFIG = {
  Paddy: {
    bagWeightKg: 40,
    supportedUnits: ["bags", "tons", "quintals", "kg"],
    varieties: {
      Common: {
        baseMspPerQuintal: 2300.00,
        stateIncentivePerQuintal: 69.00,
        totalRatePerQuintal: 2369.00,
        ratePerKg: 23.69,
      },
      Fine: {
        baseMspPerQuintal: 2320.00,
        stateIncentivePerQuintal: 80.00,
        totalRatePerQuintal: 2400.00,
        ratePerKg: 24.00,
      },
      "Grade A": {
        baseMspPerQuintal: 2320.00,
        stateIncentivePerQuintal: 80.00,
        totalRatePerQuintal: 2400.00,
        ratePerKg: 24.00,
      },
    },
    defaultVariety: "Common",
  },
  Wheat: {
    bagWeightKg: 50,
    supportedUnits: ["bags", "tons", "quintals", "kg"],
    baseMspPerQuintal: 2585.00,
    stateIncentivePerQuintal: 0.00,
    totalRatePerQuintal: 2585.00,
    ratePerKg: 25.85,
  },
  Maize: {
    bagWeightKg: 50,
    supportedUnits: ["bags", "tons", "quintals", "kg"],
    baseMspPerQuintal: 2400.00,
    stateIncentivePerQuintal: 0.00,
    totalRatePerQuintal: 2400.00,
    ratePerKg: 24.00,
  },
  Pulses: {
    bagWeightKg: 50,
    supportedUnits: ["bags", "tons", "quintals", "kg"],
    baseMspPerQuintal: 8000.00,
    stateIncentivePerQuintal: 0.00,
    totalRatePerQuintal: 8000.00,
    ratePerKg: 80.00,
  },
  Groundnut: {
    bagWeightKg: 40,
    supportedUnits: ["bags", "tons", "quintals", "kg"],
    baseMspPerQuintal: 6783.00,
    stateIncentivePerQuintal: 0.00,
    totalRatePerQuintal: 6783.00,
    ratePerKg: 67.83,
  },
  Cotton: {
    bagWeightKg: 50,
    supportedUnits: ["bags", "tons", "quintals", "kg"],
    baseMspPerQuintal: 7710.00,
    stateIncentivePerQuintal: 0.00,
    totalRatePerQuintal: 7710.00,
    ratePerKg: 77.10,
  },
};

export const CROP_MSP_RATES = {
  Paddy: 23.69,
  Wheat: 25.85,
  Maize: 24.00,
  Pulses: 80.00,
  Groundnut: 67.83,
  Cotton: 77.10,
};

export function convertQuantityToKg(quantity, unit = "bags", crop = "Paddy") {
  const qty = Number(quantity) || 0;
  const cleanUnit = String(unit || "").toLowerCase().trim();
  const cropConfig = CROP_PROCUREMENT_CONFIG[crop] || { bagWeightKg: 40 };

  if (cleanUnit === "bags" || cleanUnit === "bag") {
    return Math.round(qty * (cropConfig.bagWeightKg || 40) * 100) / 100;
  }
  if (cleanUnit === "tons" || cleanUnit === "ton" || cleanUnit === "tonnes" || cleanUnit === "tonne") {
    return Math.round(qty * 1000 * 100) / 100;
  }
  if (cleanUnit === "quintals" || cleanUnit === "quintal" || cleanUnit === "qtl") {
    return Math.round(qty * 100 * 100) / 100;
  }
  return Math.round(qty * 100) / 100;
}

export function convertKgToDisplayUnits(kg, crop = "Paddy") {
  const totalKg = Number(kg) || 0;
  const cropConfig = CROP_PROCUREMENT_CONFIG[crop] || { bagWeightKg: 40 };
  const bagWeight = cropConfig.bagWeightKg || 40;
  const bags = Math.round((totalKg / bagWeight) * 100) / 100;
  const quintals = Math.round((totalKg / 100) * 100) / 100;
  const tons = Math.round((totalKg / 1000) * 100) / 100;
  return { kg: totalKg, bags, quintals, tons };
}

export function calculateRateAndTotal({ crop = "Paddy", variety = null, quantityKg = 0 }) {
  const qtyKg = Number(quantityKg) || 0;
  const cropConfig = CROP_PROCUREMENT_CONFIG[crop];
  
  let ratePerKg = CROP_MSP_RATES[crop] || 23.69;
  let ratePerQuintal = ratePerKg * 100;
  let baseMspPerQuintal = ratePerQuintal;
  let stateIncentivePerQuintal = 0;
  let selectedVariety = variety;

  if (cropConfig) {
    if (cropConfig.varieties) {
      const varKey = (variety && cropConfig.varieties[variety]) ? variety : cropConfig.defaultVariety || "Common";
      const varData = cropConfig.varieties[varKey] || cropConfig.varieties["Common"];
      selectedVariety = varKey;
      baseMspPerQuintal = varData.baseMspPerQuintal;
      stateIncentivePerQuintal = varData.stateIncentivePerQuintal;
      ratePerQuintal = varData.totalRatePerQuintal;
      ratePerKg = varData.ratePerKg;
    } else {
      baseMspPerQuintal = cropConfig.baseMspPerQuintal || (cropConfig.ratePerKg * 100);
      stateIncentivePerQuintal = cropConfig.stateIncentivePerQuintal || 0;
      ratePerQuintal = cropConfig.totalRatePerQuintal || (cropConfig.ratePerKg * 100);
      ratePerKg = cropConfig.ratePerKg || (ratePerQuintal / 100);
    }
  }

  const quintals = Math.round((qtyKg / 100) * 100) / 100;
  const totalAmount = Math.round(qtyKg * ratePerKg * 100) / 100;

  return {
    crop,
    variety: selectedVariety,
    quantityKg: qtyKg,
    quintals,
    baseMspPerQuintal,
    stateIncentivePerQuintal,
    ratePerQuintal,
    ratePerKg,
    totalAmount,
  };
}

export function calculateAmount(crop, quantityKg, variety = null) {
  return calculateRateAndTotal({ crop, variety, quantityKg }).totalAmount;
}

const CROWD_THRESHOLDS = {
  LOW_MAX: 4,      // <= 4 is "low"
  MEDIUM_MAX: 9,   // 5 - 9 is "medium"
  // 10+ is "high"
};

function nextId(centreId) {
  const centre = getCentre(centreId);
  const code = centre?.code || "TKN";
  if (!centreCounters[centreId]) {
    centreCounters[centreId] = 1;
  }
  const count = centreCounters[centreId]++;
  return `${code}-${String(count).padStart(3, "0")}`;
}

function getCentres() {
  return centres;
}

function getCentre(centreId) {
  return centres.find((c) => c.id === centreId);
}

function getCrowdStatusForDate(centreId, targetDate = null) {
  const centre = getCentre(centreId);
  if (!centre) return "low";

  const todayStr = getTodayDateString();
  const dateStr = targetDate ? String(targetDate).trim() : todayStr;
  const isToday = dateStr === todayStr;

  const dailyCapacity = Number(centre.dailyCapacity) || 40;
  const slotCap = getCentreSlotCapacity(centreId);

  const dateFarmers = farmers.filter((f) => {
    if (f.centreId !== centreId) return false;
    if (f.status === STATUS.CANCELLED) return false;

    if (isToday) {
      if (f.status === STATUS.PAID) return false;
      const fDate = f.slotDate ? String(f.slotDate).trim() : todayStr;
      return fDate === todayStr;
    } else {
      const fDate = f.slotDate ? String(f.slotDate).trim() : null;
      return fDate === dateStr;
    }
  });

  const count = dateFarmers.length;
  const ratio = dailyCapacity > 0 ? count / dailyCapacity : 0;

  const centreSlots = generateSlotTimesForCentre(centreId);
  const hasFullSlot = centreSlots.some(
    (slot) => getSlotBookingCount(centreId, dateStr, slot) >= slotCap
  );

  if (ratio >= 1.0) return "full";
  if (ratio >= 0.7 || hasFullSlot) return "high";
  if (ratio >= 0.35) return "medium";
  return "low";
}

function getCrowdStatus(centreId, date = null) {
  return getCrowdStatusForDate(centreId, date);
}

function getBestTimeToVisit(centreId) {
  const completed = farmers.filter(
    (f) =>
      f.centreId === centreId &&
      (f.status === STATUS.PROCURED ||
        f.status === STATUS.PAYMENT_INITIATED ||
        f.status === STATUS.PAID) &&
      f.queueEnteredAt
  );

  if (completed.length < 5) {
    return null;
  }

  const buckets = [
    { label: "8-10 AM", startHour: 8, endHour: 10, count: 0 },
    { label: "10-12 PM", startHour: 10, endHour: 12, count: 0 },
    { label: "12-2 PM", startHour: 12, endHour: 14, count: 0 },
    { label: "2-4 PM", startHour: 14, endHour: 16, count: 0 },
    { label: "4-6 PM", startHour: 16, endHour: 18, count: 0 },
  ];

  completed.forEach((f) => {
    const hour = new Date(f.queueEnteredAt).getHours();
    const bucket = buckets.find((b) => hour >= b.startHour && hour < b.endHour);
    if (bucket) {
      bucket.count++;
    } else {
      if (hour < 8) buckets[0].count++;
      else buckets[buckets.length - 1].count++;
    }
  });

  buckets.sort((a, b) => a.count - b.count);
  return buckets[0].label;
}

function getCentresEnriched() {
  return centres.map((c) => {
    const opHours = getCentreOperatingHours(c);
    return {
      ...c,
      operatingHours: {
        startTime: opHours.startTime,
        endTime: opHours.endTime,
      },
      crowdStatus: getCrowdStatus(c.id),
      bestTimeToVisit: getBestTimeToVisit(c.id),
      queueLength: getQueueForCentre(c.id).length,
    };
  });
}

function getCentresByCropAndDistrict(crop, district) {
  return getCentresEnriched().filter((c) => {
    const matchesDistrict = district
      ? c.district.toLowerCase() === district.trim().toLowerCase()
      : true;
    const matchesCrop = crop
      ? c.crops.some((item) => item.toLowerCase() === crop.trim().toLowerCase())
      : true;
    return matchesDistrict && matchesCrop;
  });
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined ||
    lon1 === undefined ||
    lat2 === undefined ||
    lon2 === undefined ||
    lat1 === null ||
    lon1 === null ||
    lat2 === null ||
    lon2 === null
  ) {
    return null;
  }
  const R = 6371; // Earth radius in km
  const p1 = (Number(lat1) * Math.PI) / 180;
  const p2 = (Number(lat2) * Math.PI) / 180;
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const CROWD_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
};

function getSuggestedCentres({ crop, lat, lng, limit = 4 }) {
  const hasLocation =
    lat !== undefined &&
    lat !== null &&
    lng !== undefined &&
    lng !== null &&
    !isNaN(Number(lat)) &&
    !isNaN(Number(lng));

  const enriched = centres
    .filter((c) => {
      if (!crop) return true;
      return c.crops.some((item) => item.toLowerCase() === crop.trim().toLowerCase());
    })
    .map((c) => {
      const crowdStatus = getCrowdStatus(c.id);
      const queueLength = getQueueForCentre(c.id).length;
      const distanceKm = hasLocation ? calculateDistanceKm(lat, lng, c.lat, c.lng) : null;
      return {
        ...c,
        crowdStatus,
        queueLength,
        distanceKm,
        bestTimeToVisit: getBestTimeToVisit(c.id),
        liveAvgMinutes: getLiveAvgProcessMinutes(c.id),
      };
    });

  enriched.sort((a, b) => {
    const crowdA = CROWD_WEIGHT[a.crowdStatus] || 2;
    const crowdB = CROWD_WEIGHT[b.crowdStatus] || 2;

    // Prioritize low crowd status first
    if (crowdA !== crowdB) {
      return crowdA - crowdB;
    }

    // Tie-breaker: shortest distance if location available
    if (hasLocation && a.distanceKm !== null && b.distanceKm !== null) {
      return a.distanceKm - b.distanceKm;
    }

    // Tie-breaker 2: shortest queue length
    return a.queueLength - b.queueLength;
  });

  return enriched.slice(0, Number(limit) || 4);
}

function getQueueForCentre(centreId) {
  const todayStr = getTodayDateString();
  return farmers
    .filter((f) => {
      if (f.centreId !== centreId) return false;
      if (f.status === STATUS.PAID || f.status === STATUS.CANCELLED) return false;
      const fDate = f.slotDate ? String(f.slotDate).trim() : todayStr;
      return fDate === todayStr;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

// Dynamic live ETA calculation
function getLiveAvgProcessMinutes(centreId) {
  const centre = getCentre(centreId);
  if (!centre) return 12;

  // Find completed farmers at this centre (procured or later)
  const completed = farmers
    .filter(
      (f) =>
        f.centreId === centreId &&
        (f.status === STATUS.PROCURED ||
          f.status === STATUS.PAYMENT_INITIATED ||
          f.status === STATUS.PAID) &&
        f.procuredAt &&
        f.queueEnteredAt
    )
    .slice(-10);

  if (completed.length < 3) {
    return centre.avgProcessMinutes;
  }

  const totalDurationMinutes = completed.reduce((sum, f) => {
    // Duration in minutes (at least 1 min for demo stability)
    const durationMin = Math.max(1, (f.procuredAt - f.queueEnteredAt) / 60000);
    return sum + durationMin;
  }, 0);

  const rawLiveAvg = totalDurationMinutes / completed.length;

  // Weighted smoothing: 70% live data + 30% static baseline
  const smoothed = 0.7 * rawLiveAvg + 0.3 * centre.avgProcessMinutes;
  return Math.round(smoothed * 10) / 10;
}

function hasLivePace(centreId) {
  const completed = farmers.filter(
    (f) =>
      f.centreId === centreId &&
      (f.status === STATUS.PROCURED ||
        f.status === STATUS.PAYMENT_INITIATED ||
        f.status === STATUS.PAID) &&
      f.procuredAt
  );
  return completed.length >= 3;
}

// Dynamic ETA: position in queue * centre's live-reacting average processing time.
// Recalculated on every status lookup.
function estimateWaitMinutes(farmer) {
  const queue = getQueueForCentre(farmer.centreId);
  const position = queue.findIndex((f) => f.id === farmer.id);
  if (position === -1) return 0;
  const liveAvg = getLiveAvgProcessMinutes(farmer.centreId);
  return Math.max(1, Math.round(position * liveAvg));
}

// Time & Slot Availability Helpers
export function getTodayDateString(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseTimeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const str = String(timeStr).trim();
  const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridiem = match12[3].toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const match24 = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }
  return 0;
}

export function parseSlotTimeRange(slotTimeStr) {
  if (!slotTimeStr) return null;
  const parts = slotTimeStr.split("-");
  if (parts.length !== 2) return null;
  const startMinutes = parseTimeStringToMinutes(parts[0]);
  const endMinutes = parseTimeStringToMinutes(parts[1]);
  return { startMinutes, endMinutes };
}

export function getCentreOperatingHours(centreIdOrObj) {
  const centre = typeof centreIdOrObj === "object" && centreIdOrObj !== null
    ? centreIdOrObj
    : getCentre(centreIdOrObj);
  const rawHours = centre?.operatingHours || { startTime: "06:00 AM", endTime: "06:00 PM" };
  const startTime = rawHours.startTime || "06:00 AM";
  const endTime = rawHours.endTime || "06:00 PM";
  const startMinutes = parseTimeStringToMinutes(startTime);
  const endMinutes = parseTimeStringToMinutes(endTime);
  return {
    startTime,
    endTime,
    startMinutes: startMinutes || 360,
    endMinutes: endMinutes || 1080,
  };
}

export function isSlotTimePassed(slotTime, now = new Date()) {
  const parsed = parseSlotTimeRange(slotTime);
  if (!parsed) return false;
  const d = now instanceof Date ? now : new Date(now);
  const currentMinutes = d.getHours() * 60 + d.getMinutes();
  return currentMinutes >= parsed.endMinutes;
}

export function isDateBookableForCentre(centreId, targetDate, now = new Date()) {
  const todayStr = getTodayDateString(now);
  const cleanDate = targetDate ? String(targetDate).trim() : todayStr;

  if (cleanDate < todayStr) return false;
  if (cleanDate > todayStr) return true;

  const opHours = getCentreOperatingHours(centreId);
  const d = now instanceof Date ? now : new Date(now);
  const currentMinutes = d.getHours() * 60 + d.getMinutes();

  if (currentMinutes >= opHours.endMinutes) {
    return false;
  }

  if (currentMinutes < opHours.startMinutes) {
    return true;
  }

  const centreSlots = generateSlotTimesForCentre(centreId);
  const hasRemainingSlot = centreSlots.some((slot) => !isSlotTimePassed(slot, now));
  return hasRemainingSlot;
}

export function getEarliestBookableDate(centreId, now = new Date()) {
  const todayStr = getTodayDateString(now);
  if (isDateBookableForCentre(centreId, todayStr, now)) {
    return todayStr;
  }
  const d = now instanceof Date ? new Date(now.getTime()) : new Date();
  d.setDate(d.getDate() + 1);
  return getTodayDateString(d);
}

// Slot Capacity & Crowd Management
function getCentreSlotCapacity(centreId) {
  const centre = getCentre(centreId);
  const daily = centre ? Number(centre.dailyCapacity) || 40 : 40;
  const centreSlots = generateSlotTimesForCentre(centreId);
  const numSlots = Math.max(1, centreSlots.length);
  const capacity = Math.max(1, Math.floor(daily / numSlots));
  return capacity;
}

function getSlotBookingCount(centreId, slotDate, slotTime) {
  if (!centreId || !slotDate || !slotTime) return 0;
  const cleanDate = String(slotDate).trim();
  const cleanTime = String(slotTime).trim();
  const count = farmers.filter((f) => {
    if (f.centreId !== centreId) return false;
    if (f.status === STATUS.CANCELLED) return false;
    const farmerDate = f.slotDate ? String(f.slotDate).trim() : null;
    const farmerTime = f.slotTime ? String(f.slotTime).trim() : null;
    return farmerDate === cleanDate && farmerTime === cleanTime;
  }).length;
  return count;
}

export function getSlotStatus(centreId, slotDate, slotTime, now = new Date()) {
  const capacity = getCentreSlotCapacity(centreId);
  const todayStr = getTodayDateString(now);
  const cleanDate = slotDate ? String(slotDate).trim() : todayStr;
  const isToday = cleanDate === todayStr;
  const isPastDate = cleanDate < todayStr;

  const isTodayPassed = isToday && !isDateBookableForCentre(centreId, todayStr, now);
  const isSpecificSlotPassed = isToday && isSlotTimePassed(slotTime, now);
  const isPast = isPastDate || isTodayPassed || isSpecificSlotPassed;

  const count = getSlotBookingCount(centreId, cleanDate, slotTime);
  const isFull = isPast || count >= capacity;
  const availableSpots = isPast ? 0 : Math.max(0, capacity - count);
  const ratio = capacity > 0 ? count / capacity : 1;

  let crowdLevel = "low";
  if (isPast || isFull) {
    crowdLevel = "full";
  } else if (ratio >= 0.5) {
    crowdLevel = "medium";
  }

  return {
    count,
    capacity,
    availableSpots,
    crowdLevel,
    isFull,
    isPast,
  };
}

export function getCentreSlotsAvailability(centreId, slotDate, now = new Date()) {
  const todayStr = getTodayDateString(now);
  const earliestBookableDate = getEarliestBookableDate(centreId, now);
  const targetDate = slotDate ? String(slotDate).trim() : earliestBookableDate;
  const centre = getCentre(centreId);
  if (!centre) return null;

  const isToday = targetDate === todayStr;
  const isTodayBookable = isDateBookableForCentre(centreId, todayStr, now);
  const opHours = getCentreOperatingHours(centreId);
  const slotCapacity = getCentreSlotCapacity(centreId);
  const centreSlots = generateSlotTimesForCentre(centreId);

  const slots = centreSlots.map((slotTime) => {
    const status = getSlotStatus(centreId, targetDate, slotTime, now);
    return {
      slotTime,
      count: status.count,
      capacity: status.capacity,
      availableSpots: status.availableSpots,
      crowdLevel: status.crowdLevel,
      isFull: status.isFull,
      isPast: status.isPast,
    };
  });

  return {
    centreId,
    centreName: centre.name,
    date: targetDate,
    slotCapacity,
    earliestBookableDate,
    isTodayBookable,
    isToday,
    operatingHours: {
      startTime: opHours.startTime,
      endTime: opHours.endTime,
    },
    slots,
  };
}

export function getCentreDateRangeAvailability(centreId, days = 7, now = new Date()) {
  const centre = getCentre(centreId);
  if (!centre) return null;

  const numDays = Math.max(1, Math.min(30, parseInt(days, 10) || 7));
  const dailyCapacity = Number(centre.dailyCapacity) || 40;
  const opHours = getCentreOperatingHours(centreId);
  const todayStr = getTodayDateString(now);
  const isTodayBookable = isDateBookableForCentre(centreId, todayStr, now);
  const earliestBookableDate = getEarliestBookableDate(centreId, now);
  const centreSlots = generateSlotTimesForCentre(centreId);

  const dates = [];
  const baseDate = now instanceof Date ? new Date(now.getTime()) : new Date();
  const startOffset = isTodayBookable ? 0 : 1;

  for (let i = 0; i < numDays; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + startOffset + i);
    const dateStr = getTodayDateString(d);
    const dateIsToday = dateStr === todayStr;
    const tomorrowObj = new Date(baseDate);
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = getTodayDateString(tomorrowObj);
    const dateIsTomorrow = dateStr === tomorrowStr;

    const slots = centreSlots.map((slotTime) => {
      const status = getSlotStatus(centreId, dateStr, slotTime, now);
      return {
        slotTime,
        count: status.count,
        capacity: status.capacity,
        availableSpots: status.availableSpots,
        crowdLevel: status.crowdLevel,
        isFull: status.isFull,
        isPast: status.isPast,
      };
    });

    const totalBooked = slots.reduce((sum, s) => sum + s.count, 0);
    const totalAvailable = slots.reduce((sum, s) => sum + s.availableSpots, 0);
    const overallCrowd = getCrowdStatusForDate(centreId, dateStr);

    dates.push({
      date: dateStr,
      dayOffset: startOffset + i,
      isToday: dateIsToday,
      isTomorrow: dateIsTomorrow,
      totalBooked,
      dailyCapacity,
      availableSpots: totalAvailable,
      crowdLevel: overallCrowd,
      slots,
    });
  }

  const minBooked = Math.min(...dates.map((d) => d.totalBooked));
  dates.forEach((d) => {
    d.isLowestCrowd = d.totalBooked === minBooked;
  });

  return {
    centreId: centre.id,
    centreName: centre.name,
    district: centre.district,
    days: numDays,
    earliestBookableDate,
    isTodayBookable,
    operatingHours: {
      startTime: opHours.startTime,
      endTime: opHours.endTime,
    },
    dates,
  };
}

export function computeSlotStatus(farmer) {
  if (
    farmer.status === STATUS.PROCURED ||
    farmer.status === STATUS.PAYMENT_INITIATED ||
    farmer.status === STATUS.PAID
  ) {
    return "completed";
  }

  if (farmer.status === STATUS.CANCELLED) {
    return "cancelled";
  }

  const todayStr = getTodayDateString();
  if (farmer.slotDate && farmer.slotDate > todayStr) {
    return "upcoming";
  }

  if (!farmer.slotTime) return "active";

  const parsed = parseSlotTimeRange(farmer.slotTime);
  if (!parsed) return "upcoming";

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (currentMinutes < parsed.startMinutes) {
    return "upcoming";
  }
  if (currentMinutes >= parsed.startMinutes && currentMinutes <= parsed.endMinutes) {
    return "active";
  }
  return "active";
}

function getDailyLiveQueue(centreId) {
  const live = farmers
    .filter(
      (f) =>
        f.centreId === centreId &&
        f.status !== STATUS.PAID &&
        f.status !== STATUS.CANCELLED &&
        (f.queueType === "live" || !f.slotTime)
    )
    .sort((a, b) => a.createdAt - b.createdAt);

  const liveAvg = getLiveAvgProcessMinutes(centreId);

  return live.map((f, idx) => ({
    ...f,
    position: idx + 1,
    estimatedWaitMinutes: Math.max(1, Math.round(idx * liveAvg)),
  }));
}

function getTodaySlottedQueue(centreId) {
  const todayStr = getTodayDateString();
  const todaySlots = farmers
    .filter(
      (f) =>
        f.centreId === centreId &&
        f.status !== STATUS.CANCELLED &&
        (f.queueType === "slotted" || f.slotTime) &&
        f.slotDate === todayStr
    )
    .sort((a, b) => (a.slotTime || "").localeCompare(b.slotTime || "") || a.createdAt - b.createdAt);

  return todaySlots.map((f) => ({
    ...f,
    slotStatus: computeSlotStatus(f),
  }));
}

function getUpcomingSlottedQueue(centreId) {
  const todayStr = getTodayDateString();
  const upcoming = farmers
    .filter(
      (f) =>
        f.centreId === centreId &&
        f.status !== STATUS.CANCELLED &&
        (f.queueType === "slotted" || f.slotTime) &&
        f.slotDate &&
        f.slotDate > todayStr
    )
    .sort((a, b) => a.slotDate.localeCompare(b.slotDate) || (a.slotTime || "").localeCompare(b.slotTime || ""));

  const grouped = {};
  for (const f of upcoming) {
    if (!grouped[f.slotDate]) {
      grouped[f.slotDate] = [];
    }
    grouped[f.slotDate].push({
      ...f,
      slotStatus: "upcoming",
    });
  }

  return grouped;
}

export function registerFarmer({
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
  queueType,
  slotDate,
  slotTime,
}) {
  const now = Date.now();
  const nowDate = new Date(now);
  const todayStr = getTodayDateString(nowDate);
  const isLive = queueType === "live" || (!slotTime && (!slotDate || slotDate === todayStr));
  const finalQueueType = isLive ? "live" : "slotted";
  const earliestDate = getEarliestBookableDate(centreId, nowDate);
  const targetDate = isLive ? todayStr : (slotDate ? String(slotDate).trim() : earliestDate);
  const defaultSlot = generateSlotTimesForCentre(centreId)[0] || "08:00 AM - 10:00 AM";
  const targetTime = slotTime ? String(slotTime).trim() : (isLive ? null : defaultSlot);

  if (targetTime) {
    if (targetDate < todayStr) {
      const err = new Error("Cannot book a slot for a past date");
      err.status = 400;
      throw err;
    }
    if (!isLive && targetDate === todayStr && !isDateBookableForCentre(centreId, todayStr, nowDate)) {
      const err = new Error("Operating hours for today have ended or no slots remain at this centre. Please choose tomorrow or an upcoming date.");
      err.status = 400;
      err.isClosed = true;
      throw err;
    }
    if (!isLive && targetDate === todayStr && isSlotTimePassed(targetTime, nowDate)) {
      const err = new Error("This slot time has already passed for today. Please select an upcoming slot or date.");
      err.status = 400;
      err.isPast = true;
      throw err;
    }

    const slotStatus = getSlotStatus(centreId, targetDate, targetTime, nowDate);
    if (!isLive && slotStatus.isFull) {
      const err = new Error("This slot is full - please choose another time");
      err.status = 409;
      err.isFull = true;
      throw err;
    }
  } else if (!isLive) {
    if (targetDate < todayStr) {
      const err = new Error("Cannot book a slot for a past date");
      err.status = 400;
      throw err;
    }
    if (targetDate === todayStr && !isDateBookableForCentre(centreId, todayStr, nowDate)) {
      const err = new Error("Operating hours for today have ended or no slots remain at this centre. Please choose tomorrow or an upcoming date.");
      err.status = 400;
      err.isClosed = true;
      throw err;
    }
  }

  const chosenUnit = String(declaredUnit || unit || (quantityKg !== undefined && declaredQuantity === undefined && quantity === undefined ? "kg" : "bags")).toLowerCase();
  const rawQty = declaredQuantity !== undefined ? declaredQuantity : (quantity !== undefined ? quantity : quantityKg);
  const numQty = Number(rawQty) || 0;
  const computedKg = convertQuantityToKg(numQty, chosenUnit, crop);

  const farmer = {
    id: nextId(centreId),
    name,
    phone,
    email: email ? String(email).trim() : null,
    crop,
    variety: variety || (crop === "Paddy" ? "Common" : null),
    declaredQuantity: numQty,
    declaredUnit: chosenUnit,
    declaredQuantityKg: computedKg,
    quantityKg: computedKg, // backward compatibility
    verifiedQuantity: null,
    verifiedUnit: null,
    verifiedQuantityKg: null,
    quantityDiscrepancyReason: null,
    verifiedBy: null,
    verifiedAt: null,
    centreId,
    queueType: finalQueueType,
    slotDate: targetDate,
    slotTime: targetTime,
    cancellationReason: null,
    status: STATUS.IN_QUEUE,
    createdAt: now,
    queueEnteredAt: now,
    stageChangedAt: now,
    rescheduledCount: 0,
    checkedIn: isLive ? true : false,
    checkedInAt: isLive ? now : null,
  };
  farmers.push(farmer);
  scheduleSave();
  return farmer;
}

function getFarmer(id) {
  return farmers.find((f) => f.id === id);
}

function checkInFarmer(id) {
  const farmer = getFarmer(id);
  if (!farmer) return { error: "Farmer not found", status: 404 };
  if (farmer.status !== STATUS.IN_QUEUE) {
    return { error: "Only tokens currently in queue can be checked in", status: 400 };
  }
  farmer.checkedIn = true;
  farmer.checkedInAt = Date.now();
  scheduleSave();
  return { farmer };
}

function verifyAndAdvanceFarmer(id, { verifiedQuantity, verifiedUnit, varietySelection, discrepancyReason, adminName }) {
  const farmer = getFarmer(id);
  if (!farmer) {
    const err = new Error("Farmer not found");
    err.status = 404;
    throw err;
  }

  if (verifiedQuantity === undefined || verifiedQuantity === null || String(verifiedQuantity).trim() === "" || isNaN(Number(verifiedQuantity)) || Number(verifiedQuantity) <= 0) {
    const err = new Error("Verified quantity is required and must be greater than 0");
    err.status = 400;
    throw err;
  }

  const unit = String(verifiedUnit || farmer.declaredUnit || "bags").toLowerCase();
  const verifiedQtyNum = Number(verifiedQuantity);
  const verifiedQuantityKg = convertQuantityToKg(verifiedQtyNum, unit, farmer.crop);

  const declaredKg = farmer.declaredQuantityKg !== undefined && farmer.declaredQuantityKg !== null
    ? farmer.declaredQuantityKg
    : (farmer.quantityKg || verifiedQuantityKg);

  const diffKg = Math.abs(declaredKg - verifiedQuantityKg);
  const diffPercent = declaredKg > 0 ? (diffKg / declaredKg) * 100 : 0;
  const roundedDiffPercent = Math.round(diffPercent * 10) / 10;

  if (diffPercent > DISCREPANCY_THRESHOLD_PERCENT && (!discrepancyReason || !String(discrepancyReason).trim())) {
    const err = new Error("Please provide a reason for the quantity difference (discrepancy exceeds 15%)");
    err.status = 400;
    err.discrepancyPercent = roundedDiffPercent;
    throw err;
  }

  const now = Date.now();
  farmer.verifiedQuantity = verifiedQtyNum;
  farmer.verifiedUnit = unit;
  farmer.verifiedQuantityKg = verifiedQuantityKg;
  farmer.quantityKg = verifiedQuantityKg; // update working kg to verified
  if (varietySelection) {
    farmer.variety = varietySelection;
  }
  farmer.quantityDiscrepancyReason = discrepancyReason ? String(discrepancyReason).trim() : null;
  farmer.verifiedBy = adminName ? String(adminName).trim() : "Centre Admin";
  farmer.verifiedAt = now;
  farmer.status = STATUS.PROCURED;
  farmer.stageChangedAt = now;
  if (!farmer.procuredAt) {
    farmer.procuredAt = now;
  }

  scheduleSave();
  return {
    farmer,
    diffKg,
    diffPercent: roundedDiffPercent,
    hasDiscrepancy: diffKg > 0.01,
  };
}

function createProcurementHistorySnapshot(farmer, save = true) {
  if (!farmer || farmer.status !== STATUS.PAID) return null;

  // Duplicate guard: check if history record already exists for this exact token id or receipt id
  const existing = procurementHistoryRecords.find(
    (r) => r.tokenId === farmer.id || (farmer.receipt && r.receiptId === farmer.receipt.receiptId)
  );
  if (existing) {
    return existing;
  }

  const centre = getCentre(farmer.centreId);
  const receipt = farmer.receipt || {};

  const nowIso = new Date().toISOString();
  const paymentTimestamp = farmer.stageChangedAt || Date.now();
  const procurementTimestamp = farmer.procuredAt || farmer.createdAt || paymentTimestamp;

  const finalKg = receipt.quantityKg !== undefined && receipt.quantityKg !== null
    ? receipt.quantityKg
    : (farmer.verifiedQuantityKg !== undefined && farmer.verifiedQuantityKg !== null
      ? farmer.verifiedQuantityKg
      : (farmer.declaredQuantityKg || farmer.quantityKg || 0));

  const finalQuintals = Number((finalKg / 100).toFixed(2));
  const declaredUnit = farmer.declaredUnit || "bags";
  const verifiedUnit = farmer.verifiedUnit || declaredUnit;
  const originalQuantity = farmer.verifiedQuantity !== undefined && farmer.verifiedQuantity !== null
    ? farmer.verifiedQuantity
    : (farmer.declaredQuantity !== undefined && farmer.declaredQuantity !== null
      ? farmer.declaredQuantity
      : farmer.quantity);

  const ratePerKg = Number(receipt.ratePerKg || 0);
  const ratePerQuintal = Number(receipt.ratePerQuintal || (ratePerKg * 100));
  const baseMspPerQuintal = Number(
    receipt.baseMspPerQuintal !== undefined
      ? receipt.baseMspPerQuintal
      : (ratePerQuintal - (receipt.stateIncentivePerQuintal || 0))
  );
  const stateIncentivePerQuintal = Number(receipt.stateIncentivePerQuintal || 0);
  const totalAmountPaid = Number(receipt.totalAmount || (finalKg * ratePerKg));

  const snapshotRecord = {
    id: `PH-${farmer.id}-${Date.now()}`,
    tokenId: String(farmer.id),
    farmerId: String(farmer.farmerId || farmer.id),
    farmerName: String(farmer.name || ""),
    phone: farmer.phone ? String(farmer.phone).trim() : null,
    email: farmer.email ? String(farmer.email).trim() : null,
    acreage: farmer.acreage !== undefined && farmer.acreage !== null ? Number(farmer.acreage) : null,
    crop: String(farmer.crop || receipt.crop || ""),
    variety: String(receipt.variety || farmer.variety || "Common"),
    quantity: {
      original: originalQuantity,
      unit: verifiedUnit,
      declaredQuantity: farmer.declaredQuantity !== undefined ? farmer.declaredQuantity : null,
      declaredUnit: declaredUnit,
      declaredKg: farmer.declaredQuantityKg !== undefined ? farmer.declaredQuantityKg : finalKg,
      verifiedQuantity: farmer.verifiedQuantity !== undefined ? farmer.verifiedQuantity : null,
      verifiedUnit: verifiedUnit,
      verifiedKg: farmer.verifiedQuantityKg !== undefined ? farmer.verifiedQuantityKg : finalKg,
      kg: finalKg,
      quintal: finalQuintals,
    },
    mspRate: baseMspPerQuintal,
    stateIncentive: stateIncentivePerQuintal,
    finalRate: ratePerQuintal,
    finalRatePerKg: ratePerKg,
    finalRatePerQuintal: ratePerQuintal,
    totalAmountPaid: totalAmountPaid,
    procurementDate: new Date(procurementTimestamp).toISOString(),
    procurementTimestamp: procurementTimestamp,
    paymentDate: new Date(paymentTimestamp).toISOString(),
    paymentTimestamp: paymentTimestamp,
    centreId: String(farmer.centreId || ""),
    centreName: String(centre?.name || receipt.centreName || farmer.centreId || ""),
    slotDate: farmer.slotDate || null,
    slotTime: farmer.slotTime || null,
    receiptId: String(receipt.receiptId || `RCPT-${farmer.id}`),
    receipt: receipt ? JSON.parse(JSON.stringify(receipt)) : null,
    createdAt: nowIso,
  };

  procurementHistoryRecords.unshift(snapshotRecord);
  if (save) {
    scheduleSave();
  }
  return snapshotRecord;
}

function getProcurementHistoryForFarmer(identifier) {
  if (!identifier) return [];
  const cleanId = String(identifier).trim().toLowerCase();

  return procurementHistoryRecords
    .filter((r) => {
      const phoneMatch = r.phone && r.phone.toLowerCase() === cleanId;
      const emailMatch = r.email && r.email.toLowerCase() === cleanId;
      const tokenIdMatch = r.tokenId && r.tokenId.toLowerCase() === cleanId;
      const farmerIdMatch = r.farmerId && r.farmerId.toLowerCase() === cleanId;
      return phoneMatch || emailMatch || tokenIdMatch || farmerIdMatch;
    })
    .sort((a, b) => (b.paymentTimestamp || 0) - (a.paymentTimestamp || 0));
}

function getFarmerProcurementSummary(identifier) {
  const history = getProcurementHistoryForFarmer(identifier);
  const totalTransactions = history.length;
  const totalQuantitySoldKg = history.reduce((sum, rec) => {
    const qty = rec.quantity || {};
    const kg = qty.kg !== undefined && qty.kg !== null ? qty.kg : (qty.verifiedKg || qty.declaredKg || 0);
    return sum + Number(kg || 0);
  }, 0);
  const totalAmountEarned = history.reduce((sum, rec) => {
    return sum + Number(rec.totalAmountPaid || (rec.receipt && rec.receipt.totalAmount) || 0);
  }, 0);

  return {
    totalTransactions,
    totalQuantitySoldKg: Math.round(totalQuantitySoldKg * 100) / 100,
    totalAmountEarned: Math.round(totalAmountEarned * 100) / 100,
    history,
  };
}

function getFarmerProfile(identifier, fallbackName = null) {
  if (!identifier) return null;
  const cleanId = String(identifier).trim();
  const farmerRecords = getFarmersByIdentifier(cleanId);
  const summary = getFarmerProcurementSummary(cleanId);

  // Determine farmer details
  let name = fallbackName || "Farmer";
  let phone = null;
  let email = null;
  let memberSince = null;
  let loginMethod = cleanId.includes("@") ? "google" : "phone";

  if (farmerRecords.length > 0) {
    const sortedByCreated = [...farmerRecords].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const earliest = sortedByCreated[0];
    const latest = sortedByCreated[sortedByCreated.length - 1];

    name = latest.name || earliest.name || name;
    phone = farmerRecords.find((f) => f.phone)?.phone || (cleanId.includes("@") ? null : cleanId);
    email = farmerRecords.find((f) => f.email)?.email || (cleanId.includes("@") ? cleanId : null);
    if (farmerRecords.some((f) => f.email) || cleanId.includes("@")) {
      loginMethod = "google";
    }
    memberSince = earliest.createdAt ? new Date(earliest.createdAt).toISOString() : new Date().toISOString();
  } else if (summary.history && summary.history.length > 0) {
    const earliestHistory = [...summary.history].sort((a, b) => (a.paymentTimestamp || 0) - (b.paymentTimestamp || 0))[0];
    name = earliestHistory.farmerName || name;
    phone = summary.history.find((f) => f.phone)?.phone || (cleanId.includes("@") ? null : cleanId);
    email = summary.history.find((f) => f.email)?.email || (cleanId.includes("@") ? cleanId : null);
    if (cleanId.includes("@") || email) {
      loginMethod = "google";
    }
    memberSince = earliestHistory.procurementDate || earliestHistory.paymentDate || earliestHistory.createdAt || new Date().toISOString();
  } else {
    if (cleanId.includes("@")) {
      email = cleanId;
      loginMethod = "google";
    } else {
      phone = cleanId;
      loginMethod = "phone";
    }
    memberSince = new Date().toISOString();
  }

  // Active token lookup: token with status other than paid or cancelled
  const activeRecords = farmerRecords
    .filter((f) => f.status !== STATUS.PAID && f.status !== STATUS.CANCELLED)
    .sort((a, b) => (b.stageChangedAt || b.createdAt || 0) - (a.stageChangedAt || a.createdAt || 0));

  let activeToken = null;
  if (activeRecords.length > 0) {
    const f = activeRecords[0];
    const centre = getCentre(f.centreId);
    activeToken = {
      id: f.id,
      centreId: f.centreId,
      centreName: centre ? centre.name : f.centreId,
      status: f.status,
      crop: f.crop,
      variety: f.variety || "Common",
      quantityKg: f.declaredQuantityKg || f.quantityKg || 0,
      slotDate: f.slotDate || null,
      slotTime: f.slotTime || null,
      queueType: f.queueType || (f.slotTime ? "slotted" : "live"),
    };
  }

  return {
    name,
    identifier: phone || email || cleanId,
    phone,
    email,
    loginMethod,
    memberSince,
    totalTransactions: summary.totalTransactions,
    totalQuantitySoldKg: summary.totalQuantitySoldKg,
    totalAmountEarned: summary.totalAmountEarned,
    activeToken,
  };
}

function getProcurementRecords({
  farmerName,
  farmerId,
  crop,
  dateFrom,
  dateTo,
  tokenId,
  centreId,
  page = 1,
  limit = 20,
} = {}) {
  let records = [...procurementHistoryRecords];

  if (farmerName && String(farmerName).trim()) {
    const q = String(farmerName).trim().toLowerCase();
    records = records.filter((r) => r.farmerName && r.farmerName.toLowerCase().includes(q));
  }
  if (farmerId && String(farmerId).trim()) {
    const q = String(farmerId).trim().toLowerCase();
    records = records.filter((r) => r.farmerId && r.farmerId.toLowerCase().includes(q));
  }
  if (tokenId && String(tokenId).trim()) {
    const q = String(tokenId).trim().toLowerCase();
    records = records.filter((r) => r.tokenId && r.tokenId.toLowerCase().includes(q));
  }
  if (crop && String(crop).trim()) {
    const q = String(crop).trim().toLowerCase();
    records = records.filter((r) => r.crop && r.crop.toLowerCase() === q);
  }
  if (centreId && String(centreId).trim()) {
    const q = String(centreId).trim().toUpperCase();
    records = records.filter((r) => r.centreId && r.centreId.toUpperCase() === q);
  }
  if (dateFrom && String(dateFrom).trim()) {
    const from = String(dateFrom).trim();
    records = records.filter((r) => {
      const pDate = r.paymentDate ? r.paymentDate.split("T")[0] : (r.procurementDate ? r.procurementDate.split("T")[0] : "");
      return pDate >= from;
    });
  }
  if (dateTo && String(dateTo).trim()) {
    const to = String(dateTo).trim();
    records = records.filter((r) => {
      const pDate = r.paymentDate ? r.paymentDate.split("T")[0] : (r.procurementDate ? r.procurementDate.split("T")[0] : "");
      return pDate <= to;
    });
  }

  // Sort most recent first
  records.sort((a, b) => (b.paymentTimestamp || 0) - (a.paymentTimestamp || 0));

  const total = records.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedRecords = records.slice(startIndex, startIndex + limitNum);
  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    records: paginatedRecords,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages,
  };
}

function updateFarmerStatus(id, status) {
  const farmer = getFarmer(id);
  if (!farmer) return null;
  const now = Date.now();
  farmer.status = status;
  farmer.stageChangedAt = now;
  if (
    (status === STATUS.PROCURED ||
      status === STATUS.PAYMENT_INITIATED ||
      status === STATUS.PAID) &&
    !farmer.procuredAt
  ) {
    farmer.procuredAt = now;
  }
  if (status === STATUS.PAID) {
    if (!farmer.receipt) {
      const centre = getCentre(farmer.centreId);
      const finalKg = (farmer.verifiedQuantityKg !== undefined && farmer.verifiedQuantityKg !== null)
        ? farmer.verifiedQuantityKg
        : (farmer.declaredQuantityKg || farmer.quantityKg || 0);

      const calcResult = calculateRateAndTotal({
        crop: farmer.crop,
        variety: farmer.variety,
        quantityKg: finalKg,
      });

      const declaredKg = farmer.declaredQuantityKg !== undefined && farmer.declaredQuantityKg !== null
        ? farmer.declaredQuantityKg
        : finalKg;

      const hasDiscrepancy = farmer.verifiedQuantityKg !== undefined &&
        farmer.verifiedQuantityKg !== null &&
        Math.abs(declaredKg - finalKg) > 0.01;

      const discrepancyPercent = (hasDiscrepancy && declaredKg > 0)
        ? Math.round((Math.abs(declaredKg - finalKg) / declaredKg) * 1000) / 10
        : 0;

      farmer.receipt = {
        receiptId: `RCPT-${farmer.id}`,
        receiptStatus: "pending_release",
        crop: farmer.crop,
        variety: calcResult.variety,
        declaredQuantity: farmer.declaredQuantity !== undefined ? farmer.declaredQuantity : null,
        declaredUnit: farmer.declaredUnit || "bags",
        declaredQuantityKg: declaredKg,
        verifiedQuantity: farmer.verifiedQuantity !== undefined ? farmer.verifiedQuantity : null,
        verifiedUnit: farmer.verifiedUnit || farmer.declaredUnit || "bags",
        verifiedQuantityKg: finalKg,
        hasDiscrepancy,
        discrepancyPercent,
        discrepancyReason: farmer.quantityDiscrepancyReason || null,
        verifiedBy: farmer.verifiedBy || "Centre Admin",
        verifiedAt: farmer.verifiedAt || null,
        quantityKg: finalKg,
        quintals: calcResult.quintals,
        ratePerKg: calcResult.ratePerKg,
        ratePerQuintal: calcResult.ratePerQuintal,
        baseMspPerQuintal: calcResult.baseMspPerQuintal,
        stateIncentivePerQuintal: calcResult.stateIncentivePerQuintal,
        totalAmount: calcResult.totalAmount,
        date: new Date().toISOString().split("T")[0],
        farmerName: farmer.name,
        centreName: centre?.name || farmer.centreId,
      };
      farmer.receiptStatus = "pending_release";
    } else {
      farmer.receipt.receiptStatus = farmer.receipt.receiptStatus || "pending_release";
      farmer.receiptStatus = farmer.receipt.receiptStatus;
    }
    // Note: Official permanent procurement history snapshot is finalized upon explicit receipt release
  }
  scheduleSave();
  return farmer;
}

function releaseFarmerReceipt(id, { adminName } = {}) {
  const farmer = getFarmer(id);
  if (!farmer) {
    return { error: "Farmer not found", status: 404 };
  }

  if (farmer.status !== STATUS.PAID || !farmer.receipt) {
    return {
      error: "Payment receipt cannot be released yet. Farmer status must be 'paid' with generated receipt details.",
      status: 400,
    };
  }

  const receipt = farmer.receipt;

  // Validate required receipt fields
  const finalKg = Number(receipt.quantityKg || receipt.verifiedQuantityKg || 0);
  const ratePerKg = Number(receipt.ratePerKg || 0);
  const totalAmount = Number(receipt.totalAmount || 0);

  if (finalKg <= 0) {
    return { error: "Verified produce quantity is missing or invalid in receipt", status: 400 };
  }
  if (ratePerKg <= 0) {
    return { error: "MSP rate is missing or invalid in receipt", status: 400 };
  }
  if (totalAmount <= 0) {
    return { error: "Total payment amount must be greater than 0", status: 400 };
  }
  if (!receipt.crop && !farmer.crop) {
    return { error: "Crop information is missing in receipt", status: 400 };
  }
  if ((farmer.crop === "Paddy" || receipt.crop === "Paddy") && !receipt.variety && !farmer.variety) {
    return { error: "Paddy variety is required before releasing receipt", status: 400 };
  }

  const now = Date.now();
  receipt.receiptStatus = "released";
  receipt.releasedAt = now;
  receipt.releasedBy = adminName ? String(adminName).trim() : "Centre Admin";
  farmer.receiptStatus = "released";

  // Create or update the official immutable snapshot record
  createProcurementHistorySnapshot(farmer);

  // Trigger in-app notification to the farmer
  const totalFormatted = totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const notifMsg = `Your payment receipt for token ${farmer.id} is ready. Total amount: ₹${totalFormatted}. Tap to view and download.`;

  addNotification({
    identifier: farmer.phone || farmer.email || farmer.id,
    tokenId: farmer.id,
    title: "Payment Receipt Ready",
    message: notifMsg,
  });

  scheduleSave();

  return {
    success: true,
    farmer,
    receipt,
    totalFormatted,
  };
}

export function rescheduleFarmer(id, maxReschedulesOrOptions = 2, newSlotDate = null, newSlotTime = null) {
  const farmer = getFarmer(id);
  if (!farmer) return { error: "Farmer not found", status: 404 };

  let maxReschedules = 2;
  let targetSlotDateInput = newSlotDate;
  let targetSlotTimeInput = newSlotTime;

  if (typeof maxReschedulesOrOptions === "object" && maxReschedulesOrOptions !== null) {
    targetSlotDateInput = maxReschedulesOrOptions.newSlotDate !== undefined ? maxReschedulesOrOptions.newSlotDate : newSlotDate;
    targetSlotTimeInput = maxReschedulesOrOptions.newSlotTime !== undefined ? maxReschedulesOrOptions.newSlotTime : newSlotTime;
    maxReschedules = maxReschedulesOrOptions.maxReschedules !== undefined ? maxReschedulesOrOptions.maxReschedules : 2;
  } else if (typeof maxReschedulesOrOptions === "number") {
    maxReschedules = maxReschedulesOrOptions;
  }

  const canReschedule =
    farmer.status === STATUS.IN_QUEUE ||
    (farmer.status === STATUS.CANCELLED && farmer.cancellationReason);

  if (!canReschedule) {
    return {
      error: "Only tokens currently in queue or cancelled by centre administration can be rescheduled",
      status: 400,
    };
  }

  const currentCount = farmer.rescheduledCount || 0;
  if (currentCount >= maxReschedules) {
    return { error: `Maximum reschedule limit (${maxReschedules}) reached for this token`, status: 400 };
  }

  const nowDate = new Date();
  const todayStr = getTodayDateString(nowDate);
  const earliestDate = getEarliestBookableDate(farmer.centreId, nowDate);
  const targetDate = targetSlotDateInput ? String(targetSlotDateInput).trim() : (farmer.slotDate || earliestDate);
  const defaultSlot = generateSlotTimesForCentre(farmer.centreId)[0] || "6:00 AM - 8:00 AM";
  const targetTime = targetSlotTimeInput ? String(targetSlotTimeInput).trim() : (farmer.slotTime || defaultSlot);

  if (targetDate < todayStr) {
    return { error: "Cannot reschedule to a past date", status: 400 };
  }
  if (targetDate === todayStr && !isDateBookableForCentre(farmer.centreId, todayStr, nowDate)) {
    return { error: "Operating hours for today have ended or no slots remain at this centre. Please choose tomorrow or an upcoming date.", status: 400, isClosed: true };
  }
  if (targetDate === todayStr && isSlotTimePassed(targetTime, nowDate)) {
    return { error: "This slot time has already passed for today. Please select an upcoming slot or date.", status: 400, isPast: true };
  }

  // If selecting a different slot date/time, verify capacity
  if (targetSlotDateInput || targetSlotTimeInput) {
    const slotStatus = getSlotStatus(farmer.centreId, targetDate, targetTime, nowDate);
    if (slotStatus.isFull) {
      return {
        error: "This slot is full - please choose another time",
        status: 409,
        isFull: true,
      };
    }
  }

  // Update date & time slots
  farmer.slotDate = targetDate;
  farmer.slotTime = targetTime;

  // If token was cancelled by admin, restore it to in_queue and clear cancellation reason
  if (farmer.status === STATUS.CANCELLED) {
    farmer.status = STATUS.IN_QUEUE;
    farmer.cancellationReason = null;
  }

  const queue = getQueueForCentre(farmer.centreId);
  const maxCreatedAt = queue.reduce((max, f) => Math.max(max, f.createdAt || 0), 0);
  const now = Date.now();
  farmer.createdAt = Math.max(now, maxCreatedAt + 1);
  farmer.stageChangedAt = now;
  farmer.rescheduledCount = currentCount + 1;

  scheduleSave();
  return { farmer };
}

function cancelFarmer(id) {
  const farmer = getFarmer(id);
  if (!farmer) return null;
  farmer.status = STATUS.CANCELLED;
  farmer.stageChangedAt = Date.now();
  scheduleSave();
  return farmer;
}

function cancelFarmerWithReason(id, reason) {
  const farmer = getFarmer(id);
  if (!farmer) return null;
  farmer.status = STATUS.CANCELLED;
  farmer.cancellationReason = reason ? String(reason).trim() : "Cancelled by centre administration";
  farmer.stageChangedAt = Date.now();
  scheduleSave();
  return farmer;
}

function getFarmersByIdentifier(identifier) {
  if (!identifier) return [];
  const clean = String(identifier).trim().toLowerCase();
  return farmers.filter((f) => {
    const phoneMatch = f.phone && String(f.phone).trim().toLowerCase() === clean;
    const emailMatch = f.email && String(f.email).trim().toLowerCase() === clean;
    return phoneMatch || emailMatch;
  });
}

function getFarmersByPhone(phone) {
  return getFarmersByIdentifier(phone);
}

function nextTicketId() {
  const count = ticketCounter++;
  return `TKT-${String(count).padStart(4, "0")}`;
}

function createTicket({
  farmerPhone,
  farmerEmail,
  farmerName,
  ticketType,
  ticketSubtype,
  description,
  state = "Tamil Nadu",
  district,
  village,
  pincode,
}) {
  const now = Date.now();
  const ticket = {
    id: nextTicketId(),
    farmerPhone: farmerPhone ? String(farmerPhone).trim() : null,
    farmerEmail: farmerEmail ? String(farmerEmail).trim() : null,
    farmerName: String(farmerName).trim(),
    ticketType: String(ticketType).trim(),
    ticketSubtype: String(ticketSubtype).trim(),
    description: String(description).trim(),
    state: String(state).trim(),
    district: String(district).trim(),
    village: String(village).trim(),
    pincode: String(pincode).trim(),
    status: TICKET_STATUS.OPEN,
    createdAt: now,
    updatedAt: now,
  };
  tickets.push(ticket);
  scheduleSave();
  return ticket;
}

function getTicketsByIdentifier(identifier) {
  if (!identifier) return [];
  const clean = String(identifier).trim().toLowerCase();
  return tickets
    .filter((t) => {
      const phoneMatch = t.farmerPhone && String(t.farmerPhone).trim().toLowerCase() === clean;
      const emailMatch = t.farmerEmail && String(t.farmerEmail).trim().toLowerCase() === clean;
      return phoneMatch || emailMatch;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getTicketsByPhone(phone) {
  return getTicketsByIdentifier(phone);
}

function getAllTickets() {
  return [...tickets].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getTicketById(id) {
  return tickets.find((t) => t.id === id);
}

function updateTicketStatus(id, status) {
  const ticket = getTicketById(id);
  if (!ticket) return null;
  const oldStatus = ticket.status;
  ticket.status = status;
  ticket.updatedAt = Date.now();

  // Trigger in-app notification to the farmer who raised this ticket
  const cleanStatus = String(status).toLowerCase();
  const ticketRef = ticket.subject || ticket.id;
  let notifMessage = null;

  if (cleanStatus === "in_progress") {
    notifMessage = `Your ticket ${ticketRef} is now being worked on.`;
  } else if (cleanStatus === "resolved") {
    notifMessage = `Your ticket ${ticketRef} has been resolved.`;
  } else if (cleanStatus === "closed") {
    notifMessage = `Your ticket ${ticketRef} has been closed.`;
  } else if (
    cleanStatus === "reopened" ||
    cleanStatus === "reopen" ||
    (cleanStatus === "open" && oldStatus && oldStatus !== "open")
  ) {
    notifMessage = `Your ticket ${ticketRef} has been reopened.`;
  }

  if (notifMessage) {
    const farmerIdentifier = ticket.farmerPhone || ticket.farmerEmail || ticket.farmerIdentifier;
    const identifiers = [ticket.farmerPhone, ticket.farmerEmail, ticket.farmerIdentifier].filter(Boolean);

    // Also check if this farmer has a queue token in farmers list
    const matchingFarmer = farmers.find(
      (f) =>
        (ticket.farmerPhone && f.phone && String(f.phone).trim() === String(ticket.farmerPhone).trim()) ||
        (ticket.farmerEmail && f.email && String(f.email).trim().toLowerCase() === String(ticket.farmerEmail).trim().toLowerCase())
    );

    addNotification({
      identifier: farmerIdentifier,
      identifiers,
      tokenId: matchingFarmer ? matchingFarmer.id : null,
      title: "Support Ticket Update",
      message: notifMessage,
    });
  }

  scheduleSave();
  return ticket;
}

function allFarmers() {
  return farmers;
}

// -------------------------------------------------------------
// In-App Notifications Management
// -------------------------------------------------------------
function addNotification({ identifier, identifiers, tokenId, title, message }) {
  const cleanIdentifiers = [];
  if (identifier) cleanIdentifiers.push(String(identifier).trim().toLowerCase());
  if (Array.isArray(identifiers)) {
    identifiers.forEach((id) => {
      if (id) {
        const c = String(id).trim().toLowerCase();
        if (!cleanIdentifiers.includes(c)) cleanIdentifiers.push(c);
      }
    });
  }
  const item = {
    id: `NOTIF-${notificationCounter++}-${Date.now()}`,
    identifier: identifier ? String(identifier).trim().toLowerCase() : (cleanIdentifiers[0] || null),
    identifiers: cleanIdentifiers,
    tokenId: tokenId || null,
    title: title || "Slot Swap Alert",
    message: String(message),
    timestamp: Date.now(),
    read: false,
  };
  notifications.unshift(item);
  scheduleSave();
  return item;
}

function getNotificationsForFarmer(identifier) {
  if (!identifier) return [];
  const clean = String(identifier).trim().toLowerCase();
  const matchedFarmers = farmers
    .filter((f) => {
      const phoneMatch = f.phone && String(f.phone).trim().toLowerCase() === clean;
      const emailMatch = f.email && String(f.email).trim().toLowerCase() === clean;
      const idMatch = f.id && String(f.id).trim().toLowerCase() === clean;
      return phoneMatch || emailMatch || idMatch;
    });
  const farmerTokens = matchedFarmers.map((f) => f.id.toLowerCase());
  const farmerPhones = matchedFarmers.map((f) => f.phone ? String(f.phone).trim().toLowerCase() : null).filter(Boolean);
  const farmerEmails = matchedFarmers.map((f) => f.email ? String(f.email).trim().toLowerCase() : null).filter(Boolean);

  return notifications
    .filter((n) => {
      const notifId = n.identifier ? n.identifier.toLowerCase() : null;
      const notifIds = Array.isArray(n.identifiers) ? n.identifiers.map((x) => x.toLowerCase()) : [];
      if (notifId && !notifIds.includes(notifId)) notifIds.push(notifId);

      const directMatch = notifIds.some((id) => 
        id === clean || farmerPhones.includes(id) || farmerEmails.includes(id)
      );
      const tokenMatch = n.tokenId && (n.tokenId.toLowerCase() === clean || farmerTokens.includes(n.tokenId.toLowerCase()));
      return directMatch || tokenMatch;
    })
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function markNotificationRead(id) {
  const notif = notifications.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
    scheduleSave();
  }
  return notif;
}

function markAllNotificationsRead(identifier) {
  if (!identifier) return [];
  const clean = String(identifier).trim().toLowerCase();
  const matchedFarmers = farmers
    .filter((f) => {
      const phoneMatch = f.phone && String(f.phone).trim().toLowerCase() === clean;
      const emailMatch = f.email && String(f.email).trim().toLowerCase() === clean;
      const idMatch = f.id && String(f.id).trim().toLowerCase() === clean;
      return phoneMatch || emailMatch || idMatch;
    });
  const farmerTokens = matchedFarmers.map((f) => f.id.toLowerCase());
  const farmerPhones = matchedFarmers.map((f) => f.phone ? String(f.phone).trim().toLowerCase() : null).filter(Boolean);
  const farmerEmails = matchedFarmers.map((f) => f.email ? String(f.email).trim().toLowerCase() : null).filter(Boolean);

  const updated = [];
  notifications.forEach((n) => {
    const notifId = n.identifier ? n.identifier.toLowerCase() : null;
    const notifIds = Array.isArray(n.identifiers) ? n.identifiers.map((x) => x.toLowerCase()) : [];
    if (notifId && !notifIds.includes(notifId)) notifIds.push(notifId);

    const directMatch = notifIds.some((id) => 
      id === clean || farmerPhones.includes(id) || farmerEmails.includes(id)
    );
    const tokenMatch = n.tokenId && (n.tokenId.toLowerCase() === clean || farmerTokens.includes(n.tokenId.toLowerCase()));
    if (directMatch || tokenMatch) {
      n.read = true;
      updated.push(n);
    }
  });
  if (updated.length > 0) scheduleSave();
  return updated;
}

// -------------------------------------------------------------
// Slot Swap Flow Management
// -------------------------------------------------------------
function createSwapRequest({ senderTokenId, receiverTokenId }) {
  const sender = getFarmer(senderTokenId);
  const receiver = getFarmer(receiverTokenId);

  if (!sender) return { error: "Sender token not found", status: 404 };
  if (!receiver) return { error: "Receiver token not found", status: 404 };

  if (sender.id === receiver.id) {
    return { error: "Cannot swap a token with itself", status: 400 };
  }

  if (sender.centreId !== receiver.centreId) {
    return { error: "Can only swap slots between tokens registered at the same procurement centre", status: 400 };
  }

  const senderActive = sender.status === STATUS.IN_QUEUE || sender.status === STATUS.BOOKED;
  const receiverActive = receiver.status === STATUS.IN_QUEUE || receiver.status === STATUS.BOOKED;

  if (!senderActive) {
    return { error: `Sender token ${sender.id} is not in queue (current status: ${sender.status})`, status: 400 };
  }
  if (!receiverActive) {
    return { error: `Receiver token ${receiver.id} is not in queue (current status: ${receiver.status})`, status: 400 };
  }

  // Check for existing pending swap request between these exact tokens
  const existingPending = swapRequests.find(
    (r) =>
      r.status === "pending" &&
      ((r.senderTokenId === sender.id && r.receiverTokenId === receiver.id) ||
        (r.senderTokenId === receiver.id && r.receiverTokenId === sender.id))
  );

  if (existingPending) {
    return { error: "A pending swap request already exists between these tokens", status: 409 };
  }

  const swapReq = {
    id: `SWAP-${String(swapCounter++).padStart(4, "0")}`,
    senderTokenId: sender.id,
    senderName: sender.name,
    senderPhone: sender.phone,
    senderEmail: sender.email,
    senderSlotDate: sender.slotDate,
    senderSlotTime: sender.slotTime,
    senderCrop: sender.crop,
    receiverTokenId: receiver.id,
    receiverName: receiver.name,
    receiverPhone: receiver.phone,
    receiverEmail: receiver.email,
    receiverSlotDate: receiver.slotDate,
    receiverSlotTime: receiver.slotTime,
    receiverCrop: receiver.crop,
    centreId: sender.centreId,
    status: "pending",
    createdAt: Date.now(),
    respondedAt: null,
  };

  swapRequests.push(swapReq);

  // Trigger in-app notification to receiver
  const receiverIdentifier = receiver.phone || receiver.email || receiver.id;
  const incomingMsg = `${sender.name} (Token ${sender.id}) requested to swap slots with your token ${receiver.id}. Their slot: ${sender.slotDate} (${sender.slotTime}) for your slot: ${receiver.slotDate} (${receiver.slotTime}).`;
  
  addNotification({
    identifier: receiverIdentifier,
    tokenId: receiver.id,
    title: "Incoming Slot Swap Request",
    message: incomingMsg,
  });

  scheduleSave();
  return { success: true, swapRequest: swapReq };
}

function respondSwapRequest({ swapRequestId, response, responderIdentifier }) {
  const cleanResponse = String(response || "").trim().toLowerCase();
  if (cleanResponse !== "accept" && cleanResponse !== "decline") {
    return { error: "Response must be 'accept' or 'decline'", status: 400 };
  }

  const swapReq = swapRequests.find((r) => r.id === swapRequestId);
  if (!swapReq) {
    return { error: "Swap request not found", status: 404 };
  }

  if (swapReq.status !== "pending") {
    return { error: `Swap request is already ${swapReq.status}`, status: 400 };
  }

  const senderIdentifier = swapReq.senderPhone || swapReq.senderEmail || swapReq.senderTokenId;
  const receiverIdentifier = swapReq.receiverPhone || swapReq.receiverEmail || swapReq.receiverTokenId;

  // DECLINE FLOW
  if (cleanResponse === "decline") {
    swapReq.status = "declined";
    swapReq.respondedAt = Date.now();

    // Trigger exact required notification message to sender
    const declineMsg = "Your slot swap request was declined.";
    addNotification({
      identifier: senderIdentifier,
      tokenId: swapReq.senderTokenId,
      title: "Slot Swap Declined",
      message: declineMsg,
    });

    scheduleSave();
    return { success: true, swapRequest: swapReq };
  }

  // ACCEPT FLOW
  // 1. RE-VALIDATE BOTH TOKENS AT THE MOMENT OF ACCEPTANCE (Edge case & concurrency check)
  const sender = getFarmer(swapReq.senderTokenId);
  const receiver = getFarmer(swapReq.receiverTokenId);

  if (!sender || !receiver) {
    swapReq.status = "invalidated";
    swapReq.respondedAt = Date.now();
    scheduleSave();
    return { error: "One or both tokens no longer exist in the system", status: 400 };
  }

  const senderActive = sender.status === STATUS.IN_QUEUE || sender.status === STATUS.BOOKED;
  const receiverActive = receiver.status === STATUS.IN_QUEUE || receiver.status === STATUS.BOOKED;

  if (!senderActive) {
    swapReq.status = "invalidated";
    swapReq.respondedAt = Date.now();
    scheduleSave();
    return {
      error: `Sender token ${sender.id} is no longer active (current status: ${sender.status}). Cannot complete swap.`,
      status: 400,
    };
  }

  if (!receiverActive) {
    swapReq.status = "invalidated";
    swapReq.respondedAt = Date.now();
    scheduleSave();
    return {
      error: `Receiver token ${receiver.id} is no longer active (current status: ${receiver.status}). Cannot complete swap.`,
      status: 400,
    };
  }

  // Verify slots have not changed since request was created
  if (sender.slotDate !== swapReq.senderSlotDate || sender.slotTime !== swapReq.senderSlotTime) {
    swapReq.status = "invalidated";
    swapReq.respondedAt = Date.now();
    scheduleSave();
    return {
      error: `Sender slot has changed since this swap request was created. Cannot complete swap.`,
      status: 400,
    };
  }

  if (receiver.slotDate !== swapReq.receiverSlotDate || receiver.slotTime !== swapReq.receiverSlotTime) {
    swapReq.status = "invalidated";
    swapReq.respondedAt = Date.now();
    scheduleSave();
    return {
      error: `Receiver slot has changed since this swap request was created. Cannot complete swap.`,
      status: 400,
    };
  }

  // 2. ATOMIC SWAP OF BOTH SLOT DETAILS AND TOKEN NUMBERS
  const senderOldId = sender.id;
  const senderOldDate = sender.slotDate;
  const senderOldTime = sender.slotTime;

  const receiverOldId = receiver.id;
  const receiverOldDate = receiver.slotDate;
  const receiverOldTime = receiver.slotTime;

  // Perform atomic swap
  sender.id = receiverOldId;
  sender.slotDate = receiverOldDate;
  sender.slotTime = receiverOldTime;
  sender.swappedWithToken = senderOldId;
  sender.stageChangedAt = Date.now();

  receiver.id = senderOldId;
  receiver.slotDate = senderOldDate;
  receiver.slotTime = senderOldTime;
  receiver.swappedWithToken = receiverOldId;
  receiver.stageChangedAt = Date.now();

  // Invalidate any other pending requests involving either token
  swapRequests.forEach((r) => {
    if (r.id !== swapReq.id && r.status === "pending") {
      if (
        r.senderTokenId === senderOldId ||
        r.receiverTokenId === senderOldId ||
        r.senderTokenId === receiverOldId ||
        r.receiverTokenId === receiverOldId
      ) {
        r.status = "invalidated";
        r.respondedAt = Date.now();
      }
    }
  });

  swapReq.status = "accepted";
  swapReq.respondedAt = Date.now();

  // 3. TRIGGER NOTIFICATIONS WITH EXACT REQUIRED TEXT
  // Sender Notification: "Your slot swap request was accepted. Your new slot is [date/time] with token [new token number]."
  const senderNewSlotStr = `${sender.slotDate} (${sender.slotTime})`;
  const senderAcceptedMsg = `Your slot swap request was accepted. Your new slot is ${senderNewSlotStr} with token ${sender.id}.`;

  addNotification({
    identifier: senderIdentifier,
    tokenId: sender.id,
    title: "Slot Swap Accepted",
    message: senderAcceptedMsg,
  });

  // Receiver Notification
  const receiverNewSlotStr = `${receiver.slotDate} (${receiver.slotTime})`;
  const receiverAcceptedMsg = `You accepted the slot swap request. Your new slot is ${receiverNewSlotStr} with token ${receiver.id}.`;

  addNotification({
    identifier: receiverIdentifier,
    tokenId: receiver.id,
    title: "Slot Swap Completed",
    message: receiverAcceptedMsg,
  });

  scheduleSave();
  return {
    success: true,
    swapRequest: swapReq,
    senderFarmer: sender,
    receiverFarmer: receiver,
  };
}

function getSwapRequestsForFarmer(identifier) {
  if (!identifier) return { incoming: [], outgoing: [] };
  const clean = String(identifier).trim().toLowerCase();

  const farmerTokens = farmers
    .filter((f) => {
      const phoneMatch = f.phone && String(f.phone).trim().toLowerCase() === clean;
      const emailMatch = f.email && String(f.email).trim().toLowerCase() === clean;
      const idMatch = f.id && String(f.id).trim().toLowerCase() === clean;
      return phoneMatch || emailMatch || idMatch;
    })
    .map((f) => f.id.toLowerCase());

  const incoming = swapRequests
    .filter((r) => {
      const phoneMatch = r.receiverPhone && String(r.receiverPhone).trim().toLowerCase() === clean;
      const emailMatch = r.receiverEmail && String(r.receiverEmail).trim().toLowerCase() === clean;
      const idMatch = r.receiverTokenId && (r.receiverTokenId.toLowerCase() === clean || farmerTokens.includes(r.receiverTokenId.toLowerCase()));
      return phoneMatch || emailMatch || idMatch;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const outgoing = swapRequests
    .filter((r) => {
      const phoneMatch = r.senderPhone && String(r.senderPhone).trim().toLowerCase() === clean;
      const emailMatch = r.senderEmail && String(r.senderEmail).trim().toLowerCase() === clean;
      const idMatch = r.senderTokenId && (r.senderTokenId.toLowerCase() === clean || farmerTokens.includes(r.senderTokenId.toLowerCase()));
      return phoneMatch || emailMatch || idMatch;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return { incoming, outgoing };
}

function getAvailableSwapPartners({ centreId, crop, excludeTokenId }) {
  if (!centreId) return [];
  const cleanCentre = String(centreId).trim();
  const cleanExclude = excludeTokenId ? String(excludeTokenId).trim() : null;

  // Resolve target centre ID by id, code, or name
  const targetCentreObj = centres.find(
    (c) =>
      c.id.toLowerCase() === cleanCentre.toLowerCase() ||
      c.name.toLowerCase() === cleanCentre.toLowerCase() ||
      c.code.toLowerCase() === cleanCentre.toLowerCase()
  );
  const normalizedTargetCentreId = targetCentreObj ? targetCentreObj.id : cleanCentre;

  // a) The sender's own farmer record (id, centreId, phone/identifier, status)
  const senderFarmer = cleanExclude ? getFarmer(cleanExclude) : null;
  console.log(`[Slot Swap Lookup] Step (a) Sender record:`, senderFarmer ? {
    id: senderFarmer.id,
    centreId: senderFarmer.centreId,
    phone: senderFarmer.phone,
    status: senderFarmer.status,
    slotDate: senderFarmer.slotDate,
    slotTime: senderFarmer.slotTime,
  } : `None (query excludeTokenId=${excludeTokenId})`);

  // b) The FULL list of all farmer records in the system BEFORE any filtering
  console.log(`[Slot Swap Lookup] Step (b) Total farmers before filtering: ${farmers.length}`);

  // c) The list AFTER filtering by centreId match
  const centreMatches = farmers.filter((f) => {
    const fCentreVal = typeof f.centreId === "object" ? f.centreId?.id : String(f.centreId || "").trim();
    const fCentreObj = centres.find(
      (c) =>
        c.id.toLowerCase() === fCentreVal.toLowerCase() ||
        c.name.toLowerCase() === fCentreVal.toLowerCase() ||
        c.code.toLowerCase() === fCentreVal.toLowerCase()
    );
    const normalizedFCentreId = fCentreObj ? fCentreObj.id : fCentreVal;
    return normalizedFCentreId.toLowerCase() === normalizedTargetCentreId.toLowerCase();
  });
  console.log(`[Slot Swap Lookup] Step (c) Farmers after centreId match ("${normalizedTargetCentreId}"): ${centreMatches.length} farmers:`, centreMatches.map(f => `${f.id} (${f.name}, status=${f.status}, phone=${f.phone})`));

  // d) The list AFTER filtering by status (in_queue / active booked)
  // ROOT CAUSE FIX: Do not eliminate active in_queue farmers using isSlotTimePassed!
  // Active in-queue farmers are actively waiting at the centre regardless of wall clock time.
  const activeStatusMatches = centreMatches.filter((f) => {
    if (
      f.status === STATUS.CANCELLED ||
      f.status === STATUS.PAID ||
      f.status === STATUS.PAYMENT_INITIATED ||
      f.status === STATUS.PROCURED
    ) {
      return false;
    }
    // Only in_queue or booked active farmers are eligible
    return f.status === STATUS.IN_QUEUE || f.status === STATUS.BOOKED;
  });
  console.log(`[Slot Swap Lookup] Step (d) Farmers after status (in_queue) filter: ${activeStatusMatches.length} farmers:`, activeStatusMatches.map(f => `${f.id} (${f.name}, status=${f.status}, slot=${f.slotDate} ${f.slotTime})`));

  // e) The final list AFTER excluding the sender's own token(s) and existing pending swap requests
  const senderPhone = senderFarmer?.phone ? String(senderFarmer.phone).trim() : null;
  const filtered = activeStatusMatches
    .filter((f) => {
      // Exclude sender's own exact token
      if (cleanExclude && String(f.id).trim().toLowerCase() === cleanExclude.toLowerCase()) {
        return false;
      }

      // Exclude other tokens belonging to the sender's same account/phone
      if (senderPhone && f.phone && String(f.phone).trim() === senderPhone) {
        return false;
      }

      // Exclude if an active pending swap request already exists between these tokens
      if (cleanExclude) {
        const hasPending = swapRequests.some(
          (r) =>
            r.status === "pending" &&
            ((r.senderTokenId === cleanExclude && r.receiverTokenId === f.id) ||
              (r.senderTokenId === f.id && r.receiverTokenId === cleanExclude))
        );
        if (hasPending) return false;
      }

      return true;
    })
    .map((f) => ({
      id: f.id,
      name: f.name,
      phone: f.phone,
      crop: f.crop,
      quantityKg: f.quantityKg,
      declaredQuantity: f.declaredQuantity,
      declaredUnit: f.declaredUnit,
      slotDate: f.slotDate,
      slotTime: f.slotTime,
      centreId: f.centreId,
      status: f.status,
    }))
    .sort((a, b) => (a.slotDate || "").localeCompare(b.slotDate || "") || (a.slotTime || "").localeCompare(b.slotTime || ""));

  console.log(`[Slot Swap Lookup] Step (e) Final list after excluding sender token(s): ${filtered.length} targets:`, filtered.map(p => `${p.name} (${p.id} - ${p.slotDate || ''} ${p.slotTime || ''})`));

  return filtered;
}

export default {
  STATUS,
  SLOT_TIME_OPTIONS,
  TICKET_TYPES,
  TICKET_STATUS,
  DISCREPANCY_THRESHOLD_PERCENT,
  CROP_PROCUREMENT_CONFIG,
  CROP_MSP_RATES,
  convertQuantityToKg,
  convertKgToDisplayUnits,
  calculateRateAndTotal,
  calculateAmount,
  verifyAndAdvanceFarmer,
  CROWD_THRESHOLDS,
  getCentres,
  getCentresEnriched,
  getCentre,
  getCrowdStatus,
  getCrowdStatusForDate,
  getBestTimeToVisit,
  getCentresByCropAndDistrict,
  getSuggestedCentres,
  getQueueForCentre,
  getLiveAvgProcessMinutes,
  hasLivePace,
  estimateWaitMinutes,
  registerFarmer,
  getFarmer,
  getFarmersByPhone,
  getFarmersByIdentifier,
  updateFarmerStatus,
  releaseFarmerReceipt,
  checkInFarmer,
  rescheduleFarmer,
  cancelFarmer,
  cancelFarmerWithReason,
  allFarmers,
  createTicket,
  getTicketsByPhone,
  getTicketsByIdentifier,
  getAllTickets,
  getTicketById,
  updateTicketStatus,
  getCentreSlotCapacity,
  getSlotBookingCount,
  getSlotStatus,
  getCentreSlotsAvailability,
  getCentreDateRangeAvailability,
  getCentreOperatingHours,
  isSlotTimePassed,
  isDateBookableForCentre,
  getEarliestBookableDate,
  getDailyLiveQueue,
  getTodaySlottedQueue,
  getUpcomingSlottedQueue,
  computeSlotStatus,
  getTodayDateString,
  addNotification,
  getNotificationsForFarmer,
  markNotificationRead,
  markAllNotificationsRead,
  createSwapRequest,
  respondSwapRequest,
  getSwapRequestsForFarmer,
  getAvailableSwapPartners,
  generateSlotTimesForCentre,
  formatMinutesToTimeString,
  createProcurementHistorySnapshot,
  getProcurementHistoryForFarmer,
  getFarmerProcurementSummary,
  getFarmerProfile,
  getProcurementRecords,
  procurementHistoryRecords,
  saveImmediately,
  loadPersistedData,
  PERSISTENCE_FILE,
};
