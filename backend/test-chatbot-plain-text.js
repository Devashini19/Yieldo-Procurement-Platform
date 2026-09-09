import { sanitizePlainText } from "./utils/text.js";
import express from "express";
import chatbotRouter from "./routes/chatbot.js";
import adminChatbotRouter from "./routes/adminChatbot.js";
import http from "http";

// 1. Test unit sanitization function
console.log("=== Testing sanitizePlainText Unit Function ===");

const testCases = [
  {
    input: "To cancel your token, follow these steps:\n**Step 1:** Go to Check Status.\n**Step 2:** Click *Cancel Token*.",
    expectedNone: ["**", "*", "#"],
  },
  {
    input: "### Centres Overview\n- Thanjavur Centre (C01)\n- Gingee Centre (C08)\n- Cuddalore Centre (C11)",
    expectedNone: ["###", "- ", "*", "**"],
  },
  {
    input: "1. Select your crop\n2. Enter quantity\n3. Choose mandi",
    expectedNone: ["1. ", "2. ", "3. "],
  },
  {
    input: "📋 **விவசாயிகள் ஆதரவு டிக்கெட் நிலவரம்:**\n• **மொத்த டிக்கெட்டுகள்:** 5\n• **செயலில் உள்ளவை:** 2",
    expectedNone: ["**", "•"],
  },
];

let unitFailed = 0;
for (const tc of testCases) {
  const output = sanitizePlainText(tc.input);
  console.log("\n[INPUT]:\n" + tc.input);
  console.log("[OUTPUT]:\n" + output);
  for (const sym of tc.expectedNone) {
    if (output.includes(sym)) {
      console.error(`FAILED: Output contains forbidden symbol: "${sym}"`);
      unitFailed++;
    }
  }
}

if (unitFailed === 0) {
  console.log("\n[PASS] All unit sanitization tests passed.");
} else {
  console.error(`\n[FAIL] ${unitFailed} unit tests failed.`);
  process.exit(1);
}

// 2. Test Endpoints
console.log("\n=== Testing Chatbot API Endpoints ===");

const app = express();
app.use(express.json());
app.use("/api", chatbotRouter);
app.use("/api", adminChatbotRouter);

const server = http.createServer(app);
server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const endpointQueries = [
    // Farmer Chatbot
    {
      endpoint: "/api/chatbot/message",
      body: { message: "how do I cancel or reschedule my token", language: "en" },
      name: "Farmer Chatbot: Cancel/Reschedule Query (EN)",
    },
    {
      endpoint: "/api/chatbot/message",
      body: { message: "நான் டோக்கனை எவ்வாறு ரத்து செய்வது அல்லது மாற்றுவது?", language: "ta" },
      name: "Farmer Chatbot: Cancel/Reschedule Query (TA)",
    },
    {
      endpoint: "/api/chatbot/message",
      body: { message: "what crops can I register for procurement?", language: "en" },
      name: "Farmer Chatbot: Crops Query (EN)",
    },
    {
      endpoint: "/api/chatbot/message",
      body: { message: "வணக்கம், டோக்கன் பதிவு செய்வது எப்படி?", language: "ta" },
      name: "Farmer Chatbot: Greeting & Booking Query (TA)",
    },
    // Admin Chatbot
    {
      endpoint: "/api/admin/chatbot/message",
      body: { message: "Which centre has the highest crowd right now?", language: "en" },
      name: "Admin Chatbot: Highest Crowd (EN)",
    },
    {
      endpoint: "/api/admin/chatbot/message",
      body: { message: "Show live overview across all centres", language: "en" },
      name: "Admin Chatbot: All Centres Overview (EN)",
    },
    {
      endpoint: "/api/admin/chatbot/message",
      body: { message: "Support tickets and grievance breakdown", language: "en" },
      name: "Admin Chatbot: Support Tickets (EN)",
    },
    {
      endpoint: "/api/admin/chatbot/message",
      body: { message: "தஞ்சாவூர் மையத்தில் எத்தனை விவசாயிகள் வரிசையில் உள்ளனர்?", language: "ta" },
      name: "Admin Chatbot: Thanjavur Centre Query (TA)",
    },
    {
      endpoint: "/api/admin/chatbot/message",
      body: { message: "தற்போது அதிக கூட்டம் உள்ள கொள்முதல் மையம் எது?", language: "ta" },
      name: "Admin Chatbot: Highest Crowd (TA)",
    },
  ];

  let endpointFailed = 0;

  for (const q of endpointQueries) {
    try {
      const res = await fetch(`${baseUrl}${q.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(q.body),
      });

      const data = await res.json();
      console.log(`\n--- Test: ${q.name} ---`);
      console.log("Reply:", data.reply);

      // Verify no markdown symbols
      const forbidden = ["**", "*", "#", "•", "```"];
      let hasForbidden = false;
      for (const sym of forbidden) {
        if (data.reply.includes(sym)) {
          console.error(`FAILED: Reply contains forbidden markdown: "${sym}"`);
          hasForbidden = true;
          endpointFailed++;
        }
      }

      if (!hasForbidden) {
        console.log("[PASS] Clean plain text response confirmed.");
      }
    } catch (e) {
      console.error(`ERROR running test for ${q.name}:`, e.message);
      endpointFailed++;
    }
  }

  if (endpointFailed === 0) {
    console.log("\n==========================================");
    console.log("ALL CHATBOT PLAIN TEXT TESTS PASSED SUCCESSFULLY!");
    console.log("==========================================");
    server.unref();
  } else {
    console.error(`\nFAILED ${endpointFailed} endpoint tests.`);
    process.exit(1);
  }
});
