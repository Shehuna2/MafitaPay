import { useState, useEffect } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight, ShieldCheck } from "lucide-react";
import DepositOffers from "./DepositOffers";
import WithdrawOffers from "./WithdrawOffers";

export default function OffersHub() {
  const [activeTab, setActiveTab] = useState(
    localStorage.getItem("activeP2PTab") || "deposit"
  );

  useEffect(() => {
    localStorage.setItem("activeP2PTab", activeTab);
  }, [activeTab]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 text-white">
      {/* Header Section */}
      <div className="relative bg-gradient-to-br from-indigo-700/30 to-gray-900/50 border border-gray-700 rounded-2xl shadow-2xl p-6 sm:p-10 backdrop-blur-lg overflow-hidden">
        {/* Soft gradient glow */}
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
            Deposit Offers
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
            Withdraw Offers
          </button>
        </div>
      </div>

      {/* Animated Content */}
      <div
        key={activeTab}
        className="mt-4 transition-all duration-300 animate-fade-in-up"
      >
        {activeTab === "deposit" ? <DepositOffers /> : <WithdrawOffers />}
      </div>
    </div>
  );
}
