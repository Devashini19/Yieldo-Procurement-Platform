async function testHttp() {
  try {
    const res5 = await fetch("http://localhost:4000/api/farmers/available-swap-partners?centreId=C06&excludeTokenId=VPM-005");
    const json5 = await res5.json();
    console.log("HTTP GET /api/farmers/available-swap-partners?centreId=C06&excludeTokenId=VPM-005:");
    console.log("Status:", res5.status);
    console.log("Total targets returned:", json5.partners?.length);
    const hasVpm2 = json5.partners?.some(p => p.id === "VPM-002");
    console.log("Includes VPM-002:", hasVpm2);

    const res2 = await fetch("http://localhost:4000/api/farmers/available-swap-partners?centreId=C06&excludeTokenId=VPM-002");
    const json2 = await res2.json();
    console.log("\nHTTP GET /api/farmers/available-swap-partners?centreId=C06&excludeTokenId=VPM-002:");
    console.log("Status:", res2.status);
    console.log("Total targets returned:", json2.partners?.length);
    const hasVpm5 = json2.partners?.some(p => p.id === "VPM-005");
    console.log("Includes VPM-005:", hasVpm5);
  } catch (err) {
    console.error("HTTP test error:", err.message);
  }
}

testHttp();
