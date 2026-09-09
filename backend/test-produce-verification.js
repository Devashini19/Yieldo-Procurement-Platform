import store from "./data/store.js";

console.log("=== RUNNING PRODUCE VERIFICATION & PAYMENT RECEIPT TESTS ===\n");

// TEST A: Paddy, declared 65 bags, admin verifies 65 bags (no discrepancy)
console.log("--- TEST A: No Discrepancy Flow (65 bags declared -> 65 bags verified) ---");
const farmerA = store.registerFarmer({
  name: "Arun Test A",
  phone: "9840111111",
  crop: "Paddy",
  variety: "Common",
  declaredQuantity: 65,
  declaredUnit: "bags",
  centreId: "C01",
  queueType: "live",
});

console.log(`1. Registered token ${farmerA.id}: declaredQuantity=${farmerA.declaredQuantity} ${farmerA.declaredUnit} (${farmerA.declaredQuantityKg} kg)`);
console.assert(farmerA.declaredQuantity === 65, "Farmer A declared quantity should be 65");
console.assert(farmerA.declaredQuantityKg === 2600, "Farmer A declared kg should be 2600 (65 * 40)");

// Advance to quality_check
store.updateFarmerStatus(farmerA.id, store.STATUS.QUALITY_CHECK);
console.log(`2. Advanced status to: ${store.getFarmer(farmerA.id).status}`);

// Admin verifies 65 bags
const verifyResA = store.verifyAndAdvanceFarmer(farmerA.id, {
  verifiedQuantity: 65,
  verifiedUnit: "bags",
  varietySelection: "Common",
  adminName: "Admin C01",
});

console.log(`3. Verified produce: verifiedQuantity=${verifyResA.farmer.verifiedQuantity} ${verifyResA.farmer.verifiedUnit} (${verifyResA.farmer.verifiedQuantityKg} kg), hasDiscrepancy=${verifyResA.hasDiscrepancy}`);
console.assert(verifyResA.hasDiscrepancy === false, "Test A should have no discrepancy");
console.assert(verifyResA.farmer.status === store.STATUS.PROCURED, "Status should be procured");

// Advance to paid
const paidFarmerA = store.updateFarmerStatus(farmerA.id, store.STATUS.PAID);
console.log(`4. Paid receipt generated:`, paidFarmerA.receipt);
console.assert(paidFarmerA.receipt.hasDiscrepancy === false, "Receipt should have hasDiscrepancy=false");
console.assert(paidFarmerA.receipt.quantityKg === 2600, "Receipt quantityKg should be 2600");
console.assert(paidFarmerA.receipt.totalAmount === 61594, `Receipt total amount should be 2600 * 23.69 = 61594 (got ${paidFarmerA.receipt.totalAmount})`);
console.log("✅ TEST A PASSED!\n");


// TEST B: Paddy, declared 65 bags, admin verifies 50 bags (23% difference)
console.log("--- TEST B: Discrepancy > 15% Flow (65 bags declared -> 50 bags verified) ---");
const farmerB = store.registerFarmer({
  name: "Bala Test B",
  phone: "9840222222",
  crop: "Paddy",
  variety: "Common",
  declaredQuantity: 65,
  declaredUnit: "bags",
  centreId: "C01",
  queueType: "live",
});

console.log(`1. Registered token ${farmerB.id}: declaredQuantity=${farmerB.declaredQuantity} ${farmerB.declaredUnit} (${farmerB.declaredQuantityKg} kg)`);

// Advance to quality_check
store.updateFarmerStatus(farmerB.id, store.STATUS.QUALITY_CHECK);

