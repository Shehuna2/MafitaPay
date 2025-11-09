import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  CheckCircle,
  Loader2,
} from "lucide-react";
import DepositOffers from "./DepositOffers";
import WithdrawOffers from "./WithdrawOffers";

export default function OffersHub() {
  const [activeTab, setActiveTab] = useState(
    localStorage.getItem("activeP2PTab") || "deposit"
  );
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem("activeP2PTab", activeTab);
  }, [activeTab]);

  // 👇 Listen for offer creation event
  useEffect(() => {
    const handleOfferCreated = () => {
      setIsLoading(true);
      setRefreshTrigger((prev) => prev + 1);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3000);
      setTimeout(() => setIsLoading(false), 1500); // show brief loading
    };

    window.addEventListener("offerCreated", handleOfferCreated);
    return () => window.removeEventListener("offerCreated", handleOfferCreated);
  }, []);

  // Simulate loading on tab switch
  useEffect(() => {
    setIsLoading(true);
    const timeout = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timeout);
  }, [activeTab, refreshTrigger]);

  return (
    <div className="relative max-w-7xl mx-auto p-4 sm:p-8 text-white">
      {/* ✅ Toast Notification */}
      <AnimatePresence>
        {toastVisible && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed top-6 right-6 z-50 bg-indigo-600/90 border border-indigo-500/40 text-white px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2"
          >
            <CheckCircle className="w-5 h-5 text-green-300" />
            <span className="text-sm font-medium">
              New offer added successfully!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <div className="relative bg-gradient-to-br from-indigo-700/30 to-gray-900/50 border border-gray-700 rounded-2xl shadow-2xl p-6 sm:p-10 backdrop-blur-lg overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/20 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2">
              <Wallet className="w-7 h-7 text-indigo-400" />
              Peer-to-Peer Marketplace
            </h1>
            <p className="text-gray-400 mt-1 text-sm sm:text-base">
              Trade securely with verified merchants. Fast, transparent, and reliable.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-indigo-600/20 px-3 py-2 rounded-lg border border-indigo-500/40">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-300">
              Verified Merchant Network
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Section */}
      <div className="flex justify-center mt-8 mb-6">
        <div className="flex bg-gray-800/80 rounded-full p-1 border border-gray-700 shadow-inner backdrop-blur-md w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("deposit")}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm sm:text-base font-medium transition-all duration-300 w-1/2 sm:w-auto ${
              activeTab === "deposit"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            Deposit
          </button>
          <button
            onClick={() => setActiveTab("withdraw")}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm sm:text-base font-medium transition-all duration-300 w-1/2 sm:w-auto ${
              activeTab === "withdraw"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            Withdraw
          </button>
        </div>
      </div>

      {/* Animated Offers Content */}
      <div className="relative mt-4 min-h-[300px]">
        <AnimatePresence mode="wait">
          {isLoading ? (
            // ✅ Loading shimmer overlay
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm rounded-2xl"
            >
              <div className="flex flex-col items-center">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                <p className="mt-3 text-sm text-gray-400">
                  Loading offers...
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`${activeTab}-${refreshTrigger}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {activeTab === "deposit" ? (
                <DepositOffers refreshKey={refreshTrigger} />
              ) : (
                <WithdrawOffers refreshKey={refreshTrigger} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
