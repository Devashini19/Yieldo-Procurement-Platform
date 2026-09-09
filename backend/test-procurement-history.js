import store from "./data/store.js";
import assert from "assert";

console.log("================================================================================");
console.log("TEST SUITE: Permanent Procurement History & Point-in-Time Snapshot Persistence");
console.log("================================================================================");

async function runTests() {
  const timestamp = Date.now();
  const phoneA = `98401${String(timestamp).slice(-5)}`;
  const phoneB = `98402${String(timestamp).slice(-5)}`;

  console.log(`\n1. Registering Farmer A (${phoneA}) and Farmer B (${phoneB}) at Villupuram Central Mandi (C06)...`);
  const farmerA = store.registerFarmer({
    name: "Arun Kumar Original",
    phone: phoneA,
    crop: "Paddy",
    quantity: 40,
    unit: "bags",
    centreId: "C06",
    queueType: "slotted",
    slotDate: "2026-09-10",
    slotTime: "08:00 AM - 10:00 AM",
  });
  farmerA.acreage = 5.5; // farmer profile acreage
  farmerA.farmerId = `FID-${phoneA}`;

  const farmerB = store.registerFarmer({
    name: "Bala Murugan",
    phone: phoneB,
    crop: "Paddy",
    quantity: 50,
    unit: "bags",
    centreId: "C06",
    queueType: "slotted",
    slotDate: "2026-09-10",
    slotTime: "10:00 AM - 12:00 PM",
  });
  farmerB.acreage = 8.0;
  farmerB.farmerId = `FID-${phoneB}`;

  const originalTokenA = farmerA.id;
  const originalTokenB = farmerB.id;
  console.log(`✓ Farmer A initial token: ${originalTokenA}, Farmer B initial token: ${originalTokenB}`);

  // 2. Perform Slot Swap between Farmer A and Farmer B
  console.log("\n2. Executing Slot Swap: Farmer A requests swap with Farmer B, Farmer B accepts...");
  const swapResult = store.createSwapRequest({
    senderTokenId: originalTokenA,
    receiverTokenId: originalTokenB,
  });
  assert(swapResult.success, "Swap request creation should succeed");

  const respondResult = store.respondSwapRequest({
    swapRequestId: swapResult.swapRequest.id,
    response: "accept",
    responderIdentifier: phoneB,
  });
  assert(respondResult.success, "Swap acceptance should succeed");

  const postSwapFarmerA = store.getFarmer(originalTokenB); // Farmer A now holds Token B
  assert.strictEqual(postSwapFarmerA.phone, phoneA, "Farmer A should now hold Token B (swapped token)");
  const finalTokenA = postSwapFarmerA.id;
  console.log(`✓ Slot Swap accepted! Farmer A now holds post-swap token: ${finalTokenA} (was ${originalTokenA})`);

  // 3. Complete procurement and advance Farmer A to PAID
  console.log("\n3. Advancing Farmer A through Quality Check -> Procured (Verified) -> Paid...");
  store.updateFarmerStatus(finalTokenA, store.STATUS.QUALITY_CHECK);
  
  // Verify weighment: 42 bags
  store.verifyAndAdvanceFarmer(finalTokenA, {
    verifiedQuantity: 42,
    verifiedUnit: "bags",
    varietySelection: "Grade A",
    discrepancyReason: "Slight surplus harvested",
    adminName: "Mandi In-charge Raman",
  });

  store.updateFarmerStatus(finalTokenA, store.STATUS.PAYMENT_INITIATED);
  
  const historyBeforePaid = store.getProcurementHistoryForFarmer(phoneA);
  assert.strictEqual(historyBeforePaid.length, 0, "No history record should exist before status is PAID");

  // Advance to PAID -> Snapshot Trigger Point
  const paidFarmer = store.updateFarmerStatus(finalTokenA, store.STATUS.PAID);
  assert.strictEqual(paidFarmer.status, "paid", "Farmer status should be paid");
  console.log(`✓ Status changed to PAID for token ${finalTokenA}`);

  // 4. Verify Snapshot Record was created with the post-swap token and exact point-in-time copy
  console.log("\n4. Verifying point-in-time snapshot record in procurementHistoryRecords...");
  const historyA = store.getProcurementHistoryForFarmer(phoneA);
  assert.strictEqual(historyA.length, 1, "Exactly ONE history record should exist for Farmer A");
  
  const snapshot = historyA[0];
  console.log("Snapshot Record created:", JSON.stringify(snapshot, null, 2));

  assert.strictEqual(snapshot.tokenId, finalTokenA, "Snapshot must have the POST-SWAP token ID, not original pre-swap");
  assert.strictEqual(snapshot.farmerName, "Arun Kumar Original", "Snapshot farmerName must match");
  assert.strictEqual(snapshot.phone, phoneA, "Snapshot phone must match");
  assert.strictEqual(snapshot.acreage, 5.5, "Snapshot acreage must match point-in-time value");
  assert.strictEqual(snapshot.crop, "Paddy", "Snapshot crop must match");
  assert.strictEqual(snapshot.variety, "Grade A", "Snapshot variety must match verified variety");
  assert.strictEqual(snapshot.quantity.verifiedQuantity, 42, "Snapshot verifiedQuantity must match 42 bags");
  assert.strictEqual(snapshot.quantity.unit, "bags", "Snapshot unit must match");
  assert.strictEqual(snapshot.quantity.kg, 1680, "Snapshot kg must match 42 * 40kg = 1680kg");
  assert.strictEqual(snapshot.quantity.quintal, 16.8, "Snapshot quintals must match 16.8");
  assert(snapshot.totalAmountPaid > 0, "Snapshot totalAmountPaid must be greater than 0");
  assert(snapshot.paymentDate, "Snapshot paymentDate must exist");
  assert(snapshot.receipt, "Snapshot must contain receipt copy");
  console.log("✓ Snapshot contains complete point-in-time COPY of all procurement data!");

  // 5. Test Duplicate Guard
  console.log("\n5. Testing Duplicate Guard: Retriggering updateFarmerStatus to PAID...");
  store.updateFarmerStatus(finalTokenA, store.STATUS.PAID);
  const historyAfterRetrigger = store.getProcurementHistoryForFarmer(phoneA);
  assert.strictEqual(historyAfterRetrigger.length, 1, "Duplicate PAID update must NOT create a second snapshot record");
  console.log("✓ Duplicate protection confirmed: Still exactly 1 record.");

  // 6. Test Immutability: Mutate live farmer object and ensure snapshot remains unchanged
  console.log("\n6. Testing Immutability: Mutating live farmer profile (name, acreage, crop)...");
  postSwapFarmerA.name = "MODIFIED NAME - HACKED";
  postSwapFarmerA.acreage = 999.9;
  postSwapFarmerA.crop = "Cotton";
  if (postSwapFarmerA.receipt) {
    postSwapFarmerA.receipt.totalAmount = 99999999;
  }

  const snapshotAfterMutation = store.getProcurementHistoryForFarmer(phoneA)[0];
  assert.strictEqual(snapshotAfterMutation.farmerName, "Arun Kumar Original", "Snapshot farmerName must be IMMUTABLE");
  assert.strictEqual(snapshotAfterMutation.acreage, 5.5, "Snapshot acreage must be IMMUTABLE");
  assert.strictEqual(snapshotAfterMutation.crop, "Paddy", "Snapshot crop must be IMMUTABLE");
  assert.notStrictEqual(snapshotAfterMutation.totalAmountPaid, 99999999, "Snapshot totalAmountPaid must be IMMUTABLE");
  console.log("✓ Snapshot immutability confirmed: Live farmer changes do NOT alter saved history!");

  // 7. Test Backend Persistence & Server Restart Simulation
  console.log("\n7. Testing Persistence across Server Restart simulation (saveImmediately & loadPersistedData)...");
  store.saveImmediately();
  
  // Reload from disk
  store.loadPersistedData();
  const reloadedHistory = store.getProcurementHistoryForFarmer(phoneA);
  assert.strictEqual(reloadedHistory.length, 1, "History record must survive reload/restart");
  assert.strictEqual(reloadedHistory[0].tokenId, finalTokenA, "Reloaded snapshot must preserve post-swap tokenId");
  assert.strictEqual(reloadedHistory[0].farmerName, "Arun Kumar Original", "Reloaded snapshot must preserve farmerName");
  console.log("✓ JSON file persistence verified: History survives full server restarts!");

  // 8. Test Admin Procurement Records Query with filters and pagination
  console.log("\n8. Testing Centre Admin Procurement Records query (filters & pagination)...");
  
  // Query all
  const allRecords = store.getProcurementRecords({ page: 1, limit: 10 });
  assert(allRecords.total >= 1, "Admin should see all records");
  assert(Array.isArray(allRecords.records), "Records should be an array");

  // Query with crop filter
  const paddyRecords = store.getProcurementRecords({ crop: "Paddy" });
  assert(paddyRecords.records.some(r => r.tokenId === finalTokenA), "Should find Farmer A under crop: Paddy");

  // Query with tokenId filter
  const tokenQuery = store.getProcurementRecords({ tokenId: finalTokenA });
  assert.strictEqual(tokenQuery.total, 1, "Should find exactly 1 record matching final post-swap token ID");

  // Query with non-matching filter
  const nonMatching = store.getProcurementRecords({ crop: "NonExistentCrop123" });
  assert.strictEqual(nonMatching.total, 0, "Non-matching query should return 0 records");

  console.log("✓ Admin records endpoint filtering & pagination verified!");
  console.log("\n================================================================================");
  console.log("ALL PROCUREMENT HISTORY TESTS PASSED SUCCESSFULLY! (100% compliant)");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
