// src/pages/BuyCrypto.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import client from "../../api/client";
import { Loader2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";

export default function BuyCrypto() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [crypto, setCrypto] = useState(null);

  const [priceUsd, setPriceUsd] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [priceNgn, setPriceNgn] = useState(null);

  const [form, setForm] = useState({
    amount: "",
    currency: "NGN",
    wallet_address: "",
  });

  const [loading, setLoading] = useState(true);
  const [rateLoading, setRateLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [recentWallets, setRecentWallets] = useState([]);

  // ----------------------------------
  //        FETCH CORRECT RATE
  // ----------------------------------
  const fetchFreshRate = async () => {
    setRateLoading(true);
    try {
      const res = await client.get(`/buy-crypto/${id}/`);

      setPriceUsd(res.data.price_usd);
      setExchangeRate(res.data.usd_ngn_rate);
      setPriceNgn(res.data.price_ngn);
      setMessage(null);
    } catch (err) {
      setMessage({ type: "error", text: "Failed to refresh rate. Using last known price." });
    } finally {
      setRateLoading(false);
    }
  };

  // ----------------------------------
  //  INITIAL LOAD (crypto info + rate)
  // ----------------------------------
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);

        const listRes = await client.get("/assets/");
        const cryptos = listRes.data.cryptos || [];
        const found = cryptos.find(c => String(c.id) === String(id));

        if (mounted && found) setCrypto(found);

        await fetchFreshRate();
      } catch (err) {
        if (mounted) setMessage({ type: "error", text: "Failed to load. Retrying..." });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [id]);

  // ----------------------------------
  //       RECENT WALLETS STORE
  // ----------------------------------
  useEffect(() => {
    if (!crypto) return;
    const key = `recent_wallets_${crypto.symbol}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(stored)) setRecentWallets(stored.slice(0, 5));
    } catch {
      setRecentWallets([]);
    }
  }, [crypto]);

  const saveWalletToRecent = (address) => {
    if (!crypto || !address) return;
    const key = `recent_wallets_${crypto.symbol}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const updated = [address, ...existing.filter((a) => a !== address)].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(updated));
    setRecentWallets(updated);
  };

  // ----------------------------------
  //       FORM / CALCULATIONS
  // ----------------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleQuickPick = (val) => {
    setForm((p) => ({ ...p, amount: String(val) }));
  };

  const quickPickOptions = () => {
    if (!crypto) return [];
    if (form.currency === "NGN") return [500, 1000, 2000, 5000, 10000, 20000];
    if (form.currency === "USDT") return [0.5, 1.0, 2.0, 5.0, 10.0, 20.0];
    return [0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
  };

  // ------- CLEAN & CONSISTENT MATH -------
  let cryptoReceived = 0;
  let totalNgn = 0;

  if (priceUsd && exchangeRate && form.amount) {
    const amt = Number(form.amount);

    if (form.currency === "NGN") {
      totalNgn = amt;
      cryptoReceived = amt / (priceUsd * exchangeRate);
    }

    if (form.currency === "USDT") {
      totalNgn = amt * exchangeRate;
      cryptoReceived = amt / priceUsd;
    }

    if (form.currency === crypto?.symbol) {
      cryptoReceived = amt;
      totalNgn = amt * priceUsd * exchangeRate;
    }
  }

  // ----------------------------------
  //           SUBMIT ORDER
  // ----------------------------------
  const confirmAndSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    setShowConfirm(false);

    try {
      const res = await client.post(`/buy-crypto/${id}/`, form);
      saveWalletToRecent(form.wallet_address);

      setReceiptData({
        status: "success",
        type: "crypto",
        crypto: crypto.symbol,
        amount: totalNgn,
        wallet_address: form.wallet_address,
        tx_hash: res.data?.tx_hash ?? null,
        reference: res.data?.reference ?? null,
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1200);
    } catch (err) {
      setMessage({ type: "error", text: "Transaction failed. Try again." });
      setReceiptData({
        status: "failed",
        type: "crypto",
        crypto: crypto?.symbol ?? "CRYPTO",
        amount: totalNgn,
        wallet_address: form.wallet_address,
      });
    } finally {
      setSubmitting(false);
      setForm({ amount: "", currency: "NGN", wallet_address: "" });
    }
  };

  const trimAddress = (addr) => {
    if (!addr) return addr;
    return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
  };

  // ----------------------------------
  //           LOADING UI
  // ----------------------------------
  if (loading) return <LoadingSkeleton />;

  if (!crypto)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md w-full text-center text-red-400">
          <p>Crypto not found.</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-indigo-600 rounded-xl text-white font-bold"
          >
            Go back
          </button>
        </div>
      </div>
    );

  // ----------------------------------
  //           MAIN RENDER
  // ----------------------------------
  return (
    <>
      <ToastContainer />

      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Overlay when submitting */}
          {submitting && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <AnimatedTransactionLoader />
            </div>
          )}

          <div className="bg-gray-800/80 p-5 rounded-2xl border border-gray-700/50">

            {/* Refresh Rate Button */}
            <div className="flex justify-end mb-2">
              <button
                onClick={fetchFreshRate}
                disabled={rateLoading}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                {rateLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh rate
              </button>
            </div>

            {/* RATE DISPLAY */}
            <div className="bg-gray-800/60 p-3 rounded-xl mb-5 border border-gray-700/50 flex items-center justify-between">
              {/* Left side: rate info */}
              <div className="flex flex-col">
                <p className="text-xs text-gray-300">
                  <span className="text-gray-400">1 USD =</span>{" "}
                  <span className="font-bold text-green-400">
                    ₦{exchangeRate?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>{" "}
                  <span className="text-[10px] text-green-300">(incl. fees)</span>
                </p>

                <p className="text-xs text-gray-300 mt-1">
                  <span className="text-gray-400">1 {crypto.symbol} =</span>{" "}
                  <span className="font-bold text-indigo-400">
                    ${priceUsd?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {" → "}
                    ₦{(priceUsd * exchangeRate)?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </p>
              </div>

              {/* Right side: crypto logo */}
              <img
                src={`/images/${crypto.symbol?.toLowerCase()}.png`}
                alt={crypto.name}
                onError={(e) => (e.target.src = crypto.logo_url || "/images/default.png")}
                className="w-10 h-10 rounded-full border border-indigo-500/30 object-contain bg-gray-900"
              />
            </div>

            {/* Message */}
            {message && (
              <div
                className={`p-3 rounded-xl mb-5 text-xs border ${
                  message.type === "success"
                    ? "bg-green-600/20 text-green-400 border-green-500/50"
                    : "bg-red-600/20 text-red-400 border-red-500/50"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* FORM */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowConfirm(true);
              }}
              className="space-y-4"
            >
              {/* Amount + Currency */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs mb-1.5">Amount</label>
                  <input
                    name="amount"
                    type="number"
                    value={form.amount}
                    onChange={handleChange}
                    required
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>

                <div className="w-28">
                  <label className="block text-xs mb-1.5">Currency</label>
                  <select
                    name="currency"
                    value={form.currency}
                    onChange={handleChange}
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  >
                    <option value="NGN">NGN</option>
                    <option value="USDT">USDT</option>
                    <option value={crypto.symbol}>{crypto.symbol}</option>
                  </select>
                </div>
              </div>

              {/* Quick Picks */}
              <div>
                <label className="block text-xs mb-1.5">Quick Pick</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {quickPickOptions().map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickPick(val)}
                      className={`p-2 rounded-xl text-xs font-bold ${
                        Number(form.amount) === val
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-800/60 border border-gray-700"
                      }`}
                    >
                      {form.currency === "NGN" ? `₦${val}` : val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculation Display */}
              {form.amount && (
                <div className="bg-gray-800/60 p-3 rounded-xl text-xs border border-gray-700/50">
                  <p>You pay: <span className="text-orange-400 font-bold">₦{totalNgn.toLocaleString()}</span></p>
                  <p className="mt-1">
                    You receive:{" "}
                    <span className="text-indigo-400 font-bold">
                      {cryptoReceived.toFixed(8)} {crypto.symbol}
                    </span>
                  </p>
                  <p className="mt-2 text-[11px] text-gray-500">Rate locked • Includes all fees</p>
                </div>
              )}

              {/* Wallet Address */}
              <div>
                <label className="block text-xs mb-1.5">{crypto.symbol} Wallet Address</label>
                <input
                  name="wallet_address"
                  type="text"
                  value={form.wallet_address}
                  onChange={handleChange}
                  required
                  className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                />

                {recentWallets.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">Recently used</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {recentWallets.map((addr) => (
                        <button
                          key={addr}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, wallet_address: addr }))}
                          className="px-3 py-1.5 bg-gray-800/60 border border-gray-700 rounded-lg text-xs"
                        >
                          {trimAddress(addr)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 py-2.5 rounded-xl font-bold"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Buy ${crypto.symbol}`}
              </button>
            </form>
          </div>
        </div>

        {/* Confirm Modal */}
        {showConfirm && (
          <ConfirmModal
            crypto={crypto}
            cryptoReceived={cryptoReceived}
            form={form}
            onCancel={() => setShowConfirm(false)}
            onConfirm={confirmAndSubmit}
          />
        )}

        {/* Success Animation */}
        {showSuccess && <SuccessOverlay />}

        <Receipt type="crypto" data={receiptData} onClose={() => setReceiptData(null)} />
      </div>
    </>
  );
}

/* ---------------------------------------------------------
   HELPER COMPONENTS
--------------------------------------------------------- */

function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer {
          background: linear-gradient(
            110deg,
            rgba(55,65,81,0.28) 8%,
            rgba(99,102,241,0.14) 18%,
            rgba(55,65,81,0.28) 33%
          );
          background-size: 200% 100%;
          animation: shimmer 1.8s linear infinite;
        }
      `}</style>

      <div className="w-full max-w-4xl bg-gray-900 rounded-2xl p-4 sm:p-5 shadow-xl border border-gray-700">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-full shimmer" />
          <div className="flex-1 space-y-3">
            <div className="h-5 w-2/4 rounded shimmer" />
            <div className="h-4 w-1/3 rounded shimmer" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 mb-5 flex justify-between items-center border border-gray-700">
          <div className="space-y-2 w-3/4">
            <div className="h-4 w-32 rounded shimmer" />
            <div className="h-4 w-48 rounded shimmer" />
          </div>
          <div className="w-12 h-12 rounded-full shimmer" />
        </div>

        <div className="space-y-4">
          <div className="h-12 rounded-xl shimmer" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl shimmer" />
            ))}
          </div>
          <div className="h-24 rounded-xl shimmer" />
          <div className="h-12 rounded-xl shimmer" />
        </div>
        <p className="text-sm text-gray-400 mt-5 text-center">Fetching secure rate & crypto data…</p>
      </div>
    </div>
  );
}

function AnimatedTransactionLoader() {
  const messages = ["Confirming transaction…","Finalizing purchase…","Almost done…","Securing your receipt…"];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s < messages.length - 1 ? s + 1 : s)), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center space-y-6">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />
        <motion.div
          className="w-16 h-16 border-4 border-indigo-400 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
        />
      </div>

      <div className="w-72 h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
      </div>

      <p className="text-sm text-gray-300">{messages[step]}</p>
    </div>
  );
}

function SuccessOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <motion.div
        className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center text-white text-xl font-bold"
        initial={{ scale: 0 }}
        animate={{ scale: 1.2 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        ✓
      </motion.div>
    </div>
  );
}

function ConfirmModal({ crypto, cryptoReceived, form, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-80 text-white border border-gray-700">
        <p className="text-sm mb-4">Confirm your purchase</p>
        <p className="text-xs text-gray-400 mb-2">
          You are about to buy <span className="text-indigo-400 font-bold">{cryptoReceived.toFixed(8)} {crypto.symbol}</span> 
          using <span className="font-bold">{form.amount} {form.currency}</span>
        </p>

        <div className="flex gap-3 mt-4">
          <button onClick={onCancel} className="flex-1 py-2 bg-gray-700 rounded-xl text-sm">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-indigo-600 rounded-xl text-sm">Confirm</button>
        </div>
      </div>
    </div>
  );
}
