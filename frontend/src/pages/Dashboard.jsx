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
      <span className="text-2xl font-extrabold text-indigo-400">₦</span>
      <span className="text-5xl font-extrabold ml-1 tracking-tight">{formatted}</span>
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

  // Mock recent transactions (replace with real API later)
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
      setRecentTx(mockTransactions); // Replace with real API
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
      triggerHaptic();
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
    triggerHaptic();
  };

  // Haptic feedback (mobile only)
  const triggerHaptic = () => {
    if ("vibrate" in navigator) {
      navigator.vibrate?.(30);
    }
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
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-indigo-600/30 backdrop-blur-xl p-10 rounded-3xl shadow-wallet w-full max-w-lg animate-pulse border border-indigo-600/20">
          <div className="h-8 bg-gray-700 rounded w-44 mb-6" />
          <div className="h-14 bg-gray-700 rounded w-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white overflow-x-hidden">
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />

      {/* HERO WALLET CARD */}
      <div className="relative mx-4 mt-6 mb-12">
        <div className="absolute inset-0 bg-card-glow rounded-3xl blur-3xl opacity-60" />
        <div
          className="relative bg-indigo-600/30 backdrop-blur-2xl p-8 rounded-3xl shadow-wallet border border-indigo-600/20 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl animate-float animate-pulse-glow"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
              <Wallet className="w-8 h-8 text-indigo-400" />
              Wallet Balance
            </h2>

            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={balanceLoading || isRefreshing}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                aria-label="Refresh"
              >
                <RefreshCw
                  className={`w-5 h-5 ${balanceLoading || isRefreshing ? "animate-spin" : ""}`}
                />
              </button>

              <Link
                to="/wallet-transactions"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                aria-label="Transactions"
              >
                <List className="w-5 h-5" />
              </Link>

              <button
                onClick={() => setShowBalance((v) => !v)}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition haptic-feedback"
                aria-label={showBalance ? "Hide" : "Show"}
              >
                {showBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="mb-6">{renderBalance()}</div>

          {/* MINI TRANSACTION PREVIEW */}
          {recentTx.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Recent Activity
              </p>
              {recentTx.slice(0, 3).map((tx, i) => (
                <div
                  key={tx.id}
                  className={`flex items-center justify-between text-sm animate-slide-up`}
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

          <div className="flex items-center justify-between mt-8">
            <p className="text-sm text-gray-300">Available for spending</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDepositModal(true);
                  triggerHaptic();
                }}
                className="group flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback"
              >
                <ArrowDownLeft className="w-5 h-5 group-hover:translate-y-0.5 transition" />
                Deposit
              </button>

              <Link
                to="/deposit"
                className="group flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition haptic-feedback"
              >
                <ArrowUpRight className="w-5 h-5 group-hover:-translate-y-0.5 transition" />
                Withdraw
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* DEPOSIT MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="relative bg-indigo-600/40 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border border-indigo-600/30 animate-fade-in">
            <button
              onClick={() => setShowDepositModal(false)}
              className="absolute top-4 right-4 text-gray-300 hover:text-white haptic-feedback"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-2xl font-bold mb-4 text-white">Deposit via P2P</h2>
            <p className="text-gray-300 mb-6">
              Create a secure peer-to-peer deposit order in the marketplace.
            </p>
            <Link
              to="/p2p/marketplace"
              onClick={() => {
                setShowDepositModal(false);
                triggerHaptic();
              }}
              className="inline-block w-full text-center bg-indigo-600 text-white py-3 rounded-2xl font-semibold hover:shadow-lg transform hover:scale-105 transition haptic-feedback"
            >
              Go to Marketplace
            </Link>
          </div>
        </div>
      )}

      {/* QUICK ACTIONS */}
      <div className="px-4 lg:px-8 mb-12">
        <h3 className="text-xl font-semibold mb-5 text-indigo-400">Quick Actions</h3>
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
              className="group flex flex-col items-center justify-center p-5 rounded-2xl bg-gray-800 backdrop-blur-sm border border-indigo-600/20 hover:bg-indigo-600/20 transform hover:scale-105 transition-all duration-300 haptic-feedback"
            >
              <div className="text-indigo-400 group-hover:text-white transition">
                {a.icon}
              </div>
              <span className="mt-2 text-xs font-medium text-gray-300 group-hover:text-white">
                {a.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* EVENT CAROUSEL */}
      <div className="px-4 lg:px-8">
        <h3 className="text-xl font-semibold mb-5 text-indigo-400">Upcoming</h3>
        <div className="relative h-36 overflow-hidden rounded-3xl">
          {eventCards.map((ev, idx) => (
            <div
              key={idx}
              className={`absolute inset-0 transition-opacity duration-700 ${
                idx === currentEventIndex ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="h-full bg-gray-800 backdrop-blur-xl p-6 rounded-3xl flex items-center justify-between border border-indigo-600/20 shadow-wallet">
                <div>
                  <p className="text-sm text-indigo-300">{ev.title}</p>
                  <p className="mt-1 text-lg font-medium text-white">{ev.details}</p>
                </div>
                <span className="bg-indigo-600/30 text-indigo-300 px-3 py-1 rounded-full text-xs font-semibold">
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