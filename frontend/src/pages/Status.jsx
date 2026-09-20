import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../api.js";
import { useLanguage } from "../i18n.js";
import { getDistanceMeters, formatDistance, GEOFENCE_RADIUS_METERS } from "../utils/geo.js";
import CentreQueueBoard from "../components/CentreQueueBoard.jsx";

const STAGES = [
  { key: "in_queue", labelKey: "stage_in_queue" },
  { key: "quality_check", labelKey: "stage_quality_check" },
  { key: "procured", labelKey: "stage_procured" },
  { key: "payment_initiated", labelKey: "stage_payment_initiated" },
  { key: "paid", labelKey: "stage_paid" },
];

function formatReceiptDateTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return String(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

export default function Status({ farmerUser, onAddNotification }) {
  const { lang, t, tCrop, tDistrict, tCentre } = useLanguage();
  const todayStr = new Date().toISOString().split("T")[0];
  const [params] = useSearchParams();
  const [tokens, setTokens] = useState([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState(params.get("id") || "");
  const [showManualLookup, setShowManualLookup] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleSlot, setRescheduleSlot] = useState({
    newSlotDate: todayStr,
    newSlotTime: "",
  });
  const [rescheduleAvailability, setRescheduleAvailability] = useState([]);
  const [loadingRescheduleAvailability, setLoadingRescheduleAvailability] = useState(false);
  const [rescheduleEarliestDate, setRescheduleEarliestDate] = useState(todayStr);
  const [checkingIn, setCheckingIn] = useState(false);
  const [userDistanceMeters, setUserDistanceMeters] = useState(null);
  const [locStatus, setLocStatus] = useState("idle");
  const [voiceAlertEnabled, setVoiceAlertEnabled] = useState(true);

  // Permanent Procurement History State
  const initialTab = params.get("tab") === "history" ? "history" : "active";
  const [viewTab, setViewTab] = useState(initialTab); // "active" | "history"
  const [procurementHistory, setProcurementHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistorySnapshot, setSelectedHistorySnapshot] = useState(null);

  useEffect(() => {
    const tabParam = params.get("tab");
    if (tabParam === "history") {
      setViewTab("history");
    } else if (tabParam === "active") {
      setViewTab("active");
    }
  }, [params]);

  // Slot Swap state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapPartners, setSwapPartners] = useState([]);
  const [loadingSwapPartners, setLoadingSwapPartners] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapSuccessMsg, setSwapSuccessMsg] = useState("");
  const [swapRequests, setSwapRequests] = useState({ incoming: [], outgoing: [] });
  const [respondingSwapId, setRespondingSwapId] = useState(null);

  const prevDataRef = useRef({});
  const autoCheckInAttemptedRef = useRef({});
  const notifiedCancellationRef = useRef(new Set());
  const notifiedQueuePosRef = useRef(new Set());

  const speakAlert = useCallback(
    (text) => {
      if (!voiceAlertEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const cleanText = text ? text.replace(/[*#`_•]/g, " ").replace(/\s+/g, " ").trim() : "";
        if (!cleanText) return;

        const voices = window.speechSynthesis.getVoices() || [];
        const isTamilText = /[\u0B80-\u0BFF]/.test(cleanText);
        const isTamil = lang === "ta" || isTamilText;

        if (isTamil) {
          const matchTamilVoice =
            voices.find((v) => v.lang && /^ta[-_]IN$/i.test(v.lang)) ||
            voices.find((v) => v.lang && /^ta[-_]/i.test(v.lang)) ||
            voices.find((v) => v.lang && /^ta$/i.test(v.lang)) ||
            voices.find((v) => /tamil/i.test(v.name) || /தமிழ்/i.test(v.name) || /tamil/i.test(v.lang));

          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.text = cleanText;
          utterance.lang = "ta-IN";
          utterance.rate = 0.92;
          utterance.pitch = 1.0;

          if (matchTamilVoice) {
            utterance.voice = matchTamilVoice;
            console.log("[Status Queue Audio] Using matched Tamil voice:", matchTamilVoice.name);
          } else {
            console.warn("[Status Queue Audio] No dedicated Tamil voice pack. Synthesizing with utterance.lang = 'ta-IN'.");
          }

          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        } else {
          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.text = cleanText;
          utterance.lang = "en-IN";
          utterance.rate = 1.0;
          const matchEnglishVoice =
            voices.find((v) => v.lang && /^en[-_]IN$/i.test(v.lang)) ||
            voices.find((v) => v.lang && /^en[-_]/i.test(v.lang)) ||
            voices.find((v) => v.lang && /^en$/i.test(v.lang)) ||
            voices.find((v) => /india/i.test(v.name) || /heera/i.test(v.name) || /ravi/i.test(v.name));
          if (matchEnglishVoice) {
            utterance.voice = matchEnglishVoice;
          }
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // Ignore audio errors
      }
    },
    [voiceAlertEnabled, lang]
  );

  const lookup = useCallback(
    async (id) => {
      if (!id) return;
      setError("");
      try {
        const result = await api.getFarmerStatus(id);
        setData(result);
        setSelectedTokenId(id);

        // Check for Admin Cancellation with reason - guaranteed push to Notification Bell dropdown
        const isCancelledWithReason =
          result.farmer?.status === "cancelled" && Boolean(result.farmer?.cancellationReason);
        const cancelKey = `cancelled-${result.farmer?.id}-${result.farmer?.cancellationReason}`;

        if (isCancelledWithReason && !notifiedCancellationRef.current.has(cancelKey)) {
          notifiedCancellationRef.current.add(cancelKey);
          const centreName =
            tCentre(result.farmer?.centreId || result.centre?.name) ||
            result.centre?.name ||
            "the centre";
          const cancelAlertMsg = t("notify_status_admin_cancelled_msg")
            .replace("{reason}", result.farmer.cancellationReason)
            .replace("{centre}", centreName)
            .replace("{date}", result.farmer.slotDate || "today")
            .replace("{time}", result.farmer.slotTime || "booked slot");

          if (onAddNotification) {
            onAddNotification({
              tokenId: id,
              title: t("notify_live_alert_title"),
              message: cancelAlertMsg,
            });
          }
          speakAlert(cancelAlertMsg);
        }

        // Check for meaningful queue position / status change for in-app alert
        const prev = prevDataRef.current[id];
        const newPos = result.queuePosition;
        const newStatus = result.farmer?.status;
        const waitMin = result.estimatedWaitMinutes;

        // Milestone condition 1: Status changed
        if (prev && newStatus && newStatus !== prev.status) {
          let alertMsg = "";
          if (newStatus === "quality_check") {
            alertMsg = t("notify_status_quality_check_msg");
          } else if (newStatus === "procured") {
            const f = result.farmer;
            const hasDiff = f?.declaredQuantityKg !== undefined && f?.verifiedQuantityKg !== undefined && Math.abs(f.declaredQuantityKg - f.verifiedQuantityKg) > 0.01;
            if (hasDiff) {
              const reasonText = f.quantityDiscrepancyReason ? ` Reason: ${f.quantityDiscrepancyReason}.` : "";
              alertMsg = `Your produce has been verified at ${f.verifiedQuantity} ${f.verifiedUnit || "bags"} (booked: ${f.declaredQuantity || f.quantityKg} ${f.declaredUnit || "bags"}).${reasonText} Final payment will be calculated on the verified amount.`;
            } else {
              alertMsg = `Your produce has been procured - ${f?.verifiedQuantity || f?.declaredQuantity || f?.quantityKg} ${f?.verifiedUnit || f?.declaredUnit || "bags"} verified, matching your booking.`;
            }
          } else if (newStatus === "payment_initiated") {
            alertMsg = t("notify_status_payment_initiated_msg");
          } else if (newStatus === "paid") {
            alertMsg = t("notify_status_paid_msg");
          } else if (newStatus === "cancelled" && !result.farmer?.cancellationReason) {
            alertMsg = t("notify_status_cancelled_msg");
          }

          if (alertMsg) {
            if (onAddNotification) {
              onAddNotification({
                tokenId: id,
                title: t("notify_live_alert_title"),
                message: alertMsg,
              });
            }
            speakAlert(alertMsg);
          }
        }

        // Milestone condition 2: Strict Queue Position Notifications (ONLY Position 5 and Position 1)
        const isQueueActive = newStatus !== "cancelled" && newStatus !== "paid";
        if (isQueueActive && newPos !== null && newPos !== undefined) {
          // Rule 1: Position exactly 5
          if (newPos === 5) {
            const key5 = `yieldo_qnotif_${id}_5`;
            const alreadyNotified5 =
              notifiedQueuePosRef.current.has(key5) ||
              (() => {
                try {
                  return localStorage.getItem(key5) === "1" || sessionStorage.getItem(key5) === "1";
                } catch {
                  return false;
                }
              })();

            if (!alreadyNotified5) {
              notifiedQueuePosRef.current.add(key5);
              try {
                localStorage.setItem(key5, "1");
                sessionStorage.setItem(key5, "1");
              } catch {}

              const f = result.farmer;
              const slotTiming = f?.slotTime || "11:00 AM to 12:00 PM";
              const pos5Msg = (t("notify_pos_5_msg") || "Reach your procurement centre. You are in 5th position of the queue. Your slot timing is {slot}.").replace("{slot}", slotTiming);
              const pos5Title = t("notify_pos_5_title") || "Reach Procurement Centre";

              if (onAddNotification) {
                onAddNotification({
                  id: `NOTIF-QUEUE-5-${id}`,
                  tokenId: id,
                  farmerName: f?.name,
                  crop: f?.crop,
                  title: pos5Title,
                  message: pos5Msg,
                });
              }
              speakAlert(pos5Msg);
            }
          }
          // Rule 2: Position exactly 1
          else if (newPos === 1) {
            const key1 = `yieldo_qnotif_${id}_1`;
            const alreadyNotified1 =
              notifiedQueuePosRef.current.has(key1) ||
              (() => {
                try {
                  return localStorage.getItem(key1) === "1" || sessionStorage.getItem(key1) === "1";
                } catch {
                  return false;
                }
              })();

            if (!alreadyNotified1) {
              notifiedQueuePosRef.current.add(key1);
              try {
                localStorage.setItem(key1, "1");
                sessionStorage.setItem(key1, "1");
              } catch {}

              const f = result.farmer;
              const pos1Msg = t("notify_pos_1_msg") || "You are next in line. Please be ready for procurement.";
              const pos1Title = t("notify_pos_1_title") || "Your Turn Next";

              if (onAddNotification) {
                onAddNotification({
                  id: `NOTIF-QUEUE-1-${id}`,
                  tokenId: id,
                  farmerName: f?.name,
                  crop: f?.crop,
                  title: pos1Title,
                  message: pos1Msg,
                });
              }
              speakAlert(pos1Msg);
            }
          }
          // Positions 4, 3, 2 deliberately have no notification logic (silent transitions)
        }

        // Store latest snapshot for this token
        prevDataRef.current[id] = {
          position: newPos,
          status: newStatus,
        };
      } catch (err) {
        setError(err.message);
        setData(null);
      }
    },
    [t, tCentre, speakAlert, onAddNotification]
  );

  const farmerIdentifier = farmerUser?.identifier || farmerUser?.phone || farmerUser?.email;

  const performCheckIn = useCallback(
    async (tokenId, isAuto = false) => {
      if (!tokenId || checkingIn) return;
      if (isAuto && autoCheckInAttemptedRef.current[tokenId]) return;
      autoCheckInAttemptedRef.current[tokenId] = true;

      setCheckingIn(true);
      try {
        await api.checkInFarmerToken(tokenId);
        await lookup(tokenId);

        if (farmerIdentifier) {
          api.getFarmersByIdentifier(farmerIdentifier).then(setTokens).catch(() => {});
        }

        const centreName = data?.centre?.name || "the centre";
        const successMsg = t("checkin_success_notify").replace("{centre}", centreName);

        if (onAddNotification) {
          onAddNotification({
            tokenId,
            title: t("notify_live_alert_title"),
            message: successMsg,
          });
        }
        speakAlert(successMsg);
      } catch (err) {
        console.error("Check-in failed:", err.message);
      } finally {
        setCheckingIn(false);
      }
    },
    [checkingIn, lookup, farmerIdentifier, data?.centre?.name, t, onAddNotification, speakAlert]
  );

  // Periodic Geolocation Check (~30s) when farmer has an active token in queue and is not yet checked in
  useEffect(() => {
    const isQueueActive = data?.farmer?.status === "in_queue";
    const isAlreadyCheckedIn = data?.farmer?.checkedIn;
    const centre = data?.centre;

    if (!isQueueActive || isAlreadyCheckedIn || !centre?.lat || !centre?.lng) {
      return;
    }

    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocStatus("unsupported");
      return;
    }

    function checkPosition() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocStatus("granted");
          const dist = getDistanceMeters(
            pos.coords.latitude,
            pos.coords.longitude,
            centre.lat,
            centre.lng
          );
          setUserDistanceMeters(dist);

          if (dist !== null && dist <= GEOFENCE_RADIUS_METERS && !data?.farmer?.checkedIn) {
            performCheckIn(data.farmer.id, true);
          }
        },
        (err) => {
          if (err.code === 1) {
            setLocStatus("denied");
          } else {
            setLocStatus("error");
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      );
    }

    checkPosition();
    const geoInterval = setInterval(checkPosition, 30000);
    return () => clearInterval(geoInterval);
  }, [
    data?.farmer?.id,
    data?.farmer?.status,
    data?.farmer?.checkedIn,
    data?.centre?.lat,
    data?.centre?.lng,
    performCheckIn,
  ]);

  const loadMyTokens = useCallback(async () => {
    if (!farmerIdentifier) return;
    setTokensLoading(true);
    try {
      const list = await api.getFarmersByIdentifier(farmerIdentifier);
      setTokens(list || []);

      // Check all booked tokens for any admin cancellations to ensure bell notification is populated
      if (list && list.length > 0) {
        list.forEach((tItem) => {
          if (tItem.status === "cancelled" && tItem.cancellationReason) {
            const tKey = `cancelled-${tItem.id}-${tItem.cancellationReason}`;
            if (!notifiedCancellationRef.current.has(tKey)) {
              notifiedCancellationRef.current.add(tKey);
              const centreName =
                tCentre(tItem.centreId || tItem.centreName) ||
                tItem.centreName ||
                "the centre";
              const cancelMsg = t("notify_status_admin_cancelled_msg")
                .replace("{reason}", tItem.cancellationReason)
                .replace("{centre}", centreName)
                .replace("{date}", tItem.slotDate || "today")
                .replace("{time}", tItem.slotTime || "booked slot");

              if (onAddNotification) {
                onAddNotification({
                  tokenId: tItem.id,
                  title: t("notify_live_alert_title"),
                  message: cancelMsg,
                });
              }
            }
          }
        });
      }

      const urlId = params.get("id");
      if (urlId) {
        setSelectedTokenId(urlId);
        lookup(urlId);
      } else if (list && list.length > 0 && !selectedTokenId) {
        const activeToken = list.find((t) => t.status !== "cancelled" && t.status !== "paid") || list[0];
        setSelectedTokenId(activeToken.id);
        lookup(activeToken.id);
      }
    } catch {
      // Fallback silently if tokens list fails
    } finally {
      setTokensLoading(false);
    }
  }, [farmerIdentifier, params, lookup, selectedTokenId, t, tCentre, onAddNotification]);

  useEffect(() => {
    loadMyTokens();
  }, [loadMyTokens]);

  useEffect(() => {
    const id = params.get("id");
    if (id) {
      setSelectedTokenId(id);
      lookup(id);
    }
  }, [params, lookup]);

  // Poll every 8s for a "live" feel once a token is loaded
  useEffect(() => {
    if (!data?.farmer?.id || data.farmer.status === "cancelled" || data.farmer.status === "paid") return;
    const interval = setInterval(() => {
      lookup(data.farmer.id);
      if (farmerIdentifier) {
        api.getFarmersByIdentifier(farmerIdentifier).then(setTokens).catch(() => {});
        api.getSwapRequests(farmerIdentifier).then(setSwapRequests).catch(() => {});
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [data?.farmer?.id, data?.farmer?.status, lookup, farmerIdentifier]);

  // Load permanent procurement history on mount / user change
  const loadHistory = useCallback(async () => {
    if (!farmerIdentifier) return;
    setLoadingHistory(true);
    try {
      const records = await api.getFarmerProcurementHistory(farmerIdentifier);
      setProcurementHistory(records || []);
    } catch {
      setProcurementHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [farmerIdentifier]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Load swap requests on mount / user change
  useEffect(() => {
    if (farmerIdentifier) {
      api.getSwapRequests(farmerIdentifier).then(setSwapRequests).catch(() => {});
    }
  }, [farmerIdentifier]);

  async function handleCancel() {
    if (!data?.farmer?.id) return;
    const confirmed = window.confirm(t("status_cancel_confirm"));
    if (!confirmed) return;

    setCancelling(true);
    setError("");
    try {
      await api.cancelFarmerToken(data.farmer.id);
      await lookup(data.farmer.id);
      if (farmerIdentifier) {
        const list = await api.getFarmersByIdentifier(farmerIdentifier);
        setTokens(list || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    if (showRescheduleModal && data?.farmer?.centreId && rescheduleSlot.newSlotDate) {
      setLoadingRescheduleAvailability(true);
      api
        .getCentreSlotAvailability(data.farmer.centreId, rescheduleSlot.newSlotDate)
        .then((res) => {
          const slots = res?.slots || [];
          setRescheduleAvailability(slots);
          if (res?.earliestBookableDate) {
            setRescheduleEarliestDate(res.earliestBookableDate);
            if (rescheduleSlot.newSlotDate < res.earliestBookableDate) {
              setRescheduleSlot((s) => ({ ...s, newSlotDate: res.earliestBookableDate }));
            }
          }
          const cur = slots.find((s) => s.slotTime === rescheduleSlot.newSlotTime);
          if (!cur || cur.isFull || cur.isPast) {
            const firstAvail = slots.find((s) => !s.isFull && !s.isPast);
            if (firstAvail) {
              setRescheduleSlot((s) => ({ ...s, newSlotTime: firstAvail.slotTime }));
            }
          }
        })
        .catch(() => {
          setRescheduleAvailability([]);
        })
        .finally(() => {
          setLoadingRescheduleAvailability(false);
        });
    } else {
      setRescheduleAvailability([]);
    }
  }, [showRescheduleModal, data?.farmer?.centreId, rescheduleSlot.newSlotDate]);

  function handleReschedule() {
    if (!data?.farmer?.id) return;
    const initialDate = data.farmer.slotDate && data.farmer.slotDate >= todayStr ? data.farmer.slotDate : todayStr;
    setRescheduleSlot({
      newSlotDate: initialDate,
      newSlotTime: data.farmer.slotTime || "",
    });
    setShowRescheduleModal(true);
  }

  async function confirmRescheduleSubmit(e) {
    if (e) e.preventDefault();
    if (!data?.farmer?.id) return;

    setRescheduling(true);
    setError("");
    try {
      await api.rescheduleFarmerToken(data.farmer.id, {
        newSlotDate: rescheduleSlot.newSlotDate,
        newSlotTime: rescheduleSlot.newSlotTime,
      });
      await lookup(data.farmer.id);
      if (farmerIdentifier) {
        const list = await api.getFarmersByIdentifier(farmerIdentifier);
        setTokens(list || []);
      }
      setShowRescheduleModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setRescheduling(false);
    }
  }

  function handleManualLookup(e) {
    if (e) e.preventDefault();
    const cleanId = manualTokenInput.trim().toUpperCase();
    if (!cleanId) return;
    setSelectedTokenId(cleanId);
    lookup(cleanId);
  }

  async function handleOpenSwapModal() {
    if (!data?.farmer?.id || !data?.farmer?.centreId) return;
    setShowSwapModal(true);
    setLoadingSwapPartners(true);
    setSelectedPartnerId("");
    setSwapSuccessMsg("");
    try {
      const res = await api.getAvailableSwapPartners({
        centreId: data.farmer.centreId,
        excludeTokenId: data.farmer.id,
      });
      setSwapPartners(res?.partners || []);
    } catch {
      setSwapPartners([]);
    } finally {
      setLoadingSwapPartners(false);
    }
  }

  async function handleSendSwapRequest(e) {
    if (e) e.preventDefault();
    if (!data?.farmer?.id || !selectedPartnerId) return;
    setSwapping(true);
    setError("");
    try {
      await api.createSwapRequest({
        senderTokenId: data.farmer.id,
        receiverTokenId: selectedPartnerId,
      });
      setSwapSuccessMsg("Swap request sent successfully! The other farmer has been notified.");
      if (farmerIdentifier) {
        const updatedReqs = await api.getSwapRequests(farmerIdentifier);
        setSwapRequests(updatedReqs || { incoming: [], outgoing: [] });
      }
      setTimeout(() => {
        setShowSwapModal(false);
        setSwapSuccessMsg("");
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSwapping(false);
    }
  }

  async function handleAcceptSwap(swapReqId) {
    setRespondingSwapId(swapReqId);
    setError("");
    try {
      const res = await api.respondSwapRequest(swapReqId, "accept", farmerIdentifier);
      if (farmerIdentifier) {
        const updatedTokens = await api.getFarmersByIdentifier(farmerIdentifier);
        setTokens(updatedTokens || []);
        const updatedReqs = await api.getSwapRequests(farmerIdentifier);
        setSwapRequests(updatedReqs || { incoming: [], outgoing: [] });
      }

      // Check Status for the newly swapped token
      const newTokenId = res.receiverFarmer?.id || res.senderFarmer?.id || res.swapRequest?.senderTokenId;
      if (newTokenId) {
        setSelectedTokenId(newTokenId);
        await lookup(newTokenId);
      } else if (data?.farmer?.id) {
        await lookup(data.farmer.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRespondingSwapId(null);
    }
  }

  async function handleDeclineSwap(swapReqId) {
    setRespondingSwapId(swapReqId);
    setError("");
    try {
      await api.respondSwapRequest(swapReqId, "decline", farmerIdentifier);
      if (farmerIdentifier) {
        const updatedReqs = await api.getSwapRequests(farmerIdentifier);
        setSwapRequests(updatedReqs || { incoming: [], outgoing: [] });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRespondingSwapId(null);
    }
  }

  const isCancelled = data?.farmer?.status === "cancelled";
  const canReschedule =
    data?.farmer?.status === "in_queue" ||
    (data?.farmer?.status === "cancelled" && data?.farmer?.cancellationReason);
  const canCancel =
    data?.farmer?.status === "in_queue" || data?.farmer?.status === "quality_check";
  const canSwap =
    data?.farmer?.status === "in_queue" && Boolean(data?.farmer?.slotDate && data?.farmer?.slotTime);
  const activeIndex = data ? STAGES.findIndex((s) => s.key === data.farmer.status) : -1;
  const incomingPendingSwaps = (swapRequests?.incoming || []).filter((r) => r.status === "pending");

  return (
    <div className="card" style={{ maxWidth: 580 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20 }}>{t("status_title")}</h2>
        <button
          type="button"
          onClick={() => {
            if (voiceAlertEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
              window.speechSynthesis.cancel();
            }
            setVoiceAlertEnabled((v) => !v);
          }}
          title={voiceAlertEnabled ? t("notify_voice_on") : t("notify_voice_off")}
          style={{
            background: voiceAlertEnabled ? "rgba(31, 61, 43, 0.08)" : "transparent",
            border: "1px solid var(--line)",
            color: voiceAlertEnabled ? "var(--field)" : "#8A8368",
            borderRadius: 20,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <span>{voiceAlertEnabled ? "🔊" : "🔇"}</span>
          <span>{voiceAlertEnabled ? t("notify_voice_on") : t("notify_voice_off")}</span>
        </button>
      </div>

      {/* View Switcher: Active Tokens vs Permanent Procurement History */}
      <div
        style={{
          display: "flex",
          gap: 10,
          borderBottom: "2px solid var(--line)",
          paddingBottom: 6,
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          onClick={() => setViewTab("active")}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: viewTab === "active" ? 700 : 500,
            color: viewTab === "active" ? "var(--field)" : "#8A8368",
            borderBottom: viewTab === "active" ? "2.5px solid var(--field)" : "2.5px solid transparent",
            padding: "6px 12px",
            cursor: "pointer",
            marginBottom: -8,
            transition: "all 0.15s ease",
          }}
        >
          🎫 {t("tab_active_tokens")}
          {tokens.filter((t) => t.status !== "paid" && t.status !== "cancelled").length > 0 && (
            <span
              style={{
                fontSize: 11,
                background: "var(--wheat)",
                color: "#78350F",
                padding: "1px 6px",
                borderRadius: 10,
                marginLeft: 5,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
              }}
            >
              {tokens.filter((t) => t.status !== "paid" && t.status !== "cancelled").length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setViewTab("history");
            loadHistory();
          }}
          style={{
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: viewTab === "history" ? 700 : 500,
            color: viewTab === "history" ? "var(--field)" : "#8A8368",
            borderBottom: viewTab === "history" ? "2.5px solid var(--field)" : "2.5px solid transparent",
            padding: "6px 12px",
            cursor: "pointer",
            marginBottom: -8,
            transition: "all 0.15s ease",
          }}
        >
          📜 {t("tab_procurement_history")}
          {procurementHistory.length > 0 && (
            <span
              style={{
                fontSize: 11,
                background: "var(--field)",
                color: "#fff",
                padding: "1px 6px",
                borderRadius: 10,
                marginLeft: 5,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
              }}
            >
              {procurementHistory.length}
            </span>
          )}
        </button>
      </div>

      {viewTab === "history" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, margin: 0, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
              <span>📜</span>
              <span>{t("history_title")}</span>
            </h3>
            <p style={{ fontSize: 12, color: "#6A6553", margin: "3px 0 0 0" }}>
              {t("history_subtitle")}
            </p>
          </div>

          {loadingHistory ? (
            <div style={{ textAlign: "center", padding: "30px 16px", color: "#8A8368", fontSize: 13 }}>
              Loading official procurement records...
            </div>
          ) : procurementHistory.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "36px 16px",
                background: "rgba(35, 41, 31, 0.02)",
                borderRadius: 8,
                border: "1px dashed var(--line)",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>🌾</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
                {t("history_empty")}
              </div>
              <p style={{ fontSize: 12, color: "#6A6553", margin: 0 }}>
                Once your produce is procured and marked paid at the centre, an official permanent point-in-time record will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {procurementHistory.map((rec) => {
                const pDate = rec.paymentDate ? rec.paymentDate.split("T")[0] : "—";
                const qty = rec.quantity || {};
                const rate = rec.finalRatePerQuintal || (rec.finalRatePerKg ? rec.finalRatePerKg * 100 : 0);

                return (
                  <div
                    key={rec.id}
                    style={{
                      background: "#fff",
                      border: "1.5px solid var(--field)",
                      borderRadius: 8,
                      padding: "14px 16px",
                      boxShadow: "0 2px 8px rgba(31, 61, 43, 0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 15, color: "var(--field)" }}>
                            {rec.tokenId}
                          </span>
                          <span className="status-pill paid" style={{ fontSize: 11, padding: "2px 8px" }}>
                            ✓ {t("receipt_status_paid")}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 3 }}>
                          {tCrop(rec.crop)} · <span style={{ color: "var(--field)" }}>{rec.variety || "Common"}</span>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--field)" }}>
                          ₹{(rec.totalAmountPaid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 11, color: "#8A8368", marginTop: 2 }}>
                          📅 {pDate}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: 8,
                        background: "rgba(31, 61, 43, 0.04)",
                        borderRadius: 6,
                        padding: "10px 12px",
                        fontSize: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ color: "#6A6553", fontSize: 11 }}>{t("history_qty")}</div>
                        <div style={{ fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>
                          {qty.kg ? `${qty.kg.toLocaleString("en-IN")} KG` : "—"} ({qty.quintal || (qty.kg / 100)} Qtl)
                        </div>
                      </div>

                      <div>
                        <div style={{ color: "#6A6553", fontSize: 11 }}>{t("history_rate")}</div>
                        <div style={{ fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>
                          ₹{rate.toFixed(2)}/Qtl
                        </div>
                      </div>

                      <div>
                        <div style={{ color: "#6A6553", fontSize: 11 }}>{t("receipt_centre_label")}</div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>
                          {tCentre(rec.centreName || rec.centreId)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: 12, padding: "5px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
                        onClick={() => setSelectedHistorySnapshot(rec)}
                      >
                        🧾 {t("history_view_receipt")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewTab === "active" && (
        <>
      {tokensLoading && (
        <div style={{ color: "#8A8368", fontSize: 14, marginBottom: 16 }}>
          {t("status_loading_tokens")}
        </div>
      )}

      {!tokensLoading && tokens.length === 0 && !data && (
        <div style={{ textAlign: "center", padding: "28px 16px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
            {t("status_empty_title")}
          </div>
          <p style={{ color: "#4A4636", fontSize: 14, marginBottom: 18 }}>
            {t("status_empty_sub")}
          </p>
          <Link to="/" className="btn">
            {t("status_empty_btn")}
          </Link>
        </div>
      )}

      {/* Incoming Slot Swap Requests Banner */}
      {incomingPendingSwaps.length > 0 && (
        <div
          style={{
            background: "rgba(201, 138, 43, 0.12)",
            border: "1.5px solid var(--wheat)",
            borderRadius: 8,
            padding: "14px 16px",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 10 }}>
            <span>🔀</span>
            <span>{t("status_incoming_swap_title")} ({incomingPendingSwaps.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incomingPendingSwaps.map((req) => (
              <div
                key={req.id}
                style={{
                  background: "#fff",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>
                  <strong>{req.senderName}</strong> (Token <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{req.senderTokenId}</span>) requested to swap slots with your token <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{req.receiverTokenId}</span>.
                </div>
                <div style={{ fontSize: 12, color: "#4A4636", marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div>
                    🌾 Offered Slot: <strong style={{ color: "var(--field)" }}>📅 {req.senderSlotDate} · ⏰ {req.senderSlotTime}</strong>
                  </div>
                  <div>
                    ⏳ Your Current Slot: <strong>📅 {req.receiverSlotDate} · ⏰ {req.receiverSlotTime}</strong>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={respondingSwapId === req.id}
                    onClick={() => handleAcceptSwap(req.id)}
                    style={{ fontSize: 12, padding: "6px 14px" }}
                  >
                    {respondingSwapId === req.id ? "Processing..." : `✓ ${t("status_swap_accept_btn")}`}
                  </button>
                  <button
                    type="button"
                    className="btn secondary danger"
                    disabled={respondingSwapId === req.id}
                    onClick={() => handleDeclineSwap(req.id)}
                    style={{ fontSize: 12, padding: "6px 14px" }}
                  >
                    {respondingSwapId === req.id ? "Processing..." : `✕ ${t("status_swap_decline_btn")}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#4A4636", marginBottom: 8 }}>
            {t("status_booked_tokens_header")} ({tokens.length}) — {t("status_inspect_hint")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tokens.map((tItem) => {
              const isSelected = selectedTokenId === tItem.id;
              const stageKey = `stage_${tItem.status}`;
              const displayStatus = t(stageKey) || tItem.status.replace("_", " ");
              return (
                <div
                  key={tItem.id}
                  onClick={() => {
                    setSelectedTokenId(tItem.id);
                    lookup(tItem.id);
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    borderRadius: 6,
                    border: isSelected ? "2px solid var(--field)" : "1px solid var(--line)",
                    background: isSelected ? "rgba(31, 61, 43, 0.05)" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15 }}>
                        {tItem.id}
                      </span>
                      {tItem.farmerId && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--field)",
                            background: "rgba(31, 61, 43, 0.08)",
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}
                        >
                          {tItem.farmerId}
                        </span>
                      )}
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {tCrop(tItem.crop)} {tItem.variety ? `(${tItem.variety})` : ""}
                      </span>
                      {tItem.verifiedQuantity !== null && tItem.verifiedQuantity !== undefined ? (
                        <span style={{ fontSize: 13, fontWeight: 700, color: (tItem.declaredQuantityKg && Math.abs(tItem.declaredQuantityKg - tItem.verifiedQuantityKg) > 0.01) ? "#B45309" : "var(--field)" }}>
                          · {tItem.verifiedQuantity} {tItem.verifiedUnit || tItem.declaredUnit || "bags"} verified
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: "#4A4636" }}>
                          · {tItem.declaredQuantity || tItem.quantityKg} {tItem.declaredUnit || "kg"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#8A8368", marginTop: 2, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span>{tItem.crowdStatus === "high" ? "🔴" : tItem.crowdStatus === "medium" ? "🟡" : "🟢"}</span>
                      <span>{tCentre(tItem.centreName || tItem.centreId)} {tItem.district ? `(${tDistrict(tItem.district)})` : ""}</span>
                      {tItem.rescheduledCount > 0 && (
                        <span style={{ color: "#B45309", fontWeight: 600 }}>· {t("status_rescheduled_note")} {tItem.rescheduledCount}x</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--field)", marginTop: 3, fontWeight: 600 }}>
                      📅 {tItem.slotDate || todayStr} · ⏰ {tItem.slotTime || "—"}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`status-pill ${tItem.status === "paid" ? "paid" : ""} ${
                        tItem.status === "cancelled" ? "cancelled" : ""
                      }`}
                    >
                      {displayStatus}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Registration Success Banner */}
      {params.get("new") === "1" && (data?.farmer?.farmerId || params.get("fid")) && (
        <div
          className="registration-success-banner"
          style={{
            background: "linear-gradient(135deg, rgba(31, 61, 43, 0.12) 0%, rgba(31, 61, 43, 0.04) 100%)",
            border: "2px solid var(--field)",
            borderRadius: 8,
            padding: "16px 20px",
            marginBottom: 20,
            textAlign: "center",
            boxShadow: "0 4px 16px rgba(31, 61, 43, 0.12)",
          }}
        >
          <div style={{ fontSize: 26, marginBottom: 4 }}>🎉</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--field)", marginBottom: 4 }}>
            {lang === "ta"
              ? `பதிவு வெற்றிகரமாக முடிந்தது - விவசாயி ஐடி: ${data?.farmer?.farmerId || params.get("fid")}`
              : `Registration Successful - Farmer ID: ${data?.farmer?.farmerId || params.get("fid")}`}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>
            Token: <strong>{data?.farmer?.id || selectedTokenId}</strong> · {t("status_inspect_hint")}
          </div>
        </div>
      )}

      {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

      {data && (
        <>
          <div className="token-stub" style={{ marginTop: 10 }}>
            <div className="token-id">{data.farmer.id}</div>
            {data.farmer.farmerId && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--field)",
                  background: "rgba(31, 61, 43, 0.08)",
                  border: "1px solid rgba(31, 61, 43, 0.2)",
                  borderRadius: 20,
                  padding: "3px 12px",
                  display: "inline-block",
                  marginTop: 4,
                  marginBottom: 6,
                  letterSpacing: 0.5,
                }}
              >
                Farmer ID: {data.farmer.farmerId}
              </div>
            )}
            <div className="token-meta">
              {data.farmer.name} · {tCrop(data.farmer.crop)} {data.farmer.variety ? `(${data.farmer.variety})` : ""} ·{" "}
              {data.farmer.verifiedQuantity !== null && data.farmer.verifiedQuantity !== undefined
                ? `${data.farmer.verifiedQuantity} ${data.farmer.verifiedUnit || data.farmer.declaredUnit || "bags"} verified (${data.farmer.verifiedQuantityKg || data.farmer.quantityKg} kg)`
                : `${data.farmer.declaredQuantity || data.farmer.quantityKg} ${data.farmer.declaredUnit || "kg"}`}
            </div>

            {/* Booked Date & Time Slot */}
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "var(--field)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                flexWrap: "wrap",
                background: "rgba(31, 61, 43, 0.05)",
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(31, 61, 43, 0.1)",
              }}
            >
              <span>📅 {t("status_slot_date_label")}: <strong>{data.farmer.slotDate || todayStr}</strong></span>
              <span>·</span>
              <span>⏰ {t("status_slot_time_label")}: <strong>{data.farmer.slotTime || "—"}</strong></span>
            </div>

            {data.farmer.rescheduledCount > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#B45309", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <span>🕒 {t("status_rescheduled_note")} {data.farmer.rescheduledCount}x</span>
              </div>
            )}
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13 }}>
              <span style={{ color: "#4A4636", fontWeight: 500 }}>{tCentre(data.farmer.centreId)}</span>
              <span className={`status-pill crowd-${data.crowdStatus || "low"}`}>
                {data.crowdStatus === "high" ? "🔴" : data.crowdStatus === "medium" ? "🟡" : "🟢"} {t(`crowd_${data.crowdStatus || "low"}`)}
              </span>
            </div>
          </div>

          {isCancelled ? (
            data.farmer.cancellationReason ? (
              /* Distinct Admin Cancellation Card with prominent reason & Reschedule CTA */
              <div
                style={{
                  background: "rgba(162, 59, 46, 0.08)",
                  border: "1.5px solid var(--danger)",
                  borderRadius: 8,
                  padding: "18px 20px",
                  marginTop: 16,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 4 }}>⚠️</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--danger)", marginBottom: 4 }}>
                  {t("status_admin_cancelled_title")}
                </div>
                <div style={{ fontSize: 13, color: "#4A4636", marginBottom: 12, lineHeight: 1.4 }}>
                  {t("status_admin_cancelled_sub")}
                </div>

                <div
                  style={{
                    background: "#fff",
                    border: "1px dashed var(--danger)",
                    borderRadius: 6,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "var(--ink)",
                    marginBottom: 16,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontWeight: 700, color: "var(--danger)", display: "block", fontSize: 11, textTransform: "uppercase", marginBottom: 2 }}>
                    {t("status_cancellation_reason_label")}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#23291F" }}>
                    "{data.farmer.cancellationReason}"
                  </span>
                </div>

                <button
                  type="button"
                  className="btn"
                  onClick={handleReschedule}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "0 auto" }}
                >
                  🔄 {t("status_reschedule_cta")}
                </button>
              </div>
            ) : (
              <div className="cancelled-banner">
                <div style={{ fontWeight: 600, fontSize: 16 }}>{t("status_token_cancelled_title")}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {t("status_token_cancelled_sub")}
                </div>
              </div>
            )
          ) : (
            <>
              <div className="pipeline">
                {STAGES.map((s, i) => (
                  <div key={s.key} className={`pipeline-step ${i <= activeIndex ? "active" : ""}`}>
                    <div className="dot" />
                    {t(s.labelKey)}
                  </div>
                ))}
              </div>

              {data.queuePosition && (
                <div className="wait-banner">
                  {t("status_wait_pos")} <strong>{data.queuePosition}</strong> {t("status_wait_of")} {data.queueLength} ·{" "}
                  {t("status_wait_est")} <strong>~{data.estimatedWaitMinutes} {t("status_wait_min")}</strong>
                  <div style={{ fontSize: 12, marginTop: 6, color: "#4A4636" }}>
                    {t("status_wait_sub")}
                  </div>
                </div>
              )}

              {/* Geofenced Arrival Auto Check-In Indicator & Manual Fallback */}
              {data.farmer.status === "in_queue" && (
                <div
                  style={{
                    background: data.farmer.checkedIn
                      ? "rgba(31, 61, 43, 0.08)"
                      : "rgba(201, 138, 43, 0.08)",
                    border: `1px solid ${data.farmer.checkedIn ? "var(--field)" : "var(--wheat)"}`,
                    borderRadius: 8,
                    padding: "12px 16px",
                    marginTop: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
                      {data.farmer.checkedIn
                        ? t("checkin_badge_checked_in")
                        : userDistanceMeters !== null
                        ? t("checkin_badge_distance").replace("{distance}", formatDistance(userDistanceMeters, lang))
                        : t("checkin_badge_not_near")}
                    </div>
                    {!data.farmer.checkedIn && (
                      <div style={{ fontSize: 11, color: "#8A8368", marginTop: 2 }}>
                        {locStatus === "denied"
                          ? t("checkin_loc_denied")
                          : `Auto check-in within ${GEOFENCE_RADIUS_METERS}m of ${data.centre?.name || "centre"}`}
                      </div>
                    )}
                  </div>

                  {!data.farmer.checkedIn && (
                    <button
                      type="button"
                      className="btn"
                      disabled={checkingIn}
                      onClick={() => performCheckIn(data.farmer.id, false)}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        background: "var(--field)",
                        color: "var(--paper)",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      {checkingIn ? t("checkin_manual_loading") : t("checkin_manual_btn")}
                    </button>
                  )}
                </div>
              )}

              {(canReschedule || canCancel || canSwap) && (
                <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  {canSwap && (
                    <button
                      className="btn secondary"
                      onClick={handleOpenSwapModal}
                      disabled={swapping || rescheduling || cancelling}
                      style={{ borderColor: "var(--wheat)", color: "#8C590E", background: "rgba(201, 138, 43, 0.08)" }}
                    >
                      🔀 {t("status_swap_btn")}
                    </button>
                  )}
                  {canReschedule && (
                    <button
                      className="btn secondary"
                      onClick={handleReschedule}
                      disabled={rescheduling || cancelling || swapping}
                    >
                      {rescheduling ? t("status_reschedule_btn_loading") : t("status_reschedule_btn")}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className="btn secondary danger"
                      onClick={handleCancel}
                      disabled={cancelling || rescheduling || swapping}
                    >
                      {cancelling ? t("status_cancel_btn_loading") : t("status_cancel_btn")}
                    </button>
                  )}
                </div>
              )}

              {/* Payment Receipt Card when Status is Paid */}
              {data.farmer.status === "paid" && (() => {
                const receipt = data.farmer.receipt || {};
                const isReleased = receipt.receiptStatus === "released";

                if (!isReleased) {
                  return (
                    <div
                      className="receipt-stub"
                      id="payment-receipt-preparing"
                      style={{
                        background: "linear-gradient(135deg, rgba(245, 240, 225, 0.6) 0%, rgba(255, 255, 255, 0.95) 100%)",
                        border: "1.5px dashed var(--accent, #D97706)",
                        padding: "24px 20px",
                        textAlign: "center",
                        borderRadius: 14,
                        marginTop: 16,
                      }}
                    >
                      <div style={{ fontSize: 36, marginBottom: 8 }}>⏳</div>
                      <div
                        style={{
                          fontSize: 17,
                          fontWeight: 700,
                          color: "var(--ink)",
                          marginBottom: 6,
                        }}
                      >
                        {t("receipt_being_prepared_title") || "Payment Completed — Receipt in Preparation"}
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          color: "#6A6553",
                          maxWidth: 440,
                          margin: "0 auto 16px",
                          lineHeight: 1.5,
                        }}
                      >
                        {t("receipt_being_prepared_sub") ||
                          "Your payment has been successfully processed. The procurement centre admin is reviewing and finalizing your official receipt voucher. You will receive an SMS and in-app notification the moment it is released."}
                      </p>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "rgba(217, 119, 6, 0.12)",
                          color: "#B45309",
                          border: "1px solid rgba(217, 119, 6, 0.3)",
                          padding: "6px 14px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <span>ℹ️</span>
                        <span>{t("receipt_status_pending_release") || "Receipt Status: Pending Admin Release"}</span>
                      </div>
                    </div>
                  );
                }

                const crop = receipt.crop || data.farmer.crop || "Paddy";
                const bagWeight = (crop === "Paddy" || crop === "Groundnut") ? 40 : 50;

                const hasDiscrepancy = receipt.hasDiscrepancy ||
                  (receipt.declaredQuantityKg && receipt.verifiedQuantityKg && Math.abs(receipt.declaredQuantityKg - receipt.verifiedQuantityKg) > 0.01) ||
                  (data.farmer.declaredQuantityKg && data.farmer.verifiedQuantityKg && Math.abs(data.farmer.declaredQuantityKg - data.farmer.verifiedQuantityKg) > 0.01);

                const finalKg = receipt.quantityKg || receipt.verifiedQuantityKg || data.farmer.verifiedQuantityKg || data.farmer.quantityKg || 0;
                const finalQuintals = (finalKg / 100).toFixed(2);
                const finalBags = Math.round((finalKg / bagWeight) * 10) / 10;

                const declaredKg = receipt.declaredQuantityKg || data.farmer.declaredQuantityKg || finalKg;
                const declaredQuintals = (declaredKg / 100).toFixed(2);
                const declaredBags = receipt.declaredQuantity || Math.round((declaredKg / bagWeight) * 10) / 10;
                const declaredUnit = receipt.declaredUnit || data.farmer.declaredUnit || "bags";

                const verifiedVal = receipt.verifiedQuantity || data.farmer.verifiedQuantity || finalBags;
                const verifiedUnit = receipt.verifiedUnit || data.farmer.verifiedUnit || declaredUnit;

                const rateKg = Number(receipt.ratePerKg || (crop === "Wheat" ? 25.85 : crop === "Pulses" ? 80.00 : crop === "Groundnut" ? 67.83 : crop === "Cotton" ? 77.10 : crop === "Maize" ? 24.00 : 23.69));
                const rateQtl = Number(receipt.ratePerQuintal || (rateKg * 100));

                const totalAmount = receipt.totalAmount || Math.round(finalKg * rateKg * 100) / 100;

                return (
                  <div className="receipt-stub" id="payment-receipt-stub">
                    <div className="receipt-header">
                      <div>
                        <div className="receipt-title">🧾 {t("receipt_title")}</div>
                        <div className="receipt-sub">{t("receipt_subtitle")}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span className="status-pill paid" style={{ fontSize: 12, padding: "4px 10px" }}>
                          ✓ {t("receipt_status_paid")}
                        </span>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#6A6553", marginTop: 4 }}>
                          {receipt.receiptId || `RCPT-${data.farmer.id}`}
                        </div>
                      </div>
                    </div>

                    <div className="receipt-grid">
                      <div className="receipt-item">
                        <span className="receipt-item-label">{t("receipt_token_label")}</span>
                        <span className="receipt-item-val" style={{ fontFamily: "var(--font-mono)" }}>
                          {data.farmer.id}
                        </span>
                      </div>
                      <div className="receipt-item">
                        <span className="receipt-item-label">{t("receipt_farmer_label")}</span>
                        <span className="receipt-item-val">
                          {receipt.farmerName || data.farmer.name}
                        </span>
                      </div>

                      <div className="receipt-item">
                        <span className="receipt-item-label">{t("receipt_crop_label")}</span>
                        <span className="receipt-item-val">
                          {tCrop(crop)} {receipt.variety || data.farmer.variety ? `(${receipt.variety || data.farmer.variety})` : ""}
                        </span>
                      </div>

                      <div className="receipt-item">
                        <span className="receipt-item-label">{t("receipt_date_label")}</span>
                        <span className="receipt-item-val">
                          {receipt.date || new Date().toISOString().split("T")[0]}
                        </span>
                      </div>

                      {hasDiscrepancy ? (
                        <>
                          <div className="receipt-item" style={{ background: "rgba(35, 41, 31, 0.03)", padding: "8px 10px", borderRadius: 6 }}>
                            <span className="receipt-item-label">{t("receipt_declared_qty_label") || "Declared at Booking"}</span>
                            <span className="receipt-item-val" style={{ color: "#6B7280" }}>
                              {declaredBags} {declaredUnit} ({declaredKg.toLocaleString("en-IN")} KG / {declaredQuintals} Qtl)
                            </span>
                          </div>

                          <div className="receipt-item" style={{ background: "rgba(31, 61, 43, 0.07)", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(31, 61, 43, 0.15)" }}>
                            <span className="receipt-item-label" style={{ color: "var(--field)", fontWeight: 700 }}>
                              ✓ {t("receipt_verified_qty_label") || "Verified at Centre"}
                            </span>
                            <span className="receipt-item-val" style={{ color: "var(--field)", fontWeight: 800 }}>
                              {verifiedVal} {verifiedUnit} ({finalKg.toLocaleString("en-IN")} KG / {finalQuintals} Qtl)
                            </span>
                          </div>

                          {(receipt.adjustmentReason || data.farmer.adjustmentReason || receipt.discrepancyReason || data.farmer.quantityDiscrepancyReason) && (
                            <div className="receipt-item" style={{ gridColumn: "1 / -1", background: "rgba(201, 138, 43, 0.08)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(201, 138, 43, 0.25)" }}>
                              <span className="receipt-item-label" style={{ color: "#B45309", fontWeight: 700 }}>
                                ℹ️ Note: Verified quantity adjusted from Declared Quantity — Reason:
                              </span>
                              <span className="receipt-item-val" style={{ color: "#78350F", fontWeight: 600 }}>
                                {receipt.adjustmentReason || data.farmer.adjustmentReason || receipt.discrepancyReason || data.farmer.quantityDiscrepancyReason}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="receipt-item">
                          <span className="receipt-item-label">{t("receipt_quantity_label")}</span>
                          <span className="receipt-item-val">
                            {finalBags} {verifiedUnit} ({finalKg.toLocaleString("en-IN")} KG / {finalQuintals} Qtl)
                          </span>
                        </div>
                      )}

                      <div className="receipt-item">
                        <span className="receipt-item-label">{t("receipt_rate_label")}</span>
                        <span className="receipt-item-val">
                          ₹{rateKg.toFixed(2)} / kg (₹{rateQtl.toFixed(2)} / qtl)
                        </span>
                      </div>

                      <div className="receipt-item" style={{ gridColumn: "1 / -1" }}>
                        <span className="receipt-item-label">{t("receipt_centre_label")}</span>
                        <span className="receipt-item-val">
                          {tCentre(receipt.centreName || data.centre?.name || data.farmer.centreId)}
                        </span>
                      </div>
                    </div>

                    <div className="receipt-total-box">
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--field)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {hasDiscrepancy ? "Final Payment (based on verified quantity)" : t("receipt_total_label")}
                        </div>
                        <div style={{ fontSize: 11, color: "#6A6553", marginTop: 2 }}>
                          {finalKg.toLocaleString("en-IN")} kg ({finalQuintals} Qtl) × ₹{rateKg.toFixed(2)}/kg
                        </div>
                      </div>
                      <div className="receipt-total-amount">
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                          minimumFractionDigits: 2,
                        }).format(totalAmount)}
                      </div>
                    </div>

                    <div className="receipt-footer-badge">
                      <span>🏛️</span>
                      <span>{t("receipt_gov_verified")}</span>
                    </div>

                    <div
                      className="receipt-process-completed"
                      style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: "1px dashed rgba(0, 0, 0, 0.15)",
                        fontSize: 12,
                        color: "#6A6553",
                        textAlign: "center",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                      }}
                    >
                      Process Completed: {formatReceiptDateTime(receipt.releasedAt || receipt.processCompletedAt || data.farmer.procuredAt || data.farmer.stageChangedAt)}
                    </div>

                    <div className="no-print" style={{ marginTop: 18, textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => window.print()}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 20px",
                          fontSize: 14,
                        }}
                      >
                        <span>📄</span>
                        <span>{t("receipt_download_btn")}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Automatic Live Centre Queue Display for this active token's centre */}
              {data.farmer.centreId && data.farmer.status !== "paid" && (
                <CentreQueueBoard
                  centreId={data.farmer.centreId}
                  myTokenId={data.farmer.id}
                />
              )}
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed var(--line)" }}>
        <button
          type="button"
          onClick={() => setShowManualLookup((s) => !s)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--field)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "underline",
          }}
        >
          {showManualLookup ? t("status_manual_toggle_hide") : t("status_manual_toggle_show")}
        </button>

        {showManualLookup && (
          <form onSubmit={handleManualLookup} className="field-row" style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <input
              placeholder={t("status_manual_placeholder")}
              value={manualTokenInput}
              onChange={(e) => setManualTokenInput(e.target.value)}
            />
            <button className="btn" type="submit">{t("status_manual_btn")}</button>
          </form>
        )}
      </div>
      </>
      )}

      {/* Point-in-Time History Snapshot Receipt Modal */}
      {selectedHistorySnapshot && (() => {
        const rec = selectedHistorySnapshot;
        const receipt = rec.receipt || {};
        const crop = rec.crop || "Paddy";
        const bagWeight = (crop === "Paddy" || crop === "Groundnut") ? 40 : 50;
        const finalKg = rec.quantity?.kg || 0;
        const finalQuintals = rec.quantity?.quintal || (finalKg / 100).toFixed(2);
        const rateKg = rec.finalRatePerKg || (crop === "Wheat" ? 25.85 : crop === "Pulses" ? 80.00 : crop === "Groundnut" ? 67.83 : crop === "Cotton" ? 77.10 : crop === "Maize" ? 24.00 : 23.69);
        const rateQtl = rec.finalRatePerQuintal || (rateKg * 100);
        const totalAmount = rec.totalAmountPaid || Math.round(finalKg * rateKg * 100) / 100;
        const pDate = rec.paymentDate ? rec.paymentDate.split("T")[0] : new Date().toISOString().split("T")[0];

        return (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: 16,
            }}
          >
            <div
              className="card"
              style={{
                maxWidth: 520,
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                margin: "0 auto",
                background: "#fff",
                borderRadius: 10,
                boxShadow: "0 20px 45px rgba(0, 0, 0, 0.32)",
                padding: "24px 26px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 18, margin: 0, color: "var(--field)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🧾</span>
                    <span>{t("history_receipt_modal_title")}</span>
                  </h3>
                  <p style={{ fontSize: 12, color: "#6A6553", margin: "2px 0 0 0" }}>
                    {t("history_subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistorySnapshot(null)}
                  style={{ background: "none", border: "none", fontSize: 18, color: "#8A8368", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              <div className="receipt-stub" style={{ margin: 0, boxShadow: "none" }}>
                <div className="receipt-header">
                  <div>
                    <div className="receipt-title">🧾 {t("receipt_title")}</div>
                    <div className="receipt-sub">{t("receipt_subtitle")}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="status-pill paid" style={{ fontSize: 12, padding: "3px 8px" }}>
                      ✓ {t("receipt_status_paid")}
                    </span>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#6A6553", marginTop: 4 }}>
                      {rec.receiptId || `RCPT-${rec.tokenId}`}
                    </div>
                  </div>
                </div>

                <div className="receipt-grid">
                  <div className="receipt-item">
                    <span className="receipt-item-label">{t("receipt_token_label")}</span>
                    <span className="receipt-item-val" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {rec.tokenId}
                    </span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">{t("receipt_farmer_label")}</span>
                    <span className="receipt-item-val">{rec.farmerName}</span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">{t("receipt_crop_label")}</span>
                    <span className="receipt-item-val">{tCrop(crop)} ({rec.variety || "Common"})</span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">{t("receipt_date_label")}</span>
                    <span className="receipt-item-val">{pDate}</span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">{t("receipt_verified_qty_label")}</span>
                    <span className="receipt-item-val" style={{ color: "var(--field)", fontWeight: 700 }}>
                      {finalKg.toLocaleString("en-IN")} KG ({finalQuintals} Qtl)
                    </span>
                  </div>
                  <div className="receipt-item">
                    <span className="receipt-item-label">{t("receipt_rate_label")}</span>
                    <span className="receipt-item-val">
                      ₹{rateKg.toFixed(2)}/kg (₹{rateQtl.toFixed(2)}/qtl)
                    </span>
                  </div>
                  <div className="receipt-item" style={{ gridColumn: "1 / -1" }}>
                    <span className="receipt-item-label">{t("receipt_centre_label")}</span>
                    <span className="receipt-item-val">{tCentre(rec.centreName || rec.centreId)}</span>
                  </div>
                  {(receipt.adjustmentReason || rec.adjustmentReason || receipt.discrepancyReason) && (
                    <div className="receipt-item" style={{ gridColumn: "1 / -1", background: "rgba(201, 138, 43, 0.08)", padding: "8px 10px", borderRadius: 6 }}>
                      <span className="receipt-item-label" style={{ color: "#B45309", fontWeight: 700 }}>
                        Note: Verified quantity adjusted from Declared Quantity — Reason:
                      </span>
                      <span className="receipt-item-val" style={{ color: "#78350F" }}>
                        {receipt.adjustmentReason || rec.adjustmentReason || receipt.discrepancyReason}
                      </span>
                    </div>
                  )}
                </div>

                <div className="receipt-total-box">
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--field)", textTransform: "uppercase" }}>
                      {t("receipt_total_label")}
                    </div>
                    <div style={{ fontSize: 11, color: "#6A6553" }}>
                      {finalKg} kg ({finalQuintals} Qtl) × ₹{rateKg.toFixed(2)}/kg
                    </div>
                  </div>
                  <div className="receipt-total-amount">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(totalAmount)}
                  </div>
                </div>

                <div className="receipt-footer-badge">
                  <span>🏛️</span>
                  <span>{t("receipt_gov_verified")}</span>
                </div>

                <div
                  className="receipt-process-completed"
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px dashed rgba(0, 0, 0, 0.15)",
                    fontSize: 12,
                    color: "#6A6553",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                  }}
                >
                  Process Completed: {formatReceiptDateTime(receipt.releasedAt || receipt.processCompletedAt || rec.paymentTimestamp)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                  style={{ flex: 1, padding: "8px 14px", fontSize: 13 }}
                >
                  🖨️ {t("receipt_download_btn")}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setSelectedHistorySnapshot(null)}
                  style={{ padding: "8px 14px", fontSize: 13 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Date & Time Slot Reschedule Modal Dialog */}
      {showRescheduleModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 440,
              width: "100%",
              margin: "0 auto",
              background: "#fff",
              borderRadius: 8,
              boxShadow: "0 16px 36px rgba(0, 0, 0, 0.28)",
            }}
          >
            <h3 style={{ fontSize: 19, marginBottom: 6, color: "var(--field)" }}>
              📅 {t("status_reschedule_modal_title")}
            </h3>
            <p style={{ fontSize: 13, color: "#6A6553", marginBottom: 18, lineHeight: 1.4 }}>
              {t("status_reschedule_modal_sub")}
            </p>

            <form onSubmit={confirmRescheduleSubmit}>
              <div className="field-row">
                <label htmlFor="reschedule-date">{t("status_reschedule_select_date")}</label>
                <input
                  id="reschedule-date"
                  type="date"
                  required
                  min={rescheduleEarliestDate || todayStr}
                  value={rescheduleSlot.newSlotDate}
                  onChange={(e) =>
                    setRescheduleSlot((s) => ({ ...s, newSlotDate: e.target.value }))
                  }
                />
              </div>

              <div className="field-row">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <label style={{ margin: 0 }}>{t("status_reschedule_select_time")}</label>
                  {loadingRescheduleAvailability ? (
                    <span style={{ fontSize: 11, color: "#8A8368", fontStyle: "italic" }}>
                      🔄 {t("slot_loading_availability")}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "#8A8368" }}>
                      {t("slot_capacity_hint")}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  {rescheduleAvailability && rescheduleAvailability.length > 0 ? (
                    rescheduleAvailability.map((avail) => {
                      const slot = avail.slotTime;
                      const isPast = Boolean(avail?.isPast);
                      const isFull = Boolean(avail?.isFull);
                      const isDisabled = isPast || isFull;
                      const isSelected = rescheduleSlot.newSlotTime === slot && !isDisabled;
                      const crowd = avail?.crowdLevel || "low";
                      const spotsLeft = avail ? avail.availableSpots : null;

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (!isDisabled) {
                              setRescheduleSlot((s) => ({ ...s, newSlotTime: slot }));
                            }
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: 6,
                            border: isSelected
                              ? "2px solid var(--field)"
                              : isDisabled
                              ? "1px solid #E5E7EB"
                              : "1px solid var(--line)",
                            background: isSelected
                              ? "rgba(31, 61, 43, 0.08)"
                              : isDisabled
                              ? "#F3F4F6"
                              : "#fff",
                            cursor: isDisabled ? "not-allowed" : "pointer",
                            opacity: isDisabled ? 0.6 : 1,
                            textAlign: "left",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              width: "100%",
                              marginBottom: 4,
                            }}
                          >
                            <span
                              style={{
                                fontWeight: isSelected ? 700 : 600,
                                fontSize: 12,
                                color: isDisabled ? "#9CA3AF" : "var(--ink)",
                              }}
                            >
                              ⏰ {slot}
                            </span>
                            {isPast ? (
                              <span
                                style={{
                                  background: "#E5E7EB",
                                  color: "#4B5563",
                                  fontSize: 9,
                                  fontWeight: 800,
                                  padding: "1px 5px",
                                  borderRadius: 8,
                                }}
                              >
                                {t("slot_passed_badge") || "⏳ PASSED"}
                              </span>
                            ) : isFull ? (
                              <span
                                style={{
                                  background: "#FEE2E2",
                                  color: "#DC2626",
                                  fontSize: 9,
                                  fontWeight: 800,
                                  padding: "1px 5px",
                                  borderRadius: 8,
                                }}
                              >
                                {t("slot_full_badge")}
                              </span>
                            ) : (
                              <span
                                className={`status-pill crowd-${crowd}`}
                                style={{ fontSize: 9, padding: "1px 5px" }}
                              >
                                {crowd === "high" || crowd === "full"
                                  ? "🔴"
                                  : crowd === "medium"
                                  ? "🟡"
                                  : "🟢"}{" "}
                                {t(`slot_crowd_${crowd}`)}
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              fontSize: 10,
                              color: isPast
                                ? "#6B7280"
                                : isFull
                                ? "#DC2626"
                                : isSelected
                                ? "var(--field)"
                                : "#6A6553",
                              fontWeight: isSelected ? 600 : 400,
                            }}
                          >
                            {isPast
                              ? `⏳ ${t("slot_passed_label") || "Slot Passed"}`
                              : isFull
                              ? `⛔ ${t("slot_full_label")}`
                              : avail
                              ? `✓ ${t("slot_spots_left").replace("{spots}", `${avail.availableSpots}/${avail.capacity}`)}`
                              : "✓ Available"}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ color: "#8A8368", fontSize: 13, fontStyle: "italic", padding: "12px 0" }}>
                      ℹ️ {t("slot_select_centre_prompt")}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                <button
                  className="btn"
                  type="submit"
                  disabled={rescheduling}
                  style={{ flex: 1 }}
                >
                  {rescheduling ? t("status_reschedule_btn_loading") : t("status_reschedule_confirm_btn")}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  disabled={rescheduling}
                >
                  {t("status_reschedule_close_btn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Peer-to-Peer Slot Swap Modal Dialog */}
      {showSwapModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 480,
              width: "100%",
              margin: "0 auto",
              background: "#fff",
              borderRadius: 8,
              boxShadow: "0 16px 36px rgba(0, 0, 0, 0.28)",
            }}
          >
            <h3 style={{ fontSize: 19, marginBottom: 6, color: "var(--field)" }}>
              🔀 {t("status_swap_modal_title")}
            </h3>
            <p style={{ fontSize: 13, color: "#6A6553", marginBottom: 16, lineHeight: 1.4 }}>
              {t("status_swap_modal_sub")}
            </p>

            {swapSuccessMsg ? (
              <div style={{ background: "rgba(31, 61, 43, 0.08)", border: "1px solid var(--field)", padding: 14, borderRadius: 6, color: "var(--field)", fontWeight: 600, fontSize: 13, textAlign: "center", marginBottom: 14 }}>
                ✓ {swapSuccessMsg}
              </div>
            ) : (
              <form onSubmit={handleSendSwapRequest}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#4A4636", marginBottom: 4, textTransform: "uppercase" }}>
                    Your Current Slot
                  </div>
                  <div style={{ background: "rgba(31, 61, 43, 0.06)", padding: "8px 12px", borderRadius: 6, fontSize: 13, color: "var(--ink)", border: "1px solid rgba(31, 61, 43, 0.12)" }}>
                    Token <strong>{data?.farmer?.id}</strong> · 📅 {data?.farmer?.slotDate || todayStr} · ⏰ {data?.farmer?.slotTime || "—"}
                  </div>
                </div>

                <div className="field-row">
                  <label style={{ marginBottom: 6 }}>{t("status_swap_partner_label")}</label>
                  {loadingSwapPartners ? (
                    <div style={{ fontSize: 12, color: "#8A8368", fontStyle: "italic", padding: "10px 0" }}>
                      Checking available swap partners...
                    </div>
                  ) : swapPartners.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#8A8368", padding: "12px 0", textAlign: "center" }}>
                      {t("status_swap_no_partners")}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto", padding: "2px 0" }}>
                      {swapPartners.map((p) => {
                        const isSelected = selectedPartnerId === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedPartnerId(p.id)}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "10px 12px",
                              borderRadius: 6,
                              border: isSelected ? "2px solid var(--field)" : "1px solid var(--line)",
                              background: isSelected ? "rgba(31, 61, 43, 0.08)" : "#fff",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
                                {p.name} (Token <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{p.id}</span>)
                              </div>
                              <div style={{ fontSize: 12, color: "var(--field)", marginTop: 2, fontWeight: 600 }}>
                                📅 {p.slotDate} · ⏰ {p.slotTime}
                              </div>
                            </div>
                            <div>
                              <input
                                type="radio"
                                name="swapPartner"
                                checked={isSelected}
                                onChange={() => setSelectedPartnerId(p.id)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button
                    className="btn"
                    type="submit"
                    disabled={swapping || !selectedPartnerId}
                    style={{ flex: 1 }}
                  >
                    {swapping ? t("status_swap_btn_loading") : t("status_swap_send_btn")}
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setShowSwapModal(false)}
                    disabled={swapping}
                  >
                    {t("status_swap_close_btn")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
