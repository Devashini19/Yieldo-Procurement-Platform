import { Router } from "express";
import store from "../data/store.js";
import { sanitizePlainText } from "../utils/text.js";

const router = Router();

// POST /api/chatbot/message
router.post("/chatbot/message", async (req, res) => {
  const {
    message,
    language = "en",
    history = [],
    farmerIdentifier,
    farmerName,
  } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const targetLanguage = language === "ta" ? "Tamil" : "English";
  const userText = message.toLowerCase();
  const isTamil = targetLanguage === "Tamil" || /[\u0B80-\u0BFF]/.test(message);

  // 1. Gather authenticated farmer data if available
  let authenticatedFarmer = null;
  let activeTokenRecord = null;
  let activeQueueInfo = null;
  let farmerContextSummary = "";

  if (farmerIdentifier) {
    const records = store.getFarmersByIdentifier(farmerIdentifier);
    const profile = store.getFarmerProfile(farmerIdentifier, farmerName);
    const summary = store.getFarmerProcurementSummary(farmerIdentifier);

    authenticatedFarmer = {
      identifier: farmerIdentifier,
      name: profile?.name || farmerName || (records[0] ? records[0].name : "Farmer"),
      farmerId: profile?.farmerId || null,
      totalBookings: records.length,
      completedProcurements: summary?.totalCompleted || 0,
      totalEarnings: summary?.totalEarnings || 0,
    };

    activeTokenRecord =
      records.find(
        (f) => f.status !== store.STATUS.CANCELLED && f.status !== store.STATUS.PAID
      ) || records[0];

    if (activeTokenRecord) {
      const centre = store.getCentre(activeTokenRecord.centreId);
      const queue = store.getQueueForCentre(activeTokenRecord.centreId);
      const pos = queue.findIndex((f) => f.id === activeTokenRecord.id);
      activeQueueInfo = {
        tokenId: activeTokenRecord.id,
        crop: activeTokenRecord.crop,
        quantityKg: activeTokenRecord.quantityKg,
        centreName: centre ? centre.name : activeTokenRecord.centreId,
        centreId: activeTokenRecord.centreId,
        district: centre ? centre.district : "",
        slotDate: activeTokenRecord.slotDate,
        slotTime: activeTokenRecord.slotTime,
        status: activeTokenRecord.status,
        queuePosition: pos >= 0 ? pos + 1 : null,
        isServing: pos === 0,
        estimatedWaitMinutes:
          pos >= 0 ? store.estimateWaitMinutes(activeTokenRecord.centreId, pos) : null,
      };
    }

    farmerContextSummary = `LOGGED-IN FARMER CONTEXT:
- Name: ${authenticatedFarmer.name}
- Farmer ID: ${authenticatedFarmer.farmerId || "Unavailable"}
- Active Booking: ${
      activeQueueInfo
        ? `Token ${activeQueueInfo.tokenId}, Crop ${activeQueueInfo.crop} (${activeQueueInfo.quantityKg} kg) at ${activeQueueInfo.centreName}, Slot ${activeQueueInfo.slotDate} ${activeQueueInfo.slotTime}, Status ${activeQueueInfo.status}${
            activeQueueInfo.queuePosition
              ? `, Queue Position ${activeQueueInfo.queuePosition}, Estimated wait ${activeQueueInfo.estimatedWaitMinutes} mins`
              : ""
          }`
        : "No active booking"
    }
- Total Completed Procurements: ${authenticatedFarmer.completedProcurements}
- Total Earnings: Rs. ${authenticatedFarmer.totalEarnings}`;
  } else {
    farmerContextSummary =
      "LOGGED-IN FARMER CONTEXT: The user is currently not logged in as a specific farmer.";
  }

  // Check if message explicitly mentions a token ID (e.g. TNJ-001, VPM-002, CDL-003)
  const tokenMatch = message.match(/\b([A-Za-z]{3}-\d+)\b/);
  let queriedTokenRecord = null;
  if (tokenMatch) {
    const rawToken = tokenMatch[1].toUpperCase();
    const found = store.getFarmer(rawToken);
    if (found) {
      const c = store.getCentre(found.centreId);
      const q = store.getQueueForCentre(found.centreId);
      const pos = q.findIndex((f) => f.id === found.id);
      queriedTokenRecord = {
        id: found.id,
        name: found.name,
        crop: found.crop,
        quantityKg: found.quantityKg,
        centreName: c ? c.name : found.centreId,
        district: c ? c.district : "",
        slotDate: found.slotDate,
        slotTime: found.slotTime,
        status: found.status,
        queuePosition: pos >= 0 ? pos + 1 : null,
        estimatedWaitMinutes: pos >= 0 ? store.estimateWaitMinutes(found.centreId, pos) : null,
      };
    }
  }

  // 2. Comprehensive Grounded System Prompt
  const systemPrompt = `You are Yieldo AI Assistant, the official agricultural procurement and mandi queue assistant for farmers in Tamil Nadu.
You assist farmers with slot booking, live token queue tracking, mandi procedures, crop MSP rates, slot swap, and receipts.

CRITICAL OPERATIONAL RULES:
1. ACTUAL IMPLEMENTED YIELDO FEATURES ONLY:
- Slot Booking: Supported crops are Paddy, Wheat, Pulses, Maize, Groundnut, Cotton. Farmers pick crop, quantity (in kg, bags, quintals, or tons), nearest procurement centre, booking date, and a 2-hour slot time window.
- 15 Direct Purchase Centres operate across Thanjavur (C01 to C05), Villupuram (C06 to C10), and Cuddalore (C11 to C15) with standard operating hours (06:00 AM to 06:00 PM).
- MSP Rates and Tamil Nadu State Incentive:
  - Paddy (Common): Base MSP Rs. 2,300 per quintal plus Tamil Nadu State Incentive Rs. 69 per quintal = Rs. 2,369 per quintal (Rs. 23.69 per kg). Standard bag is 40 kg.
  - Paddy (Fine and Grade A): Base MSP Rs. 2,320 per quintal plus Tamil Nadu State Incentive Rs. 80 per quintal = Rs. 2,400 per quintal (Rs. 24.00 per kg).
  - Wheat: Base MSP Rs. 2,585 per quintal (Rs. 25.85 per kg). Bag is 50 kg.
  - Maize: Base MSP Rs. 2,400 per quintal (Rs. 24.00 per kg). Bag is 50 kg.
  - Pulses: Base MSP Rs. 8,000 per quintal (Rs. 80.00 per kg). Bag is 50 kg.
  - Groundnut: Base MSP Rs. 6,783 per quintal (Rs. 67.83 per kg). Bag is 40 kg.
  - Cotton: Base MSP Rs. 7,710 per quintal (Rs. 77.10 per kg). Bag is 50 kg.
- Check Status: Farmers enter their Token ID on the Check Status page to track their live queue position, estimated wait time, now-serving token, quality check stages, receipt, and payment.
- Quality Check: Verifies moisture level, foreign matter, admixture, and rejected grain percentage.
- Receipt and Payment: Centre admin generates point-of-sale receipt with net weight and payable amount. Payments are processed through Direct Benefit Transfer (bank transfer).
- Procurement History: Farmers can view completed past procurements and receipts.
- Farmer Profile: Displays farmer name, phone/email, Farmer ID (e.g. FID-...), total bookings, and earnings.
- Peer-to-Peer Slot Swap: Farmers booked at the same centre can request swapping slot date and time from the Check Status page.
- Cancellation and Reschedule: Farmers can cancel or pick a new slot on the Check Status page.
- Support Tickets: Farmers can raise tickets on the Raise Ticket page for operational issues, payment queries, or complaints.
- In-App Notifications: Real-time alerts via the top Notification Bell icon with audio chime for queue position alerts and status updates.

2. SMS IS NOT IMPLEMENTED:
- Yieldo does NOT send SMS messages. Never claim an SMS will be sent or that SMS notifications exist.
- If a farmer asks about SMS, explicitly clarify that SMS is not implemented and all notifications and queue alerts appear directly inside the application via the Notification Bell and Check Status dashboard.

3. NO HALLUCINATION:
- Never invent farmer IDs, token numbers, queue positions, payment amounts, dates, or non-existent features.
- When answering questions about the farmer's personal token, queue, or farmer ID, ONLY use the authenticated farmer context provided below. If the information is not in the context, state clearly that it is currently unavailable or that they should log in.

4. RESPONSE STYLE AND PLAIN TEXT:
- Respond in ${targetLanguage} by default. In Tamil mode, produce natural, polite, simple Tamil sentences suitable for farmers.
- Use plain conversational text only.
- Do NOT use Markdown formatting (no asterisks for bold or italics, no header hashtags, no bullet points, no numbered lists with periods, no emojis, no decorative symbols).
- Explain steps naturally in conversational sentences.

${farmerContextSummary}
${
  queriedTokenRecord
    ? `SPECIFIC TOKEN QUERIED (${queriedTokenRecord.id}):
- Name: ${queriedTokenRecord.name}
- Crop: ${queriedTokenRecord.crop} (${queriedTokenRecord.quantityKg} kg)
- Centre: ${queriedTokenRecord.centreName} (${queriedTokenRecord.district})
- Slot: ${queriedTokenRecord.slotDate} ${queriedTokenRecord.slotTime}
- Status: ${queriedTokenRecord.status}
- Queue Position: ${queriedTokenRecord.queuePosition || "Not in active queue"}
- Wait Time: ${queriedTokenRecord.estimatedWaitMinutes || "Unavailable"} mins`
    : ""
}`;

  // 3. Gemini API Call with Grounded Prompt
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: [
              ...history.map((h) => ({
                role: h.sender === "user" ? "user" : "model",
                parts: [{ text: h.text }],
              })),
              {
                role: "user",
                parts: [{ text: message }],
              },
            ],
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        const replyText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) {
          const cleanReply = sanitizePlainText(replyText);
          return res.json({ reply: cleanReply, language: targetLanguage, systemPrompt });
        }
      }
    } catch (err) {
      console.warn("Gemini API call failed, falling back to local assistant:", err.message);
    }
  }

  // 4. Intelligent Local Fallback Resolver
  let reply = "";

  // A. SMS Inquiry Check (Strict prevention of SMS misinformation)
  if (
    userText.includes("sms") ||
    userText.includes("எஸ்.எம்.எஸ்") ||
    userText.includes("மெசேஜ்") ||
    userText.includes("குறுஞ்செய்தி") ||
    (userText.includes("message") && (userText.includes("receive") || userText.includes("send") || userText.includes("get")))
  ) {
    reply = isTamil
      ? "Yieldo செயலியில் SMS சேவை செயல்படுத்தப்படவில்லை. உங்கள் முன்பதிவு, டோக்கன் மற்றும் வரிசை நிலவரங்கள் அனைத்தும் செயலியின் அறிவிப்பு மணி (Notification Bell) மற்றும் நிலை அறிதல் (Check Status) பக்கம் வழியாகவே நேரடியாக தெரிவிக்கப்படும்."
      : "SMS integration is not implemented in Yieldo. All your booking updates, token details, and live queue alerts are provided directly inside the application through the Notification Bell and the Check Status page.";
  }

  // B. Greetings
  else if (
    userText.includes("hello") ||
    userText.includes("hi") ||
    userText.includes("hey") ||
    userText.includes("வணக்கம்")
  ) {
    reply = isTamil
      ? "வணக்கம்! நான் Yieldo கொள்முதல் உதவியாளர். டோக்கன் முன்பதிவு, நேரலை வரிசை நிலை, குறைந்தபட்ச ஆதரவு விலை (MSP), மற்றும் கொள்முதல் மையங்கள் பற்றிய விவரங்களுக்கு உதவ முடியும். நான் உங்களுக்கு எவ்வாறு உதவட்டும்?"
      : "Hello! I am your Yieldo assistant. I can help you with slot booking, live token queue tracking, MSP rates with state incentives, and direct purchase centres. How can I help you today?";
  }

  // C. Farmer ID inquiries
  else if (
    userText.includes("farmer id") ||
    userText.includes("my id") ||
    userText.includes("விவசாயி ஐடி") ||
    userText.includes("விவசாயி எண்")
  ) {
    if (authenticatedFarmer?.farmerId) {
      reply = isTamil
        ? `உங்கள் விவசாயி ஐடி (Farmer ID): ${authenticatedFarmer.farmerId}. பதிவு செய்த பெயர்: ${authenticatedFarmer.name}.`
        : `Your authenticated Farmer ID is ${authenticatedFarmer.farmerId} registered under ${authenticatedFarmer.name}.`;
    } else if (authenticatedFarmer) {
      reply = isTamil
        ? "உங்கள் விவசாயி ஐடி தற்போது கிடைக்கவில்லை. மேல் வலது பக்கத்தில் உள்ள விவசாயி சுயவிவர மெனுவில் உங்கள் விவரங்களை சரிபார்க்கலாம்."
        : "Your Farmer ID is currently unavailable. You can view your account profile from the top-right profile menu.";
    } else {
      reply = isTamil
        ? "உங்கள் விவசாயி ஐடி விவரங்களை அறிய உங்கள் அலைபேசி எண் அல்லது Google கணக்கு மூலம் உள்நுழையவும்."
        : "To view your Farmer ID, please log in with your mobile number or Google account.";
    }
  }

  // D. Live Queue and Wait Time inquiries
  else if (
    userText.includes("queue position") ||
    userText.includes("my position") ||
    userText.includes("wait time") ||
    userText.includes("வரிசை எண்") ||
    userText.includes("வரிசை நிலை") ||
    userText.includes("காத்திருப்பு") ||
    userText.includes("எத்தனையாவது")
  ) {
    if (activeQueueInfo && activeQueueInfo.queuePosition) {
      reply = isTamil
        ? `உங்கள் டோக்கன் ${activeQueueInfo.tokenId} (${activeQueueInfo.crop}) ${activeQueueInfo.centreName} மையத்தில் தற்போது வரிசை எண் ${activeQueueInfo.queuePosition}-ல் உள்ளது. மதிப்பிடப்பட்ட காத்திருப்பு நேரம் சுமார் ${activeQueueInfo.estimatedWaitMinutes || 15} நிமிடங்கள்.`
        : `Your token ${activeQueueInfo.tokenId} for ${activeQueueInfo.crop} at ${activeQueueInfo.centreName} is currently at queue position ${activeQueueInfo.queuePosition} with an estimated wait time of ${activeQueueInfo.estimatedWaitMinutes || 15} minutes.`;
    } else if (queriedTokenRecord && queriedTokenRecord.queuePosition) {
      reply = isTamil
        ? `டோக்கன் ${queriedTokenRecord.id} (${queriedTokenRecord.crop}) ${queriedTokenRecord.centreName} மையத்தில் தற்போது வரிசை எண் ${queriedTokenRecord.queuePosition}-ல் உள்ளது.`
        : `Token ${queriedTokenRecord.id} for ${queriedTokenRecord.crop} at ${queriedTokenRecord.centreName} is currently at queue position ${queriedTokenRecord.queuePosition}.`;
    } else if (activeQueueInfo) {
      reply = isTamil
        ? `உங்கள் டோக்கன் ${activeQueueInfo.tokenId} (${activeQueueInfo.crop}) ${activeQueueInfo.centreName} மையத்தில் ${activeQueueInfo.slotDate} அன்று ${activeQueueInfo.slotTime} நேரத்திற்கு முன்பதிவு செய்யப்பட்டுள்ளது. தற்போதைய நிலை: ${activeQueueInfo.status}.`
        : `Your token ${activeQueueInfo.tokenId} for ${activeQueueInfo.crop} at ${activeQueueInfo.centreName} is scheduled for ${activeQueueInfo.slotDate} during ${activeQueueInfo.slotTime}. Current status is ${activeQueueInfo.status}.`;
    } else {
      reply = isTamil
        ? "உங்கள் நேரலை வரிசை விவரம் தற்போது கிடைக்கவில்லை. உங்கள் டோக்கன் எண்ணைக் கொண்டு நிலை அறிதல் (Check Status) பக்கத்தில் நேரலை வரிசை நிலையை அறியலாம்."
        : "Your queue position is currently unavailable. Please enter your Token ID on the Check Status page or log in with your registered account.";
    }
  }

  // E. Token and Booking Information inquiries
  else if (
    userText.includes("my token") ||
    userText.includes("active token") ||
    userText.includes("my booking") ||
    userText.includes("current booking") ||
    userText.includes("my slot") ||
    userText.includes("booked slot") ||
    userText.includes("token number") ||
    userText.includes("token id") ||
    (userText.includes("token") && (userText.includes("what") || userText.includes("my") || userText.includes("check") || userText.includes("active") || userText.includes("booking"))) ||
    userText.includes("என் டோக்கன்") ||
    userText.includes("என் முன்பதிவு") ||
    userText.includes("டோக்கன் எண்")
  ) {
    if (activeQueueInfo) {
      reply = isTamil
        ? `உங்கள் செயலில் உள்ள டோக்கன் எண் ${activeQueueInfo.tokenId} ஆகும். பயிர்: ${activeQueueInfo.crop} (${activeQueueInfo.quantityKg} கிலோ), மையம்: ${activeQueueInfo.centreName}, நாள்: ${activeQueueInfo.slotDate}, நேரம்: ${activeQueueInfo.slotTime}.`
        : `Your active token is ${activeQueueInfo.tokenId} for ${activeQueueInfo.crop} (${activeQueueInfo.quantityKg} kg) at ${activeQueueInfo.centreName}, booked for ${activeQueueInfo.slotDate} during ${activeQueueInfo.slotTime}.`;
    } else if (authenticatedFarmer) {
      reply = isTamil
        ? "உங்களுக்கு தற்போது செயலில் உள்ள டோக்கன் எதுவும் இல்லை. புதிய டோக்கன் முன்பதிவு செய்ய 'நேர முன்பதிவு' (Book a Slot) பக்கத்திற்கு செல்லவும்."
        : "You do not currently have any active booked tokens. You can book a procurement slot on the Book a Slot page.";
    } else {
      reply = isTamil
        ? "உங்கள் டோக்கன் விவரங்களை அறிய நீங்கள் உள்நுழைந்திருக்க வேண்டும், அல்லது நிலை அறிதல் (Check Status) பக்கத்தில் உங்கள் டோக்கன் எண்ணை உள்ளிட்டு சரிபார்க்கலாம்."
        : "To check your token details, please log in with your mobile number or enter your Token ID on the Check Status page.";
    }
  }

  // F. Specific Token ID queried in text
  else if (queriedTokenRecord) {
    reply = isTamil
      ? `டோக்கன் ${queriedTokenRecord.id} விவரங்கள்: பயிர் ${queriedTokenRecord.crop} (${queriedTokenRecord.quantityKg} கிலோ), கொள்முதல் மையம் ${queriedTokenRecord.centreName}, முன்பதிவு நேரம் ${queriedTokenRecord.slotDate} ${queriedTokenRecord.slotTime}, தற்போதைய நிலை: ${queriedTokenRecord.status}.`
      : `Details for Token ${queriedTokenRecord.id}: Crop ${queriedTokenRecord.crop} (${queriedTokenRecord.quantityKg} kg) at ${queriedTokenRecord.centreName}, booked for ${queriedTokenRecord.slotDate} during ${queriedTokenRecord.slotTime}, current status: ${queriedTokenRecord.status}.`;
  }

  // G. MSP Rates & State Incentives
  else if (
    userText.includes("msp") ||
    userText.includes("incentive") ||
    userText.includes("rate") ||
    userText.includes("price") ||
    userText.includes("ஆதரவு விலை") ||
    userText.includes("விலை") ||
    userText.includes("ஊக்கத்தொகை")
  ) {
    reply = isTamil
      ? "தமிழ்நாட்டில் நெல் பொது ரகத்திற்கு குறைந்தபட்ச ஆதரவு விலை குவிண்டாலுக்கு ரூ. 2300 மற்றும் தமிழ்நாடு அரசின் ஊக்கத்தொகை ரூ. 69 சேர்த்து மொத்தம் ரூ. 2369 ஆகும் (கிலோவுக்கு ரூ. 23.69). சன்ன மற்றும் கிரேடு ஏ ரகத்திற்கு குவிண்டாலுக்கு ரூ. 2320 மற்றும் ஊக்கத்தொகை ரூ. 80 சேர்த்து ரூ. 2400 ஆகும். கோதுமை குவிண்டாலுக்கு ரூ. 2585, மக்காச்சோளம் ரூ. 2400, பருப்பு வகைகள் ரூ. 8000, நிலக்கடலை ரூ. 6783, மற்றும் பருத்தி ரூ. 7710 ஆகும்."
      : "In Tamil Nadu, the Minimum Support Price for Paddy Common is Rs. 2,300 base plus Rs. 69 state incentive, totalling Rs. 2,369 per quintal (Rs. 23.69 per kg). Paddy Fine and Grade A is Rs. 2,320 base plus Rs. 80 state incentive, totalling Rs. 2,400 per quintal. Wheat is Rs. 2,585 per quintal, Maize is Rs. 2,400, Pulses is Rs. 8,000, Groundnut is Rs. 6,783, and Cotton is Rs. 7,710 per quintal.";
  }

  // H. Payment & Receipts
  else if (
    userText.includes("payment") ||
    userText.includes("receipt") ||
    userText.includes("money") ||
    userText.includes("amount") ||
    userText.includes("கட்டணம்") ||
    userText.includes("ரசீது") ||
    userText.includes("பணம்")
  ) {
    if (authenticatedFarmer && authenticatedFarmer.completedProcurements > 0) {
      reply = isTamil
        ? `உங்கள் கொள்முதல் கொடுப்பனவு Direct Benefit Transfer (DBT) முறையில் வங்கி கணக்கிற்கு நேரடியாக அனுப்பப்படுகிறது. உங்கள் நிறைவு செய்யப்பட்ட கொள்முதல்கள்: ${authenticatedFarmer.completedProcurements}, மொத்த வருவாய்: ரூ. ${authenticatedFarmer.totalEarnings}. நிலை அறிதல் பக்கத்தில் விரிவான ரசீதை பதிவிறக்கலாம்.`
        : `Payments are transferred directly to your bank account via Direct Benefit Transfer once procurement and weighing are verified. Your completed procurements: ${authenticatedFarmer.completedProcurements}, total earnings: Rs. ${authenticatedFarmer.totalEarnings}. You can view receipts on the Check Status page.`;
    } else {
      reply = isTamil
        ? "Yieldo-வில் கொள்முதல் மற்றும் தரப் பரிசோதனை முடிந்தவுடன் அதிகாரி ரசீது வழங்குவார். கட்டணத் தொகை Direct Benefit Transfer முறையில் விவசாயியின் வங்கி கணக்கில் நேரடியாக செலுத்தப்படும். நிலை அறிதல் பக்கத்தில் ரசீது மற்றும் கட்டண நிலையை அறியலாம்."
        : "In Yieldo, after crop quality inspection and weighing at the centre, the admin releases your receipt. Payment is processed directly to your bank account through Direct Benefit Transfer. You can track receipt and payment status on the Check Status page.";
    }
  }

  // I. Slot Swap
  else if (
    userText.includes("swap") ||
    userText.includes("exchange") ||
    userText.includes("பரிமாற்றம்") ||
    userText.includes("மாற்றிக் கொள்ள")
  ) {
    reply = isTamil
      ? "Yieldo-வில் ஒரே கொள்முதல் மையத்தில் முன்பதிவு செய்துள்ள சக விவசாயிகளுடன் உங்கள் நேரத்தை மாற்றிக்கொள்ள Slot Swap வசதி உள்ளது. நிலை அறிதல் (Check Status) பக்கத்திற்கு சென்று 'Slot Swap' விருப்பத்தைப் பயன்படுத்தி கிடைக்கக்கூடிய விவசாயிகளுடன் நேரப் பரிமாற்ற கோரிக்கை அனுப்பலாம்."
      : "Yieldo offers a peer-to-peer Slot Swap feature for farmers booked at the same centre. Head to the Check Status page and select the Slot Swap option to request an exchange of dates or time slots with available fellow farmers.";
  }

  // J. Cancellation & Rescheduling
  else if (
    userText.includes("cancel") ||
    userText.includes("reschedule") ||
    userText.includes("ரத்து") ||
    userText.includes("மறு அட்டவணை") ||
    userText.includes("தேதி மாற்ற")
  ) {
    reply = isTamil
      ? "உங்கள் டோக்கனை ரத்து செய்ய அல்லது நேரத்தை மாற்ற, நிலை அறிதல் (Check Status) பக்கத்திற்கு சென்று உங்கள் டோக்கன் எண்ணை உள்ளிடவும். அங்கு டோக்கன் ரத்து அல்லது மறு அட்டவணை விருப்பத்தைப் பயன்படுத்தி புதிய தேதியை தேர்ந்தெடுக்கலாம்."
      : "To cancel or reschedule your token, go to the Check Status page and enter your Token ID. Next, choose Cancel Token or Reschedule to pick a new date and time slot.";
  }

  // K. Centres & Mandi Locations
  else if (
    userText.includes("centre") ||
    userText.includes("mandi") ||
    userText.includes("location") ||
    userText.includes("district") ||
    userText.includes("மையம்") ||
    userText.includes("மண்டி") ||
    userText.includes("மாவட்டம்")
  ) {
    reply = isTamil
      ? "Yieldo-வில் தற்போது தஞ்சாவூர், விழுப்புரம், மற்றும் கடலூர் ஆகிய 3 மாவட்டங்களில் 15 நேரடி கொள்முதல் மையங்கள் செயல்படுகின்றன. மையங்கள் காலை 6:00 மணி முதல் மாலை 6:00 மணி வரை திறந்திருக்கும். நேர முன்பதிவு பக்கத்தில் உங்கள் மாவட்ட மையத்தைத் தேர்ந்தெடுக்கலாம்."
      : "Yieldo currently operates 15 direct purchase centres across Thanjavur, Villupuram, and Cuddalore districts, open from 06:00 AM to 06:00 PM. You can select your closest centre on the Book a Slot page.";
  }

  // L. Slot Booking & Registration
  else if (
    userText.includes("book") ||
    userText.includes("register") ||
    userText.includes("slot") ||
    userText.includes("பதிவு") ||
    userText.includes("முன்பதிவு")
  ) {
    reply = isTamil
      ? "டோக்கன் முன்பதிவு செய்ய 'நேர முன்பதிவு' (Book a Slot) பக்கத்திற்கு செல்லவும். உங்கள் பெயர், பயிர் வகை (நெல், கோதுமை, பருப்பு வகைகள், மக்காச்சோளம், நிலக்கடலை, பருத்தி), அளவு மற்றும் கொள்முதல் மையத்தைத் தேர்ந்தெடுத்து 2 மணி நேர முன்பதிவு டோக்கனைப் பெறலாம்."
      : "To book a procurement slot, go to the 'Book a Slot' page. Select your crop (Paddy, Wheat, Pulses, Maize, Groundnut, Cotton), enter quantity in kg, and pick your nearest procurement centre with a 2-hour time slot to generate your token.";
  }

  // M. Crop Information
  else if (
    userText.includes("crop") ||
    userText.includes("paddy") ||
    userText.includes("wheat") ||
    userText.includes("pulses") ||
    userText.includes("பயிர்") ||
    userText.includes("நெல்")
  ) {
    reply = isTamil
      ? "Yieldo-வில் நெல் (Paddy), கோதுமை (Wheat), பருப்பு வகைகள் (Pulses), மக்காச்சோளம் (Maize), நிலக்கடலை (Groundnut), மற்றும் பருத்தி (Cotton) ஆகிய பயிர்களை பதிவு செய்யலாம். மூட்டை, குவிண்டால், டன், அல்லது கிலோ அலகுகளில் அளவை குறிப்பிடலாம்."
      : "Yieldo supports slot booking for Paddy, Wheat, Pulses, Maize, Groundnut, and Cotton. You can specify crop quantity in bags, quintals, tons, or kg.";
  }

  // N. Support Tickets & Complaints
  else if (
    userText.includes("ticket") ||
    userText.includes("complaint") ||
    userText.includes("grievance") ||
    userText.includes("issue") ||
    userText.includes("புகார்") ||
    userText.includes("டிக்கெட்") ||
    userText.includes("பிரச்சனை")
  ) {
    reply = isTamil
      ? "கொள்முதல் தாமதம், கட்டணக் குழப்பம் அல்லது உதவி தேவைப்பட்டால் 'ஆதரவு டிக்கெட்' (Raise Ticket) பக்கத்திற்கு சென்று உங்கள் புகாரை பதிவு செய்யலாம். கொள்முதல் மைய அதிகாரி அதை பரிசீலித்து தீர்வு காண்பார்."
      : "If you face any issues with queue delays, payments, or mandi operations, you can submit a support ticket on the 'Raise Ticket' page. The centre admin will review and resolve it.";
  }

  // O. Check Status General
  else if (
    userText.includes("status") ||
    userText.includes("check") ||
    userText.includes("track") ||
    userText.includes("நிலை")
  ) {
    reply = isTamil
      ? "உங்கள் டோக்கன் நிலையை அறிய 'நிலை அறிதல்' (Check Status) பக்கத்திற்கு செல்லவும். அங்கு உங்கள் டோக்கன் எண்ணை (எ.கா. TNJ-001) உள்ளிட்டு நேரலை வரிசை எண், மதிப்பிடப்பட்ட காத்திருப்பு நேரம், மற்றும் ரசீது நிலையை அறியலாம்."
      : "You can track your token in the 'Check Status' tab. Enter your Token ID (such as TNJ-001) to view real-time queue position, estimated wait time, quality check progress, and receipt status.";
  }

  // P. In-App Notifications General
  else if (
    userText.includes("notification") ||
    userText.includes("alert") ||
    userText.includes("bell") ||
    userText.includes("அறிவிப்பு") ||
    userText.includes("மணி")
  ) {
    reply = isTamil
      ? "Yieldo-வில் அனைத்து வரிசை மற்றும் டோக்கன் எச்சரிக்கைகளும் செயலியில் உள்ள அறிவிப்பு மணி (Notification Bell) மூலம் உடனடியாக தெரிவிக்கப்படும். SMS அனுப்பப்படாது."
      : "All queue alerts and token updates in Yieldo are delivered in real time via the top Notification Bell with an audio chime. SMS messages are not used.";
  }

  // Q. General Default Fallback
  else {
    reply = isTamil
      ? "நான் உங்கள் Yieldo உதவியாளர். டோக்கன் முன்பதிவு, நேரலை வரிசை நிலை, குறைந்தபட்ச ஆதரவு விலை (MSP), மற்றும் கொள்முதல் மையங்கள் பற்றிய கேள்விகளுக்கு உதவ முடியும். நான் உங்களுக்கு எவ்வாறு உதவட்டும்?"
      : "I am your Yieldo assistant. You can ask me about token booking, live wait times, MSP rates with state incentives, direct purchase centres, or quality checks. How can I help you?";
  }

  reply = sanitizePlainText(reply);

  return res.json({
    reply,
    language: targetLanguage,
    systemPrompt,
  });
});

export default router;
