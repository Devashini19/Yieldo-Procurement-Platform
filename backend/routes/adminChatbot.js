import { Router } from "express";
import store from "../data/store.js";
import { sanitizePlainText } from "../utils/text.js";

const router = Router();

// Helper to resolve centre from query string or ID
function findCentre(input) {
  if (!input) return null;
  const clean = String(input).trim().toLowerCase();
  const direct = store.getCentre(input.trim().toUpperCase());
  if (direct) return direct;

  const centres = store.getCentres();
  return centres.find(
    (c) =>
      c.id.toLowerCase() === clean ||
      c.code.toLowerCase() === clean ||
      c.name.toLowerCase().includes(clean) ||
      c.district.toLowerCase().includes(clean)
  );
}

// 1. Tool: getQueueForCentre
function getQueueForCentreTool({ centreId }) {
  const centre = findCentre(centreId);
  if (!centre) {
    return { error: `Centre not found matching "${centreId}". Available centre IDs: C01-C15.` };
  }
  const queue = store.getQueueForCentre(centre.id);
  const activeQueue = queue.filter(
    (f) => f.status === store.STATUS.IN_QUEUE || f.status === store.STATUS.QUALITY_CHECK
  );
  const crowdStatus = store.getCrowdStatus(centre.id);
  const liveAvg = store.getLiveAvgProcessMinutes(centre.id);
  const hasLivePace = store.hasLivePace(centre.id);

  return {
    centreId: centre.id,
    centreName: centre.name,
    district: centre.district,
    dailyCapacity: centre.dailyCapacity,
    totalQueueLength: queue.length,
    activeQueueCount: activeQueue.length,
    crowdStatus,
    liveAvgProcessMinutes: liveAvg,
    hasLivePace,
    farmers: queue.slice(0, 15).map((f) => ({
      id: f.id,
      name: f.name,
      crop: f.crop,
      quantityKg: f.quantityKg,
      slotDate: f.slotDate,
      slotTime: f.slotTime,
      status: f.status,
      checkedIn: f.checkedIn || false,
    })),
  };
}

// 2. Tool: getAllCentresOverview
function getAllCentresOverviewTool() {
  const centres = store.getCentres();
  const list = centres.map((c) => {
    const queue = store.getQueueForCentre(c.id);
    const active = queue.filter(
      (f) => f.status === store.STATUS.IN_QUEUE || f.status === store.STATUS.QUALITY_CHECK
    );
    return {
      centreId: c.id,
      code: c.code,
      name: c.name,
      district: c.district,
      dailyCapacity: c.dailyCapacity,
      activeQueueCount: active.length,
      totalQueueCount: queue.length,
      crowdStatus: store.getCrowdStatus(c.id),
      liveAvgMinutes: store.getLiveAvgProcessMinutes(c.id),
      hasLivePace: store.hasLivePace(c.id),
      bestTimeToVisit: store.getBestTimeToVisit(c.id),
    };
  });

  // Sort descending by active queue count so highest crowd is always first
  const sorted = [...list].sort((a, b) => b.activeQueueCount - a.activeQueueCount);

  return {
    totalCentres: sorted.length,
    totalActiveFarmersInQueue: sorted.reduce((sum, c) => sum + c.activeQueueCount, 0),
    highestCrowdCentre: sorted[0]
      ? {
          centreId: sorted[0].centreId,
          name: sorted[0].name,
          district: sorted[0].district,
          activeQueueCount: sorted[0].activeQueueCount,
          crowdStatus: sorted[0].crowdStatus,
          liveAvgMinutes: sorted[0].liveAvgMinutes,
        }
      : null,
    lowestCrowdCentre: sorted[sorted.length - 1]
      ? {
          centreId: sorted[sorted.length - 1].centreId,
          name: sorted[sorted.length - 1].name,
          district: sorted[sorted.length - 1].district,
          activeQueueCount: sorted[sorted.length - 1].activeQueueCount,
          crowdStatus: sorted[sorted.length - 1].crowdStatus,
        }
      : null,
    centres: sorted,
  };
}

