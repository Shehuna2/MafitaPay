// src/pages/Deposit.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import { Loader2, RefreshCcw, Copy, ChevronDown, ChevronUp, ArrowLeft, CreditCard } from "lucide-react";
import { toast } from "react-hot-toast";

export default function Deposit() {
  const navigate = useNavigate();
  const [dvaDetails, setDvaDetails] = useState({
    account_number: null,
    bank_name: null,
    account_name: null,
    provider: null,
    type: null
  });

  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [provider, setProvider] = useState("flutterwave");
  const [copied, setCopied] = useState(false);

  // BVN or NIN
  const [bvnOrNin, setBvnOrNin] = useState("");
  const [showBvnField, setShowBvnField] = useState(false);

  // ----------------------------------------------------
  // SHOW BVN/NIN FIELD WHENEVER PROVIDER = FLUTTERWAVE
  // ----------------------------------------------------
  useEffect(() => {
    if (provider === "flutterwave") {
      setShowBvnField(true);
    } else {
      setShowBvnField(false);
      setBvnOrNin("");
    }
  }, [provider]);

  // ----------------------------------------------------
  // FETCH WALLET EXISTING VA
  // ----------------------------------------------------
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
            type: response.data.type || "static"
          });
        } else {
          // reset if no saved VA
          setDvaDetails({
            account_number: null,
            bank_name: null,
            account_name: null,
            provider: null,
            type: null
          });
        }
      } catch (err) {
        console.error("Failed to fetch wallet:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, [provider]);

  // ----------------------------------------------------
  // GENERATE DVA
  // ----------------------------------------------------
  const fetchDVA = async () => {
    setLoading(true);

    try {
      const payload = { provider };

      if (provider === "flutterwave") {
        if (!bvnOrNin || bvnOrNin.length < 11) {
          toast.error("Enter a valid BVN (11 digits) or NIN (16 digits)");
          setLoading(false);
          return;
        }
        payload.bvn_or_nin = bvnOrNin;
      }

      const response = await client.post("/wallet/dva/generate/", payload);

      if (response.data.success) {
        setDvaDetails({
          account_number: response.data.account_number,
          bank_name: response.data.bank_name,
          account_name: response.data.account_name,
          provider,
          type: response.data.type
        });

        toast.success("Virtual account generated successfully!");
        setBvnOrNin("");
      } else {
        toast.error(response.data.message || "Failed to generate virtual account");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error generating virtual account");
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // COPY
  // ----------------------------------------------------
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ----------------------------------------------------
  // RENDER
  // ----------------------------------------------------
  return (
    <>
      <style>{`
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

        {/* LOADING OVERLAY */}
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping"></div>
                </div>
                <p className="text-lg font-medium text-indigo-300">
                  Loading your virtual account...
                </p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => window.history.back()}
              className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-indigo-400">
              Deposit via Bank Transfer
            </h1>
          </div>

          {/* Alternative Deposit Method Card */}
          <div className="bg-gradient-to-r from-indigo-600/10 to-purple-600/10 rounded-2xl p-4 mb-5 border border-indigo-500/30 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium text-sm">Deposit with Card</h3>
                  <p className="text-gray-400 text-xs">Instant deposit from EUR, USD, or GBP cards</p>
                </div>
              </div>
              <button
                onClick={() => navigate("/card-deposit")}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 transform hover:-translate-y-0.5"
              >
                Use Card
              </button>
            </div>
          </div>

          <div className="bg-gray-800/80 rounded-2xl p-4 sm:p-5 shadow-2xl border border-gray-700/50 animate-fade-in-up">

            {/* PROVIDER SELECT */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Payment Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={loading}
                className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
              >
                <option value="flutterwave">Flutterwave</option>
                <option value="palmpay">PalmPay</option>
                <option value="paystack" disabled>Paystack (Not available)</option>
                <option value="9psb" disabled>9PSB Bank (Coming Soon)</option>
                <option value="monnify" disabled>Monnify (Coming Soon)</option>
              </select>
            </div>

            {/* BVN / NIN FIELD (ALWAYS SHOW FOR FLUTTERWAVE) */}
            {provider === "flutterwave" && showBvnField && !dvaDetails.account_number &&(
              <div className="mb-5 animate-fade-in-up">
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Enter BVN (11 digits) or NIN (11 digits)
                </label>
                <input
                  type="text"
                  placeholder="Enter BVN or NIN"
                  value={bvnOrNin}
                  onChange={(e) =>
                    setBvnOrNin(e.target.value.replace(/\D/g, "").slice(0, 16))
                  }
                  className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition"
                />
              </div>
            )}

            {/* GENERATE BUTTON */}
            {!dvaDetails.account_number && !loading && (
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

            {/* SHOW RESULT */}
            {dvaDetails.account_number && (
              <div className="bg-gray-800/60 p-5 rounded-xl space-y-6 border border-gray-700/50 animate-fade-in-up">

                {/* TYPE */}
                {dvaDetails.type && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Account Type</span>
                    <span className="text-indigo-400 font-bold">
                      {dvaDetails.type.toUpperCase()}
                      {dvaDetails.type === "static" && " (Permanent)"}
                    </span>
                  </div>
                )}

                {/* BANK */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Bank</span>
                  <span className="text-indigo-400 font-bold">
                    {dvaDetails.bank_name || "—"}
                  </span>
                </div>

                {/* ACCOUNT NUMBER */}
                <div className="flex justify-between items-center relative">
                  <span className="text-xs text-gray-400">Account Number</span>

                  <div className="flex items-center gap-2 relative">
                    <span
                      className={`font-bold text-lg transition-all ${
                        copied ? "text-green-400 scale-110" : "text-indigo-300"
                      }`}
                    >
                      {dvaDetails.account_number}
                    </span>

                    <button
                      onClick={() => copyToClipboard(dvaDetails.account_number)}
                      className="text-indigo-400 hover:text-indigo-300 transition"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    {copied && (
                      <span className="absolute -top-6 right-0 text-xs text-green-400 animate-fade-in-up">
                        Copied!
                      </span>
                    )}
                  </div>
                </div>

                {/* ACCOUNT NAME */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Account Name</span>
                  <span className="text-indigo-400 font-bold">
                    Mafita Digital Solutions FLW
                  </span>
                </div>

                {/* TRUST MESSAGE */}
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/40">
                  <div className="flex items-start gap-3">
                    <div className="text-indigo-400 mt-0.5">ℹ️</div>
                    <div className="flex-1 text-sm text-gray-300 leading-relaxed">
                      <p>
                        Banks may show{" "}
                        <strong className="text-indigo-300">"Mafita Digital Solutions FLW"</strong>{" "}
                        as the account owner. This is normal — Flutterwave issues virtual
                        accounts under our business name, but{" "}
                        <strong className="text-green-300">{dvaDetails.account_number}</strong>{" "}
                        belongs to you alone.
                      </p>

                      <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Hausa version?
                      </button>

                      {showAdvanced && (
                        <div className="mt-3 text-xs text-gray-400 animate-fade-in-up leading-relaxed">
                          <p>
                            Sunan <strong className="text-indigo-300">"Mafita Digital Solutions FLW"</strong> 
                            da zaka gani lokacin turo kudi, sunan kamfaninmu ne wanda
                            muka rijista da Flutterwave. Amma duk kudin da aka turo zuwa
                            <strong className="text-green-300"> {dvaDetails.account_number}</strong> naka ne kai tsaye.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* FEES */}
                <div className="pt-2 space-y-5 border-t border-gray-700/50">
                  <p className="text-xs text-gray-400">
                    Transfers reflect instantly. <span className="text-yellow-400 ml-1">2% (max ₦100)</span> fee.
                  </p>
                </div>

              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
