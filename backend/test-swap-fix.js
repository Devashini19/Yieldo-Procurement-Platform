import store from "./data/store.js";

console.log("================================================================================");
console.log("TEST 1: Swap Target Lookup for Farmer VPM-005 (Pooja, centre C06, phone 9043771176)");
console.log("================================================================================");
const targetsForVpm5 = store.getAvailableSwapPartners({ centreId: "C06", excludeTokenId: "VPM-005" });
const vpm2Found = targetsForVpm5.find(t => t.id === "VPM-002");
console.log(`\n>>> VERIFICATION 1: Is VPM-002 in eligible targets for VPM-005? ${vpm2Found ? "YES! PASSED" : "NO! FAILED"}`);
if (vpm2Found) {
  console.log("Found VPM-002 details:", vpm2Found);
}

console.log("\n================================================================================");
console.log("TEST 2: Swap Target Lookup for Farmer VPM-002 (Karthik R, centre C06, phone 9840334455)");
console.log("================================================================================");
const targetsForVpm2 = store.getAvailableSwapPartners({ centreId: "C06", excludeTokenId: "VPM-002" });
const vpm5Found = targetsForVpm2.find(t => t.id === "VPM-005");
console.log(`\n>>> VERIFICATION 2: Is VPM-005 in eligible targets for VPM-002? ${vpm5Found ? "YES! PASSED" : "NO! FAILED"}`);
if (vpm5Found) {
  console.log("Found VPM-005 details:", vpm5Found);
}
