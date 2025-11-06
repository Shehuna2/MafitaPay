// src/pages/Deposit.jsx
import React, { useState, useEffect } from "react";
import client from "../../api/client";
import { Loader2, RefreshCcw, Banknote, Copy, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";

export default function Deposit() {
  const [dvaDetails, setDvaDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requeryLoading, setRequeryLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lastRequeryDate, setLastRequeryDate] = useState(new Date().toISOString().split("T")[0]);
  const [provider, setProvider] = useState("paystack");

  useEffect(() => {
    const fetchWallet = async () => {
      setLoading(true);
      try {
        const response = await client.get(`/wallet/?provider=${provider}`);
        if (response.data.van_account_number) {
          setDvaDetails({
            account_number: response.data.van_account_number,
            bank_name: response.data.van_bank_name,
            account_name: response.data.van_account_name,
            provider: response.data.van_provider || provider,
          });
        } else {
          setDvaDetails(null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, [provider]);

  const fetchDVA = async () => {
    setLoading(true);
    try {
      const response = await client.post("/wallet/dva/generate/", {
        provider,
        preferred_bank: provider === "paystack" ? "titan-paystack" : "9psb",
      });
      if (response.data.success) {
        setDvaDetails({
          account_number: response.data.account_number,
          bank_name: response.data.bank_name,
          account_name: response.data.account_name,
          provider,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequery = async () => {
    if (!dvaDetails?.account_number) return;
    setRequeryLoading(true);
    try {
      await client.post("/wallet/dva/requery/", {
        account_number: dvaDetails.account_number,
        provider_slug: provider === "paystack" ? "titan-paystack" : "9psb",
        date: lastRequeryDate,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setRequeryLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out; }
      `}</style>

      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" />

        {/* Full-Screen Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping"></div>
                </div>
                <p className="text-lg font-medium text-indigo-300">Loading your virtual account...</p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10">
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => window.history.back()}
              className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-indigo-400 flex items-center gap-2">
              <Banknote className="w-6 h-6" />
              Deposit via Bank Transfer
            </h1>
          </div>

          <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-2xl border border-gray-700/50 animate-fade-in-up">
            {/* Provider */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Payment Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={loading}
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 appearance-none cursor-pointer disabled:opacity-60"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 0.75rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "12px",
                }}
              >
                <option value="paystack">Paystack</option>
                <option value="9psb">9PSB Bank</option>
                <option value="flutterwave" disabled>Flutterwave (Coming Soon)</option>
                <option value="monnify" disabled>Monnify (Coming Soon)</option>
              </select>
            </div>

            {/* Generate Button */}
            {!dvaDetails && !loading && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 mb-5 max-w-md mx-auto">
                  Generate a virtual account to fund your wallet with{" "}
                  <span className="font-bold text-indigo-300">{provider.toUpperCase()}</span>.
                </p>
                <button
                  onClick={fetchDVA}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-7 py-3 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2.5 mx-auto"
                >
                  Generate Virtual Account
                </button>
              </div>
            )}

            {/* DVA Display */}
            {dvaDetails && (
              <div className="bg-gray-800/60 backdrop-blur-md p-5 rounded-xl space-y-5 border border-gray-700/50">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Bank</span>
                    <span className="font-bold text-white text-right">
                      {dvaDetails.bank_name}
                      <span className="block text-xs text-gray-500 mt-0.5">({dvaDetails.provider?.toUpperCase()})</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Account No.</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-indigo-300">{dvaDetails.account_number}</span>
                      <button
                        onClick={() => copyToClipboard(dvaDetails.account_number)}
                        className="text-indigo-400 hover:text-indigo-300 transition"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Name</span>
                    <span className="font-bold text-white">{dvaDetails.account_name}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-700/50">
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Funds are credited <span className="font-bold text-green-400">automatically</span> within minutes.
                    <br />
                    <strong className="text-yellow-400">Note:</strong> A 1% fee (up to ₦300) applies per transfer.
                  </p>
                </div>

                {/* Requery */}
                <div className="pt-4 border-t border-gray-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={handleRequery}
                      disabled={requeryLoading}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-75"
                    >
                      <RefreshCcw className={`w-4 h-4 ${requeryLoading ? "animate-spin" : ""}`} />
                      {requeryLoading ? "Checking..." : "Requery Funds"}
                    </button>

                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-xs text-gray-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      {showAdvanced ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" /> Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" /> Advanced
                        </>
                      )}
                    </button>
                  </div>

                  {showAdvanced && (
                    <div className="animate-fade-in-up">
                      <label className="block text-xs text-gray-400 mb-1">Requery Date</label>
                      <input
                        type="date"
                        value={lastRequeryDate}
                        onChange={(e) => setLastRequeryDate(e.target.value)}
                        className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}