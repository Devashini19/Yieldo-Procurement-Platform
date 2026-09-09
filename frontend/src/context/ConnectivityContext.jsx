import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../api.js";

const STORAGE_KEY = "yieldo_pending_registrations";

export const ConnectivityContext = createContext({
  isOnline: true,
  pendingRegistrations: [],
  pendingCount: 0,
  addPendingRegistration: () => {},
  syncPendingRegistrations: async () => {},
});

export function ConnectivityProvider({ children, onAddNotification }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [pendingRegistrations, setPendingRegistrations] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Save to localStorage whenever pendingRegistrations changes
  const savePending = (list) => {
    setPendingRegistrations(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("Failed to save pending registrations to localStorage:", e);
    }
  };

  const addPendingRegistration = useCallback((data) => {
    const entry = {
      id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      ...data,
      offlineCreatedAt: Date.now(),
    };
    const updated = [...pendingRegistrations, entry];
    savePending(updated);
    return entry;
  }, [pendingRegistrations]);

  const syncPendingRegistrations = useCallback(async () => {
    if (!navigator.onLine) return;

    let currentPending = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      currentPending = raw ? JSON.parse(raw) : [];
    } catch {
      currentPending = [];
    }

    if (currentPending.length === 0) return;

    const remaining = [];

    for (const item of currentPending) {
      try {
        const payload = {
          name: item.name,
          phone: item.phone || null,
          email: item.email || null,
          crop: item.crop,
          quantityKg: Number(item.quantityKg),
          centreId: item.centreId,
        };

        const res = await api.registerFarmer(payload);

        // Notify user of successful synchronization with real token assigned
        if (onAddNotification && res?.farmer) {
          onAddNotification({
            tokenId: res.farmer.id,
            title: "Offline Booking Synced",
            message: `Your offline booking for ${res.farmer.crop} (${res.farmer.quantityKg}kg) has been registered! Assigned Token ID: ${res.farmer.id} with estimated wait: ~${res.estimatedWaitMinutes || 10} min.`,
          });
        }
      } catch (err) {
        console.warn("Failed to sync pending registration, will retry next time:", err);
        // Keep in queue for next retry
        remaining.push(item);
      }
    }

    savePending(remaining);
  }, [onAddNotification]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      // Automatically attempt to sync pending registrations when back online
      syncPendingRegistrations();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check if we came back online with pending bookings
    if (navigator.onLine) {
      syncPendingRegistrations();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingRegistrations]);

  return (
    <ConnectivityContext.Provider
      value={{
        isOnline,
        pendingRegistrations,
        pendingCount: pendingRegistrations.length,
        addPendingRegistration,
        syncPendingRegistrations,
      }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}
