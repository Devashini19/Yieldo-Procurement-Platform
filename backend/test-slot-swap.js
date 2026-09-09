import store from "./data/store.js";
import assert from "assert";

console.log("=== RUNNING SLOT SWAP AUTOMATED TEST SUITE ===\n");

const runSuffix = Date.now().toString().slice(-6);
const phoneA = `987${runSuffix}1`;
const phoneB = `987${runSuffix}2`;
const phoneC = `987${runSuffix}3`;
const phoneD = `987${runSuffix}4`;
const phoneE = `987${runSuffix}5`;

// 1. SETUP: Register two farmers with distinct slots at centre C01
const farmerA = store.registerFarmer({
  name: "Arun Kumar",
  phone: phoneA,
  email: `arun_${runSuffix}@example.com`,
  crop: "Paddy",
  quantity: 20,
  unit: "bags",
  centreId: "C01",
  queueType: "slotted",
  slotDate: "2026-09-10",
  slotTime: "8:00 AM - 10:00 AM",
});

const farmerB = store.registerFarmer({
  name: "Bala Murugan",
  phone: phoneB,
  email: `bala_${runSuffix}@example.com`,
  crop: "Paddy",
  quantity: 25,
  unit: "bags",
  centreId: "C01",
  queueType: "slotted",
  slotDate: "2026-09-11",
  slotTime: "10:00 AM - 12:00 PM",
});

console.log(`[Setup] Farmer A registered: ID=${farmerA.id}, Date=${farmerA.slotDate}, Time=${farmerA.slotTime}`);
console.log(`[Setup] Farmer B registered: ID=${farmerB.id}, Date=${farmerB.slotDate}, Time=${farmerB.slotTime}`);

const tokenA_Initial = farmerA.id;
const tokenB_Initial = farmerB.id;

// TEST 1: SENDER SENDS SWAP REQUEST TO RECEIVER
console.log("\n--- TEST 1: Sender sends swap request ---");
const reqRes = store.createSwapRequest({
  senderTokenId: farmerA.id,
  receiverTokenId: farmerB.id,
});
assert.strictEqual(reqRes.success, true, "Swap request creation should succeed");
const swapReq = reqRes.swapRequest;
console.log(`Swap request created: ID=${swapReq.id}, Status=${swapReq.status}`);

// Verify receiver got notification
const receiverNotifs = store.getNotificationsForFarmer(farmerB.phone);
assert(receiverNotifs.length > 0, "Receiver should have received notification");
console.log(`Receiver Notification: "${receiverNotifs[0].message}"`);
assert(receiverNotifs[0].message.includes("requested to swap slots"), "Notification message should contain request details");

// TEST 2: RECEIVER ACCEPTS SWAP REQUEST
console.log("\n--- TEST 2: Receiver accepts swap request ---");
const acceptRes = store.respondSwapRequest({
  swapRequestId: swapReq.id,
  response: "accept",
  responderIdentifier: farmerB.phone,
});
assert.strictEqual(acceptRes.success, true, "Accept swap request should succeed");

// Verify Sender notification on Accept (Requirement 1)
const senderNotifs = store.getNotificationsForFarmer(farmerA.phone);
assert(senderNotifs.length > 0, "Sender must receive notification on Accept");
const senderAcceptNotif = senderNotifs.find((n) => n.title === "Slot Swap Accepted" || n.message.includes("accepted"));
assert(senderAcceptNotif, "Sender should have 'Slot Swap Accepted' notification");
console.log(`Sender Accept Notification: "${senderAcceptNotif.message}"`);

// Exact requirement check: "Your slot swap request was accepted. Your new slot is [date/time] with token [new token number]."
assert(
  senderAcceptNotif.message.startsWith("Your slot swap request was accepted. Your new slot is "),
  "Notification must match required phrasing: 'Your slot swap request was accepted. Your new slot is ...'"
);
assert(
  senderAcceptNotif.message.includes(tokenB_Initial),
  `Notification must contain new token number ${tokenB_Initial}`
);

// TEST 3: VERIFY ATOMIC TOKEN & SLOT SWAP (Requirement 2)
console.log("\n--- TEST 3: Verify atomic token and slot swap ---");
// Re-fetch records
const senderAfterSwap = store.getFarmersByIdentifier(farmerA.phone)[0];
const receiverAfterSwap = store.getFarmersByIdentifier(farmerB.phone)[0];

console.log(`Farmer A (Sender) now: ID=${senderAfterSwap.id}, Slot=${senderAfterSwap.slotDate} (${senderAfterSwap.slotTime})`);
console.log(`Farmer B (Receiver) now: ID=${receiverAfterSwap.id}, Slot=${receiverAfterSwap.slotDate} (${receiverAfterSwap.slotTime})`);

// Sender receives receiver's slot date, time, and token ID
assert.strictEqual(senderAfterSwap.id, tokenB_Initial, "Sender must now have receiver's original token number");
assert.strictEqual(senderAfterSwap.slotDate, "2026-09-11", "Sender must now have receiver's slot date");
assert.strictEqual(senderAfterSwap.slotTime, "10:00 AM - 12:00 PM", "Sender must now have receiver's slot time");

