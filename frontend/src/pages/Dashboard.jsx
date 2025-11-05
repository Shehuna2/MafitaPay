// src/pages/Dashboard.jsx
import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet,
  Phone,
  Globe,
  List,
  Tv,
  Zap,
  Book,
  Users,
  Fuel,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Repeat,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import client from "../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  const formatted = num.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return (
    <span className="inline-flex items-baseline">
      <span className="text-xl font-bold">₦</span>
      <span className="text-3xl font-bold ml-1">{formatted}</span>
    </span>
  );
};

export default function Dashboard() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const location = useLocation();

  const transactionRoutes = [
    "/buy-airtime",
    "/buy-data",
    "/sell-crypto",
    "/cable-tv",
    "/electricity",
    "/education",
    "/referral",
  ];

  const eventCards = [
    { title: "Placeholder Event 1", details: "Details coming soon...", date: "4/6" },
    { title: "Placeholder Event 2", details: "Details coming soon...", date: "5/6" },
    { title: "Placeholder Event 3", details: "Details coming soon...", date: "6/6" },
  ];

  // Fetch wallet with loading state
  const fetchWallet = useCallback(async () => {
    if (balanceLoading || isRefreshing) return;
    setBalanceLoading(true);
    try {
      const res = await client.get("wallet/");
      if (import.meta.env.DEV) {
        console.log("Wallet fetch:", {
          status: res.status,
          data: res.data,
          timestamp: new Date().toISOString(),
        });
      }
      setWallet(res.data);
      setLoading(false);
    } catch (err) {
      console.error("Wallet fetch error:", {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
        timestamp: new Date().toISOString(),
      });
      toast.error("Failed to load wallet. Please try again.");
      setLoading(false);
    } finally {
      setBalanceLoading(false);
      setIsRefreshing(false);
    }
  }, [balanceLoading, isRefreshing]);

  // Initial load + polling
  useEffect(() => {
    fetchWallet();
    const interval = setInterval(fetchWallet, 15000);
    return () => clearInterval(interval);
  }, [fetchWallet]);

  // Detect transaction completion from navigation
  useEffect(() => {
    const fromTransaction =
      transactionRoutes.some((route) => location.pathname.startsWith(route)) ||
      location.state?.transactionCompleted ||
      location.state?.fromTransaction;

    if (fromTransaction) {
      toast.success("Transaction completed! Updating balance...");
      fetchWallet();
    }
  }, [location.pathname, location.state, fetchWallet]);

  // Event carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentEventIndex((prev) => (prev === eventCards.length - 1 ? 0 : prev + 1));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Manual refresh with debounce
  const handleRefresh = async () => {
    if (balanceLoading || isRefreshing) return;
    setIsRefreshing(true);
    toast.info("Refreshing balance...");
    await fetchWallet();
  };

  const handleCloseDepositModal = () => {
    setShowDepositModal(false);
    fetchWallet();
  };

  // Render balance securely
  const renderBalance = () => {
    if (!wallet) return <span className="text-3xl font-bold text-gray-400">₦0</span>;

    if (!showBalance) {
      return <span className="text-3xl font-bold tracking-widest">••••</span>;
    }

    return (
      <div className="flex items-center">
        {formatCurrency(wallet.balance)}
        {(balanceLoading || isRefreshing) && (
          <RefreshCw className="w-4 h-4 ml-2 animate-spin text-indigo-400" />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4">
        <div className="bg-indigo-600/20 backdrop-blur-md p-8 rounded-2xl shadow-xl w-full max-w-md animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-40 mb-4" />
          <div className="h-10 bg-gray-700 rounded w-48" />
          <div className="flex justify-between mt-6">
            <div className="h-10 bg-gray-700 rounded-full w-20" />
            <div className="h-10 bg-gray-700 rounded-full w-20" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />

      {/* Wallet Section */}
      <div className="bg-indigo-600/30 backdrop-blur-md p-6 rounded-2xl shadow-xl mx-4 mt-4 border border-indigo-600/20">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="w-5 h-5" /> Wallet Balance
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={balanceLoading || isRefreshing}
              className="text-xs p-2 rounded-full bg-gray-700/80 hover:bg-gray-600 transition disabled:opacity-50"
              aria-label="Refresh balance"
            >
              <RefreshCw
                className={`w-4 h-4 ${balanceLoading || isRefreshing ? "animate-spin" : ""}`}
              />
            </button>
            <Link
              to="/wallet-transactions"
              className="text-xs p-2 rounded-full bg-gray-700/80 hover:bg-gray-600 transition"
              aria-label="View transactions"
            >
              <List className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-xs p-2 rounded-full bg-gray-700/80 hover:bg-gray-600 transition"
              aria-label={showBalance ? "Hide balance" : "Show balance"}
            >
              {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="mt-4">{renderBalance()}</div>

        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-white/70">Available Balance</p>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowDepositModal(true)}
              className="bg-indigo-600/80 text-white p-2 rounded-full hover:bg-indigo-700 transition"
              aria-label="Deposit funds"
            >
              <ArrowDownLeft className="w-6 h-6" />
            </button>
            <Link
              to="/deposit"
              className="bg-indigo-600/80 text-white p-2 rounded-full hover:bg-indigo-700 transition"
              aria-label="Withdraw funds"
            >
              <ArrowUpRight className="w-6 h-6" />
            </Link>
          </div>
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 p-6 rounded-2xl shadow-xl w-full max-w-md relative">
            <button
              onClick={handleCloseDepositModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative z-10">
              <h2 className="text-xl font-bold mb-4">Deposit via P2P</h2>
              <p className="text-sm text-gray-400 mb-6">
                Create a secure P2P deposit order from the marketplace.
              </p>
              <Link
                to="/p2p/marketplace"
                onClick={handleCloseDepositModal}
                className="inline-block bg-indigo-600 text-white px-5 py-2.5 rounded-full hover:bg-indigo-700 transition text-sm font-medium"
              >
                Go to P2P Marketplace
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="px-4 lg:px-8 mt-6">
        <div className="bg-gray-800 p-4 rounded-xl shadow">
          <div className="grid grid-cols-4 gap-4">
            {[
              { to: "/buy-airtime", label: "Airtime", icon: <Phone className="w-6 h-6 text-indigo-500" /> },
              { to: "/buy-data", label: "Data", icon: <Globe className="w-6 h-6 text-indigo-500" /> },
              { to: "/assets", label: "Gas Fee", icon: <Fuel className="w-6 h-6 text-indigo-500" /> },
              { to: "/sell-crypto", label: "Sell", icon: <Repeat className="w-6 h-6 text-indigo-500" /> },
              { to: "/buy-cable-tv", label: "Cable", icon: <Tv className="w-6 h-6 text-indigo-500" /> },
              { to: "/buy-electricity", label: "Electricity", icon: <Zap className="w-6 h-6 text-indigo-500" /> },
              { to: "/buy-education", label: "Education", icon: <Book className="w-6 h-6 text-indigo-500" /> },
              { to: "/referral", label: "Referral", icon: <Users className="w-6 h-6 text-indigo-500" /> },
            ].map((action, i) => (
              <Link
                key={i}
                to={action.to}
                state={{ returnToDashboard: true }}
                className="flex flex-col items-center justify-center p-4 rounded-lg hover:bg-gray-700 transition active:scale-95"
                aria-label={`Go to ${action.label}`}
              >
                {action.icon}
                <span className="text-xs sm:text-sm mt-2 text-center">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Event Carousel */}
      <div className="px-4 lg:px-8 mt-6">
        <h3 className="text-lg font-semibold mb-4">Upcoming Events</h3>
        <div className="relative h-28 overflow-hidden rounded-2xl">
          {eventCards.map((event, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                index === currentEventIndex ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="bg-gray-800 p-6 rounded-2xl shadow h-full flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{event.title}</p>
                  <p className="text-white mt-1 font-medium">{event.details}</p>
                </div>
                <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded">
                  {event.date}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}