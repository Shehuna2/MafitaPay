import { useEffect, useState, useCallback, useRef } from "react";
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
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
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
      <span className="text-lg sm:text-xl font-extrabold text-indigo-400">₦</span>
      <span className="text-3xl sm:text-4xl font-extrabold ml-1 tracking-tight">
        {formatted}
      </span>
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
  const [recentTx, setRecentTx] = useState([]);
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
    { title: "Crypto Summit 2025", details: "Join the biggest blockchain event in Lagos", date: "12/6" },
    { title: "Zero-Fee Week", details: "Trade any asset with 0% fees", date: "15/6" },
    { title: "Referral Bonus", details: "Invite a friend – earn ₦5,000 each", date: "20/6" },
  ];

  const mockTransactions = [
    { id: 1, type: "deposit", amount: 50000, time: "2 mins ago", icon: <ArrowDownCircle className="w-4 h-4 text-green-400" /> },
    { id: 2, type: "airtime", amount: 2000, time: "15 mins ago", icon: <Phone className="w-4 h-4 text-indigo-400" /> },
    { id: 3, type: "data", amount: 5000, time: "1 hr ago", icon: <Globe className="w-4 h-4 text-blue-400" /> },
  ];

  const fetchWallet = useCallback(async () => {
    if (balanceLoading || isRefreshing) return;
    setBalanceLoading(true);
    try {
      const res = await client.get("wallet/");
      setWallet(res.data);
      setRecentTx(mockTransactions);
      setLoading(false);
    } catch {
      toast.error("Failed to load wallet");
      setLoading(false);
    } finally {
      setBalanceLoading(false);
      setIsRefreshing(false);
    }
  }, [balanceLoading, isRefreshing]);

  useEffect(() => {
    fetchWallet();
    const poll = setInterval(fetchWallet, 15000);
    return () => clearInterval(poll);
  }, [fetchWallet]);

  useEffect(() => {
    const fromTx =
      transactionRoutes.some((r) => location.pathname.startsWith(r)) ||
      location.state?.transactionCompleted;
    if (fromTx) {
      toast.success("Transaction complete – balance updated");
      fetchWallet();
      triggerHaptic();
    }
  }, [location.pathname, location.state, fetchWallet]);

  // Auto-advance event cards
  useEffect(() => {
    const int = setInterval(() => {
      setCurrentEventIndex((i) => (i + 1) % eventCards.length);
    }, 6000);
    return () => clearInterval(int);
  }, []);

  // Swipe gesture detection
  const eventRef = useRef(null);
  const touchStart = useRef(0);
  const touchEnd = useRef(0);

  const handleTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStart.current - touchEnd.current;
    if (Math.abs(diff) < 50) return; // threshold
    if (diff > 0) nextEvent(); // swipe left
    else prevEvent(); // swipe right
  };

  const handleTouchMove = (e) => {
    touchEnd.current = e.touches[0].clientX;
  };

  const nextEvent = () => {
    setCurrentEventIndex((prev) => (prev + 1) % eventCards.length);
  };

  const prevEvent = () => {
    setCurrentEventIndex((prev) =>
      prev === 0 ? eventCards.length - 1 : prev - 1
    );
  };

  const handleRefresh = async () => {
    if (balanceLoading || isRefreshing) return;
    setIsRefreshing(true);
    toast.info("Refreshing…");
    await fetchWallet();
    triggerHaptic();
  };

  const triggerHaptic = () => {
    if ("vibrate" in navigator) navigator.vibrate?.(30);
  };

  const renderBalance = () => {
    if (!wallet)
      return <span className="text-3xl sm:text-4xl font-extrabold text-gray-500">₦0</span>;

    if (!showBalance)
      return (
        <span className="text-3xl sm:text-4xl font-extrabold tracking-widest text-gray-400">
          ••••••
        </span>
      );

    return (
      <div className="flex items-center gap-3">
        {formatCurrency(wallet.balance)}
        {(balanceLoading || isRefreshing) && (
          <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-indigo-400" />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-indigo-600/30 backdrop-blur-xl p-6 sm:p-10 rounded-3xl shadow-wallet w-full max-w-sm sm:max-w-lg animate-pulse border border-indigo-600/20">
          <div className="h-7 sm:h-8 bg-gray-700 rounded w-36 sm:w-44 mb-4 sm:mb-6" />
          <div className="h-12 sm:h-14 bg-gray-700 rounded w-48 sm:w-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white overflow-x-hidden px-2 sm:px-4">
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />

      {/* Wallet card ... unchanged ... */}

      {/* Quick Actions ... unchanged ... */}

      {/* ✅ Swipeable Upcoming Events */}
      <div className="px-2 sm:px-4 pb-8 select-none">
        <h3 className="text-lg sm:text-xl font-semibold mb-4 text-indigo-400">
          Upcoming
        </h3>
        <div
          ref={eventRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative h-28 sm:h-36 overflow-hidden rounded-3xl"
        >
          {eventCards.map((ev, idx) => (
            <div
              key={idx}
              className={`absolute inset-0 transition-opacity duration-700 ${
                idx === currentEventIndex ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="h-full bg-gray-800 backdrop-blur-xl p-4 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between border border-indigo-600/20 shadow-wallet">
                <div>
                  <p className="text-xs sm:text-sm text-indigo-300">{ev.title}</p>
                  <p className="mt-1 text-sm sm:text-lg font-medium text-white">
                    {ev.details}
                  </p>
                </div>
                <span className="mt-2 sm:mt-0 bg-indigo-600/30 text-indigo-300 px-2 sm:px-3 py-1 rounded-full text-xs font-semibold">
                  {ev.date}
                </span>
              </div>
            </div>
          ))}
          {/* Small dots indicator */}
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2">
            {eventCards.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentEventIndex(idx)}
                className={`w-2 h-2 rounded-full ${
                  idx === currentEventIndex ? "bg-indigo-400" : "bg-gray-600"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