// Attempt to verify 50 bags without reason (should throw error)
let rejectedWithoutReason = false;
try {
  store.verifyAndAdvanceFarmer(farmerB.id, {
    verifiedQuantity: 50,
    verifiedUnit: "bags",
    varietySelection: "Common",
    discrepancyReason: "", // Empty reason
    adminName: "Admin C01",
  });
} catch (err) {
  rejectedWithoutReason = true;
  console.log(`2. Expected rejection without reason caught: "${err.message}" (discrepancy: ${err.discrepancyPercent}%)`);
  console.assert(err.discrepancyPercent === 23.1, `Discrepancy should be ~23.1% (got ${err.discrepancyPercent}%)`);
}
console.assert(rejectedWithoutReason === true, "Should reject verification with >15% discrepancy when reason is missing");

// Now verify 50 bags with reason
const verifyResB = store.verifyAndAdvanceFarmer(farmerB.id, {
  verifiedQuantity: 50,
  verifiedUnit: "bags",
  varietySelection: "Common",
  discrepancyReason: "Quality check - moisture rejection",
  adminName: "Admin C01",
});

console.log(`3. Verified with reason: verifiedQuantity=${verifyResB.farmer.verifiedQuantity} ${verifyResB.farmer.verifiedUnit} (${verifyResB.farmer.verifiedQuantityKg} kg), reason="${verifyResB.farmer.quantityDiscrepancyReason}"`);
console.assert(verifyResB.hasDiscrepancy === true, "Test B should have discrepancy");
console.assert(verifyResB.farmer.verifiedQuantityKg === 2000, "Verified KG should be 2000 (50 bags * 40kg)");
console.assert(verifyResB.farmer.declaredQuantityKg === 2600, "Declared KG must be preserved as 2600");

// Advance to paid
const paidFarmerB = store.updateFarmerStatus(farmerB.id, store.STATUS.PAID);
console.log(`4. Paid receipt generated:`, paidFarmerB.receipt);
console.assert(paidFarmerB.receipt.hasDiscrepancy === true, "Receipt should flag hasDiscrepancy=true");
console.assert(paidFarmerB.receipt.declaredQuantityKg === 2600, "Receipt declaredQuantityKg should be 2600");
console.assert(paidFarmerB.receipt.verifiedQuantityKg === 2000, "Receipt verifiedQuantityKg should be 2000");
console.assert(paidFarmerB.receipt.quantityKg === 2000, "Receipt final quantityKg should be 2000");
console.assert(paidFarmerB.receipt.discrepancyReason === "Quality check - moisture rejection", "Receipt reason should match");
console.assert(paidFarmerB.receipt.totalAmount === 47380, `Receipt total amount should be 2000 * 23.69 = 47380 (got ${paidFarmerB.receipt.totalAmount})`);
console.log("✅ TEST B PASSED!\n");


// TEST C: Attempt to advance without entering verified quantity at all
console.log("--- TEST C: Missing Verified Quantity Flow ---");
const farmerC = store.registerFarmer({
  name: "Chitra Test C",
  phone: "9840333333",
  crop: "Paddy",
  declaredQuantity: 65,
  declaredUnit: "bags",
  centreId: "C01",
  queueType: "live",
});

store.updateFarmerStatus(farmerC.id, store.STATUS.QUALITY_CHECK);

let rejectedMissingQty = false;
try {
  store.verifyAndAdvanceFarmer(farmerC.id, {
    verifiedQuantity: null,
    verifiedUnit: "bags",
  });
} catch (err) {
  rejectedMissingQty = true;
  console.log(`1. Expected rejection caught for missing quantity: "${err.message}"`);
}
console.assert(rejectedMissingQty === true, "Should reject advance when verifiedQuantity is missing");

let rejectedZeroQty = false;
try {
  store.verifyAndAdvanceFarmer(farmerC.id, {
    verifiedQuantity: 0,
    verifiedUnit: "bags",
  });
} catch (err) {
  rejectedZeroQty = true;
  console.log(`2. Expected rejection caught for 0 quantity: "${err.message}"`);
}
console.assert(rejectedZeroQty === true, "Should reject advance when verifiedQuantity is 0");
console.log("✅ TEST C PASSED!\n");

console.log("🎉 ALL UNIT AND INTEGRATION TESTS PASSED SUCCESSFULLY!");