// 3. Tool: getCentreBySlotDateTime
function getCentreBySlotDateTimeTool({ centreId, date, time }) {
  const centre = findCentre(centreId);
  if (!centre) {
    return { error: `Centre not found matching "${centreId}".` };
  }
  const targetDate = date ? String(date).trim() : new Date().toISOString().split("T")[0];
  const targetTime = time
    ? String(time).trim()
    : (store.generateSlotTimesForCentre ? store.generateSlotTimesForCentre(centre.id)[0] : "06:00 AM - 08:00 AM");

  const status = store.getSlotStatus(centre.id, targetDate, targetTime);
  return {
    centreId: centre.id,
    centreName: centre.name,
    district: centre.district,
    date: targetDate,
    slotTime: targetTime,
    capacity: status.capacity,
    bookedCount: status.count,
    availableSpots: status.availableSpots,
    crowdLevel: status.crowdLevel,
    isFull: status.isFull,
  };
}

// 4. Tool: getTicketsSummary
function getTicketsSummaryTool() {
  const all = store.getAllTickets();
  const open = all.filter((t) => t.status === "open" || t.status === "in_progress");
  const resolved = all.filter((t) => t.status === "resolved" || t.status === "closed");

  const breakdown = {};
  for (const type of Object.keys(store.TICKET_TYPES)) {
    breakdown[type] = open.filter((t) => t.ticketType === type).length;
  }

  return {
    totalTickets: all.length,
    openTicketsCount: open.length,
    resolvedTicketsCount: resolved.length,
    openTicketsByType: breakdown,
    recentOpenTickets: open.slice(0, 5).map((t) => ({
      id: t.id,
      farmerName: t.farmerName,
      farmerPhone: t.farmerPhone,
      type: t.ticketType,
      subtype: t.ticketSubtype,
      district: t.district,
      status: t.status,
    })),
  };
}

// Gemini Tool Definitions
const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "getQueueForCentre",
        description: "Get real-time live queue count, queue list, active farmers, and processing pace for a specific procurement centre ID (e.g. C01, C02, C08) or centre name.",
        parameters: {
          type: "OBJECT",
          properties: {
            centreId: {
              type: "STRING",
              description: "Centre ID (e.g. C01, C02, C08, KLK, TNJ) or name/district.",
            },
          },
          required: ["centreId"],
        },
      },
      {
        name: "getAllCentresOverview",
        description: "Get a comprehensive operational overview across all 15 procurement centres including active queue lengths (sorted from highest to lowest crowd), crowd status levels, capacities, and processing averages.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "getCentreBySlotDateTime",
        description: "Get capacity, booked count, available spots, and crowd level for a specific centre, date, and time slot combination.",
        parameters: {
          type: "OBJECT",
          properties: {
            centreId: { type: "STRING", description: "The centre ID, e.g. C01, C08" },
            date: { type: "STRING", description: "Date in YYYY-MM-DD format" },
            time: { type: "STRING", description: "Time slot bucket e.g. '8:00 AM - 10:00 AM'" },
          },
          required: ["centreId"],
        },
      },
      {
        name: "getTicketsSummary",
        description: "Get summary metrics and category breakdown of farmer support tickets and open grievances.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
    ],
  },
];

// Helper to format history for Gemini API
function formatChatHistory(history, message) {
  const contents = [];
  let userTurnSeen = false;

  if (Array.isArray(history)) {
    for (const h of history) {
      if (!h || !h.text) continue;
      const role = h.sender === "user" ? "user" : "model";
      if (role === "user") {
        userTurnSeen = true;
      }
      if (!userTurnSeen) continue; // Gemini requires conversation to start with user

      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += "\n" + h.text;
      } else {
        contents.push({ role, parts: [{ text: h.text }] });
      }
    }
  }

  const lastTurn = contents[contents.length - 1];
  if (!lastTurn || lastTurn.role !== "user" || lastTurn.parts[0].text !== message) {
    if (lastTurn && lastTurn.role === "user") {
      lastTurn.parts[0].text = message;
    } else {
      contents.push({ role: "user", parts: [{ text: message }] });
    }
  }

  return contents;
}

