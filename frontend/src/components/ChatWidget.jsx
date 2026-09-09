import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function ChatWidget() {
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

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const isSpeechSupported = !!SpeechRecognition;

  // Initialize with welcome message on mount
  useEffect(() => {
    setMessages([{ sender: "bot", text: t("chat_welcome_msg") }]);
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isListening, voiceError, showFaqs]);

  const speakReply = useCallback(
    (text) => {
      if (!voiceReplyEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const targetLocale = lang === "ta" ? "ta-IN" : "en-IN";
        utterance.lang = targetLocale;

        const voices = window.speechSynthesis.getVoices();
        const matchVoice =
          voices.find((v) => v.lang === targetLocale) ||
          voices.find((v) => v.lang.startsWith(lang === "ta" ? "ta" : "en"));

        if (matchVoice) {
          utterance.voice = matchVoice;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
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

    try {
      // Pass the current language from LanguageContext dynamically
      const data = await api.sendChatbotMessage({
        message: userMessage,
        language: lang,
        history: newHistory,
      });

      const replyText = data.reply || "Thank you for reaching out.";
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: replyText },
      ]);

      speakReply(replyText);
    } catch {
      const fallbackText =
        lang === "ta"
          ? "மன்னிக்கவும், தகவலைப் பெறுவதில் பிழை ஏற்பட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்."
          : "Sorry, could not connect to assistant. Please try again shortly.";
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: fallbackText },
      ]);
      speakReply(fallbackText);
    } finally {
      setLoading(false);
    }
  }

  function handleSend(e) {
    if (e) e.preventDefault();
    sendUserMessage(input);
  }

  function handleFaqClick(faq) {
    setVoiceError("");
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: faq.q },
      { sender: "bot", text: faq.a },
    ]);
    speakReply(faq.a);
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
