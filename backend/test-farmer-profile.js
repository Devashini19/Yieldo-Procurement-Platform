import assert from "assert";
import store from "./data/store.js";

console.log("================================================================================");
console.log("TEST SUITE: Farmer Profile API & Procurement Summary Aggregation");
console.log("================================================================================");

function runTests() {
  const ts = Date.now();
  const phone = `98409${String(ts).slice(-5)}`;
  const email = `farmer_${ts}@example.com`;

  console.log(`\n1. Testing fallback profile for brand new unregistered phone farmer (${phone})...`);
  const newPhoneProfile = store.getFarmerProfile(phone, "New Farmer Name");
  assert.strictEqual(newPhoneProfile.name, "New Farmer Name");
  assert.strictEqual(newPhoneProfile.identifier, phone);
  assert.strictEqual(newPhoneProfile.phone, phone);
  assert.strictEqual(newPhoneProfile.email, null);
  assert.strictEqual(newPhoneProfile.loginMethod, "phone");
  assert.strictEqual(newPhoneProfile.totalTransactions, 0);
  assert.strictEqual(newPhoneProfile.totalQuantitySoldKg, 0);
  assert.strictEqual(newPhoneProfile.totalAmountEarned, 0);
  assert.strictEqual(newPhoneProfile.activeToken, null);
  assert(newPhoneProfile.memberSince, "Should have memberSince timestamp");
  console.log("✓ New phone farmer profile generated correctly");

  console.log(`\n2. Testing fallback profile for brand new Google signed-in farmer (${email})...`);
  const newGoogleProfile = store.getFarmerProfile(email, "Google Farmer");
  assert.strictEqual(newGoogleProfile.name, "Google Farmer");
  assert.strictEqual(newGoogleProfile.identifier, email);
  assert.strictEqual(newGoogleProfile.email, email);
  assert.strictEqual(newGoogleProfile.loginMethod, "google");
  assert.strictEqual(newGoogleProfile.totalTransactions, 0);
  console.log("✓ New Google farmer profile generated correctly");

  console.log(`\n3. Registering active token for Phone Farmer (${phone})...`);
  const farmer = store.registerFarmer({
    name: "Ramesh Kannan",
    phone: phone,
    crop: "Paddy",
    variety: "Common",
    quantity: 40,
    unit: "bags",
    centreId: "C01",
    queueType: "live",
  });
  console.log(`✓ Active token created: ${farmer.id}`);

  const activeProfile = store.getFarmerProfile(phone);
  assert.strictEqual(activeProfile.name, "Ramesh Kannan");
  assert.strictEqual(activeProfile.identifier, phone);
  assert.strictEqual(activeProfile.phone, phone);
  assert(activeProfile.activeToken !== null, "Active token should be populated");
  assert.strictEqual(activeProfile.activeToken.id, farmer.id);
  assert.strictEqual(activeProfile.activeToken.centreId, "C01");
  assert.strictEqual(activeProfile.activeToken.status, "in_queue");
  assert.strictEqual(activeProfile.totalTransactions, 0);
  console.log("✓ Active token correctly identified in profile");

  console.log(`\n4. Simulating procurement completion, receipt generation, and receipt release...`);
  // Move to quality check
  store.updateFarmerStatus(farmer.id, store.STATUS.QUALITY_CHECK);
  // Verify quantity
  store.verifyAndAdvanceFarmer(farmer.id, {
    verifiedQuantity: 40,
    verifiedUnit: "bags",
    varietySelection: "Common",
    adminName: "Admin Test",
  });
  // Advance to payment initiated and paid
  store.updateFarmerStatus(farmer.id, store.STATUS.PAYMENT_INITIATED);
  store.updateFarmerStatus(farmer.id, store.STATUS.PAID);
  
  // Release receipt to snapshot into procurementHistoryRecords
  const releaseRes = store.releaseFarmerReceipt(farmer.id, { adminName: "Admin Test" });
  assert(releaseRes.receipt, "Receipt release must succeed");
  console.log(`✓ Receipt released for token ${farmer.id}, totalAmount: ₹${releaseRes.receipt.totalAmount}`);

  console.log(`\n5. Verifying updated profile stats and procurement summary...`);
  const updatedProfile = store.getFarmerProfile(phone);
  assert.strictEqual(updatedProfile.totalTransactions, 1, "totalTransactions should be 1");
  assert.strictEqual(updatedProfile.totalQuantitySoldKg, 1600, "totalQuantitySoldKg should be 1600 kg (40 bags * 40 kg)");
  assert(updatedProfile.totalAmountEarned > 0, "totalAmountEarned should be greater than 0");
  assert.strictEqual(updatedProfile.activeToken, null, "Completed/paid token should no longer be active");
  console.log("Updated Profile:", {
    name: updatedProfile.name,
    identifier: updatedProfile.identifier,
    memberSince: updatedProfile.memberSince,
    totalTransactions: updatedProfile.totalTransactions,
    totalQuantitySoldKg: updatedProfile.totalQuantitySoldKg,
    totalAmountEarned: updatedProfile.totalAmountEarned,
    activeToken: updatedProfile.activeToken,
  });

  console.log("\n================================================================================");
  console.log("ALL FARMER PROFILE TESTS PASSED!");
  console.log("================================================================================");
}

runTests();
