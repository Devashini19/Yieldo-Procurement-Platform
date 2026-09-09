import store from "./data/store.js";
import assert from "assert";

console.log("=== RUNNING SLOT SWAP PARTNER LOOKUP & END-TO-END SUITE ===\n");

const runId = Date.now().toString().slice(-6);

// 1. SETUP: Register 3 farmers at Centre C02 (Kumbakonam) with distinct crops & dates
console.log("--- 1. Registering 3 farmers at Centre C02 ---");
const farmer1 = store.registerFarmer({
  name: "Karthik Paddy",
  phone: `911${runId}1`,
  crop: "Paddy",
  quantity: 20,
  unit: "bags",
  centreId: "C02",
  queueType: "slotted",
  slotDate: "2026-09-12",
  slotTime: "7:00 AM - 9:00 AM",
});

const farmer2 = store.registerFarmer({
  name: "Muthu Pulses",
  phone: `911${runId}2`,
  crop: "Pulses",
  quantity: 15,
  unit: "bags",
  centreId: "C02",
  queueType: "slotted",
  slotDate: "2026-09-13",
  slotTime: "9:00 AM - 11:00 AM",
});

const farmer3 = store.registerFarmer({
  name: "Suresh Paddy",
  phone: `911${runId}3`,
  crop: "Paddy",
  quantity: 25,
  unit: "bags",
  centreId: "C02",
  queueType: "slotted",
  slotDate: "2026-09-14",
  slotTime: "11:00 AM - 1:00 PM",
});

console.log(`Registered Farmer 1: ${farmer1.id} (${farmer1.name} - ${farmer1.crop})`);
console.log(`Registered Farmer 2: ${farmer2.id} (${farmer2.name} - ${farmer2.crop})`);
console.log(`Registered Farmer 3: ${farmer3.id} (${farmer3.name} - ${farmer3.crop})`);

// 2. Lookup as Farmer 1 using centre ID "C02"
console.log("\n--- 2. Lookup available swap partners for Farmer 1 by centre ID 'C02' ---");
const partnersById = store.getAvailableSwapPartners({
  centreId: "C02",
  excludeTokenId: farmer1.id,
});

console.log("Partners found count:", partnersById.length);
assert(partnersById.length >= 2, `Expected at least 2 partners, got ${partnersById.length}`);

const hasFarmer2 = partnersById.some((p) => p.id === farmer2.id);
const hasFarmer3 = partnersById.some((p) => p.id === farmer3.id);
const hasSelf = partnersById.some((p) => p.id === farmer1.id);

assert.strictEqual(hasFarmer2, true, "Farmer 2 (different crop Pulses at same centre) MUST be in eligible list");
assert.strictEqual(hasFarmer3, true, "Farmer 3 MUST be in eligible list");
assert.strictEqual(hasSelf, false, "Farmer 1 (self) MUST NOT be in eligible list");
console.log("✓ Lookup by centre ID verified successfully!");

// 3. Lookup using Centre Name and Centre Code
console.log("\n--- 3. Lookup available swap partners by Centre Name & Centre Code ---");
const partnersByName = store.getAvailableSwapPartners({
  centreId: "Kumbakonam Grain & Pulse Centre",
  excludeTokenId: farmer1.id,
});
assert(partnersByName.length >= 2, "Lookup by Centre Name should resolve to C02");

const partnersByCode = store.getAvailableSwapPartners({
  centreId: "KMU",
  excludeTokenId: farmer1.id,
});
assert(partnersByCode.length >= 2, "Lookup by Centre Code KMU should resolve to C02");
console.log("✓ Centre Name & Code normalization verified successfully!");

const token1_Initial = farmer1.id;
const token2_Initial = farmer2.id;
const token3_Initial = farmer3.id;

// 4. Send a swap request from Farmer 1 to Farmer 2
console.log("\n--- 4. Initiating Swap Request from Farmer 1 to Farmer 2 ---");
const swapRes = store.createSwapRequest({
  senderTokenId: token1_Initial,
  receiverTokenId: token2_Initial,
});
assert.strictEqual(swapRes.success, true);
const swapId = swapRes.swapRequest.id;
console.log("Swap request created:", swapId);

// 5. Lookup again as Farmer 1 - Farmer 2 should be excluded because request is pending
console.log("\n--- 5. Verify Farmer 2 is excluded while swap request is pending ---");
const partnersAfterRequest = store.getAvailableSwapPartners({
  centreId: "C02",
  excludeTokenId: token1_Initial,
});
const hasFarmer2Pending = partnersAfterRequest.some((p) => p.id === token2_Initial);
const hasFarmer3Pending = partnersAfterRequest.some((p) => p.id === token3_Initial);

assert.strictEqual(hasFarmer2Pending, false, "Farmer 2 must be excluded while pending swap request exists");
assert.strictEqual(hasFarmer3Pending, true, "Farmer 3 must still be available");
console.log("✓ Pending swap partner exclusion verified!");

// 6. Farmer 2 accepts swap request
console.log("\n--- 6. Farmer 2 Accepts Swap Request & Validates Notifications ---");
const acceptRes = store.respondSwapRequest({
  swapRequestId: swapId,
  response: "accept",
  responderIdentifier: farmer2.phone,
});
assert.strictEqual(acceptRes.success, true);

// 7. Verify Tokens & Slots Swapped
const farmer1After = store.getFarmer(token2_Initial); // Farmer 1 now has Farmer 2's initial token ID
const farmer2After = store.getFarmer(token1_Initial); // Farmer 2 now has Farmer 1's initial token ID

assert.strictEqual(farmer1After.name, "Karthik Paddy");
assert.strictEqual(farmer1After.slotDate, "2026-09-13");
assert.strictEqual(farmer1After.slotTime, "9:00 AM - 11:00 AM");

assert.strictEqual(farmer2After.name, "Muthu Pulses");
assert.strictEqual(farmer2After.slotDate, "2026-09-12");
assert.strictEqual(farmer2After.slotTime, "7:00 AM - 9:00 AM");

console.log("✓ End-to-end token and slot swap successfully completed!");
console.log("\n🎉 ALL SWAP PARTNER LOOKUP & FLOW TESTS PASSED!\n");
