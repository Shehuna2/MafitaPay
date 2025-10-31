import React, { useState, useEffect } from "react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Loader2, RefreshCcw, Banknote, Copy, ChevronDown, ChevronUp } from "lucide-react";

export default function Deposit() {
  const [dvaDetails, setDvaDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requeryLoading, setRequeryLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lastRequeryDate, setLastRequeryDate] = useState(new Date().toISOString().split("T")[0]);
  const [provider, setProvider] = useState("paystack");

  // ✅ Fetch DVA when provider changes
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
        toast.error(err.response?.data?.error || "Failed to load wallet details", {
          position: "top-right",
          autoClose: 3000,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, [provider]);

  // ✅ Generate new DVA
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
        toast.success(response.data.message, { position: "top-right", autoClose: 3000 });
      } else {
        toast.error(response.data.error || "Failed to generate virtual account", {
          position: "top-right",
          autoClose: 3000,
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to generate virtual account", {
        position: "top-right",
        autoClose: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Requery for missed deposits
  const handleRequery = async () => {
    if (!dvaDetails?.account_number) {
      toast.error("No virtual account available. Generate one first.", {
        position: "top-right",
        autoClose: 3000,
      });
      return;
    }
    setRequeryLoading(true);
    try {
      const response = await client.post("/wallet/dva/requery/", {
        account_number: dvaDetails.account_number,
        provider_slug: provider === "paystack" ? "titan-paystack" : "9psb",
        date: lastRequeryDate,
      });
      if (response.data.success) {
        toast.success(response.data.message, { position: "top-right", autoClose: 3000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to check transfers", {
        position: "top-right",
        autoClose: 3000,
      });
    } finally {
      setRequeryLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Account number copied!", { position: "top-right", autoClose: 2000 });
  };

  if (loading && !dvaDetails) {
    return (
      <div className="flex justify-center mt-16 text-gray-400">
        <Loader2 className="animate-spin w-6 h-6" /> Loading wallet details...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 pb-12 text-white min-h-screen">
      <ToastContainer />
      <div className="bg-gray-900 rounded-2xl shadow-xl p-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Banknote className="w-6 h-6 text-indigo-400" /> Deposit via Bank Transfer
        </h2>

        {/* Payment Provider */}
        <div className="mb-4">
          <label className="block text-gray-400 mb-2">Payment Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-gray-800 text-white p-2 rounded-lg"
          >
            <option value="paystack">Paystack</option>
            <option value="9psb">9PSB Bank</option>
            <option value="flutterwave" disabled>
              Flutterwave (Coming Soon)
            </option>
            <option value="monnify" disabled>
              Monnify (Coming Soon)
            </option>
          </select>
        </div>

        {/* Generate DVA Button */}
        {!dvaDetails && (
          <div className="text-center">
            <p className="text-gray-400 mb-4">
              Generate a virtual account to fund your wallet with{" "}
              {provider.toUpperCase()}.
            </p>
            <button
              onClick={fetchDVA}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded-lg transition disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Generate Virtual Account"}
            </button>
          </div>
        )}

        {/* DVA Display */}
        {dvaDetails && (
          <div className="bg-gray-800 p-4 rounded-xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Bank:</span>
              <span className="font-semibold">
                {dvaDetails.bank_name}{" "}
                <span className="text-sm text-gray-400">
                  ({dvaDetails.provider?.toUpperCase()})
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Acc No:</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">{dvaDetails.account_number}</span>
                <button
                  onClick={() => copyToClipboard(dvaDetails.account_number)}
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Name:</span>
              <span className="font-semibold">{dvaDetails.account_name}</span>
            </div>

            <p className="text-sm text-gray-300 mt-4">
              Funds are credited automatically within minutes.
              <br />
              <strong>Note:</strong> A 1% fee (up to ₦300) applies per transfer.
            </p>

            {/* Requery Section */}
            <div className="mt-4">
              <button
                onClick={handleRequery}
                disabled={requeryLoading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition disabled:opacity-60"
              >
                <RefreshCcw size={16} className={requeryLoading ? "animate-spin" : ""} />
                {requeryLoading ? "Checking..." : "Requery Funds"}
              </button>

              {/* Advanced date toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="ml-3 text-gray-400 text-sm hover:text-gray-200"
              >
                {showAdvanced ? (
                  <>
                    <ChevronUp size={14} className="inline mr-1" />
                    Hide advanced
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} className="inline mr-1" />
                    Advanced
                  </>
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3">
                  <label className="block text-gray-400 text-sm mb-1">Requery Date</label>
                  <input
                    type="date"
                    value={lastRequeryDate}
                    onChange={(e) => setLastRequeryDate(e.target.value)}
                    className="bg-gray-700 text-white px-2 py-1 rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
