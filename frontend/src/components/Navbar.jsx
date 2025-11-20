// src/components/Navbar.jsx
import { Link, useLocation } from "react-router-dom";
import { Bell, Headphones, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const access = localStorage.getItem("access");

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const notificationRef = useRef(null);
  const userRef = useRef(null);

  const hiddenRoutes = ["/login", "/register", "/verify-email", "/reset-password"];
  const shouldHideNavbar = hiddenRoutes.some((r) => location.pathname.startsWith(r));

  if (shouldHideNavbar || !isAuthenticated) return null;

  const fetchNotifications = async () => {
    try {
      setLoadingNotifs(true);
      const res = await client.get("notifications/");
      const data = Array.isArray(res.data) ? res.data : [];
      setNotifications(data);
      localStorage.setItem("notifications", JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to fetch notifications:", err.response?.data || err.message);
      setNotifications([]);
    } finally {
      setLoadingNotifs(false);
    }
  };

  useEffect(() => {
    if (!access) return;
    const cached = localStorage.getItem("notifications");
    if (cached) setNotifications(JSON.parse(cached));

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    window.addEventListener("transactionCompleted", fetchNotifications);

    return () => {
      clearInterval(interval);
      window.removeEventListener("transactionCompleted", fetchNotifications);
    };
  }, [access]);

  const handleToggleNotifications = async () => {
    const newState = !showNotifications;
    setShowNotifications(newState);
    setShowUserMenu(false);

    if (newState && notifications.some((n) => !n.is_read)) {
      try {
        await client.post("notifications/mark-read/");
        const updated = notifications.map((n) => ({ ...n, is_read: true }));
        setNotifications(updated);
        localStorage.setItem("notifications", JSON.stringify(updated));
      } catch {
        console.warn("Failed to mark notifications as read");
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        (notificationRef.current && notificationRef.current.contains(e.target)) ||
        (userRef.current && userRef.current.contains(e.target))
      )
        return;
      setShowNotifications(false);
      setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = Array.isArray(notifications)
    ? notifications.filter((n) => !n.is_read).length
    : 0;

  const openWhatsApp = () => {
    const phone = "2348168623961";
    const message = encodeURIComponent("Hello, I need help with ......");
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  return (
    <nav className="fixed top-0 left-0 w-full bg-gray-950/40 backdrop-blur-md border-b border-gray-800 z-50">
      <div className="container mx-auto px-4 py-3.5 flex justify-between items-center">
        {/* Logo */}
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-lg font-bold text-green-100 flex-shrink-0"
        >
          <img
            src="/mafitapay.png"
            alt="MafitaPay Logo"
            className="w-7 h-7 rounded-full object-contain"
          />

          <span>
            Mafita<span className="text-indigo-400">Pay</span>
          </span>
        </Link>


        {/* Icons */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button onClick={handleToggleNotifications} className="relative p-1.5">
              <Bell
                size={22}
                className="text-gray-300 hover:text-green-400 transition"
              />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[9px] px-1.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-64 bg-gray-900/90 backdrop-blur-xl rounded-xl shadow-lg border border-gray-800 overflow-hidden text-xs">
                <div className="flex justify-between items-center px-3 py-2 border-b border-gray-800">
                  <span className="font-semibold text-gray-200">Notifications</span>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    <X size={14} />
                  </button>
                </div>

                <ul className="max-h-56 overflow-y-auto">
                  {loadingNotifs ? (
                    <li className="px-3 py-2 text-gray-400 text-center">Loading...</li>
                  ) : notifications.length > 0 ? (
                    notifications.map((n) => (
                      <li
                        key={n.id}
                        className={`px-3 py-2 border-b border-gray-800 hover:bg-gray-800/60 cursor-pointer text-xs ${
                          n.is_read ? "text-gray-400" : "text-gray-200"
                        }`}
                      >
                        {n.message}
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2 text-gray-400 text-center">No new notifications</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* WhatsApp */}
          <button onClick={openWhatsApp} className="p-1.5">
            <Headphones
              size={22}
              className="text-gray-300 hover:text-green-400 transition"
            />
          </button>
        </div>
      </div>
    </nav>
  );
}
