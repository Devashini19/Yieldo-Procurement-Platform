import http from "http";
import assert from "assert";
import store from "./data/store.js";

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

async function runE2ETests() {
  console.log("================================================================================");
  console.log("E2E HTTP INTEGRATION TEST: Farmer Profile & Procurement Stats API");
  console.log("================================================================================");

  const timestamp = Date.now();
  const phone = `98403${String(timestamp).slice(-5)}`;
  const email = `farmer_${timestamp}@gmail.com`;

  // 1. Test brand new unregistered farmer lookup
  console.log(`\n1. Testing GET /api/farmers/profile/${phone} for new farmer...`);
  const res1 = await makeRequest("GET", `/api/farmers/profile/${phone}?name=Kavitha%20Rajan`);
  assert.strictEqual(res1.status, 200, "Should return 200 status");
  assert.strictEqual(res1.data.name, "Kavitha Rajan");
  assert.strictEqual(res1.data.identifier, phone);
  assert.strictEqual(res1.data.phone, phone);
  assert.strictEqual(res1.data.loginMethod, "phone");
  assert.strictEqual(res1.data.totalTransactions, 0);
  assert.strictEqual(res1.data.totalQuantitySoldKg, 0);
  assert.strictEqual(res1.data.totalAmountEarned, 0);
  assert.strictEqual(res1.data.activeToken, null);
  console.log("✓ Brand new phone profile response validated:", res1.data);

  // 2. Test Google sign-in profile lookup
  console.log(`\n2. Testing GET /api/farmers/profile/${email} for Google farmer...`);
  const res2 = await makeRequest("GET", `/api/farmers/profile/${email}?name=Sundar%20Pichai`);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.data.name, "Sundar Pichai");
  assert.strictEqual(res2.data.identifier, email);
  assert.strictEqual(res2.data.email, email);
  assert.strictEqual(res2.data.loginMethod, "google");
  console.log("✓ Google sign-in profile response validated:", res2.data);

  // 3. Register a token for the farmer and verify activeToken presence
  console.log(`\n3. Registering token for phone farmer ${phone}...`);
  const regRes = await makeRequest("POST", "/api/farmers/join-live-queue", {
    name: "Kavitha Rajan",
    phone: phone,
    crop: "Paddy",
    quantity: 50,
    unit: "bags",
    centreId: "C01",
  });
  assert(regRes.status === 200 || regRes.status === 201, `Status should be 200 or 201 (got ${regRes.status})`);
  const tokenId = regRes.data.farmer.id;
  console.log(`✓ Registered token: ${tokenId}`);

  const res3 = await makeRequest("GET", `/api/farmers/profile/${phone}`);
  assert.strictEqual(res3.status, 200);
  assert.strictEqual(res3.data.name, "Kavitha Rajan");
  assert(res3.data.activeToken !== null, "activeToken should not be null");
  assert.strictEqual(res3.data.activeToken.id, tokenId);
  assert.strictEqual(res3.data.activeToken.centreId, "C01");
  assert.strictEqual(res3.data.activeToken.status, "in_queue");
  console.log("✓ Active token properly detected in profile:", res3.data.activeToken);

  // 4. Complete procurement process and release receipt
  console.log(`\n4. Advancing token ${tokenId} through verification -> payment -> paid -> receipt release...`);
  await makeRequest("PATCH", `/api/admin/farmers/${tokenId}/advance`, {
    status: store.STATUS.QUALITY_CHECK,
  });
  await makeRequest("PATCH", `/api/admin/farmers/${tokenId}/advance`, {
    status: store.STATUS.PROCURED,
    verifiedQuantity: 52,
    verifiedUnit: "bags",
    varietySelection: "Grade A",
    adminName: "Mandi In-charge",
  });
  await makeRequest("PATCH", `/api/admin/farmers/${tokenId}/advance`, {
    status: store.STATUS.PAYMENT_INITIATED,
  });
  await makeRequest("PATCH", `/api/admin/farmers/${tokenId}/advance`, {
    status: store.STATUS.PAID,
  });
  const releaseRes = await makeRequest("PATCH", `/api/admin/farmers/${tokenId}/release-receipt`, {
    adminName: "Mandi In-charge",
  });
  assert.strictEqual(releaseRes.status, 200);
  console.log(`✓ Receipt released. Total amount: ₹${releaseRes.data.receipt.totalAmount}`);

  // 5. Verify updated profile stats
  console.log(`\n5. Verifying finalized stats for ${phone}...`);
  const res4 = await makeRequest("GET", `/api/farmers/profile/${phone}`);
  assert.strictEqual(res4.status, 200);
  assert.strictEqual(res4.data.totalTransactions, 1, "Should have 1 completed transaction");
  assert.strictEqual(res4.data.totalQuantitySoldKg, 2080, "Should have 2080 KG (52 bags * 40 kg)");
  assert.strictEqual(res4.data.totalAmountEarned, releaseRes.data.receipt.totalAmount);
  assert.strictEqual(res4.data.activeToken, null, "Paid token should no longer be activeToken");
  console.log("✓ Finalized stats validated:", {
    totalTransactions: res4.data.totalTransactions,
    totalQuantitySoldKg: res4.data.totalQuantitySoldKg,
    totalAmountEarned: res4.data.totalAmountEarned,
    activeToken: res4.data.activeToken,
  });

  // 6. Test second transaction for cumulative totals
  console.log(`\n6. Registering and completing a 2nd transaction for ${phone}...`);
  const reg2 = await makeRequest("POST", "/api/farmers/join-live-queue", {
    name: "Kavitha Rajan",
    phone: phone,
    crop: "Wheat",
    quantity: 20,
    unit: "bags",
    centreId: "C02",
  });
  const token2Id = reg2.data.farmer.id;
  await makeRequest("PATCH", `/api/admin/farmers/${token2Id}/advance`, {
    status: store.STATUS.QUALITY_CHECK,
  });
  await makeRequest("PATCH", `/api/admin/farmers/${token2Id}/advance`, {
    status: store.STATUS.PROCURED,
    verifiedQuantity: 20,
    verifiedUnit: "bags",
    adminName: "Mandi In-charge",
  });
  await makeRequest("PATCH", `/api/admin/farmers/${token2Id}/advance`, {
    status: store.STATUS.PAYMENT_INITIATED,
  });
  await makeRequest("PATCH", `/api/admin/farmers/${token2Id}/advance`, {
    status: store.STATUS.PAID,
  });
  const release2 = await makeRequest("PATCH", `/api/admin/farmers/${token2Id}/release-receipt`, {
    adminName: "Mandi In-charge",
  });

  const res5 = await makeRequest("GET", `/api/farmers/profile/${phone}`);
  assert.strictEqual(res5.data.totalTransactions, 2, "Cumulative transactions should be 2");
  assert.strictEqual(res5.data.totalQuantitySoldKg, 2080 + (20 * 50), "Cumulative KG should be 3080 KG");
  assert.strictEqual(
    res5.data.totalAmountEarned,
    releaseRes.data.receipt.totalAmount + release2.data.receipt.totalAmount,
    "Cumulative amount should equal sum of both released receipts"
  );
  console.log("✓ Cumulative stats validated:", {
    totalTransactions: res5.data.totalTransactions,
    totalQuantitySoldKg: res5.data.totalQuantitySoldKg,
    totalAmountEarned: res5.data.totalAmountEarned,
  });

  console.log("\n================================================================================");
  console.log("ALL E2E INTEGRATION TESTS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

runE2ETests().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