// Local Operational Query Resolver (Deterministic Fallback)
function resolveLocalAdminQuery(userMessage, isTamil) {
  const msg = userMessage.toLowerCase();

  // 1. Tickets summary
  if (msg.includes("ticket") || msg.includes("grievance") || msg.includes("புகார்") || msg.includes("மனு")) {
    const tktData = getTicketsSummaryTool();
    if (isTamil) {
      const breakdownText = Object.entries(tktData.openTicketsByType)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ") || "திறந்த புகார்கள் எதுவும் இல்லை";

      return (
        `விவசாயிகள் ஆதரவு டிக்கெட் நிலவரம்: ` +
        `மொத்த டிக்கெட்டுகள் ${tktData.totalTickets}, ` +
        `செயலில் உள்ளவை ${tktData.openTicketsCount}, ` +
        `தீர்க்கப்பட்டவை ${tktData.resolvedTicketsCount}. ` +
        `பிரிவு வாரியாக திறந்த புகார்கள்: ${breakdownText}.`
      );
    }
    const breakdownText = Object.entries(tktData.openTicketsByType)
      .map(([type, count]) => `${type}: ${count}`)
      .join(", ");

    return (
      `Farmer Support Tickets Operational Summary: ` +
      `Total tickets logged: ${tktData.totalTickets}. ` +
      `Open or in-progress tickets: ${tktData.openTicketsCount}. ` +
      `Resolved or closed tickets: ${tktData.resolvedTicketsCount}. ` +
      `Open tickets by category: ${breakdownText}.`
    );
  }

  // 2. Highest crowd / Busiest centre
  if (
    msg.includes("highest crowd") ||
    msg.includes("most crowded") ||
    msg.includes("busiest") ||
    msg.includes("highest") ||
    msg.includes("crowd") ||
    msg.includes("அதிக கூட்டம்") ||
    msg.includes("நெரிசல்")
  ) {
    const data = getAllCentresOverviewTool();
    const sorted = data.centres || data;
    const top = data.highestCrowdCentre || sorted[0];

    if (isTamil) {
      const runnersUp = sorted.slice(1, 4).map((c) => `${c.name}: ${c.activeQueueCount} விவசாயிகள் (${c.crowdStatus})`).join(", ");
      return (
        `தற்போது அதிக நெரிசல் உள்ள மையம் ${top.name} (${top.centreId}, ${top.district}). ` +
        `வரிசையில் உள்ளவர்கள் ${top.activeQueueCount} விவசாயிகள். ` +
        `நெரிசல் நிலை: ${top.crowdStatus === "high" ? "அதிக நெரிசல்" : top.crowdStatus === "medium" ? "மிதமான கூட்டம்" : "குறைந்த கூட்டம்"}. ` +
        `சராசரி செயலாக்க நேரம்: ${top.liveAvgMinutes} நிமிடங்கள் / விவசாயி. ` +
        (runnersUp ? `அடுத்தடுத்த மையங்கள்: ${runnersUp}.` : "")
      );
    }

    const runnersUp = sorted.slice(1, 4).map((c) => `${c.name} with ${c.activeQueueCount} in queue (${c.crowdStatus})`).join(", ");
    return (
      `The procurement centre with the highest live load is ${top.name} (${top.centreId} in ${top.district}) with ${top.activeQueueCount} active farmers in queue. ` +
      `Current crowd status is ${top.crowdStatus} and average process speed is ${top.liveAvgMinutes} minutes per farmer. ` +
      (runnersUp ? `Next busiest centres are ${runnersUp}.` : "")
    );
  }

  // 3. All centres overview / list
  if (
    msg.includes("all centres") ||
    msg.includes("overview") ||
    msg.includes("list centres") ||
    msg.includes("அனைத்து மையங்கள்") ||
    msg.includes("முழு விபரம்")
  ) {
    const data = getAllCentresOverviewTool();
    const sorted = data.centres || data;
    const totalInQueue = data.totalActiveFarmersInQueue ?? sorted.reduce((sum, c) => sum + c.activeQueueCount, 0);

    if (isTamil) {
      const summaryList = sorted.map((c) => `${c.name} (${c.centreId}): ${c.activeQueueCount} விவசாயிகள், ${c.crowdStatus} நிலை`).join(". ");
      return (
        `அனைத்து கொள்முதல் மையங்களின் நேரலை நிலவரம்: மொத்தமாக வரிசையில் உள்ள விவசாயிகள் ${totalInQueue}. விவரங்கள்: ${summaryList}.`
      );
    }

    const summaryList = sorted.map((c) => `${c.name} (${c.centreId}): ${c.activeQueueCount} active farmers, capacity ${c.dailyCapacity} per day, crowd ${c.crowdStatus}`).join(". ");
    return (
      `Live operational overview across all 15 centres: Total active farmers in queue is ${totalInQueue}. Centre details: ${summaryList}.`
    );
  }

  // 4. Specific Centre query
  const TAMIL_CENTRE_MAP = {
    "தஞ்சாவூர்": "C01",
    "கும்பகோணம்": "C02",
    "பாபநாசம்": "C03",
    "பட்டுக்கோட்டை": "C04",
    "ஒரத்தநாடு": "C05",
    "விழுப்புரம்": "C06",
    "திண்டிவனம்": "C07",
    "செஞ்சி": "C08",
    "கள்ளக்குறிச்சி": "C09",
    "விக்ரவாண்டி": "C10",
    "கடலூர்": "C11",
    "பண்ருட்டி": "C12",
    "சிதம்பரம்": "C13",
    "விருத்தாசலம்": "C14",
    "காட்டுமன்னார்கோவில்": "C15",
  };

  let matchedCentre = null;
  for (const [taName, cid] of Object.entries(TAMIL_CENTRE_MAP)) {
    if (userMessage.includes(taName)) {
      matchedCentre = store.getCentre(cid);
      break;
    }
  }

  if (!matchedCentre) {
    const centres = store.getCentres();
    matchedCentre = centres.find((c) => {
      const nameL = c.name.toLowerCase();
      const distL = c.district.toLowerCase();
      const codeL = c.code.toLowerCase();
      const idL = c.id.toLowerCase();
      return msg.includes(idL) || msg.includes(codeL) || msg.includes(nameL.split(" ")[0].toLowerCase()) || (msg.includes(distL) && msg.includes(c.code.toLowerCase()));
    }) || centres.find((c) => msg.includes(c.id.toLowerCase()));
  }

  if (matchedCentre) {
    const qData = getQueueForCentreTool({ centreId: matchedCentre.id });
    if (isTamil) {
      return (
        `${qData.centreName} (${qData.centreId}, ${qData.district}) நேரலை நிலவரம்: ` +
        `தற்போது வரிசையில் உள்ளவர்கள் ${qData.activeQueueCount} விவசாயிகள், ` +
        `இன்றைய மொத்த டோக்கன்கள் ${qData.totalQueueLength}, ` +
        `தினசரி கொள்ளளவு ${qData.dailyCapacity} விவசாயிகள், ` +
        `நெரிசல் நிலை ${qData.crowdStatus}, ` +
        `சராசரி வேகம் ${qData.liveAvgProcessMinutes} நிமிடங்கள் / விவசாயி.`
      );
    }

    return (
      `Live Queue Status for ${qData.centreName} (${qData.centreId}, ${qData.district}): ` +
      `Active queue count is ${qData.activeQueueCount} farmers. ` +
      `Total tokens today is ${qData.totalQueueLength} with daily capacity of ${qData.dailyCapacity} farmers per day. ` +
      `Current crowd level is ${qData.crowdStatus} and processing pace is ${qData.liveAvgProcessMinutes} minutes per farmer.`
    );
  }

  // 5. Default General Operational Guidance
  if (isTamil) {
    return (
      `வணக்கம் நிர்வாகி! நான் Yieldo நேரலை செயல்பாட்டு AI உதவியாளர். நீங்கள் மையங்களின் வரிசை எண்ணிக்கை, அதிக கூட்டம் உள்ள மையம், அல்லது ஆதரவு டிக்கெட்டுகள் குறித்து கேட்கலாம்.`
    );
  }

  return (
    `Hello Administrator! I am your Yieldo Live Operations AI Assistant. You can ask me about live queue counts, busiest procurement centres, or support ticket summaries.`
  );
}

