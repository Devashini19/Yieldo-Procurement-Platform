import store from "./data/store.js";

async function runTests() {
  console.log("=== Testing Dynamic Per-Centre Operating Hours & Time Slots ===");

  // 1. Dynamic Slot Generation for Different Centres
  console.log("\n--- Test 1: Dynamic Slot Generation per Centre ---");
  const slotsC01 = store.generateSlotTimesForCentre("C01"); // 06:00 - 18:00 (12 hrs -> 6 slots)
  const slotsC02 = store.generateSlotTimesForCentre("C02"); // 07:00 - 17:00 (10 hrs -> 5 slots)
  const slotsC04 = store.generateSlotTimesForCentre("C04"); // 08:00 - 16:00 (8 hrs -> 4 slots)

  console.log("C01 (6 AM - 6 PM) slots (" + slotsC01.length + "):", slotsC01);
  console.log("C02 (7 AM - 5 PM) slots (" + slotsC02.length + "):", slotsC02);
  console.log("C04 (8 AM - 4 PM) slots (" + slotsC04.length + "):", slotsC04);

  if (slotsC01.length !== 6) throw new Error(`Expected 6 slots for C01, got ${slotsC01.length}`);
  if (slotsC02.length !== 5) throw new Error(`Expected 5 slots for C02, got ${slotsC02.length}`);
  if (slotsC04.length !== 4) throw new Error(`Expected 4 slots for C04, got ${slotsC04.length}`);

  if (slotsC01[0] !== "6:00 AM - 8:00 AM" || slotsC01[5] !== "4:00 PM - 6:00 PM") {
    throw new Error("C01 start/end slots incorrect: " + JSON.stringify(slotsC01));
  }
  if (slotsC02[0] !== "7:00 AM - 9:00 AM" || slotsC02[4] !== "3:00 PM - 5:00 PM") {
    throw new Error("C02 start/end slots incorrect: " + JSON.stringify(slotsC02));
  }
  if (slotsC04[0] !== "8:00 AM - 10:00 AM" || slotsC04[3] !== "2:00 PM - 4:00 PM") {
    throw new Error("C04 start/end slots incorrect: " + JSON.stringify(slotsC04));
  }
  console.log("✓ Dynamic Slot Generation per centre validated successfully.");

  // 1b. Test uneven operating hours remainder handling
  const unevenSlots = store.generateSlotTimesForCentre({
    operatingHours: { startTime: "06:30", endTime: "11:00" }
  });
  console.log("Uneven hours (06:30 - 11:00) slots (" + unevenSlots.length + "):", unevenSlots);
  if (unevenSlots.length !== 3 || unevenSlots[2] !== "10:30 AM - 11:00 AM") {
    throw new Error("Uneven slot remainder not handled correctly: " + JSON.stringify(unevenSlots));
  }
  console.log("✓ Uneven operating window remainder handling validated successfully.");

  // 2. Capacity Calculations
  console.log("\n--- Test 2: Per-Centre Slot Capacity Math ---");
  const capC01 = store.getCentreSlotCapacity("C01");
  const capC02 = store.getCentreSlotCapacity("C02");
  const capC04 = store.getCentreSlotCapacity("C04");

  console.log(`C01 Slot Capacity: ${capC01} (Daily 50 / 6 slots)`);
  console.log(`C02 Slot Capacity: ${capC02} (Daily 40 / 5 slots)`);
  console.log(`C04 Slot Capacity: ${capC04} (Daily 35 / 4 slots)`);

  if (capC01 !== 8) throw new Error(`Expected capC01 = 8, got ${capC01}`);
  if (capC02 !== 8) throw new Error(`Expected capC02 = 8, got ${capC02}`);
  if (capC04 !== 8) throw new Error(`Expected capC04 = 8, got ${capC04}`);
  console.log("✓ Slot capacity calculation validated successfully.");

  // 3. Slot Availability API Layer
  console.log("\n--- Test 3: getCentreSlotsAvailability Output ---");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const availC01 = store.getCentreSlotsAvailability("C01", tomorrowStr);
  const availC02 = store.getCentreSlotsAvailability("C02", tomorrowStr);

  console.log(`C01 returned ${availC01.slots.length} slots with capacity ${availC01.slots[0].capacity}`);
  console.log(`C02 returned ${availC02.slots.length} slots with capacity ${availC02.slots[0].capacity}`);

  if (availC01.slots.length !== 6 || availC01.slots[0].capacity !== 8) {
    throw new Error("availC01 mismatch");
  }
  if (availC02.slots.length !== 5 || availC02.slots[0].capacity !== 8) {
    throw new Error("availC02 mismatch");
  }
  console.log("✓ Centre slot availability endpoint output validated successfully.");

  // 4. Registration and Rescheduling with Dynamic Slots
  console.log("\n--- Test 4: Slotted Registration & Reschedule with dynamic slots ---");
  const availBefore = store.getCentreSlotsAvailability("C01", tomorrowStr);
  const spots68Before = availBefore.slots.find((s) => s.slotTime === "6:00 AM - 8:00 AM").availableSpots;
  const spots46Before = availBefore.slots.find((s) => s.slotTime === "4:00 PM - 6:00 PM").availableSpots;

  const farmerData = {
    name: "Dynamic Slot Test Farmer",
    phone: "987" + Date.now().toString().slice(-7),
    crop: "Wheat",
    variety: "Sharbati",
    declaredQuantity: "25",
    declaredUnit: "bags",
    quantityKg: "1250",
    centreId: "C01",
    slotDate: tomorrowStr,
    slotTime: "6:00 AM - 8:00 AM", // Slot previously unavailable in fixed 4-slot list!
  };

  const regFarmer = store.registerFarmer(farmerData);
  console.log("Registered token:", regFarmer.id, "for slot:", regFarmer.slotTime);

  if (regFarmer.slotTime !== "6:00 AM - 8:00 AM") {
    throw new Error("Registration slot mismatch: " + regFarmer.slotTime);
  }

  // Check that capacity for 6:00 AM - 8:00 AM decreased by 1
  const availAfterReg = store.getCentreSlotsAvailability("C01", tomorrowStr);
  const bookedSlot = availAfterReg.slots.find((s) => s.slotTime === "6:00 AM - 8:00 AM");
  console.log("6:00 AM - 8:00 AM available spots:", bookedSlot.availableSpots, "/", bookedSlot.capacity);
  if (bookedSlot.availableSpots !== spots68Before - 1) {
    throw new Error(`Expected ${spots68Before - 1} spots left, got ${bookedSlot.availableSpots}`);
  }

  // Reschedule to 4:00 PM - 6:00 PM (also previously unavailable in 4-slot list!)
  const reschedRes = store.rescheduleFarmer(regFarmer.id, {
    newSlotDate: tomorrowStr,
    newSlotTime: "4:00 PM - 6:00 PM",
  });
  const reschedFarmer = reschedRes.farmer;
  console.log("Rescheduled token slot to:", reschedFarmer.slotTime);
  if (reschedFarmer.slotTime !== "4:00 PM - 6:00 PM") {
    throw new Error("Reschedule slot mismatch: " + reschedFarmer.slotTime);
  }

  const availAfterResched = store.getCentreSlotsAvailability("C01", tomorrowStr);
  const oldSlot = availAfterResched.slots.find((s) => s.slotTime === "6:00 AM - 8:00 AM");
  const newSlot = availAfterResched.slots.find((s) => s.slotTime === "4:00 PM - 6:00 PM");

  if (oldSlot.availableSpots !== spots68Before || newSlot.availableSpots !== spots46Before - 1) {
    throw new Error(`Spots mismatch after reschedule: old=${oldSlot.availableSpots} (expected ${spots68Before}), new=${newSlot.availableSpots} (expected ${spots46Before - 1})`);
  }
  console.log("✓ Dynamic slotted registration and rescheduling validated successfully.");

  // 5. 7-Day Crowd Comparison
  console.log("\n--- Test 5: 7-day crowd comparison ---");
  const dateRangeRes = store.getCentreDateRangeAvailability("C01", 7);
  console.log("7-day crowd range entries count:", dateRangeRes.dates.length);
  if (dateRangeRes.dates.length !== 7) throw new Error("Expected 7 days in crowd range");
  console.log("Sample day crowd details:", {
    date: dateRangeRes.dates[0].date,
    dailyCapacity: dateRangeRes.dates[0].dailyCapacity,
    crowdLevel: dateRangeRes.dates[0].crowdLevel,
    isToday: dateRangeRes.dates[0].isToday,
    slotsCount: dateRangeRes.dates[0].slots.length,
  });
  if (dateRangeRes.dates[0].slots.length !== 6) {
    throw new Error(`Expected 6 dynamic slots in 7-day crowd entries for C01, got ${dateRangeRes.dates[0].slots.length}`);
  }
  console.log("✓ 7-Day crowd comparison validated successfully.");

  console.log("\n ALL DYNAMIC PER-CENTRE OPERATING HOURS & TIME SLOT TESTS PASSED! \n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
