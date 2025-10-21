// src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
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
  const formattedAmount = Number(amount).toLocaleString("en-NG");
  return (
    <span className="inline-flex items-baseline">
      <span className="text-xl font-bold">₦</span>
      <span className="text-3xl font-bold ml-1">{formattedAmount}</span>
    </span>
  );
};

export default function Dashboard() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [recentTransaction, setRecentTransaction] = useState(false);
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

  const fetchWallet = async (retryCount = 0, maxRetries = 5) => {
    setBalanceLoading(true);
    try {
      const res = await client.get("wallet/", {
        params: { t: new Date().getTime() },
      });
      console.log("Wallet fetch response:", {
        status: res.status,
        data: res.data,
        timestamp: new Date().toISOString(),
      });
      setWallet(res.data);
      setLoading(false);
      setBalanceLoading(false);
    } catch (err) {
      console.error("Wallet fetch error:", {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
        timestamp: new Date().toISOString(),
      });
      if (retryCount < maxRetries && err.response?.status !== 401) {
        console.log(`Retrying wallet fetch (${retryCount + 1}/${maxRetries})...`);
        setTimeout(() => fetchWallet(retryCount + 1, maxRetries), 1000);
      } else {
        toast.error("Failed to load wallet data. Please try again.");
        setLoading(false);
        setBalanceLoading(false);
      }
    }
  };

  useEffect(() => {
    console.log("Location state:", location.state, "Pathname:", location.pathname);
    fetchWallet();
    setRecentTransaction(true); // Aggressive polling on mount to catch admin funding

    let walletPollInterval = setInterval(fetchWallet, 8000);

    const fromTransactionRoute =
      transactionRoutes.some((route) => location.pathname.startsWith(route)) ||
      location.state?.transactionCompleted ||
      location.state?.fromTransaction;

    if (fromTransactionRoute) {
      setRecentTransaction(true);
      toast.success("Transaction processed! Updating balance...");
      fetchWallet();
    }

    if (recentTransaction) {
      clearInterval(walletPollInterval);
      walletPollInterval = setInterval(fetchWallet, 3000); // Poll every 3 seconds
      setTimeout(() => {
        clearInterval(walletPollInterval);
        walletPollInterval = setInterval(fetchWallet, 8000); // Revert to 8 seconds
        setRecentTransaction(false);
      }, 30000); // Stop aggressive polling after 30 seconds
    }

    const eventInterval = setInterval(() => {
      setCurrentEventIndex((prevIndex) => (prevIndex === 2 ? 0 : prevIndex + 1));
    }, 5000);

    return () => {
      clearInterval(walletPollInterval);
      clearInterval(eventInterval);
    };
  }, [location]);

  const handleCloseDepositModal = () => {
    setShowDepositModal(false);
    setRecentTransaction(true);
    fetchWallet();
  };

  if (loading) return <p className="text-center text-gray-400">Loading wallet...</p>;

  const renderBalance = () => {
    if (!showBalance) {
      return <span className="text-3xl font-bold">****</span>;
    }
    return (
      <span className="flex items-center">
        {wallet ? formatCurrency(wallet.balance || 0.0) : formatCurrency(0.0)}
        {balanceLoading && <RefreshCw className="w-4 h-4 ml-2 animate-spin" />}
      </span>
    );
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Account number copied to clipboard!");
    });
  };

  const eventCards = [
    { title: "Placeholder Event 1", details: "Details coming soon...", date: "4/6" },
    { title: "Placeholder Event 2", details: "Details coming soon...", date: "5/6" },
    { title: "Placeholder Event 3", details: "Details coming soon...", date: "6/6" },
  ];

  const currentEvent = eventCards[currentEventIndex];

  return (
    <div className="min-h-screen text-white">
      <ToastContainer />
      <div className="bg-indigo-600/30 backdrop-blur-md text-white p-6 rounded-2xl shadow-xl mx-4 mt-4 border border-indigo-600/20">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="w-5 h-5" /> Wallet Balance
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchWallet();
                toast.info("Refreshing balance...");
              }}
              className="text-xs px-2 py-1 rounded-full bg-gray-700/80 hover:bg-gray-600 transition"
              disabled={balanceLoading}
            >
              <RefreshCw className={`w-4 h-4 ${balanceLoading ? "animate-spin" : ""}`} />
            </button>
            <Link
              to="/wallet-transactions"
              className="text-xs px-2 py-1 rounded-full flex items-center bg-gray-700/80 hover:bg-gray-600 transition"
            >
              <List className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-xs px-2 py-1 rounded-full bg-gray-700/80 hover:bg-gray-600 transition"
            >
              {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <p className="text-3xl font-bold mt-4">{renderBalance()}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-white/70">Available Balance</p>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowDepositModal(true)}
              className="bg-indigo-600/80 text-white px-4 py-2 rounded-full text-sm hover:bg-indigo-700 transition"
            >
              <ArrowDownLeft className="w-6 h-6" />
            </button>
            <Link
              to="/withdraw"
              className="bg-indigo-600/80 text-white px-4 py-2 rounded-full text-sm hover:bg-indigo-700 transition"
            >
              <ArrowUpRight className="w-6 h-6" />
            </Link>
          </div>
        </div>
      </div>

      {showDepositModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 pt-20 pl-60">
          <div className="bg-gray-900 p-6 rounded-2xl shadow-xl w-96 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />
            <div className="relative z-10">
              <button
                onClick={handleCloseDepositModal}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-bold mb-4">Deposit via P2P</h2>
              <p className="text-sm text-gray-400">
                Please create a P2P deposit order from the marketplace.
              </p>
              <Link
                to="/p2p/marketplace"
                className="mt-4 inline-block bg-indigo-600 text-white px-4 py-2 rounded-full hover:bg-indigo-700"
              >
                Go to P2P Marketplace
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mt-6">
        <div className="bg-gray-800 p-4 rounded-xl shadow">
          <div className="grid grid-cols-4 gap-4">
            {[
              { to: "/buy-airtime", label: "Airtime", icon: <Phone className="w-6 h-6 text-indigo-600/80" /> },
              { to: "/buy-data", label: "Data", icon: <Globe className="w-6 h-6 text-indigo-600/80" /> },
              { to: "/assets", label: "Gas fee", icon: <Fuel className="w-6 h-6 text-indigo-600/80" /> },
              { to: "/sell-crypto", label: "Sell", icon: <Repeat className="w-6 h-6 text-indigo-600/80" /> },
              { to: "/cable-tv", label: "Cable", icon: <Tv className="w-6 h-6 text-indigo-600/80" /> },
              { to: "/electricity", label: "Electricity", icon: <Zap className="w-6 h-6 text-indigo-600/80" /> },
              { to: "/education", label: "Education", icon: <Book className="w-6 h-6 text-indigo-600/80" /> },
              { to: "/referral", label: "Referral", icon: <Users className="w-6 h-6 text-indigo-600/80" /> },
            ].map((action, i) => (
              <Link
                key={i}
                to={action.to}
                state={{ returnToDashboard: true, fromTransaction: true }}
                className="flex flex-col items-center justify-center hover:bg-gray-700 p-4 rounded-lg transition"
                onClick={() => {
                  toast.info("Processing transaction...");
                  setRecentTransaction(true);
                }}
              >
                {action.icon}
                <span className="text-sm mt-2">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 mt-6">
        <h3 className="text-lg font-semibold mb-4">Event</h3>
        <div className="w-full">
          <div className="bg-gray-800 p-6 rounded-2xl shadow w-full flex items-center justify-between transition-opacity duration-500">
            <div>
              <p className="text-sm text-gray-400">{currentEvent.title}</p>
              <p className="text-white mt-2">{currentEvent.details}</p>
            </div>
            <span className="text-xs text-gray-500">{currentEvent.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}