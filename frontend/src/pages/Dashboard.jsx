// src/pages/Dashboard.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet, Phone, Globe, List, Repeat, Repeat2, Tv, Zap, Book, Users, Fuel,
  RefreshCw, ArrowUpRight, ArrowDownLeft, Eye, EyeOff, X,
  Building2, ArrowRightLeft
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
  const [displayBalance, setDisplayBalance] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("");
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const location = useLocation();
  const eventRef = useRef(null);
  const touchStart = useRef(0);
  const touchEnd = useRef(0);

  const eventCards = [
    { title: "Crypto Summit 2025", details: "Join the biggest blockchain event in Lagos", date: "12/6" },
    { title: "Zero-Fee Week", details: "Trade any asset with 0% fees", date: "15/6" },
    { title: "Referral Bonus", details: "Invite a friend – earn ₦500 each", date: "20/6" },
  ];

  const fetchWallet = useCallback(async () => {
    try {
      const walletRes = await client.get("wallet/");
      setWallet(walletRes.data);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load wallet:", err);
      setLoading(false);
    } finally {
      setBalanceLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
    const interval = setInterval(fetchWallet, 30000);
    return () => clearInterval(interval);
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

  // Animate balance display
  useEffect(() => {
    if (!wallet) return;
    let start = displayBalance;
    let end = Number(wallet.balance || 0);
    let frame;
    const duration = 700;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const value = start + (end - start) * eased;
      setDisplayBalance(value);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [wallet?.balance]);

  const renderBalance = () => {
    if (!wallet) return <span className="text-3xl sm:text-4xl font-extrabold text-gray-500">₦0</span>;

    return (
      <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setShowBalance((v) => !v)}>
        {showBalance ? (
          <>
            {formatCurrency(displayBalance.toFixed(2))}
            <EyeOff className="w-5 h-5 text-gray-400" />
          </>
        ) : (
          <>
            <span className="text-3xl sm:text-4xl font-extrabold tracking-widest text-gray-400">••••••</span>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen text-white overflow-x-hidden px-1 sm:px-2">
      {/* HERO WALLET CARD */}
      <div className="relative mx-2 mt-4 sm:mt-6 mb-6 sm:mb-10">
        <div className="relative bg-indigo-600/30 backdrop-blur-2xl p-5 sm:p-8 rounded-3xl shadow-wallet border border-indigo-600/20 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-lg sm:text-2xl font-bold text-white">
              <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-400" />
              Wallet Balance
            </h2>

            <div className="flex gap-1">
              <button onClick={handleRefresh} disabled={balanceLoading || isRefreshing} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback">
                <RefreshCw className={`w-4 h-4 ${balanceLoading || isRefreshing ? "animate-spin" : ""}`} />
              </button>
              <Link to="/wallet-transactions" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback">
                <List className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Balance */}
          <div className="mb-4">{renderBalance()}</div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-5">
            <button onClick={() => openModal("deposit")} className="group flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-2xl text-sm font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback">
              <ArrowDownLeft className="w-4 h-4 group-hover:translate-y-0.5 transition" />
              Deposit
            </button>
            <button onClick={() => openModal("withdraw")} className="group flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-2xl text-sm font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback">
              <ArrowUpRight className="w-4 h-4 group-hover:-translate-y-0.5 transition" />
              Withdraw
            </button>
          </div>

          {/* Virtual Accounts */}
          <div className="my-5 border-t border-white/10"></div>
          <div className="space-y-2">
            {wallet?.virtual_accounts?.length > 0 ? (
              <>
                {wallet.virtual_accounts.slice(0, 3).map((va, i) => (
                  <div
                    key={va.id}
                    className="flex items-center justify-between text-xs bg-white/5 backdrop-blur-sm p-2.5 rounded-xl border border-indigo-500/20 animate-slide-up"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-white tracking-wider">{va.account_number}</span>
                      <span className="text-xs text-gray-400">{va.bank_name}</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(va.account_number);
                        setCopiedId(va.id);
                        triggerHaptic();
                        setTimeout(() => setCopiedId(null), 1500);
                      }}
                      className={`text-xs font-medium py-1 px-2 rounded-lg transition haptic-feedback ${
                        copiedId === va.id ? "bg-green-600 text-white" : "bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40"
                      }`}
                    >
                      {copiedId === va.id ? "Copied!" : "Copy"}
                    </button>
                  </div>
                ))}
                {wallet.virtual_accounts.length > 3 && (
                  <Link to="/deposit" className="text-xs text-indigo-400 hover:text-white underline inline-block mt-1">
                    View all ({wallet.virtual_accounts.length})
                  </Link>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">No virtual accounts assigned</p>
            )}
          </div>
        </div>
      </div>

      {/* MODAL, QUICK ACTIONS, EVENT CAROUSEL — UNCHANGED */}
        {/* ... (your existing modal, quick actions, and event carousel) */}
        {/* UNIVERSAL MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="relative bg-indigo-600/40 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md border border-indigo-600/30">
              <button onClick={closeModal} className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-300 hover:text-white haptic-feedback">
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
              <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-white">
                {modalType === "deposit" ? "Deposit Funds" : "Withdraw Funds"}
              </h2>
              <p className="text-sm sm:text-base text-gray-300 mb-4 sm:mb-6">
                Choose how you’d like to {modalType === "deposit" ? "add" : "withdraw"} money.
              </p>
              <div className="space-y-3">
                <Link to={modalType === "deposit" ? "/deposit/" : "/withdraw/"} onClick={closeModal} className="group flex items-center justify-between w-full p-4 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-6 h-6 text-indigo-400" />
                    <div>
                      <p className="font-medium text-white">Bank Transfer</p>
                      <p className="text-xs text-gray-400">Instant via your bank</p>
                    </div>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-gray-400 group-hover:text-indigo-300 transition" />
                </Link>
                <Link to="/p2p/marketplace" onClick={closeModal} className="group flex items-center justify-between w-full p-4 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <Repeat2 className="w-6 h-6 text-indigo-400" />
                    <div>
                      <p className="font-medium text-white">P2P Marketplace</p>
                      <p className="text-xs text-gray-400">Trade directly with users</p>
                    </div>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-gray-400 group-hover:text-indigo-300 transition" />
                </Link>
                <Link to="/p2p/marketplace" onClick={closeModal} className="group flex items-center justify-between w-full p-4 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all duration-300">
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
            { to: "/assets", label: "Gas fee", icon: <Fuel className="w-6 h-6" /> },
            { to: "/sell-crypto", label: "Sell", icon: <Repeat className="w-6 h-6" /> },
            { to: "/p2p/marketplace", label: "P2P", icon: <Repeat2 className="w-6 h-6" /> },
            { to: "/buy-cable-tv", label: "Cable", icon: <Tv className="w-6 h-6" /> },
            { to: "/buy-electricity", label: "Power", icon: <Zap className="w-6 h-6" /> },
            { to: "/buy-education", label: "Edu", icon: <Book className="w-6 h-6" /> },
            { to: "/referral", label: "Refer", icon: <Users className="w-6 h-6" /> },
          ].map((a, i) => (
            <Link key={i} to={a.to} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-800 border border-indigo-600/20 hover:bg-indigo-600/20 transition-all duration-300">
              <div className="text-indigo-400 mb-1">{a.icon}</div>
              <span className="text-xs font-medium text-gray-300">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Event Carousel */}
      <div className="px-2 sm:px-4 pb-10">
        <h3 className="text-lg font-bold mb-3 text-indigo-400">Upcoming</h3>
        <div ref={eventRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className="relative overflow-hidden rounded-2xl">
          <div className="flex transition-transform duration-700 ease-in-out" style={{ transform: `translateX(-${currentEventIndex * 100}%)` }}>
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
              <button key={idx} onClick={() => setCurrentEventIndex(idx)} className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentEventIndex ? "bg-indigo-400 w-4" : "bg-gray-600"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