// POST /api/admin/chatbot/message
router.post("/admin/chatbot/message", async (req, res) => {
  const { message, language = "en", history = [] } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const isTamil = language === "ta" || /[\u0B80-\u0BFF]/.test(message);
  const targetLanguage = isTamil ? "Tamil" : "English";

  const systemPrompt = `You are the Yieldo Admin Operations AI Assistant for Tamil Nadu agricultural procurement centres.
You assist centre administrators, quality inspectors, and mandi supervisors with real-time operational analytics and queue management.
Data access: You have tools to inspect live queues for any centre (C01 to C15), overall load balancing across all 15 centres, slot capacities, and support tickets.

CRITICAL DIRECTIVES:
1. You MUST ALWAYS call the appropriate tool for any question about queue counts, crowd levels, centre status, slot capacities, or support tickets. NEVER answer operational or data questions from memory, assumptions, or with a generic capabilities message.
2. For questions regarding the highest crowd, busiest centre, overall centre load, or comparison across centres, you MUST call getAllCentresOverview.
3. For questions about a specific procurement centre, you MUST call getQueueForCentre with the centre ID or name.
4. For questions about slot availability or capacity on a given date/time, you MUST call getCentreBySlotDateTime.
5. For questions about farmer grievances, complaints, or support tickets, you MUST call getTicketsSummary.
6. Always base queue counts, capacities, wait times, and ticket numbers ONLY on the real data returned by the tools. NEVER fabricate, estimate, or hallucinate numbers.
7. Respond in ${targetLanguage} by default (or match the user's language).
8. Respond in plain, conversational text only. Do NOT use Markdown formatting - no asterisks for bold, no numbered lists with periods, no bullet points with dashes or asterisks, no headers. If listing multiple steps or options, use natural sentence structure or simple numbered phrases like 'First, ... Second, ...' instead of Markdown list syntax.`;

  // If GEMINI_API_KEY is available, run Gemini with Tool Calling
  if (process.env.GEMINI_API_KEY) {
    try {
      const toolMap = {
        getQueueForCentre: getQueueForCentreTool,
        getAllCentresOverview: getAllCentresOverviewTool,
        getCentreBySlotDateTime: getCentreBySlotDateTimeTool,
        getTicketsSummary: getTicketsSummaryTool,
      };

      const contents = formatChatHistory(history, message);

      // 1. Console log exact user message right before Gemini API call
      console.log("[Admin Chatbot] Exact user message being sent to Gemini:", message);

      // Initial request with tool declarations using gemini-3.6-flash
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: GEMINI_TOOLS,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        const candidate = result.candidates?.[0];
        const functionCalls = candidate?.content?.parts?.filter((p) => p.functionCall);

        // 2. Console log right after Gemini API call whether tool call was triggered
        console.log(
          "[Admin Chatbot] Gemini response received. Tool/function call triggered:",
          functionCalls && functionCalls.length > 0
            ? functionCalls.map((c) => ({
                tool: c.functionCall.name,
                arguments: c.functionCall.args || {},
              }))
            : "NO TOOL CALL (Model responded directly conversationally)"
        );

        if (functionCalls && functionCalls.length > 0) {
          // Execute function calls
          const functionResponses = [];
          for (const call of functionCalls) {
            const fnName = call.functionCall.name;
            const fnArgs = call.functionCall.args || {};
            const executor = toolMap[fnName];
            const output = executor ? executor(fnArgs) : { error: `Function ${fnName} not found` };

            // 5. Console log raw tool result
            console.log(`[Admin Chatbot] Raw tool result for "${fnName}":`, JSON.stringify(output, null, 2));

            functionResponses.push({
              functionResponse: {
                name: fnName,
                response: { output },
              },
            });
          }

          // Follow-up request with function response
          const secondResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [
                  ...contents,
                  candidate.content,
                  { role: "user", parts: functionResponses },
                ],
              }),
            }
          );

          if (secondResponse.ok) {
            const secondResult = await secondResponse.json();
            const replyText = secondResult.candidates?.[0]?.content?.parts?.[0]?.text;
            if (replyText) {
              return res.json({ reply: sanitizePlainText(replyText.trim()), language: targetLanguage });
            }
          }
        } else {
          const directText = candidate?.content?.parts?.[0]?.text;
          if (directText) {
            return res.json({ reply: sanitizePlainText(directText.trim()), language: targetLanguage });
          }
        }
      } else {
        const errBody = await response.text();
        console.warn("[Admin Chatbot] Gemini API non-OK response:", response.status, errBody);
      }
    } catch (err) {
      console.warn("[Admin Chatbot] Gemini call error, falling back to local resolver:", err.message);
    }
  }

  // Fallback to deterministic real-data resolver
  const rawReply = resolveLocalAdminQuery(message, isTamil);
  const reply = sanitizePlainText(rawReply);
  return res.json({
    reply,
    language: targetLanguage,
  });
});

export default router;
