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
      <span className="text-2xl font-extrabold text-yellow-400">₦</span>
      <span className="text-5xl font-extrabold ml-1 tracking-tight">{formatted}</span>
    </span>
  );
};

export default function Dashboard() {
  /* ==== STATE ==== */
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
    { title: "Crypto Summit 2025", details: "Join the biggest blockchain event in Lagos", date: "12/6" },
    { title: "Zero-Fee Week", details: "Trade any asset with 0% fees", date: "15/6" },
    { title: "Referral Bonus", details: "Invite a friend – earn ₦5,000 each", date: "20/6" },
  ];

  /* ==== API ==== */
  const fetchWallet = useCallback(async () => {
    if (balanceLoading || isRefreshing) return;
    setBalanceLoading(true);
    try {
      const res = await client.get("wallet/");
      setWallet(res.data);
      setLoading(false);
    } catch (err) {
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
    }
  }, [location.pathname, location.state, fetchWallet]);

  useEffect(() => {
    const int = setInterval(() => {
      setCurrentEventIndex((i) => (i + 1) % eventCards.length);
    }, 5000);
    return () => clearInterval(int);
  }, []);

  const handleRefresh = async () => {
    if (balanceLoading || isRefreshing) return;
    setIsRefreshing(true);
    toast.info("Refreshing…");
    await fetchWallet();
  };

  const renderBalance = () => {
    if (!wallet) return <span className="text-5xl font-extrabold text-gray-500">₦0</span>;

    if (!showBalance)
      return (
        <span className="text-5xl font-extrabold tracking-widest text-gray-400">••••••</span>
      );

    return (
      <div className="flex items-center gap-3">
        {formatCurrency(wallet.balance)}
        {(balanceLoading || isRefreshing) && (
          <RefreshCw className="w-6 h-6 animate-spin text-yellow-400" />
        )}
      </div>
    );
  };

  /* ==== UI ==== */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-indigo-900/40 to-violet-900/30 backdrop-blur-xl p-10 rounded-3xl shadow-wallet w-full max-w-lg animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-44 mb-6" />
          <div className="h-14 bg-gray-700 rounded w-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />

      {/* ==== HERO WALLET CARD ==== */}
      <div className="relative mx-4 mt-6 mb-12">
        <div className="absolute inset-0 bg-card-glow rounded-3xl opacity-60" />
        <div
          className="relative bg-gradient-to-br from-indigo-900/60 via-violet-800/40 to-indigo-900/60 backdrop-blur-2xl p-8 rounded-3xl shadow-wallet border border-white/10 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          style={{ animation: "float 6s ease-in-out infinite" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="flex items-center gap-3 text-2xl font-bold text-yellow-300">
              <Wallet className="w-8 h-8" />
              Wallet Balance
            </h2>

            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={balanceLoading || isRefreshing}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition"
                aria-label="Refresh"
              >
                <RefreshCw
                  className={`w-5 h-5 ${balanceLoading || isRefreshing ? "animate-spin" : ""}`}
                />
              </button>

              <Link
                to="/wallet-transactions"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition"
                aria-label="Transactions"
              >
                <List className="w-5 h-5" />
              </Link>

              <button
                onClick={() => setShowBalance((v) => !v)}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition"
                aria-label={showBalance ? "Hide" : "Show"}
              >
                {showBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Balance */}
          <div className="mb-6">{renderBalance()}</div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-300">Available for spending</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDepositModal(true)}
                className="group flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-5 py-3 rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition"
              >
                <ArrowDownLeft className="w-5 h-5 group-hover:translate-y-0.5 transition" />
                Deposit
              </button>

              <Link
                to="/deposit"
                className="group flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-3 rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition"
              >
                <ArrowUpRight className="w-5 h-5 group-hover:-translate-y-0.5 transition" />
                Withdraw
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ==== DEPOSIT MODAL ==== */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="relative bg-gradient-to-br from-indigo-900/80 to-violet-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border border-white/20 transform transition-all">
            <button
              onClick={() => setShowDepositModal(false)}
              className="absolute top-4 right-4 text-gray-300 hover:text-white"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-2xl font-bold mb-4 text-yellow-300">Deposit via P2P</h2>
            <p className="text-gray-300 mb-6">
              Create a secure peer-to-peer deposit order in the marketplace.
            </p>
            <Link
              to="/p2p/marketplace"
              onClick={() => setShowDepositModal(false)}
              className="inline-block w-full text-center bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-2xl font-semibold hover:shadow-lg transform hover:scale-105 transition"
            >
              Go to Marketplace
            </Link>
          </div>
        </div>
      )}

      {/* ==== QUICK ACTIONS ==== */}
      <div className="px-4 lg:px-8 mb-12">
        <h3 className="text-xl font-semibold mb-5 text-yellow-300">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { to: "/buy-airtime", label: "Airtime", icon: <Phone className="w-7 h-7" /> },
            { to: "/buy-data", label: "Data", icon: <Globe className="w-7 h-7" /> },
            { to: "/assets", label: "Gas", icon: <Fuel className="w-7 h-7" /> },
            { to: "/sell-crypto", label: "Sell", icon: <Repeat className="w-7 h-7" /> },
            { to: "/buy-cable-tv", label: "Cable", icon: <Tv className="w-7 h-7" /> },
            { to: "/buy-electricity", label: "Power", icon: <Zap className="w-7 h-7" /> },
            { to: "/buy-education", label: "Edu", icon: <Book className="w-7 h-7" /> },
            { to: "/referral", label: "Refer", icon: <Users className="w-7 h-7" /> },
          ].map((a, i) => (
            <Link
              key={i}
              to={a.to}
              state={{ returnToDashboard: true }}
              className="group flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-b from-white/5 to-white/10 backdrop-blur-sm border border-white/10 hover:from-indigo-600/30 hover:to-violet-600/30 transform hover:scale-105 transition-all duration-300"
            >
              <div className="text-indigo-300 group-hover:text-yellow-300 transition">
                {a.icon}
              </div>
              <span className="mt-2 text-xs font-medium text-gray-200 group-hover:text-white">
                {a.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ==== EVENT CAROUSEL ==== */}
      <div className="px-4 lg:px-8">
        <h3 className="text-xl font-semibold mb-5 text-yellow-300">Upcoming</h3>
        <div className="relative h-36 overflow-hidden rounded-3xl">
          {eventCards.map((ev, idx) => (
            <div
              key={idx}
              className={`absolute inset-0 transition-opacity duration-700 ${
                idx === currentEventIndex ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="h-full bg-gradient-to-r from-indigo-900/50 to-violet-900/50 backdrop-blur-xl p-6 rounded-3xl flex items-center justify-between border border-white/10 shadow-wallet">
                <div>
                  <p className="text-sm text-indigo-200">{ev.title}</p>
                  <p className="mt-1 text-lg font-medium text-white">{ev.details}</p>
                </div>
                <span className="bg-yellow-400/20 text-yellow-300 px-3 py-1 rounded-full text-xs font-semibold">
                  {ev.date}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}