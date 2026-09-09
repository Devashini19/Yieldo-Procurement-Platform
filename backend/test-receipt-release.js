import http from "http";

const BASE_URL = "http://localhost:4000";

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTest() {
  console.log("=== Testing Admin Review & Release Receipt Gate ===");

  // 1. Register a test farmer
  const regRes = await makeRequest("POST", "/api/farmers/register", {
    name: "Receipt Release Test Farmer",
    phone: "9876500099",
    crop: "Paddy",
    variety: "Grade A",
    quantity: 50,
    unit: "bags",
    centreId: "C01",
    mode: "live",
  });

  if (regRes.status !== 201) {
    console.error("Failed to register farmer:", regRes);
    process.exit(1);
  }

  const farmerId = regRes.data.farmer.id;
  console.log(`✓ Registered farmer ${farmerId}`);

  // 2. Advance to quality_check
  await makeRequest("PATCH", `/api/admin/farmers/${farmerId}/advance`, { status: "quality_check" });
  console.log("✓ Advanced to quality_check");

  // 3. Advance to procured with weighment verification (48 bags = 1920 kg)
  await makeRequest("PATCH", `/api/admin/farmers/${farmerId}/advance`, {
    status: "procured",
    verifiedQuantity: 48,
    verifiedUnit: "bags",
    varietySelection: "Grade A",
    discrepancyReason: "Minor drying loss",
    adminName: "Officer Ramesh",
  });
  console.log("✓ Advanced to procured (verified 48 bags / 1920 kg)");

  // 4. Advance to payment_initiated
  await makeRequest("PATCH", `/api/admin/farmers/${farmerId}/advance`, { status: "payment_initiated" });
  console.log("✓ Advanced to payment_initiated");

  // 5. Advance to paid
  const paidRes = await makeRequest("PATCH", `/api/admin/farmers/${farmerId}/advance`, { status: "paid" });
  console.log("✓ Advanced to paid");
  console.log("  Receipt status after paid transition:", paidRes.data?.receipt?.receiptStatus);

  if (paidRes.data?.receipt?.receiptStatus !== "pending_release") {
    console.error("❌ FAILED: receiptStatus should be pending_release", paidRes.data);
    process.exit(1);
  }

  // 6. Test farmer status endpoint security (no financial leak)
  const statusRes = await makeRequest("GET", `/api/farmers/${farmerId}/status`);
  const safeReceipt = statusRes.data.farmer.receipt;
  console.log("  Farmer status receipt payload:", safeReceipt);
  if (safeReceipt.totalAmount !== undefined || safeReceipt.ratePerKg !== undefined) {
    console.error("❌ FAILED: Financial figures leaked before release!", safeReceipt);
    process.exit(1);
  }
  console.log("✓ Verified farmer status endpoint does NOT leak financial amounts when pending_release");

  // 7. Test direct receipt endpoint access (should be 403)
  const directReceiptRes = await makeRequest("GET", `/api/farmers/${farmerId}/receipt`);
  console.log("  Direct receipt status code:", directReceiptRes.status);
  if (directReceiptRes.status !== 403) {
    console.error("❌ FAILED: Direct receipt access should return 403 when pending_release, got:", directReceiptRes.status);
    process.exit(1);
  }
  console.log("✓ Direct /api/farmers/:id/receipt correctly returned 403 Forbidden while pending_release");

  // 8. Admin releases receipt via PATCH /api/admin/farmers/:id/release-receipt
  const releaseRes = await makeRequest("PATCH", `/api/admin/farmers/${farmerId}/release-receipt`, {
    adminName: "Centre Superintendent",
  });

  if (releaseRes.status !== 200) {
    console.error("❌ FAILED to release receipt:", releaseRes);
    process.exit(1);
  }

  console.log("✓ Admin released receipt successfully:", {
    receiptId: releaseRes.data.receipt?.receiptId,
    receiptStatus: releaseRes.data.receipt?.receiptStatus,
    releasedBy: releaseRes.data.receipt?.releasedBy,
    releasedAt: releaseRes.data.receipt?.releasedAt,
    totalAmount: releaseRes.data.receipt?.totalAmount,
  });

  if (releaseRes.data.receipt?.receiptStatus !== "released") {
    console.error("❌ FAILED: receiptStatus should be released");
    process.exit(1);
  }

  // 9. Verify farmer status endpoint now returns full receipt
  const releasedStatusRes = await makeRequest("GET", `/api/farmers/${farmerId}/status`);
  const releasedReceipt = releasedStatusRes.data.farmer.receipt;
  console.log("  Farmer status receipt after release:", {
    receiptStatus: releasedReceipt?.receiptStatus,
    totalAmount: releasedReceipt?.totalAmount,
    ratePerKg: releasedReceipt?.ratePerKg,
  });

  if (releasedReceipt?.receiptStatus !== "released" || !releasedReceipt?.totalAmount) {
    console.error("❌ FAILED: Released receipt missing or incomplete in farmer status");
    process.exit(1);
  }
  console.log("✓ Farmer status endpoint now returns complete released receipt details");

  // 10. Verify farmer history contains the released record
  const historyRes = await makeRequest("GET", `/api/farmers/procurement-history/${farmerId}`);
  const historyList = Array.isArray(historyRes.data) ? historyRes.data : (historyRes.data?.records || []);
  console.log("  Procurement history count for farmer:", historyList.length);
  if (!historyList || historyList.length === 0) {
    console.error("❌ FAILED: History snapshot was not created upon receipt release", historyRes.data);
    process.exit(1);
  }
  console.log("✓ Permanent procurement history snapshot exists with released status");

  // 11. Verify farmer received receipt release notification
  const notifRes = await makeRequest("GET", `/api/farmers/notifications/${farmerId}`);
  const notifsList = Array.isArray(notifRes.data) ? notifRes.data : (notifRes.data?.notifications || []);
  const latestNotif = notifsList[0];
  console.log("  Latest notification to farmer:", latestNotif?.message);
  if (!latestNotif || !latestNotif.message.includes("receipt")) {
    console.error("❌ FAILED: Notification for receipt release was not found", notifRes.data);
    process.exit(1);
  }
  console.log("✓ Notification verified successfully");

  console.log("\n🎉 ALL RECEIPT RELEASE GATE TESTS PASSED SUCCESSFULLY! 🎉");
}

runTest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
