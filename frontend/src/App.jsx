import { useState, useEffect, useRef } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import Register from "./pages/Register.jsx";
import FarmerRegister from "./pages/FarmerRegister.jsx";
import Status from "./pages/Status.jsx";
import RaiseTicket from "./pages/RaiseTicket.jsx";
import Admin from "./pages/Admin.jsx";
import FarmerLogin from "./pages/FarmerLogin.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminRegister from "./pages/AdminRegister.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import NotificationBell, { playNotificationSound } from "./components/NotificationBell.jsx";
import FarmerProfileMenu from "./components/FarmerProfileMenu.jsx";
import AdminProfileMenu from "./components/AdminProfileMenu.jsx";
import { LanguageProvider, useLanguage } from "./i18n.js";
import { ConnectivityProvider, useConnectivity } from "./context/ConnectivityContext.jsx";
import { api } from "./api.js";

function Topbar({
  farmerUser,
  onLogout,
  adminToken,
  onAdminLogout,
  notifications,
  onMarkRead,
  onMarkAllRead,
}) {
  const { pathname } = useLocation();
  const { lang, setLang, t } = useLanguage();
  const { isOnline, pendingCount } = useConnectivity();
  const isActive = (p) => (pathname === p ? "active" : "");
  const isAdmin = pathname.startsWith("/admin");

  return (
    <div className="topbar">
      <div className="brand">
        <div
          className="brand-logo-container"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            overflow: "hidden",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: "#ffffff",
          }}
        >
          <img
            src="/logo.jpg"
            alt="Yieldo Logo"
            className="brand-logo"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              borderRadius: "50%",
              display: "block",
            }}
          />
        </div>
        <span className="brand-name">Yieldo</span>

        {/* Offline & Syncing Status Indicator */}
        {!isOnline && (
          <span
            className="offline-badge"
            title={t("offline_badge_title")}
            style={{
              background: "rgba(162, 59, 46, 0.12)",
              color: "var(--danger)",
              border: "1px solid var(--danger)",
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginLeft: 6,
            }}
          >
            ⚡ {t("offline_label")}
            {pendingCount > 0 && ` (${pendingCount} ${t("offline_pending_short")})`}
          </span>
        )}
        {isOnline && pendingCount > 0 && (
          <span
            className="syncing-badge"
            style={{
              background: "rgba(201, 138, 43, 0.15)",
              color: "#8C590E",
              border: "1px solid rgba(201, 138, 43, 0.4)",
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginLeft: 6,
            }}
          >
            🔄 {pendingCount} {t("offline_syncing_short")}
          </span>
        )}
      </div>
      <div className="nav-links" style={{ alignItems: "center", gap: 12 }}>
        {adminToken ? (
          <>
            <Link to="/admin" className={isActive("/admin")}>Admin Control Panel</Link>
            <AdminProfileMenu
              adminToken={adminToken}
              onLogout={onAdminLogout}
            />
          </>
        ) : farmerUser ? (
          <>
            <Link to="/" className={isActive("/")}>{t("nav_book")}</Link>
            <Link to="/status" className={isActive("/status")}>{t("nav_status")}</Link>
            <Link to="/tickets" className={isActive("/tickets")}>{t("nav_tickets")}</Link>
            <Link to="/admin" className={isActive("/admin")}>{t("nav_admin")}</Link>
            
            {/* Persistent Bell Notification Center for Farmer */}
            <NotificationBell
              notifications={notifications}
              onMarkRead={onMarkRead}
              onMarkAllRead={onMarkAllRead}
            />

            {/* Consolidated Farmer Profile & Quick Stats Dropdown */}
            <FarmerProfileMenu
              farmerUser={farmerUser}
              onLogout={onLogout}
            />
          </>
        ) : (
          <>
            <Link to="/" className={isActive("/") || isActive("/login")}>{t("nav_login")}</Link>
            <Link to="/register-farmer" className={isActive("/register-farmer") || isActive("/signup")}>{t("nav_signup")}</Link>
            <Link to="/admin" className={isActive("/admin")}>{t("nav_admin")}</Link>
          </>
        )}

        {!isAdmin && (
          <div className="lang-switcher">
            <button
              type="button"
              className={`lang-btn ${lang === "en" ? "active" : ""}`}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-btn ${lang === "ta" ? "active" : ""}`}
              onClick={() => setLang("ta")}
            >
              தமிழ்
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MainLayout({
  farmerUser,
  setFarmerUser,
  adminToken,
  setAdminToken,
  notifications,
  onAddNotification,
  onMarkRead,
  onMarkAllRead,
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdmin = pathname.startsWith("/admin");

  function handleFarmerLogout() {
    setFarmerUser(null);
    navigate("/");
  }

  function handleAdminLogout() {
    if (adminToken) {
      api.logoutAdmin(adminToken).catch(() => {});
    }
    setAdminToken(null);
    navigate("/admin");
  }

  return (
    <div className="app-shell">
      <Topbar
        farmerUser={farmerUser}
        onLogout={handleFarmerLogout}
        adminToken={adminToken}
        onAdminLogout={handleAdminLogout}
        notifications={notifications}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
      />
      <Routes>
        <Route
          path="/"
          element={
            farmerUser ? (
              <Register farmerUser={farmerUser} />
            ) : (
              <FarmerLogin onLogin={setFarmerUser} />
            )
          }
        />
        <Route
          path="/login"
          element={
            farmerUser ? (
              <Register farmerUser={farmerUser} />
            ) : (
              <FarmerLogin onLogin={setFarmerUser} />
            )
          }
        />
        <Route
          path="/register-farmer"
          element={<FarmerRegister />}
        />
        <Route
          path="/signup"
          element={<FarmerRegister />}
        />
        <Route
          path="/status"
          element={
            farmerUser ? (
              <Status
                farmerUser={farmerUser}
                onAddNotification={onAddNotification}
              />
            ) : (
              <FarmerLogin onLogin={setFarmerUser} />
            )
          }
        />
        <Route
          path="/tickets"
          element={
            farmerUser ? (
              <RaiseTicket farmerUser={farmerUser} />
            ) : (
              <FarmerLogin onLogin={setFarmerUser} />
            )
          }
        />
        <Route
          path="/admin"
          element={
            adminToken ? (
              <Admin onLogout={handleAdminLogout} adminToken={adminToken} />
            ) : (
              <AdminLogin onLogin={setAdminToken} />
            )
          }
        />
        <Route
          path="/admin/register"
          element={<AdminRegister />}
        />
        <Route
          path="/admin-register"
          element={<AdminRegister />}
        />
      </Routes>
      {!isAdmin && <ChatWidget farmerUser={farmerUser} />}
    </div>
  );
}

export default function App() {
  const [farmerUser, setFarmerUser] = useState(null);
  const [adminToken, setAdminToken] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const seenNotifIdsRef = useRef(new Set());

  // Restore farmer session directly from backend persistence on page mount/refresh
  useEffect(() => {
    const raw = localStorage.getItem("yieldo_farmer_session");
    if (!raw) return;
    try {
      const session = JSON.parse(raw);
      const queryId = session.farmerId || session.identifier || session.phone || session.email;
      if (!queryId) return;
      api
        .getFarmerProfile(queryId, session.name || "")
        .then((res) => {
          if (res && (res.farmerId || res.identifier)) {
            setFarmerUser(res);
          }
        })
        .catch((err) => {
          console.warn("Farmer session restore failed:", err);
          localStorage.removeItem("yieldo_farmer_session");
        });
    } catch {
      localStorage.removeItem("yieldo_farmer_session");
    }
  }, []);

  const farmerIdentifier = farmerUser?.identifier || farmerUser?.phone || farmerUser?.email;

  // Sync notifications from backend for the logged-in farmer
  useEffect(() => {
    if (!farmerIdentifier) return;

    let isMounted = true;
    async function fetchNotifs() {
      try {
        const backendNotifs = await api.getFarmerNotifications(farmerIdentifier);
        if (!isMounted || !Array.isArray(backendNotifs)) return;

        let hasNewUnread = false;
        backendNotifs.forEach((n) => {
          if (!n.read && !seenNotifIdsRef.current.has(n.id)) {
            hasNewUnread = true;
          }
          seenNotifIdsRef.current.add(n.id);
        });

        if (hasNewUnread && seenNotifIdsRef.current.size > backendNotifs.length) {
          playNotificationSound();
        }

        setNotifications((prev) => {
          // Merge backend notifications with any client-local notifications (avoid duplicates)
          const map = new Map();
          // Add backend notifications first
          backendNotifs.forEach((item) => map.set(item.id, item));
          // Add local notifications if not in map and not matching an existing backend notification
          prev.forEach((item) => {
            const isDuplicate =
              map.has(item.id) ||
              backendNotifs.some(
                (b) =>
                  b.id === item.id ||
                  (b.tokenId && item.tokenId && b.tokenId === item.tokenId && b.message === item.message)
              );
            if (!isDuplicate) {
              map.set(item.id, item);
            }
          });
          return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        });
      } catch {
        // Ignore background polling errors
      }
    }

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [farmerIdentifier]);

  function handleSetFarmerUser(user) {
    if (!user) {
      localStorage.removeItem("yieldo_farmer_session");
      setNotifications([]); // reset notifications on logout
      seenNotifIdsRef.current.clear();
      setFarmerUser(null);
    } else {
      const sessionData = {
        farmerId: user.farmerId,
        identifier: user.identifier || user.phone || user.email,
        name: user.name,
      };
      localStorage.setItem("yieldo_farmer_session", JSON.stringify(sessionData));
      setFarmerUser(user);
    }
  }

  function handleAddNotification({ id, tokenId, farmerName, crop, title, message }) {
    // Play short audio chime
    playNotificationSound();

    const notifId = id || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    // Add unread notification to top of list
    const newEntry = {
      id: notifId,
      tokenId,
      farmerName,
      crop,
      title: title || "Queue Alert",
      message,
      timestamp: Date.now(),
      read: false,
    };
    seenNotifIdsRef.current.add(notifId);
    setNotifications((prev) => {
      if (prev.some((n) => n.id === notifId || (tokenId && n.tokenId === tokenId && n.message === message))) {
        return prev;
      }
      return [newEntry, ...prev];
    });
  }

  function handleMarkRead(id) {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
    if (typeof id === "string" && id.startsWith("NOTIF-")) {
      api.markNotificationRead(id).catch(() => {});
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, read: true }))
    );
    if (farmerIdentifier) {
      try {
        await api.markAllNotificationsRead(farmerIdentifier);
      } catch {
        const unreadBackend = notifications.filter(
          (item) => !item.read && typeof item.id === "string" && item.id.startsWith("NOTIF-")
        );
        unreadBackend.forEach((item) => {
          api.markNotificationRead(item.id).catch(() => {});
        });
      }
    } else {
      const unreadBackend = notifications.filter(
        (item) => !item.read && typeof item.id === "string" && item.id.startsWith("NOTIF-")
      );
      unreadBackend.forEach((item) => {
        api.markNotificationRead(item.id).catch(() => {});
      });
    }
  }

  return (
    <LanguageProvider>
      <ConnectivityProvider onAddNotification={handleAddNotification}>
        <MainLayout
          farmerUser={farmerUser}
          setFarmerUser={handleSetFarmerUser}
          adminToken={adminToken}
          setAdminToken={setAdminToken}
          notifications={notifications}
          onAddNotification={handleAddNotification}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
        />
      </ConnectivityProvider>
    </LanguageProvider>
  );
}
