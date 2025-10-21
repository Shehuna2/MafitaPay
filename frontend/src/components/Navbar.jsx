import { Link, useNavigate } from "react-router-dom";
import { Bell, Headphones, User, X, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import client from "../api/client";

export default function Navbar() {
  const navigate = useNavigate();
  const access = localStorage.getItem("access");

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [profileImage, setProfileImage] = useState(null);

  const notificationRef = useRef(null);
  const userRef = useRef(null);

  const BASE_URL = window.location.hostname.includes("localhost")
    ? "http://127.0.0.1:8000"
    : "https://zunhub.digital";

  // ✅ Mock notifications
  useEffect(() => {
    setNotifications([
      { id: 1, message: "Your P2P order has been confirmed" },
      { id: 2, message: "New deposit offer available" },
      { id: 3, message: "Withdrawal request approved" },
    ]);
  }, []);

  // ✅ Fetch user profile image when logged in
  useEffect(() => {
    if (!access) return;

    const fetchProfileImage = async () => {
      try {
        const res = await client.get("profile-api/");
        const img = res.data.profile_image
          ? res.data.profile_image.startsWith("http")
            ? res.data.profile_image
            : `${BASE_URL}${res.data.profile_image}`
          : "/static/images/avt13.jpg";

        setProfileImage(img);
        localStorage.setItem("profile_image", img);
      } catch (err) {
        console.warn("Failed to fetch profile image");
      }
    };

    fetchProfileImage();
  }, [access]);

  // ✅ Listen for profile image update event
  useEffect(() => {
    const handleProfileImageUpdate = (e) => {
      const { profile_image } = e.detail;
      const fullUrl = profile_image.startsWith("http")
        ? profile_image
        : `${BASE_URL}${profile_image}`;
      setProfileImage(fullUrl);
      localStorage.setItem("profile_image", fullUrl);
    };

    window.addEventListener("profileImageUpdated", handleProfileImageUpdate);
    return () =>
      window.removeEventListener("profileImageUpdated", handleProfileImageUpdate);
  }, []);

  const unreadCount = notifications.length;

  const handleLogout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("profile_image");
    navigate("/login");
  };

  // ✅ Close dropdowns on outside click
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

  // ✅ Open WhatsApp link
  const openWhatsApp = () => {
    const phone = "2348168623961"; // <-- replace with your WhatsApp number
    const message = encodeURIComponent("Hello, I need help with ......");
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  return (
    <nav className="fixed top-0 left-0 w-full bg-gray-950/40 backdrop-blur-md border-b border-gray-800 z-50">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        {/* Brand */}
        <Link to="/dashboard" className="text-xl font-bold text-gray-200">
          Mafita<span className="text-green-400">Pay</span>
        </Link>

        {/* Right Section */}
        <div className="flex items-center gap-5 relative">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              className="relative"
            >
              <Bell
                size={22}
                className={`text-gray-300 hover:text-green-400 transition ${
                  showNotifications ? "text-green-400" : ""
                }`}
              />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-1 bg-green-500 text-white text-[10px] px-1.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-72 bg-gray-900/90 backdrop-blur-xl rounded-xl shadow-lg border border-gray-800 overflow-hidden animate-fadeIn">
                <div className="flex justify-between items-center px-4 py-2 border-b border-gray-800">
                  <span className="text-sm font-semibold text-gray-200">
                    Notifications
                  </span>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    <X size={16} />
                  </button>
                </div>
                <ul className="max-h-60 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((n) => (
                      <li
                        key={n.id}
                        className="px-4 py-3 text-sm text-gray-300 border-b border-gray-800 hover:bg-gray-800/60 cursor-pointer"
                      >
                        {n.message}
                      </li>
                    ))
                  ) : (
                    <li className="px-4 py-3 text-sm text-gray-400 text-center">
                      No new notifications
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Customer Support (WhatsApp) */}
          <button onClick={openWhatsApp} className="relative">
            <Headphones
              size={22}
              className="text-gray-300 hover:text-green-400 cursor-pointer transition"
            />
          </button>

          {/* Auth Section */}
          {access ? (
            <div className="relative" ref={userRef}>
              <button
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2"
              >
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt="User"
                    className="w-8 h-8 rounded-full border border-gray-700 object-cover hover:scale-105 transition"
                  />
                ) : (
                  <User
                    size={22}
                    className={`text-gray-300 hover:text-green-400 transition ${
                      showUserMenu ? "text-green-400" : ""
                    }`}
                  />
                )}
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-3 w-52 bg-gray-900/90 backdrop-blur-xl rounded-xl shadow-lg border border-gray-800 overflow-hidden animate-fadeIn">
                  <ul className="text-sm text-gray-300">
                    <li>
                      <Link
                        to="/accounts/profile"
                        className="flex items-center gap-2 px-4 py-3 hover:bg-gray-800/60"
                      >
                        <User size={16} /> Profile
                      </Link>
                    </li>
                    <li>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-800/60 text-left text-red-400"
                      >
                        <LogOut size={16} /> Logout
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm text-gray-300 hover:text-green-400"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-sm text-gray-300 hover:text-green-400"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
