// src/pages/Deposit.jsx
import React, { useState, useEffect } from "react";
import client from "../../api/client";
import { Loader2, Copy, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";

export default function Deposit() {
  const [provider, setProvider] = useState("flutterwave");
  const [dva, setDva] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bvnOrNin, setBvnOrNin] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHausa, setShowHausa] = useState(false);
  const [bvnError, setBvnError] = useState(""); 
  const [generateError, setGenerateError] = useState(""); // NEW INLINE ERROR

  // ===============================================================
  // Fetch existing Static VA
  // ===============================================================
  useEffect(() => {
    const loadVA = async () => {
      setLoading(true);
      try {
        const res = await client.get(`/wallet/?provider=${provider}`);
        if (res.data.van_account_number) {
          setDva({
            account_number: res.data.van_account_number,
            account_name: res.data.van_account_name,
            bank_name: res.data.van_bank_name,
            type: "static",
          });
        } else {
          setDva(null);
        }
      } catch (err) {
        console.error("Fetch wallet failed:", err);
        toast.error("Failed to load your virtual account.");
      } finally {
        setLoading(false);
      }
    };

    loadVA();
  }, [provider]);

  // ===============================================================
  // Inline BVN/NIN validation
  // ===============================================================
  const validateBvnOrNin = async (value) => {
    if (!value || value.length < 11) {
      setBvnError("");
      return;
    }

    try {
      const res = await client.post("/wallet/dva/check-bvn/", {
        provider,
        bvn_or_nin: value,
      });

      if (res.data.exists) {
        setBvnError("❌ This BVN/NIN is already linked to another account.");
      } else {
        setBvnError("");
      }
    } catch (err) {
      console.error("BVN/NIN check failed:", err);
      setBvnError("");
    }
  };

  // ===============================================================
  // Generate Static VA
  // ===============================================================
  const generateDVA = async () => {
    setGenerateError(""); // clear old errors

    if (!bvnOrNin || bvnOrNin.length < 11) {
      setGenerateError("Enter a valid BVN or NIN to continue.");
      return;
    }

    if (bvnError) {
      setGenerateError(bvnError);
      return;
    }

    setLoading(true);
    try {
      const res = await client.post("/wallet/dva/generate/", {
        provider,
        bvn_or_nin: bvnOrNin,
      });

      if (res.data.success) {
        setDva({
          account_number: res.data.account_number,
          account_name: res.data.account_name,
          bank_name: res.data.bank_name,
          type: res.data.type,
        });

        setBvnOrNin("");
        setBvnError("");
        setGenerateError("");
      }
    } catch (error) {
      console.error("GEN DVA ERROR:", error);

      let backendError =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        "Unable to generate virtual account.";

      // Friendly error mapping
      if (backendError.includes("already belongs")) {
        backendError =
          "This virtual account is already assigned to another user. Contact support.";
      }

      if (
        backendError.toLowerCase().includes("bvn") ||
        backendError.toLowerCase().includes("nin")
      ) {
        backendError = "Invalid or already registered BVN/NIN.";
      }

      setGenerateError(backendError);
    } finally {
      setLoading(false);
    }
  };

  // ===============================================================
  // Copy to clipboard
  // ===============================================================
  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // ===============================================================
  // UI
  // ===============================================================
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, #ffffff05, #ffffff15, #ffffff05);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite linear;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-in-up { animation: fade-in-up .35s ease-out; }
      `}</style>

      {/* LOADING OVERLAY */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="p-6 bg-gray-800/90 rounded-2xl border border-gray-700/50 text-center fade-in-up">
            <div className="w-14 h-14 mx-auto mb-4 bg-indigo-600/20 rounded-full flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
            </div>
            <p className="text-indigo-300 font-medium">Loading virtual account…</p>
            <div className="mt-3 h-2 rounded-full bg-gray-700/50 overflow-hidden">
              <div className="h-full shimmer bg-indigo-600/60"></div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN PAGE */}
      <div className="min-h-screen bg-gray-900 text-white px-4 py-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-xl font-bold text-indigo-400 mb-6">
          Deposit via Bank Transfer
        </h1>

        <div className="bg-gray-800/70 p-5 rounded-2xl border border-gray-700/40 fade-in-up">
          {/* PROVIDER */}
          <div className="mb-4">
            <label className="text-xs text-gray-400">Payment Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setDva(null);
                setBvnOrNin("");
                setBvnError("");
                setGenerateError(""); // clear on change
              }}
              className="w-full mt-1 p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
            >
              <option value="flutterwave">Flutterwave</option>
              <option value="paystack" disabled>
                Paystack (Unavailable)
              </option>
              <option value="9psb" disabled>
                9PSB (Coming Soon)
              </option>
            </select>
          </div>

          {/* BVN FIELD */}
          {provider === "flutterwave" && !dva && (
            <div className="mb-4 fade-in-up">
              <label className="text-xs text-gray-400">BVN or NIN</label>
              <input
                className={`w-full mt-1 p-2.5 rounded-lg text-sm border ${
                  bvnError ? "border-red-500" : "border-gray-700"
                } bg-gray-800`}
                placeholder="Enter BVN or NIN"
                maxLength={11}
                value={bvnOrNin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                  setBvnOrNin(val);
                  setBvnError("");
                  setGenerateError("");
                }}
                onBlur={() => validateBvnOrNin(bvnOrNin)}
              />
              {bvnError && <p className="text-xs text-red-500 mt-1">{bvnError}</p>}
            </div>
          )}

          {/* GENERATE BUTTON */}
          {!dva && (
            <>
              <button
                onClick={generateDVA}
                className={`w-full py-3 mt-4 rounded-xl text-sm font-semibold transition-all ${
                  bvnError
                    ? "bg-gray-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                Generate Virtual Account
              </button>

              {/* INLINE ERROR MESSAGE */}
              {generateError && (
                <p className="text-xs text-red-500 mt-2 text-center fade-in-up">
                  {generateError}
                </p>
              )}
            </>
          )}

          {/* ACCOUNT CARD */}
          {dva && (
            <div className="mt-6 space-y-5 fade-in-up">
              <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-700/40 space-y-3">
                <Row label="Bank" value={dva.bank_name} />
                <Row
                  label="Account Number"
                  value={
                    <div className="flex gap-2 items-center relative">
                      <span
                        className={`font-bold ${
                          copied ? "text-green-400 scale-110" : "text-indigo-300"
                        } transition-all`}
                      >
                        {dva.account_number}
                      </span>
                      <button
                        onClick={() => copy(dva.account_number)}
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {copied && (
                        <span className="absolute -top-5 right-0 text-green-400 text-xs fade-in-up">
                          Copied!
                        </span>
                      )}
                    </div>
                  }
                />
                <Row label="Account Name" value={dva.account_name} />
              </div>

              <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-700/40 text-sm text-gray-300 leading-relaxed">
                <p>
                  Banks may display{" "}
                  <strong className="text-indigo-300">
                    Mafita Digital Solutions FLW
                  </strong>{" "}
                  as the account owner. This is normal for Flutterwave virtual
                  accounts — but{" "}
                  <span className="text-green-300 font-semibold">
                    this account is yours alone.
                  </span>
                </p>
                <button
                  onClick={() => setShowHausa((x) => !x)}
                  className="mt-2 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {showHausa ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  Hausa version?
                </button>
                {showHausa && (
                  <p className="mt-2 text-xs text-gray-400 fade-in-up leading-relaxed">
                    Sunan{" "}
                    <strong className="text-indigo-300">
                      Mafita Digital Solutions FLW
                    </strong>{" "}
                    da zaka gani a yayin turo kuɗi, sunan kamfaninmu ne. Amma
                    duk kuɗin da aka tura zuwa{" "}
                    <strong className="text-green-300">{dva.account_number}</strong>{" "}
                    naka ne kai tsaye. Wannan asusun naka ne kaɗai, Yallabai.
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500">
                Fee: 1% (max ₦300). Funds settle instantly.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ===============================================================
// Row component
// ===============================================================
function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="font-semibold text-indigo-300 text-sm">{value}</span>
    </div>
  );
}
