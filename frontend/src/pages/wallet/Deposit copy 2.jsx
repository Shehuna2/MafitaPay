// File: src/pages/Deposit.jsx
// purpose: orchestrates the hooks + presentational components into a clean step-based flow
import React, { useState } from "react";
import useWallet from "../../hooks/useWallet";
import useDvaFlow from "../../hooks/useDvaFlow";
import LoadingOverlay from "../../components/Deposit/LoadingOverlay";
import DvaDisplay from "../../components/Deposit/DvaDisplay";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";

export default function Deposit() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lastRequeryDate, setLastRequeryDate] = useState(new Date().toISOString().split("T")[0]);

  const dva = useDvaFlow("paystack");
  const { wallet, loading: walletLoading, refresh } = useWallet(dva.provider);

  const handleGenerateClick = async () => {
    // enforce step progression explicitly
    if (dva.provider === "flutterwave" && dva.step === "choose") {
      dva.toStep("bank");
      return;
    }
    if (dva.provider === "flutterwave" && dva.step === "bank") {
      dva.toStep("bvn");
      return;
    }
    if (dva.provider === "flutterwave" && dva.step === "bvn") {
      // if BVN provided validate; otherwise allow skip (temporary)
      if (dva.bvnOrNin && !dva.validateBvn(dva.bvnOrNin)) {
        toast.error("BVN must be 11 digits");
        return;
      }
      // confirm -> generate
    }
    // for non-flutterwave or after steps done: generate
    const result = await dva.generateDva();
    if (result?.success) {
      toast.success("Virtual account generated");
      // refresh wallet cache
      refresh();
    } else {
      toast.error(dva.error || "Failed to generate DVA");
    }
  };

  const handleRequery = async () => {
    if (!wallet?.van_account_number && !dva.lastResponse?.account_number) {
      toast.error("No account number to requery");
      return;
    }
    const account = wallet?.van_account_number || dva.lastResponse.account_number;
    const res = await dva.requery({ account_number: account, date: lastRequeryDate });
    if (res.success) {
      toast.success("Requery initiated");
      refresh();
    } else {
      toast.error(dva.error || "Requery failed");
    }
  };

  const copyToClipboard = (text, label = "Copied!") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const displayDetails = wallet?.van_account_number
    ? {
        account_number: wallet.van_account_number,
        bank_name: wallet.van_bank_name,
        account_name: wallet.van_account_name,
        provider: wallet.van_provider,
        type: wallet.type,
      }
    : dva.lastResponse;

  return (
    <>
      <LoadingOverlay show={walletLoading || dva.loading} message={walletLoading ? "Loading your virtual account..." : "Working..."} />
      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <button onClick={() => window.history.back()} className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-indigo-400">Deposit via Bank Transfer</h1>
          </div>

          <div className="bg-gray-800/80 rounded-2xl p-4 sm:p-5 shadow-2xl border border-gray-700/50">
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Payment Provider</label>
              <select value={dva.provider} onChange={(e) => dva.setProvider(e.target.value)} disabled={dva.loading} className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm">
                <option value="paystack">Paystack</option>
                <option value="flutterwave">Flutterwave</option>
                <option value="9psb" disabled>9PSB (Soon)</option>
              </select>
            </div>

            {/* Flutterwave step UI */}
            {dva.provider === "flutterwave" && dva.step === "bank" && (
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">Choose Bank</label>
                <select value={dva.preferredBank} onChange={(e) => dva.setPreferredBank(e.target.value)} className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm">
                  <option value="wema-bank">Wema Bank</option>
                  <option value="sterling-bank">Sterling Bank</option>
                </select>
              </div>
            )}

            {dva.provider === "flutterwave" && dva.step === "bvn" && (
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">BVN or NIN (optional for static)</label>
                <input value={dva.bvnOrNin} onChange={(e) => dva.setBvnOrNin(e.target.value.replace(/\D/g, "").slice(0,11))} placeholder={process.env.NODE_ENV === "development" ? "12345678901 (sandbox)" : "Enter your BVN"} className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm" />
                <p className="text-xs text-gray-500 mt-1">Leave empty for temporary account (expires ~1 hour).</p>
              </div>
            )}

            {!displayDetails?.account_number && !walletLoading && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 mb-5 max-w-md mx-auto">
                  Generate a virtual account to fund your wallet with <span className="font-bold text-indigo-300">{dva.provider.toUpperCase()}</span>.
                </p>

                <div className="flex flex-col gap-3 items-center">
                  <button onClick={handleGenerateClick} className="bg-indigo-600 hover:bg-indigo-500 text-white px-7 py-3 rounded-xl font-bold text-sm shadow-lg">
                    {dva.provider === "flutterwave" ? (dva.step === "choose" ? "Choose Bank" : dva.step === "bank" ? "Enter BVN (optional)" : dva.step === "bvn" ? "Generate Virtual Account" : "Generate") : "Generate Virtual Account"}
                  </button>

                  <button onClick={() => { dva.toStep("choose"); dva.setBvnOrNin(""); dva.setPreferredBank("wema-bank"); }} className="text-xs text-gray-400 mt-2">Reset Flow</button>
                </div>
              </div>
            )}

            {/* VA display */}
            {displayDetails?.account_number && (
              <DvaDisplay
                details={displayDetails}
                onCopy={(t) => copyToClipboard(t, "Account number copied!")}
                onRequery={handleRequery}
                requeryLoading={dva.requeryLoading}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
                lastRequeryDate={lastRequeryDate}
                setLastRequeryDate={setLastRequeryDate}
              />
            )}

            {dva.error && <p className="text-xs text-red-400 mt-3">{dva.error}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// helper kept local
function copyToClipboard(text, label = "Copied!") {
  navigator.clipboard.writeText(text);
  // toast is not imported here to keep this helper pure; caller shows toast
}
