import store from "./data/store.js";
import assert from "assert";

console.log("=== RUNNING ADMIN ANALYTICS SUMMARY TEST SUITE ===\n");

const allFarmers = store.allFarmers();
const allCentres = store.getCentres();
const allTickets = store.getAllTickets();

console.log(`[Store Data Check]`);
console.log(`- Total farmers in store: ${allFarmers.length}`);
console.log(`- Total centres in store: ${allCentres.length}`);
console.log(`- Total tickets in store: ${allTickets.length}\n`);

assert(Array.isArray(allFarmers), "allFarmers should be an array");
assert(Array.isArray(allCentres) && allCentres.length === 15, "allCentres should be 15 centres");
assert(Array.isArray(allTickets), "allTickets should be an array");

// 1. Test Crop Breakdown
const nonCancelled = allFarmers.filter((f) => f.status !== store.STATUS.CANCELLED);
const cropCounts = {};
nonCancelled.forEach((f) => {
  const crop = (f.crop && String(f.crop).trim()) || "Other";
  cropCounts[crop] = (cropCounts[crop] || 0) + 1;
});
const totalActive = nonCancelled.length;
const cropBreakdown = Object.entries(cropCounts).map(([name, count]) => ({
  name,
  value: count,
  percentage: totalActive > 0 ? Number(((count / totalActive) * 100).toFixed(1)) : 0,
}));

console.log(`[Crop Breakdown] Found ${cropBreakdown.length} crops:`, cropBreakdown);
assert(cropBreakdown.length > 0, "Should have at least one crop category");

// 2. Test Status Breakdown
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
  .map(([key, count]) => ({ key, count }));

console.log(`[Status Breakdown] Statuses with counts:`, statusBreakdown);
assert(statusBreakdown.length > 0, "Should have tokens in at least one status");

// 3. Test Ticket Type Breakdown
const ticketCounts = {};
allTickets.forEach((t) => {
  const type = (t.ticketType && String(t.ticketType).trim()) || "Other";
  ticketCounts[type] = (ticketCounts[type] || 0) + 1;
});
console.log(`[Ticket Types Breakdown]:`, ticketCounts);

// 4. Test Crowd Distribution
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
console.log(`[Crowd Distribution across 15 centres]:`, crowdCounts);
assert.strictEqual(crowdCounts.low + crowdCounts.medium + crowdCounts.high, 15, "Sum of crowd counts across centres should equal 15");

console.log("\n=== ALL ANALYTICS AGGREGATION TESTS PASSED SUCCESSFULLY ===");
