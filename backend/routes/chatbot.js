import { Router } from "express";
import store from "../data/store.js";
import { sanitizePlainText } from "../utils/text.js";

const router = Router();

// POST /api/chatbot/message
router.post("/chatbot/message", async (req, res) => {
  const { message, language = "en", history = [] } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const targetLanguage = language === "ta" ? "Tamil" : "English";
  const systemPrompt = `You are Yieldo AI Assistant, an agricultural procurement and mandi queue assistant for farmers in Tamil Nadu.
You help farmers register for procurement slots, check queue status, understand crop requirements, and navigate mandi procedures.
Respond in ${targetLanguage} by default, unless the farmer's message is clearly written in a different language — in that case, match their message's language instead.
Keep answers concise, helpful, friendly, and practical for farmers.
Respond in plain, conversational text only. Do NOT use Markdown formatting - no asterisks for bold, no numbered lists with periods, no bullet points with dashes or asterisks, no headers. If listing multiple steps or options, use natural sentence structure or simple numbered phrases like 'First, ... Second, ...' instead of Markdown list syntax.`;

  // If GEMINI_API_KEY is available in environment, use Gemini API
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

  // Fallback intelligent response generator adhering to target language
  const userText = message.toLowerCase();
  const isTamil = targetLanguage === "Tamil" || /[\u0B80-\u0BFF]/.test(message);

  let reply = "";

  if (userText.includes("hello") || userText.includes("hi") || userText.includes("வணக்கம்")) {
    reply = isTamil
      ? "வணக்கம்! நான் Yieldo உதவியாளர். டோக்கன் முன்பதிவு, வரிசை நிலை அறிதல், அல்லது கொள்முதல் மையங்கள் பற்றிய கேள்விகளுக்கு உதவ முடியும். நான் உங்களுக்கு எவ்வாறு உதவட்டும்?"
      : "Hello! I am your Yieldo assistant. I can help you with slot booking, live token tracking, and procurement centre guidelines. How can I help you today?";
  } else if (
    userText.includes("status") ||
    userText.includes("token") ||
    userText.includes("queue") ||
    userText.includes("நிலை") ||
    userText.includes("டோக்கன்")
  ) {
    reply = isTamil
      ? "உங்கள் டோக்கன் நிலையை அறிய 'நிலை அறிதல்' (Check Status) பக்கத்திற்கு செல்லவும். அங்கு உங்கள் டோக்கன் எண்ணை (எ.கா. TNJ-001) உள்ளிட்டு நேரலை வரிசை எண் மற்றும் மதிப்பிடப்பட்ட நேரத்தை அறியலாம்."
      : "You can track your live token status in the 'Check Status' tab. Enter your Token ID (e.g. TNJ-001) to view real-time queue position and estimated wait time.";
  } else if (
    userText.includes("book") ||
    userText.includes("register") ||
    userText.includes("slot") ||
    userText.includes("பதிவு") ||
    userText.includes("முன்பதிவு")
  ) {
    reply = isTamil
      ? "டோக்கன் முன்பதிவு செய்ய 'நேர முன்பதிவு' (Book a Slot) பக்கத்திற்கு செல்லவும். உங்கள் பெயர், பயிர் வகை (நெல், கோதுமை, பருப்பு வகைகள், சோளம், நிலக்கடலை, பருத்தி), அளவு மற்றும் கொள்முதல் மையத்தைத் தேர்ந்தெடுத்து டோக்கன் பெறலாம்."
      : "To book a procurement slot, head to the 'Book a Slot' page. Select your crop (Paddy, Wheat, Pulses, Maize, Groundnut, Cotton), enter quantity in kg, and choose your nearest procurement centre.";
  } else if (
    userText.includes("centre") ||
    userText.includes("mandi") ||
    userText.includes("location") ||
    userText.includes("மையம்") ||
    userText.includes("மண்டி")
  ) {
    const centres = store.getCentres();
    const count = centres.length;
    reply = isTamil
      ? `தற்போது தஞ்சாவூர், விழுப்புரம், மற்றும் கடலூர் மாவட்டங்களில் ${count} கொள்முதல் மையங்கள் செயல்படுகின்றன. முன்பதிவு பக்கத்தில் உங்கள் மாவட்ட மையத்தைத் தேர்ந்தெடுக்கலாம்.`
      : `We have ${count} direct purchase centres operating across Thanjavur, Villupuram, and Cuddalore districts. You can select your closest centre on the booking page.`;
  } else if (
    userText.includes("crop") ||
    userText.includes("paddy") ||
    userText.includes("wheat") ||
    userText.includes("பயிர்") ||
    userText.includes("நெல்")
  ) {
    reply = isTamil
      ? "Yieldo-வில் நெல் (Paddy), கோதுமை (Wheat), பருப்பு வகைகள் (Pulses), மக்காச்சோளம் (Maize), நிலக்கடலை (Groundnut), மற்றும் பருத்தி (Cotton) ஆகிய பயிர்களை பதிவு செய்யலாம்."
      : "Yieldo supports slot booking for Paddy, Wheat, Pulses, Maize, Groundnut, and Cotton with real-time quality check and procurement tracking.";
  } else if (
    userText.includes("cancel") ||
    userText.includes("reschedule") ||
    userText.includes("ரத்து") ||
    userText.includes("மாற்ற")
  ) {
    reply = isTamil
      ? "உங்கள் டோக்கனை ரத்து செய்ய அல்லது நேரத்தை மாற்ற, நிலை அறிதல் பக்கத்திற்கு சென்று உங்கள் டோக்கன் எண்ணை உள்ளிடவும். அங்கு டோக்கன் ரத்து அல்லது மறு அட்டவணை விருப்பத்தைப் பயன்படுத்தி புதிய நேரத்தை தேர்ந்தெடுக்கலாம்."
      : "To cancel or reschedule your token, first go to the Check Status page and enter your token number. Next, choose the Cancel Token or Reschedule option to pick a new date and time slot.";
  } else {
    reply = isTamil
      ? `நான் உங்கள் Yieldo உதவியாளர். டோக்கன் முன்பதிவு, வரிசை நிலை, அல்லது கொள்முதல் மையங்கள் பற்றிய கேள்விகளுக்கு உதவ முடியும். மேலும் தகவலுக்கு உங்கள் கேள்வியைத் தெளிவாகக் கேளுங்கள்.`
      : `I am your Yieldo assistant. You can ask me about token booking, live wait times, procurement centres, or quality check stages. How else can I assist you?`;
  }

  reply = sanitizePlainText(reply);

  return res.json({
    reply,
    language: targetLanguage,
    systemPrompt,
  });
});

export default router;
