import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function AdminChatbot() {
  const { lang } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(true);
  const [voiceError, setVoiceError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const isSpeechSupported = !!SpeechRecognition;

  // Initialize with admin welcome message safely without wiping active chat history
  useEffect(() => {
    const welcome =
      lang === "ta"
        ? "வணக்கம் நிர்வாகி! நான் Yieldo நேரலை செயல்பாட்டு AI உதவியாளர். அனைத்து கொள்முதல் மையங்களின் நேரலை வரிசை, நெரிசல் நிலை, தினசரி கொள்ளளவு மற்றும் விவசாயிகள் ஆதரவு டிக்கெட்டுகள் குறித்த கேள்விகளை என்னிடம் கேட்கலாம்."
        : "Hello Administrator! I am your Yieldo Live Operations AI. Ask me about live queues across any of the 15 centres, crowd hotspots, slot bookings, or open farmer support tickets.";
    setMessages((prev) => {
      if (prev.length <= 1) {
        return [{ sender: "bot", text: welcome }];
      }
      return prev;
    });
  }, [lang]);

  const [voices, setVoices] = useState([]);
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // Listen to speech synthesis voices
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const updateVoices = () => {
        const available = window.speechSynthesis.getVoices() || [];
        if (available.length > 0) {
          setVoices(available);
          console.log(
            `[AdminChatbot SpeechSynthesis] Loaded ${available.length} voices on device:`,
            available.map((v) => `${v.name} [${v.lang}]${v.default ? " (default)" : ""}`)
          );
          const tamilVoice = available.find(
            (v) => (v.lang && /^ta/i.test(v.lang)) || /tamil/i.test(v.name) || /தமிழ்/i.test(v.name)
          );
          if (tamilVoice) {
            console.log("[AdminChatbot SpeechSynthesis] Dedicated Tamil voice found:", tamilVoice.name, `[${tamilVoice.lang}]`);
          } else {
            console.warn(
              "[AdminChatbot SpeechSynthesis] Notice: No dedicated Tamil voice pack (ta-IN) detected in getVoices(). " +
              "Tamil responses will skip audio playback to prevent English voice mispronunciation; text will display visibly."
            );
          }
        }
      };

      updateVoices();

      window.speechSynthesis.onvoiceschanged = updateVoices;
      window.speechSynthesis.addEventListener("voiceschanged", updateVoices);

      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
        if (window.speechSynthesis.onvoiceschanged === updateVoices) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isListening, voiceError]);

  const speakReply = useCallback(
    (text, overrideLang) => {
      if (!voiceReplyEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      const getVoicesList = () => {
        const direct = window.speechSynthesis.getVoices();
        if (direct && direct.length > 0) return direct;
        if (voices && voices.length > 0) return voices;
        return [];
      };

      const doSpeak = (availableVoices) => {
        try {
          window.speechSynthesis.cancel();

          // Strip markdown symbols for clearer speech
          const cleanText = text ? text.replace(/[*#`_•]/g, " ").replace(/\s+/g, " ").trim() : "";
          if (!cleanText) {
            setIsSpeaking(false);
            return;
          }

          // Evaluate current language dynamically on every message
          const activeLang = overrideLang || langRef.current || lang;
          const isTamilText = /[\u0B80-\u0BFF]/.test(cleanText);
          const isTamil = activeLang === "ta" || isTamilText;

          // Always log available voices list (name + lang) as requested
          console.log(
            `[AdminChatbot SpeechSynthesis] Available voices list (${availableVoices.length}):`,
            availableVoices.map((v) => `${v.name} (${v.lang})`)
          );
          console.log(
            `[AdminChatbot SpeechSynthesis] doSpeak called -> activeLang: "${activeLang}", isTamilText: ${isTamilText}, final isTamil: ${isTamil}`
          );

          if (isTamil) {
            const matchTamilVoice =
              availableVoices.find((v) => v.lang && /^ta[-_]IN$/i.test(v.lang)) ||
              availableVoices.find((v) => v.lang && /^ta[-_]/i.test(v.lang)) ||
              availableVoices.find((v) => v.lang && /^ta$/i.test(v.lang)) ||
              availableVoices.find((v) => /tamil/i.test(v.name) || /தமிழ்/i.test(v.name) || /tamil/i.test(v.lang));

            if (!matchTamilVoice) {
              console.warn(
                "[AdminChatbot SpeechSynthesis] Notice: No dedicated Tamil voice pack (ta-IN) installed on this browser/OS. " +
                "Skipping audio playback for Tamil to prevent English voice mispronunciation. " +
                "Tamil text response remains clearly visible in the chat."
              );
              console.log("[AdminChatbot SpeechSynthesis Speak Debug - Tamil]", {
                text: cleanText,
                utteranceLang: "ta-IN",
                voiceName: "none (Tamil voice not installed - skipped audio fallback)",
                voiceLang: "none",
                hasDedicatedVoice: false,
                action: "graceful silent fallback (text only)",
              });
              setIsSpeaking(false);
              return;
            }

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.text = cleanText;
            utterance.lang = "ta-IN";
            utterance.rate = 0.92;
            utterance.pitch = 1.0;
            utterance.voice = matchTamilVoice;
            console.log("[AdminChatbot SpeechSynthesis] Selected dedicated Tamil voice:", matchTamilVoice.name, `(${matchTamilVoice.lang})`);

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = (e) => {
              console.warn("[AdminChatbot SpeechSynthesis] Utterance error:", e);
              setIsSpeaking(false);
            };

            console.log("[AdminChatbot SpeechSynthesis Speak Debug - Tamil]", {
              text: utterance.text,
              utteranceLang: utterance.lang,
              voiceName: utterance.voice.name,
              voiceLang: utterance.voice.lang,
              hasDedicatedVoice: true,
              action: "speaking via Tamil voice",
            });

            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utterance);
          } else {
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.text = cleanText;
            utterance.lang = "en-IN";
            utterance.rate = 1.0;

            const matchEnglishVoice =
              availableVoices.find((v) => v.lang && /^en[-_]IN$/i.test(v.lang)) ||
              availableVoices.find((v) => v.lang && /^en[-_]/i.test(v.lang)) ||
              availableVoices.find((v) => v.lang && /^en$/i.test(v.lang)) ||
              availableVoices.find((v) => /india/i.test(v.name) || /heera/i.test(v.name) || /ravi/i.test(v.name));

            if (matchEnglishVoice) {
              utterance.voice = matchEnglishVoice;
              console.log("[AdminChatbot SpeechSynthesis] Selected English voice:", matchEnglishVoice.name, `(${matchEnglishVoice.lang})`);
            }
            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = (e) => {
              console.warn("[AdminChatbot SpeechSynthesis] Utterance error:", e);
              setIsSpeaking(false);
            };

            console.log("[AdminChatbot SpeechSynthesis Speak Debug - English]", {
              text: utterance.text,
              utteranceLang: utterance.lang,
              voiceName: utterance.voice ? utterance.voice.name : "none (browser default)",
              voiceLang: utterance.voice ? utterance.voice.lang : "none (browser default)",
              hasDedicatedVoice: !!utterance.voice,
            });

            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utterance);
          }
        } catch (err) {
          console.error("[AdminChatbot SpeechSynthesis] Speak exception:", err);
          setIsSpeaking(false);
        }
      };

      const currentVoices = getVoicesList();
      if (currentVoices.length > 0) {
        doSpeak(currentVoices);
      } else {
        let handled = false;
        const onVoicesReady = () => {
          if (handled) return;
          handled = true;
          const loaded = getVoicesList();
          doSpeak(loaded);
        };
        window.speechSynthesis.addEventListener("voiceschanged", onVoicesReady, { once: true });
        setTimeout(onVoicesReady, 250);
      }
    },
    [voiceReplyEnabled, lang, voices]
  );

  async function sendUserMessage(text) {
    const userMessage = text.trim();
    if (!userMessage || loading) return;

    const activeCurrentLang = langRef.current || lang;

    // 1. Console log right before fetch call
    console.log("[AdminChatbot Frontend] Sending message to /api/admin/chatbot/message:", {
      message: userMessage,
      language: activeCurrentLang,
    });

    setVoiceError("");
    const newHistory = [...messages, { sender: "user", text: userMessage }];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    try {
      const data = await api.sendAdminChatbotMessage({
        message: userMessage,
        language: activeCurrentLang,
        history: newHistory,
      });

      // 2. Console log response received from API
      console.log("[AdminChatbot Frontend] Received response from backend:", data);

      const replyText = data.reply || "Operations query completed.";
      setMessages((prev) => [...prev, { sender: "bot", text: replyText }]);
      speakReply(replyText, activeCurrentLang);
    } catch (err) {
      console.error("[AdminChatbot Frontend] Error sending chatbot message:", err);
      const fallbackText =
        activeCurrentLang === "ta"
          ? "மன்னிக்கவும், தகவலைப் பெறுவதில் பிழை ஏற்பட்டது. சர்வர் இணைப்பை சரிபார்க்கவும்."
          : "Operational query failed. Please verify server connection and try again.";
      setMessages((prev) => [...prev, { sender: "bot", text: fallbackText }]);
      speakReply(fallbackText, activeCurrentLang);
    } finally {
      setLoading(false);
    }
  }

  function handleSend(e) {
    if (e) e.preventDefault();
    sendUserMessage(input);
  }

  function startListening() {
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    setVoiceError("");

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = lang === "ta" ? "ta-IN" : "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
          sendUserMessage(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setVoiceError(lang === "ta" ? "குரல் பதிவு தோல்வியடைந்தது" : `Voice error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError(lang === "ta" ? "குரல் உள்ளீடு கிடைக்கவில்லை" : "Voice input unavailable");
    }
  }

  function renderFormattedMessage(text) {
    return text.split("\n").map((line, idx) => {
      const isBullet = line.trim().startsWith("•") || line.trim().startsWith("-") || line.trim().startsWith("*");
      const formattedParts = line.split(/(\*\*.*?\*\*)/g).map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={pIdx} style={{ color: "#F8FAFC", fontWeight: 700 }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      return (
        <div
          key={idx}
          style={{
            paddingLeft: isBullet ? 8 : 0,
            minHeight: line.trim() ? "auto" : 6,
            marginBottom: 3,
            lineHeight: 1.45,
          }}
        >
          {formattedParts}
        </div>
      );
    });
  }

  return (
    <>
      {/* Floating Admin AI Trigger Button */}
      <button
        type="button"
        id="admin-ai-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
          color: "#F8FAFC",
          border: "1px solid #334155",
          borderRadius: 28,
          padding: "12px 20px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: "0.01em",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 14px 28px -4px rgba(0, 0, 0, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.45)";
        }}
        title="Open Admin Operations AI Assistant"
      >
        <span style={{ fontSize: 18, filter: "drop-shadow(0 0 4px #38BDF8)" }}>⚡</span>
        <span>{lang === "ta" ? "செயல்பாட்டு AI" : "Operations AI"}</span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#10B981",
            boxShadow: "0 0 8px #10B981",
          }}
        />
      </button>

      {/* Admin Operations AI Chatbot Window */}
      {isOpen && (
        <div
          id="admin-ai-modal"
          style={{
            position: "fixed",
            bottom: 84,
            right: 24,
            width: 420,
            maxWidth: "calc(100vw - 32px)",
            height: 580,
            maxHeight: "calc(100vh - 110px)",
            zIndex: 9999,
            background: "#0F172A",
            border: "1px solid #334155",
            borderRadius: 14,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "#E2E8F0",
            fontFamily: "var(--font-body, system-ui, sans-serif)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              background: "linear-gradient(90deg, #1E293B 0%, #0F172A 100%)",
              borderBottom: "1px solid #334155",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0284C7 0%, #0369A1 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  boxShadow: "0 0 12px rgba(2, 132, 199, 0.4)",
                }}
              >
                ⚡
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#F8FAFC", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{lang === "ta" ? "நிர்வாக செயல்பாட்டு AI" : "Admin Operations AI"}</span>
                  <span
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#34D399",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 10,
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    LIVE DATA
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                  {lang === "ta" ? "15 மையங்களின் நேரலை பகுப்பாய்வு" : "Live analytics across all 15 centres"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Voice toggle */}
              <button
                type="button"
                onClick={() => {
                  if (isSpeaking) {
                    window.speechSynthesis.cancel();
                    setIsSpeaking(false);
                  }
                  setVoiceReplyEnabled((v) => !v);
                }}
                style={{
                  background: voiceReplyEnabled ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.05)",
                  border: voiceReplyEnabled ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid #334155",
                  color: voiceReplyEnabled ? "#38BDF8" : "#64748B",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                title={voiceReplyEnabled ? "Voice replies ON" : "Voice replies OFF"}
              >
                {voiceReplyEnabled ? (isSpeaking ? "🔊..." : "🔊") : "🔇"}
              </button>

              {/* Close button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid #334155",
                  color: "#94A3B8",
                  borderRadius: 6,
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div
            style={{
              flex: 1,
              padding: "16px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "#090D16",
            }}
          >
            {messages.map((msg, i) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "88%",
                      padding: "10px 14px",
                      borderRadius: isUser ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                      background: isUser
                        ? "linear-gradient(135deg, #1E40AF 0%, #1D4ED8 100%)"
                        : "#1E293B",
                      color: isUser ? "#FFFFFF" : "#F1F5F9",
                      border: isUser ? "1px solid #3B82F6" : "1px solid #334155",
                      fontSize: 13,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                    }}
                  >
                    {isUser ? msg.text : renderFormattedMessage(msg.text)}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "14px 14px 14px 2px",
                    background: "#1E293B",
                    color: "#94A3B8",
                    fontSize: 13,
                    border: "1px solid #334155",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ display: "inline-block", animation: "spin 1s infinite linear" }}>⚡</span>
                  <span>{lang === "ta" ? "நேரலை தகவல்கள் பகுப்பாய்வு செய்யப்படுகின்றன..." : "Querying live operational store..."}</span>
                </div>
              </div>
            )}

            {voiceError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#FCA5A5",
                  fontSize: 11,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                ⚠️ {voiceError}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={handleSend}
            style={{
              padding: "12px",
              background: "#1E293B",
              borderTop: "1px solid #334155",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isSpeechSupported && (
              <button
                type="button"
                onClick={startListening}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: isListening ? "1px solid #EF4444" : "1px solid #475569",
                  background: isListening ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.05)",
                  color: isListening ? "#EF4444" : "#94A3B8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
                title={isListening ? "Listening... click to stop" : "Voice input (mic)"}
              >
                {isListening ? "🔴" : "🎤"}
              </button>
            )}

            <input
              type="text"
              id="admin-chatbot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                lang === "ta"
                  ? "எ.கா: 'தஞ்சாவூர் மையத்தில் எத்தனை பேர் வரிசையில் உள்ளனர்?'"
                  : "e.g. 'How many in queue at Thanjavur Main?'"
              }
              style={{
                flex: 1,
                padding: "9px 12px",
                background: "#0F172A",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#F8FAFC",
                fontSize: 13,
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#38BDF8")}
              onBlur={(e) => (e.target.style.borderColor = "#334155")}
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                padding: "9px 16px",
                background: "linear-gradient(135deg, #0284C7 0%, #0369A1 100%)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              {lang === "ta" ? "அனுப்பு" : "Send"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
