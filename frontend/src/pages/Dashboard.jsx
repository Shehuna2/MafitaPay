// src/pages/Dashboard.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet, Phone, Globe, List, Repeat2, Tv, Zap, Book, Users, Fuel,
  RefreshCw, ArrowUpRight, ArrowDownLeft, Repeat, Eye, EyeOff, X,
  ArrowDownCircle, Clock, Building2, ArrowRightLeft
} from "lucide-react";
import client from "../api/client";

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
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("");
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [recentTx, setRecentTx] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const location = useLocation();

  const eventCards = [
    { title: "Crypto Summit 2025", details: "Join the biggest blockchain event in Lagos", date: "12/6" },
    { title: "Zero-Fee Week", details: "Trade any asset with 0% fees", date: "15/6" },
    { title: "Referral Bonus", details: "Invite a friend – earn ₦5,000 each", date: "20/6" },
  ];

  const fetchWallet = useCallback(async () => {
    try {
      const [walletRes, txRes] = await Promise.all([
        client.get("wallet/"),
        client.get("/wallet/transactions/?limit=3")
      ]);

      setWallet(walletRes.data);

      const data = Array.isArray(txRes.data) ? txRes.data : txRes.data.results || [];
      const formattedTx = data.map(tx => ({
        id: tx.id,
        type: tx.category === "crypto" ? "Crypto" : tx.category === "airtime" ? "Airtime" : tx.category === "data" ? "Data" : "Other",
        amount: parseFloat(tx.amount),
        time: new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        icon: tx.tx_type === "credit" ? (
          <ArrowDownCircle className="w-4 h-4 text-green-400" />
        ) : (
          <ArrowUpRight className="w-4 h-4 text-red-400" />
        ),
      }));

      setRecentTx(formattedTx);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load wallet/transactions:", err);
      setRecentTx([]);
      setLoading(false);
    } finally {
      setBalanceLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const handleRefresh = async () => {
    if (balanceLoading || isRefreshing) return;
    setBalanceLoading(true);
    setIsRefreshing(true);
    await fetchWallet();
    triggerHaptic();
  };

  const triggerHaptic = () => {
    if ("vibrate" in navigator) navigator.vibrate?.(30);
  };

  const openModal = (type) => {
    setModalType(type);
    setShowModal(true);
    triggerHaptic();
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType("");
  };

  const eventRef = useRef(null);
  const touchStart = useRef(0);
  const touchEnd = useRef(0);

  const nextEvent = () => setCurrentEventIndex((prev) => (prev + 1) % eventCards.length);
  const prevEvent = () => setCurrentEventIndex((prev) => (prev === 0 ? eventCards.length - 1 : prev - 1));

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextEvent, 6000);
    return () => clearInterval(interval);
  }, [isPaused, eventCards.length]);

  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; setIsPaused(true); };
  const handleTouchMove = (e) => { touchEnd.current = e.touches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStart.current - touchEnd.current;
    if (Math.abs(diff) > 50) diff > 0 ? nextEvent() : prevEvent();
    setTimeout(() => setIsPaused(false), 3000);
  };

  const renderBalance = () => {
    if (!wallet) return <span className="text-3xl sm:text-4xl font-extrabold text-gray-500">₦0</span>;
    if (!showBalance) return <span className="text-3xl sm:text-4xl font-extrabold tracking-widest text-gray-400">••••••</span>;

    return (
      <div className="flex items-center gap-3">
        {formatCurrency(wallet.balance)}
        {isRefreshing && <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-indigo-400" />}
      </div>
    );
  };

  if (loading) {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .shimmer {
            background: linear-gradient(90deg, #1a1a2e 25%, #2a2a3e 50%, #1a1a2e 75%);
            background-size: 200% 100%;
            animation: shimmer 1.8s infinite linear;
          }
          .pulse-slow { animation: pulse 2s ease-in-out infinite; }
          @keyframes pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 0.4; } }
        `}</style>

        <div className="min-h-screen bg-gray-900 text-white px-3 py-6 animate-fade-in">
          {/* Wallet Card Skeleton */}
          <div className="w-full max-w-md sm:max-w-lg md:max-w-2xl mx-auto mb-6">
            <div className="bg-indigo-600/30 backdrop-blur-2xl p-4 sm:p-6 rounded-3xl border border-indigo-600/20">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 w-full">
                  <div className="w-8 h-8 bg-gray-700/50 rounded-full shimmer" />
                  <div className="h-6 flex-1 bg-gray-700/50 rounded shimmer" />
                </div>
                <div className="hidden sm:flex gap-2 ml-4 shrink-0">
                  {Array(3).fill().map((_, i) => (
                    <div key={i} className="w-9 h-9 rounded-xl bg-gray-700/50 shimmer" />
                  ))}
                </div>
              </div>

              {/* Balance */}
              <div className="mb-6">
                <div className="h-10 w-3/4 bg-gray-700/50 rounded shimmer mx-auto" />
              </div>

              {/* Recent Activity (Mobile) */}
              <div className="block md:hidden space-y-2">
                {Array(3).fill().map((_, i) => (
                  <div key={i} className="h-5 w-full bg-gray-700/50 rounded shimmer" />
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                <div className="h-11 flex-1 bg-indigo-600/50 rounded-2xl shimmer" />
                <div className="h-11 flex-1 bg-indigo-600/50 rounded-2xl shimmer" />
              </div>
            </div>
          </div>

          {/* Quick Actions Skeleton */}
          <div className="px-2 sm:px-4 mb-6">
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {Array(9).fill().map((_, i) => (
                <div key={i} className="flex flex-col items-center justify-center p-3 rounded-2xl bg-gray-800 border border-indigo-600/20">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700/50 rounded-full shimmer mb-2" />
                  <div className="h-3 w-1/2 bg-gray-700/50 rounded shimmer" />
                </div>
              ))}
            </div>
          </div>

          {/* Event Carousel Skeleton */}
          <div className="px-2 sm:px-4">
            <div className="h-5 w-1/3 bg-gray-700/50 rounded shimmer mb-3" />
            <div className="bg-gray-800/60 backdrop-blur-md p-4 rounded-xl border border-gray-700/50 h-28 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="h-4 w-2/3 bg-gray-700/50 rounded shimmer" />
                <div className="h-5 w-5/6 bg-gray-700/50 rounded shimmer" />
              </div>
              <div className="h-7 w-20 bg-indigo-600/30 rounded-full shimmer self-end" />
            </div>
            <div className="flex justify-center gap-1.5 mt-3">
              <div className="w-4 h-1.5 bg-indigo-400 rounded-full pulse-slow" />
              <div className="w-1.5 h-1.5 bg-gray-600 rounded-full pulse-slow" />
              <div className="w-1.5 h-1.5 bg-gray-600 rounded-full pulse-slow" />
            </div>
          </div>
        </div>
      </>
    );
  }


  return (
    <>
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.4s ease-out; }

        .shadow-wallet {
          box-shadow: 0 8px 32px rgba(0,0,0,0.25),
                      inset 0 1px 0 rgba(255,255,255,0.1);
        }

        .haptic-feedback {
          transition: transform 0.1s;
        }
        .haptic-feedback:active { transform: scale(0.96); }
      `}</style>

      <div className="min-h-screen text-white overflow-x-hidden px-1 sm:px-2">
        {/* HERO WALLET CARD */}
        <div className="relative mx-2 mt-4 sm:mt-6 mb-6 sm:mb-10">
          <div className="relative bg-indigo-600/30 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl shadow-wallet border border-indigo-600/20 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
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
                  <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${balanceLoading || isRefreshing ? "animate-spin" : ""}`} />
                </button>

                <Link
                  to="/wallet-transactions"
                  className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                  aria-label="Transactions"
                >
                  <List className="w-4 h-4 sm:w-5 sm:h-5" />
                </Link>

                <button
                  onClick={() => setShowBalance(v => !v)}
                  className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                  aria-label={showBalance ? "Hide" : "Show"}
                >
                  {showBalance ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              </div>
            </div>

            {/* Balance */}
            <div className="mb-4 sm:mb-6">{renderBalance()}</div>

            {/* MINI TRANSACTIONS (desktop) */}
            <div className="hidden md:block">
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
                    View all
                  </Link>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 sm:mt-8">
              <p className="text-xs sm:text-sm text-gray-300">Available for spending</p>
              <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                <button
                  onClick={() => openModal("deposit")}
                  className="group flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl text-sm sm:text-base font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback"
                >
                  <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-y-0.5 transition" />
                  Deposit
                </button>

                <button
                  onClick={() => openModal("withdraw")}
                  className="group flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl text-sm sm:text-base font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback"
                >
                  <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:-translate-y-0.5 transition" />
                  Withdraw
                </button>
              </div>
            </div>

            {/* Mobile Transactions */}
            <div className="block md:hidden mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-gray-400 mb-2">Recent Activity</p>
              {recentTx.slice(0, 2).map((tx) => (
                <div key={tx.id} className="flex justify-between text-xs py-1">
                  <span className="flex items-center gap-1">{tx.icon} {tx.type}</span>
                  <span className="text-gray-400">₦{tx.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* UNIVERSAL MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="relative bg-indigo-600/40 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md border border-indigo-600/30">
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-300 hover:text-white haptic-feedback"
                aria-label="Close"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-white">
                {modalType === "deposit" ? "Deposit Funds" : "Withdraw Funds"}
              </h2>
              <p className="text-sm sm:text-base text-gray-300 mb-4 sm:mb-6">
                Choose how you’d like to {modalType === "deposit" ? "add" : "withdraw"} money.
              </p>

              <div className="space-y-3">
                <Link
                  to={modalType === "deposit" ? "/deposit/" : "/withdraw/"}
                  onClick={closeModal}
                  className="group flex items-center justify-between w-full p-4 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-6 h-6 text-indigo-400" />
                    <div>
                      <p className="font-medium text-white">Bank Transfer</p>
                      <p className="text-xs text-gray-400">Instant via your bank</p>
                    </div>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-gray-400 group-hover:text-indigo-300 transition" />
                </Link>

                <Link
                  to="/p2p/marketplace"
                  onClick={closeModal}
                  className="group flex items-center justify-between w-full p-4 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <Repeat2 className="w-6 h-6 text-indigo-400" />
                    <div>
                      <p className="font-medium text-white">P2P Marketplace</p>
                      <p className="text-xs text-gray-400">Trade directly with users</p>
                    </div>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-gray-400 group-hover:text-indigo-300 transition" />
                </Link>
                <Link
                  to="/p2p/marketplace"
                  onClick={closeModal}
                  className="group flex items-center justify-between w-full p-4 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <Repeat2 className="w-6 h-6 text-indigo-400" />
                    <div>
                      <p className="font-medium text-white">Cards Deposit</p>
                      <p className="text-xs text-gray-400">Instant Card Deposit</p>
                    </div>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-gray-400 group-hover:text-indigo-300 transition" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="px-2 sm:px-4 pb-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { to: "/buy-airtime", label: "Airtime", icon: <Phone className="w-6 h-6" /> },
              { to: "/buy-data", label: "Data", icon: <Globe className="w-6 h-6" /> },
              { to: "/assets", label: "Gas", icon: <Fuel className="w-6 h-6" /> },
              { to: "/sell-crypto", label: "Sell", icon: <Repeat className="w-6 h-6" /> },
              { to: "/p2p/marketplace", label: "P2P", icon: <Repeat2 className="w-6 h-6" /> },
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

        {/* Event Carousel */}
        <div className="px-2 sm:px-4">
          <h3 className="text-lg font-bold mb-3 text-indigo-400">Upcoming</h3>
          <div
            ref={eventRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative overflow-hidden rounded-2xl"
          >
            <div
              className="flex transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${currentEventIndex * 100}%)` }}
            >
              {eventCards.map((ev, idx) => (
                <div key={idx} className="w-full flex-shrink-0 px-1">
                  <div className="bg-gray-800/60 backdrop-blur-md p-4 rounded-xl border border-gray-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between h-28">
                    <div>
                      <p className="text-xs text-indigo-300">{ev.title}</p>
                      <p className="mt-1 text-sm font-bold text-white">{ev.details}</p>
                    </div>
                    <span className="mt-2 sm:mt-0 bg-indigo-600/30 text-indigo-300 px-2.5 py-1 rounded-full text-xs font-bold">
                      {ev.date}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1.5">
              {eventCards.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentEventIndex(idx)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentEventIndex ? "bg-indigo-400 w-4" : "bg-gray-600"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}