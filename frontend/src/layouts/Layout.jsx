import { Link, useLocation, Outlet } from "react-router-dom";
import {
  Home,
  Settings,
  Wallet,
  Banknote,
  Users,
  Repeat2,
  ChevronDown,
  ChevronRight,
  Store,
  List,
  Briefcase,
  PlusCircle,
} from "lucide-react";
import { SiEthereum, SiGooglecloudspanner } from "react-icons/si";
import { useMemo, useState, useEffect } from "react";
import client from "../api/client"; // Import the Axios client

export default function Layout({ children }) {
  const location = useLocation();
  const [p2pOpen, setP2POpen] = useState(location.pathname.startsWith("/p2p"));
  const [user, setUser] = useState(() => getStoredUser());

  function getStoredUser() {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // Fetch user profile from backend if outdated or missing
  async function refreshUserProfile() {
    try {
      const token = localStorage.getItem("access");
      if (!token) return;

      if (import.meta.env.DEV) {
        console.log("Axios baseURL:", client.defaults.baseURL);
      }

      const response = await client.get("profile-api/");
      if (import.meta.env.DEV) {
        console.log("Profile response:", response.data);
      }
      localStorage.setItem("user", JSON.stringify(response.data));
      localStorage.setItem("last_user_fetch", Date.now().toString());
      setUser(response.data);
    } catch (error) {
      console.error("Profile refresh failed:", error.response?.data || error.message);
    }
  }

  useEffect(() => {
    const lastFetch = parseInt(localStorage.getItem("last_user_fetch") || "0");
    const minutesSinceLastFetch = (Date.now() - lastFetch) / 60000;

    // Fetch on mount if user is missing or data is stale
    if (!user || minutesSinceLastFetch > 2) {
      refreshUserProfile();
    }

    // Also listen for userUpdated events
    const handleUserUpdate = () => setUser(getStoredUser());
    window.addEventListener("userUpdated", handleUserUpdate);
    window.addEventListener("storage", handleUserUpdate);

    return () => {
      window.removeEventListener("userUpdated", handleUserUpdate);
      window.removeEventListener("storage", handleUserUpdate);
    };
  }, []);

  useEffect(() => {
    setP2POpen(location.pathname.startsWith("/p2p"));
  }, [location.pathname]);

  const navItems = useMemo(() => {
    const items = [
      { to: "/dashboard", label: "Home", icon: <Home className="w-6 h-6" /> },
      {
        label: "P2P Market",
        icon: <Repeat2 className="w-6 h-6" />,
        isGroup: true,
        children: [
          { to: "/p2p/marketplace", label: "P2P Offers", icon: <Store className="w-6 h-6" /> },
          { to: "/p2p/my-orders", label: "My Orders", icon: <List className="w-6 h-6" /> },
          {
            to: "/p2p/merchant-orders",
            label: "Merchant Orders",
            icon: <Briefcase className="w-6 h-6" />,
            merchantOnly: true,
          },
          { to: "/p2p/create-offer", label: "Create Offer", icon: <PlusCircle className="w-6 h-6" /> },
        ],
      },
      { to: "/assets", label: "Gas Fee", icon: <SiEthereum className="w-6 h-6 text-gray-400" /> },
      { to: "/sell-crypto", label: "Sell", icon: <Banknote className="w-6 h-6" /> },
      { to: "/referral", label: "Referral", icon: <Users className="w-6 h-6" /> },
      { to: "/settings", label: "Settings", icon: <Settings className="w-6 h-6" /> },
      { to: "/admin/sell-orders", label: "Admin", icon: <SiGooglecloudspanner className="w-6 h-6" /> },
    ];

    return items.map((item) => {
      if (item.isGroup) {
        return {
          ...item,
          children: item.children.filter(
            (child) => !child.merchantOnly || user?.is_merchant
          ),
        };
      }
      return item;
    });
  }, [user]);

  const p2pNavItem = navItems.find((item) => item.label === "P2P Market");

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-gray-800 border-r border-gray-700 p-4 fixed top-0 left-0 h-screen overflow-y-auto">
        <h1 className="text-xl font-bold mb-10 mt-2">Zunhub</h1>
        <nav className="space-y-2">
          {navItems.map((item) =>
            item.isGroup ? (
              <div key={item.label}>
                <button
                  onClick={() => setP2POpen(!p2pOpen)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg transition ${
                    location.pathname.startsWith("/p2p")
                      ? "bg-indigo-600 text-white"
                      : "text-gray-400 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {p2pOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {p2pOpen && (
                  <div className="ml-8 mt-2 space-y-1">
                    {item.children.map((child) => (
                      <Link
                        key={child.to}
                        to={child.to}
                        className={`block px-2 py-1.5 rounded-md text-sm transition ${
                          location.pathname === child.to
                            ? "bg-indigo-500 text-white"
                            : "text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                  location.pathname.startsWith(item.to)
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            )
          )}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-60 flex flex-col">
        <main className="flex-1">{children || <Outlet />}</main>
      </div>

      {/* Mobile nav */}
      <nav className="fixed bottom-0 left-0 w-full bg-gray-800 border-t border-gray-700 flex justify-around p-3 lg:hidden z-30">
        {location.pathname.startsWith("/p2p")
          ? p2pNavItem.children.map((child) => (
              <Link
                key={child.to}
                to={child.to}
                className={`flex flex-col items-center text-sm ${
                  location.pathname === child.to
                    ? "text-indigo-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {child.icon}
                <span>{child.label}</span>
              </Link>
            ))
          : navItems
              .filter((item) => !item.isGroup && item.to !== "/referral")
              .map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center text-sm ${
                    location.pathname.startsWith(item.to)
                      ? "text-indigo-400"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
      </nav>
    </div>
  );
}