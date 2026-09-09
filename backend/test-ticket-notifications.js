import http from "http";

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : "";
    const options = {
      hostname: "localhost",
      port: 4000,
      path: `/api${path}`,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(body ? { "Content-Length": Buffer.byteLength(dataString) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on("error", (err) => reject(err));
    if (body) {
      req.write(dataString);
    }
    req.end();
  });
}

async function runTests() {
  console.log("=== STARTING SUPPORT TICKET NOTIFICATION TESTS ===\n");

  const farmerA = {
    name: "Ramesh Test Farmer",
    phone: "9876501234",
    email: "ramesh.test@example.com",
  };

  const farmerB = {
    name: "Suresh Unrelated Farmer",
    phone: "9876505678",
    email: "suresh.test@example.com",
  };

  // STEP 1: Farmer raises a ticket
  console.log("1. Farmer A raises a ticket...");
  const createRes = await makeRequest("POST", "/tickets", {
    farmerName: farmerA.name,
    farmerPhone: farmerA.phone,
    farmerEmail: farmerA.email,
    ticketType: "Operational",
    ticketSubtype: "Slot Booking Issue",
    description: "Cannot select preferred morning slot at centre.",
    state: "Tamil Nadu",
    district: "Thanjavur",
    village: "Alakkudi",
    pincode: "613001",
  });

  if (createRes.status !== 201 || !createRes.data?.ticket) {
    console.error("FAIL: Could not create ticket:", createRes);
    process.exit(1);
  }
  const ticket = createRes.data.ticket;
  console.log(`✓ Ticket created: ID=${ticket.id}, Status=${ticket.status}`);

  // Helper to fetch notifications for farmer
  async function getNotifications(phone) {
    const res = await makeRequest("GET", `/farmers/notifications/${phone}`);
    return Array.isArray(res.data) ? res.data : (res.data?.notifications || []);
  }

  // Helper to test notification content
  function assertNotification(notifs, expectedText, stepDesc) {
    const found = notifs.find((n) => n.message === expectedText);
    if (!found) {
      console.error(`FAIL: Expected notification not found for ${stepDesc}`);
      console.error(`Expected message: "${expectedText}"`);
      console.error("Recent notifications:", notifs.slice(0, 3));
      process.exit(1);
    }
    console.log(`✓ Verified: [${stepDesc}]`);
    console.log(`  Notification title: "${found.title}"`);
    console.log(`  Notification message: "${found.message}"`);
    return found;
  }

  // STEP 2: Centre Admin marks it "In Progress"
  console.log("\n2. Admin marks ticket 'In Progress'...");
  const updateRes1 = await makeRequest("PATCH", `/admin/tickets/${ticket.id}/status`, {
    status: "in_progress",
  });
  if (updateRes1.status !== 200) {
    console.error("FAIL: Status update to in_progress failed:", updateRes1);
    process.exit(1);
  }
  const notifsAfterStep2 = await getNotifications(farmerA.phone);
  assertNotification(
    notifsAfterStep2,
    `Your ticket ${ticket.id} is now being worked on.`,
    "In Progress status transition"
  );

  // STEP 3: Centre Admin marks it "Resolved"
  console.log("\n3. Admin marks ticket 'Resolved'...");
  const updateRes2 = await makeRequest("PATCH", `/admin/tickets/${ticket.id}/status`, {
    status: "resolved",
  });
  if (updateRes2.status !== 200) {
    console.error("FAIL: Status update to resolved failed:", updateRes2);
    process.exit(1);
  }
  const notifsAfterStep3 = await getNotifications(farmerA.phone);
  assertNotification(
    notifsAfterStep3,
    `Your ticket ${ticket.id} has been resolved.`,
    "Resolved status transition"
  );

  // STEP 4: Centre Admin marks it "Reopened"
  console.log("\n4. Admin marks ticket 'Reopened'...");
  const updateRes3 = await makeRequest("PATCH", `/admin/tickets/${ticket.id}/status`, {
    status: "reopened",
  });
  if (updateRes3.status !== 200) {
    console.error("FAIL: Status update to reopened failed:", updateRes3);
    process.exit(1);
  }
  const notifsAfterStep4 = await getNotifications(farmerA.phone);
  assertNotification(
    notifsAfterStep4,
    `Your ticket ${ticket.id} has been reopened.`,
    "Reopened status transition"
  );

  // STEP 5: Centre Admin marks it "Closed"
  console.log("\n5. Admin marks ticket 'Closed'...");
  const updateRes4 = await makeRequest("PATCH", `/admin/tickets/${ticket.id}/status`, {
    status: "closed",
  });
  if (updateRes4.status !== 200) {
    console.error("FAIL: Status update to closed failed:", updateRes4);
    process.exit(1);
  }
  const notifsAfterStep5 = await getNotifications(farmerA.phone);
  assertNotification(
    notifsAfterStep5,
    `Your ticket ${ticket.id} has been closed.`,
    "Closed status transition"
  );

  // STEP 5b: Reopen from closed via UI "open" status (Reopen button behavior)
  console.log("\n5b. Admin marks ticket 'open' (Reopen from closed state)...");
  const updateRes5 = await makeRequest("PATCH", `/admin/tickets/${ticket.id}/status`, {
    status: "open",
  });
  if (updateRes5.status !== 200) {
    console.error("FAIL: Status update to open failed:", updateRes5);
    process.exit(1);
  }
  const notifsAfterStep5b = await getNotifications(farmerA.phone);
  const reopenNotifs = notifsAfterStep5b.filter(
    (n) => n.message === `Your ticket ${ticket.id} has been reopened.`
  );
  if (reopenNotifs.length < 2) {
    console.error("FAIL: Expected 2 separate reopened notifications, got:", reopenNotifs.length);
    process.exit(1);
  }
  console.log(`✓ Verified: Separate reopened notification created on subsequent transition (${reopenNotifs.length} total)`);

  // STEP 6: Confirm notifications are only sent to the correct farmer
  console.log("\n6. Verifying isolation: Confirming Farmer B (different farmer) receives 0 of these notifications...");
  const notifsFarmerB = await getNotifications(farmerB.phone);
  const leakedNotifs = notifsFarmerB.filter(
    (n) => n.message.includes(ticket.id)
  );
  if (leakedNotifs.length > 0) {
    console.error("FAIL: Farmer B received notifications belonging to Farmer A!", leakedNotifs);
    process.exit(1);
  }
  console.log(`✓ Verified: Farmer B received 0 notifications for ticket ${ticket.id}. Strict isolation confirmed.`);

  // STEP 7: Confirm "My Submitted Tickets" endpoint returns ticket with updated status
  console.log("\n7. Verifying 'My Submitted Tickets' query returns correct state...");
  const myTicketsRes = await makeRequest("GET", `/tickets/by-identifier/${farmerA.phone}`);
  if (myTicketsRes.status !== 200 || !Array.isArray(myTicketsRes.data)) {
    console.error("FAIL: Could not fetch tickets by identifier:", myTicketsRes);
    process.exit(1);
  }
  const fetchedTicket = myTicketsRes.data.find((t) => t.id === ticket.id);
  if (!fetchedTicket) {
    console.error("FAIL: Ticket not found in farmer's submitted tickets:", ticket.id);
    process.exit(1);
  }
  console.log(`✓ Verified: Ticket ${fetchedTicket.id} exists in farmer's submitted tickets list with status "${fetchedTicket.status}".`);

  console.log("\n=======================================================");
  console.log("ALL 7 TEST CASES PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runTests().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});
