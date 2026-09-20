import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function ChatWidget({ farmerUser }) {
  const { lang, t, faqs } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(true);
  const [voiceError, setVoiceError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showFaqs, setShowFaqs] = useState(true);
  const [voices, setVoices] = useState([]);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  const isSpeechSupported = !!SpeechRecognition;

  const farmerIdentifier = farmerUser?.identifier || farmerUser?.phone || farmerUser?.email;
  const farmerName = farmerUser?.name;

  // Initialize with welcome message on mount and sync on language change if chat not started
  useEffect(() => {
    setMessages((prev) => {
      if (!prev || prev.length === 0) {
        return [{ sender: "bot", text: t("chat_welcome_msg") }];
      }
      if (prev.length === 1 && prev[0].sender === "bot") {
        return [{ sender: "bot", text: t("chat_welcome_msg") }];
      }
      return prev;
    });
  }, [lang, t]);

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
            `[SpeechSynthesis] Loaded ${available.length} voices on device:`,
            available.map((v) => `${v.name} [${v.lang}]${v.default ? " (default)" : ""}`)
          );
          const tamilVoice =
            available.find((v) => v.lang && v.lang.toLowerCase() === "ta-in") ||
            available.find((v) => v.lang && v.lang.toLowerCase().startsWith("ta")) ||
            null;
          if (tamilVoice) {
            console.log("[SpeechSynthesis] Dedicated Tamil voice found:", tamilVoice.name, `[${tamilVoice.lang}]`);
          } else {
            console.warn(
              "[SpeechSynthesis] Notice: No dedicated Tamil voice pack (ta-IN) detected in getVoices(). " +
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
  }, [messages, isOpen, isListening, voiceError, showFaqs]);

  const speakReply = useCallback(
    (text, overrideLang) => {
      if (!voiceReplyEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      // Safe voice loading helper respecting browser async voice readiness
      const getVoicesSafely = (onDone) => {
        // 1. Call speechSynthesis.getVoices()
        const direct = window.speechSynthesis.getVoices() || [];
        if (direct.length > 0) {
          setVoices(direct);
          onDone(direct);
          return;
        }

        // 2. If array is empty, listen for onvoiceschanged / voiceschanged
        let resolved = false;
        let retryTimer = null;

        const cleanup = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoicesReady);
          if (window.speechSynthesis.onvoiceschanged === onVoicesReady) {
            window.speechSynthesis.onvoiceschanged = null;
          }
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
        };

        const onVoicesReady = () => {
          if (resolved) return;
          resolved = true;
          cleanup();
          // 3. After voices become available, call getVoices() again
          const loaded = window.speechSynthesis.getVoices() || [];
          if (loaded.length > 0) {
            setVoices(loaded);
          }
          onDone(loaded);
        };

        // 4. Avoid registering duplicate voiceschanged listeners every time the user speaks
        window.speechSynthesis.addEventListener("voiceschanged", onVoicesReady, { once: true });
        window.speechSynthesis.onvoiceschanged = onVoicesReady;

        // 5. If getVoices() is still empty and voiceschanged does not fire, retry once after 1.5s (1–2 seconds)
        retryTimer = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          cleanup();
          const retried = window.speechSynthesis.getVoices() || [];
          if (retried.length > 0) {
            setVoices(retried);
          }
          // 6. Only after this retry should the system conclude that no browser voice is available
          onDone(retried);
        }, 1500);
      };

      const doSpeak = (availableVoices) => {
        try {
          window.speechSynthesis.cancel();

          // Strip markdown symbols and clean whitespace for clearer speech
          const cleanText = text ? text.replace(/[*#`_•]/g, " ").replace(/\s+/g, " ").trim() : "";
          if (!cleanText) {
            setIsSpeaking(false);
            return;
          }

          // Evaluate current language dynamically on every message
          const activeLang = overrideLang || langRef.current || lang;
          const isTamilText = /[\u0B80-\u0BFF]/.test(cleanText);
          const isTamil = activeLang === "ta" || isTamilText;

          if (isTamil) {
            // Priority 1: voice.lang === "ta-IN" (case-insensitive)
            // Priority 2: otherwise a voice.lang starting with "ta"
            const matchTamilVoice =
              availableVoices.find((v) => v.lang && v.lang.toLowerCase() === "ta-in") ||
              availableVoices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ta")) ||
              null;

            // Required Tamil TTS Debug Logging
            console.log("[Tamil TTS] text:", cleanText);
            console.log("[Tamil TTS] utterance.lang:", "ta-IN");
            console.log(
              "[Tamil TTS] available voices:\n" +
                (availableVoices.length > 0
                  ? availableVoices.map((v) => `${v.name} - ${v.lang}`).join("\n")
                  : "none")
            );
            console.log("[Tamil TTS] selected voice:", matchTamilVoice ? matchTamilVoice.name : "none");
            console.log("[Tamil TTS] selected voice.lang:", matchTamilVoice ? matchTamilVoice.lang : "none");

            // Graceful fallback: If no Tamil voice is available, skip audio gracefully without English voice fallback
            if (!matchTamilVoice) {
              console.warn(
                "[Tamil TTS] No browser/OS Tamil voice detected. Skipping Tamil audio playback gracefully; text response displayed."
              );
              setIsSpeaking(false);
              return;
            }

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.text = cleanText;
            utterance.lang = "ta-IN";
            utterance.rate = 0.92;
            utterance.pitch = 1.0;
            utterance.voice = matchTamilVoice;

            currentUtteranceRef.current = utterance;

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = (e) => {
              console.warn("[Tamil TTS] Utterance error:", e);
              setIsSpeaking(false);
            };

            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utterance);
          } else {
            // English voice playback (existing working English behavior kept unchanged)
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
              console.log("[SpeechSynthesis] Selected English voice:", matchEnglishVoice.name, `(${matchEnglishVoice.lang})`);
            }

            currentUtteranceRef.current = utterance;

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = (e) => {
              console.warn("[SpeechSynthesis] Utterance error:", e);
              setIsSpeaking(false);
            };

            console.log("[SpeechSynthesis Speak Debug - English]", {
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
          console.error("[SpeechSynthesis] Speak exception:", err);
          setIsSpeaking(false);
        }
      };

      getVoicesSafely(doSpeak);
    },
    [voiceReplyEnabled, lang]
  );

  async function sendUserMessage(text) {
    const userMessage = text.trim();
    if (!userMessage || loading) return;

    setVoiceError("");
    const newHistory = [...messages, { sender: "user", text: userMessage }];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    const activeCurrentLang = langRef.current || lang;

    try {
      // Pass the current language from LanguageContext dynamically along with authenticated farmer context
      const data = await api.sendChatbotMessage({
        message: userMessage,
        language: activeCurrentLang,
        history: newHistory,
        farmerIdentifier,
        farmerName,
      });

      const replyText = data.reply || (activeCurrentLang === "ta" ? "உங்கள் கேள்விக்கு நன்றி." : "Thank you for reaching out.");
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: replyText },
      ]);

      speakReply(replyText, activeCurrentLang);
    } catch {
      const fallbackText =
        activeCurrentLang === "ta"
          ? "மன்னிக்கவும், தகவலைப் பெறுவதில் பிழை ஏற்பட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்."
          : "Sorry, could not connect to assistant. Please try again shortly.";
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: fallbackText },
      ]);
      speakReply(fallbackText, activeCurrentLang);
    } finally {
      setLoading(false);
    }
  }

  function handleSend(e) {
    if (e) e.preventDefault();
    sendUserMessage(input);
  }

  function handleFaqClick(faq) {
    const activeCurrentLang = langRef.current || lang;
    setVoiceError("");
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: faq.q },
      { sender: "bot", text: faq.a },
    ]);
    speakReply(faq.a, activeCurrentLang);
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
      const activeCurrentLang = langRef.current || lang;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = activeCurrentLang === "ta" ? "ta-IN" : "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript && transcript.trim()) {
          setInput(transcript);
          sendUserMessage(transcript);
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setVoiceError(t("voice_err_permission"));
        } else if (event.error === "no-speech") {
          setVoiceError(t("voice_err_no_speech"));
        } else {
          setVoiceError(t("voice_err_general"));
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError(t("voice_err_general"));
    }
  }

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999 }}>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 24,
            padding: "12px 20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            background: "var(--field)",
            color: "var(--paper)",
            border: "1px solid var(--wheat)",
          }}
        >
          <span style={{ fontSize: 18 }}>🎙️</span>
          <span>{t("chat_open_btn")}</span>
        </button>
      )}

      {isOpen && (
        <div
          className="card"
          style={{
            width: 390,
            maxWidth: "92vw",
            height: 540,
            display: "flex",
            flexDirection: "column",
            padding: 0,
            overflow: "hidden",
            boxShadow: "0 10px 35px rgba(0,0,0,0.2)",
            borderRadius: 12,
            border: "1px solid var(--line)",
            background: "#fff",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: "var(--field)",
              color: "var(--paper)",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{t("chat_widget_title")}</span>
                {isSpeaking && <span style={{ fontSize: 12 }}>🔊</span>}
              </div>
              <div style={{ fontSize: 11, opacity: 0.8, color: "var(--wheat-light)" }}>
                {t("chat_widget_subtitle")} ({lang === "ta" ? "தமிழ்" : "English"})
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Voice auto-reply toggle */}
              <button
                type="button"
                onClick={() => {
                  if (voiceReplyEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                  }
                  setVoiceReplyEnabled((v) => !v);
                }}
                title={voiceReplyEnabled ? t("voice_toggle_on") : t("voice_toggle_off")}
                style={{
                  background: voiceReplyEnabled ? "rgba(255,255,255,0.15)" : "transparent",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "var(--paper)",
                  borderRadius: 16,
                  padding: "4px 8px",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>{voiceReplyEnabled ? "🔊" : "🔇"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && "speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                  }
                  setIsOpen(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--paper)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "2px 6px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "var(--paper)",
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  maxWidth: "84%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontSize: 14,
                  lineHeight: 1.4,
                  background: m.sender === "user" ? "var(--field)" : "#fff",
                  color: m.sender === "user" ? "var(--paper)" : "var(--ink)",
                  border: m.sender === "user" ? "none" : "1px solid var(--line)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                {m.text}
              </div>
            ))}

            {isListening && (
              <div
                style={{
                  alignSelf: "center",
                  background: "#FDF2F0",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 14 }}>🎙️</span>
                <span>{t("voice_listening")}</span>
              </div>
            )}

            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 13,
                  color: "#8A8368",
                  padding: "6px 12px",
                }}
              >
                {lang === "ta" ? "தட்டச்சு செய்கிறது..." : "Typing response..."}
              </div>
            )}

            {voiceError && (
              <div
                className="error-text"
                style={{
                  fontSize: 12,
                  background: "#FDF2F0",
                  padding: "8px 12px",
                  borderRadius: 6,
                  margin: "4px 0",
                }}
              >
                {voiceError}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* FAQ Quick Access Chips */}
          {faqs && faqs.length > 0 && (
            <div className="faq-section">
              <div className="faq-header">
                <span>{t("faq_section_title") || "Common Questions"}</span>
                <button
                  type="button"
                  className="faq-toggle-btn"
                  onClick={() => setShowFaqs((s) => !s)}
                >
                  {showFaqs ? "▲" : "▼"}
                </button>
              </div>
              {showFaqs && (
                <div className="faq-chips">
                  {faqs.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="faq-chip"
                      onClick={() => handleFaqClick(item)}
                    >
                      {item.q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback browser speech support note if unsupported */}
          {!isSpeechSupported && (
            <div
              style={{
                fontSize: 11,
                color: "#8A8368",
                padding: "4px 12px",
                background: "#FAF7EF",
                borderTop: "1px solid var(--line)",
                textAlign: "center",
              }}
            >
              {t("voice_not_supported")}
            </div>
          )}

          {/* Input & voice mic field */}
          <form
            onSubmit={handleSend}
            style={{
              display: "flex",
              alignItems: "center",
              borderTop: "1px solid var(--line)",
              padding: "10px",
              background: "#fff",
              gap: 8,
            }}
          >
            {isSpeechSupported && (
              <button
                type="button"
                onClick={startListening}
                className={`mic-btn ${isListening ? "listening" : ""}`}
                title={isListening ? "Listening..." : "Click to speak"}
              >
                🎙️
              </button>
            )}

            <input
              style={{
                flex: 1,
                padding: "10px 12px",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 14,
                outline: "none",
              }}
              placeholder={isListening ? t("voice_listening") : t("chat_input_placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="btn"
              type="submit"
              disabled={loading || !input.trim()}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              {t("chat_send_btn")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
