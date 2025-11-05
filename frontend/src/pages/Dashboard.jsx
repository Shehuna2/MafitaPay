import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet,
  Phone,
  Globe,
  List,
  Repeat2,
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
  const [isPaused, setIsPaused] = useState(false);
  const location = useLocation();

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
  }, [mockTransactions]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const handleRefresh = async () => {
    if (balanceLoading || isRefreshing) return;
    setBalanceLoading(true);
    setIsRefreshing(true);
    toast.info("Refreshing…");
    await fetchWallet();
    triggerHaptic();
  };

  const triggerHaptic = () => {
    if ("vibrate" in navigator) navigator.vibrate?.(30);
  };

  // ─────── Event Carousel ───────
  const eventRef = useRef(null);
  const touchStart = useRef(0);
  const touchEnd = useRef(0);

  const nextEvent = () => {
    setCurrentEventIndex((prev) => (prev + 1) % eventCards.length);
  };
  const prevEvent = () => {
    setCurrentEventIndex((prev) =>
      prev === 0 ? eventCards.length - 1 : prev - 1
    );
  };

  // auto-slide every 6s if not paused
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      nextEvent();
    }, 6000);
    return () => clearInterval(interval);
  }, [isPaused, eventCards.length]);

  const handleTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
    setIsPaused(true);
  };
  const handleTouchMove = (e) => {
    touchEnd.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    const diff = touchStart.current - touchEnd.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextEvent();
      else prevEvent();
    }
    // Resume auto-slide after 3s pause
    setTimeout(() => setIsPaused(false), 3000);
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
        {isRefreshing && (
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
    <div className="min-h-screen text-white overflow-x-hidden px-1 sm:px-2">
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />

            {/* HERO WALLET CARD */}
      <div className="relative mx-2 mt-4 sm:mt-6 mb-6 sm:mb-10">
        <div className="absolute inset-0 bg-card-glow rounded-3xl blur-3xl opacity-60" />
        <div
          className="relative bg-indigo-600/30 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl shadow-wallet border border-indigo-600/20 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl animate-float animate-pulse-glow"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="flex items-center gap-2 sm:gap-3 text-xl sm:text-2xl font-bold text-white">
              <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-400" />
              Wallet Balance
            </h2>

            <div className="flex gap-1 sm:gap-2">
              <button
                onClick={handleRefresh}
                disabled={balanceLoading || isRefreshing}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                aria-label="Refresh"
              >
                <RefreshCw
                  className={`w-4 h-4 sm:w-5 sm:h-5 ${balanceLoading || isRefreshing ? "animate-spin" : ""}`}
                />
              </button>

              <Link
                to="/wallet-transactions"
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                aria-label="Transactions"
              >
                <List className="w-4 h-4 sm:w-5 sm:h-5" />
              </Link>

              <button
                onClick={() => setShowBalance((v) => !v)}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                aria-label={showBalance ? "Hide" : "Show"}
              >
                {showBalance ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>

          {/* Balance */}
          <div className="mb-4 sm:mb-6">{renderBalance()}</div>

          {/* MINI TRANSACTIONS */}
          <div className="hidden-md">
            {recentTx.length > 0 && (
              <div className="mt-4 sm:mt-6 space-y-2">
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Recent Activity
                </p>
                {recentTx.slice(0, 3).map((tx, i) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between text-sm animate-slide-up"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <div className="flex items-center gap-2">
                      {tx.icon}
                      <span className="capitalize">{tx.type}</span>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span className="font-medium">₦{tx.amount.toLocaleString()}</span>
                      <span className="text-xs text-gray-500">{tx.time}</span>
                    </div>
                  </div>
                ))}
                <Link
                  to="/wallet-transactions"
                  className="text-xs text-indigo-400 hover:text-white underline mt-2 inline-block"
                >
                  View all →
                </Link>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 sm:mt-8">
            <p className="text-xs sm:text-sm text-gray-300">Available for spending</p>
            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={() => {
                  setShowDepositModal(true);
                  triggerHaptic();
                }}
                className="group flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl text-sm sm:text-base font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback"
              >
                <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-y-0.5 transition" />
                Deposit
              </button>

              <Link
                to="/deposit"
                className="group flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl text-sm sm:text-base font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback"
              >
                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:-translate-y-0.5 transition" />
                Withdraw
              </Link>
            </div>
          </div>

          {/* Mobile Transactions (shown only on <md) */}
          <div className="block-mobile mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-gray-400 mb-2">Recent Activity</p>
            {recentTx.slice(0, 2).map((tx) => (
              <div key={tx.id} className="flex justify-between text-xs py-1">
                <span className="flex items-center gap-1">
                  {tx.icon} {tx.type}
                </span>
                <span className="text-gray-400">₦{tx.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DEPOSIT MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="relative bg-indigo-600/40 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md border border-indigo-600/30 animate-fade-in">
            <button
              onClick={() => setShowDepositModal(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-300 hover:text-white haptic-feedback"
              aria-label="Close"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-white">Deposit via P2P</h2>
            <p className="text-sm sm:text-base text-gray-300 mb-4 sm:mb-6">
              Create a secure peer-to-peer deposit order in the marketplace.
            </p>
            <Link
              to="/p2p/marketplace"
              onClick={() => {
                setShowDepositModal(false);
                triggerHaptic();
              }}
              className="block w-full text-center bg-indigo-600 text-white py-3 rounded-2xl text-sm sm:text-base font-semibold hover:shadow-lg transform hover:scale-105 transition haptic-feedback"
            >
              Go to Marketplace
            </Link>
          </div>
        </div>
      )}

      {/* Quick Actions - 3 per row */}
      <div className="px-2 sm:px-4 pb-6">
        <h3 className="text-lg sm:text-xl font-semibold mb-4 text-indigo-400">
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { to: "/buy-airtime", label: "Airtime", icon: <Phone className="w-6 h-6" /> },
            { to: "/buy-data", label: "Data", icon: <Globe className="w-6 h-6" /> },
            { to: "/assets", label: "Gas", icon: <Fuel className="w-6 h-6" /> },
            { to: "/sell-crypto", label: "Sell", icon: <Repeat className="w-6 h-6" /> },
            { to: "/p2p/marketplace", label: "Sell", icon: <Repeat2 className="w-6 h-6" /> },
            { to: "/buy-cable-tv", label: "Cable", icon: <Tv className="w-6 h-6" /> },
            { to: "/buy-electricity", label: "Power", icon: <Zap className="w-6 h-6" /> },
            { to: "/buy-education", label: "Edu", icon: <Book className="w-6 h-6" /> },
            { to: "/referral", label: "Refer", icon: <Users className="w-6 h-6" /> },
          ].map((a, i) => (
            <Link
              key={i}
              to={a.to}
              className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-800 border border-indigo-600/20 hover:bg-indigo-600/20 transition-all duration-300"
            >
              <div className="text-indigo-400 mb-1">{a.icon}</div>
              <span className="text-xs font-medium text-gray-300">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ─────── Swipeable Carousel (Slide Transition + Pause) ─────── */}
      <div className="px-2 sm:px-4 pb-8 select-none">
        <h3 className="text-lg sm:text-xl font-semibold mb-4 text-indigo-400">
          Upcoming
        </h3>
        <div
          ref={eventRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative overflow-hidden rounded-3xl"
        >
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{
              transform: `translateX(-${currentEventIndex * 100}%)`,
              width: `${eventCards.length * 100}%`,
            }}
          >
            {eventCards.map((ev, idx) => (
              <div key={idx} className="w-full flex-shrink-0 px-1">
                <div className="bg-gray-800 backdrop-blur-xl p-4 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between border border-indigo-600/20 shadow-wallet h-28 sm:h-36">
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
          </div>
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