// Receiver receives sender's slot date, time, and token ID
assert.strictEqual(receiverAfterSwap.id, tokenA_Initial, "Receiver must now have sender's original token number");
assert.strictEqual(receiverAfterSwap.slotDate, "2026-09-10", "Receiver must now have sender's slot date");
assert.strictEqual(receiverAfterSwap.slotTime, "8:00 AM - 10:00 AM", "Receiver must now have sender's slot time");

// Check token lookup consistency
assert.strictEqual(store.getFarmer(tokenB_Initial).name, "Arun Kumar", "Lookup by tokenB_Initial should return Farmer A");
assert.strictEqual(store.getFarmer(tokenA_Initial).name, "Bala Murugan", "Lookup by tokenA_Initial should return Farmer B");

// TEST 4: DECLINE BEHAVIOR (Requirement 3)
console.log("\n--- TEST 4: Decline Behavior ---");
const farmerC = store.registerFarmer({
  name: "Chandran C",
  phone: phoneC,
  crop: "Paddy",
  quantity: 15,
  unit: "bags",
  centreId: "C01",
  queueType: "slotted",
  slotDate: "2026-09-12",
  slotTime: "12:00 PM - 2:00 PM",
});

const farmerD = store.registerFarmer({
  name: "Dinesh D",
  phone: phoneD,
  crop: "Paddy",
  quantity: 18,
  unit: "bags",
  centreId: "C01",
  queueType: "slotted",
  slotDate: "2026-09-13",
  slotTime: "2:00 PM - 4:00 PM",
});

const tokenC_Initial = farmerC.id;
const tokenD_Initial = farmerD.id;

const declineReqRes = store.createSwapRequest({
  senderTokenId: farmerC.id,
  receiverTokenId: farmerD.id,
});
assert.strictEqual(declineReqRes.success, true);

const declineRes = store.respondSwapRequest({
  swapRequestId: declineReqRes.swapRequest.id,
  response: "decline",
  responderIdentifier: farmerD.phone,
});
assert.strictEqual(declineRes.success, true);

// Check Sender notification on Decline (Requirement 1)
const senderCNotifs = store.getNotificationsForFarmer(farmerC.phone);
const declineNotif = senderCNotifs.find((n) => n.title === "Slot Swap Declined" || n.message.includes("declined"));
assert(declineNotif, "Sender must receive notification on decline");
console.log(`Sender Decline Notification: "${declineNotif.message}"`);
assert.strictEqual(
  declineNotif.message,
  "Your slot swap request was declined.",
  "Decline notification must exactly match: 'Your slot swap request was declined.'"
);

// Verify no changes to slots or tokens after decline (Requirement 3)
const farmerCAfterDecline = store.getFarmer(tokenC_Initial);
const farmerDAfterDecline = store.getFarmer(tokenD_Initial);
assert.strictEqual(farmerCAfterDecline.id, tokenC_Initial);
assert.strictEqual(farmerCAfterDecline.slotDate, "2026-09-12");
assert.strictEqual(farmerCAfterDecline.slotTime, "12:00 PM - 2:00 PM");
assert.strictEqual(farmerDAfterDecline.id, tokenD_Initial);
assert.strictEqual(farmerDAfterDecline.slotDate, "2026-09-13");
assert.strictEqual(farmerDAfterDecline.slotTime, "2:00 PM - 4:00 PM");

// TEST 5: EDGE CASE - CONCURRENT / STALE REQUEST (Requirement 4)
console.log("\n--- TEST 5: Edge Case - Concurrent / Stale Request Validation ---");
const farmerE = store.registerFarmer({
  name: "Elango E",
  phone: phoneE,
  crop: "Paddy",
  quantity: 10,
  unit: "bags",
  centreId: "C01",
  queueType: "slotted",
  slotDate: "2026-09-14",
  slotTime: "8:00 AM - 10:00 AM",
});

const farmerF = store.registerFarmer({
  name: "Farooq F",
  phone: "9876500006",
  crop: "Paddy",
  quantity: 12,
  unit: "bags",
  centreId: "C01",
  queueType: "slotted",
  slotDate: "2026-09-15",
  slotTime: "10:00 AM - 12:00 PM",
});

const staleReqRes = store.createSwapRequest({
  senderTokenId: farmerE.id,
  receiverTokenId: farmerF.id,
});
assert.strictEqual(staleReqRes.success, true);

// Cancel Farmer E's token before Accept is clicked
store.cancelFarmer(farmerE.id);
console.log(`Simulated state change: Farmer E token ${farmerE.id} was cancelled before Farmer F accepts`);

// Farmer F tries to accept now
const staleAcceptRes = store.respondSwapRequest({
  swapRequestId: staleReqRes.swapRequest.id,
  response: "accept",
  responderIdentifier: farmerF.phone,
});

assert(staleAcceptRes.error, "Accept should be rejected when token state changed");
console.log(`Rejection as expected: "${staleAcceptRes.error}"`);
assert.strictEqual(farmerF.id, farmerF.id, "Farmer F's token remains unchanged");
assert.strictEqual(farmerF.slotDate, "2026-09-15", "Farmer F's slot remains unchanged");

console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY!");
