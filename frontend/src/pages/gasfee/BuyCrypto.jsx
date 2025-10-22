// File: src/pages/BuyCrypto.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import client from "../../api/client";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import Receipt from "../../components/Receipt";

/**
 * BuyCrypto page
 * - gradient shimmer skeleton while loading
 * - per-crypto recent wallets (localStorage: recent_wallets_<SYMBOL>, max 5)
 * - quick-pick amounts; live calculation
 * - confirm modal
 * - full-screen staged transaction loader + success overlay
 * - receipt modal
 * - friendly/sanitized error messages
 */

export default function BuyCrypto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [crypto, setCrypto] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [form, setForm] = useState({
    amount: "",
    currency: "NGN",
    wallet_address: "",
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error'|'success', text }
  const [showConfirm, setShowConfirm] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [recentWallets, setRecentWallets] = useState([]); // per-crypto loaded when crypto available

  // fetch asset list and find this crypto
  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      try {
        setLoading(true);
        setMessage(null);
        const res = await client.get("/assets/");
        // backend might return { cryptos: [...] } or array directly
        const cryptos = Array.isArray(res.data?.cryptos)
          ? res.data.cryptos
          : Array.isArray(res.data)
          ? res.data
          : [];
        const found = cryptos.find((c) => String(c.id) === String(id));
        if (!mounted) return;
        if (found) {
          setCrypto(found);
          setExchangeRate(res.data?.exchange_rate ?? null);
        } else {
          setMessage({ type: "error", text: "Crypto not found." });
        }
      } catch (err) {
        console.error("Failed to load crypto:", err);
        setMessage({ type: "error", text: "Failed to load crypto. Please try again." });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => {
      mounted = false;
    };
  }, [id]);

  // load recent wallets when crypto becomes available
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

  // helper: save wallet to per-crypto recent list
  const saveWalletToRecent = (address) => {
    if (!crypto || !address) return;
    const key = `recent_wallets_${crypto.symbol}`;
    const existing = Array.isArray(JSON.parse(localStorage.getItem(key) || "[]"))
      ? JSON.parse(localStorage.getItem(key) || "[]")
      : [];
    const updated = [address, ...existing.filter((a) => a !== address)].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(updated));
    setRecentWallets(updated);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleQuickPick = (val) => {
    setForm((p) => ({ ...p, amount: String(val) }));
  };

  const quickPickOptions = () => {
    if (!crypto) return [];
    if (form.currency === "NGN") return [500, 1000, 2000, 5000];
    if (form.currency === "USDT") return [0.5, 1.0, 2.0, 5.0];
    return [0.1, 0.5, 1.0, 2.0];
  };

  // live calculation
  let cryptoReceived = 0;
  let totalNgn = 0;
  if (crypto && exchangeRate && form.amount) {
    const amt = Number(form.amount);
    if (!Number.isNaN(amt) && amt > 0) {
      if (form.currency === "NGN") {
        totalNgn = amt;
        cryptoReceived = amt / exchangeRate / (crypto.price || 1);
      } else if (form.currency === "USDT") {
        totalNgn = amt * exchangeRate;
        cryptoReceived = amt / (crypto.price || 1);
      } else if (form.currency === crypto.symbol) {
        cryptoReceived = amt;
        totalNgn = amt * (crypto.price || 1) * exchangeRate;
      }
    }
  }

  // sanitize known blockchain/backend errors into user-friendly messages
  const sanitizeError = (err) => {
    const raw = err?.response?.data?.error || err?.message || String(err);
    const low = raw.toLowerCase();
    if (low.includes("insufficient") && low.includes("fund")) {
      return "Insufficient funds. Please top up and try again.";
    }
    if (low.includes("invalid") && low.includes("address")) {
      return "Invalid wallet address. Please check and try again.";
    }
    if (low.includes("network") || low.includes("timeout")) {
      return "Network error. Please try again in a moment.";
    }
    // generic fallback
    return "Transaction failed. Please try again later.";
  };

  // submit transaction
  const confirmAndSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    setShowConfirm(false);

    try {
      const res = await client.post(`/buy-crypto/${id}/`, form);

      // save wallet to recent list
      saveWalletToRecent(form.wallet_address);

      // create receiptData from response (best-effort)
      setReceiptData({
        status: "success",
        type: "crypto",
        crypto: crypto.symbol,
        amount: totalNgn,
        wallet_address: form.wallet_address,
        tx_hash: res.data?.tx_hash ?? null,
        reference: res.data?.reference ?? null,
      });

      // show brief success overlay then let receipt show
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1200);
    } catch (err) {
      console.error("Purchase error:", err);
      const safeMsg = sanitizeError(err);
      setMessage({ type: "error", text: safeMsg });

      setReceiptData({
        status: "failed",
        type: "crypto",
        crypto: crypto?.symbol ?? "CRYPTO",
        amount: totalNgn,
        wallet_address: form.wallet_address,
        tx_hash: null,
        reference: null,
      });
    } finally {
      setSubmitting(false);
      // clear form but keep wallet in recent list
      setForm({ amount: "", currency: "NGN", wallet_address: "" });
    }
  };

  const trimAddress = (addr) => {
    if (!addr || typeof addr !== "string") return addr;
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // ------------------ Loading skeleton (shimmer) ------------------
  const LoadingSkeleton = () => (
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

      <div className="w-full max-w-3xl bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-700">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full shimmer" />
          <div className="flex-1 space-y-3">
            <div className="h-5 w-2/4 rounded shimmer" />
            <div className="h-4 w-1/3 rounded shimmer" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 mb-6 flex justify-between items-center border border-gray-700">
          <div className="space-y-2 w-3/4">
            <div className="h-4 w-32 rounded shimmer" />
            <div className="h-4 w-48 rounded shimmer" />
          </div>
          <div className="w-12 h-12 rounded-full shimmer" />
        </div>

        <div className="space-y-4">
          <div className="h-12 rounded-lg shimmer" />
          <div className="h-12 rounded-lg shimmer" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg shimmer" />
            ))}
          </div>
          <div className="h-24 rounded-lg shimmer" />
          <div className="h-12 rounded-lg shimmer" />
        </div>
        <p className="text-sm text-gray-400 mt-6 text-center">Fetching secure rate & crypto data…</p>
      </div>
    </div>
  );

  if (loading) return <LoadingSkeleton />;

  if (!crypto)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md w-full text-center text-red-400">
          <p>Crypto not found.</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-indigo-600 rounded-md text-white"
          >
            Go back
          </button>
        </div>
      </div>
    );

  // ------------------ Page UI ------------------
  return (
    <>
      <div className="min-h-screen bg-gray-900 p-4">
        <div className="max-w-3xl mx-auto bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-700 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-indigo-900/20 to-gray-900/10" />

          <div className="flex items-center mb-6 z-10 relative">
            <button
              onClick={() => navigate(-1)}
              className="mr-3 p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-2xl font-bold">Buy {crypto.name}</h1>
          </div>

          <div className="bg-gray-800 p-4 rounded-xl mb-6 flex items-center justify-between border border-gray-700 z-10 relative">
            <div>
              <p className="text-sm text-gray-300">
                <span className="text-gray-400">1 USD =</span>{" "}
                <span className="font-semibold text-green-400">₦{exchangeRate?.toLocaleString()}</span>
              </p>
              <p className="text-sm text-gray-300 mt-1">
                <span className="text-gray-400">1 {crypto.symbol} =</span>{" "}
                <span className="font-semibold text-indigo-400">
                  ${crypto.price?.toLocaleString() ?? "—"} ≈ ₦{crypto.price && exchangeRate ? (crypto.price * exchangeRate).toLocaleString() : "—"}
                </span>
              </p>
            </div>
            {crypto.logo_url && (
              <img src={crypto.logo_url} alt={crypto.name} className="w-12 h-12 rounded-full border-2 border-indigo-400/40" />
            )}
          </div>

          {message && (
            <div
              className={`p-3 rounded-md mb-6 text-sm ${
                message.type === "success" ? "bg-green-600/20 text-green-300" : "bg-red-600/20 text-red-300"
              } z-10`}
              role="alert"
            >
              {message.text}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setShowConfirm(true);
            }}
            className="space-y-6 z-10 relative"
          >
            {/* Amount + Currency */}
            <div className="flex gap-3">
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                placeholder={`Enter amount in ${form.currency}`}
                value={form.amount}
                onChange={handleChange}
                required
                className="flex-1 bg-gray-800 border border-gray-700 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
              />
              <select
                name="currency"
                value={form.currency}
                onChange={handleChange}
                className="w-32 bg-gray-800 border border-gray-700 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
              >
                <option value="NGN">NGN</option>
                <option value="USDT">USDT</option>
                <option value={crypto.symbol}>{crypto.symbol}</option>
              </select>
            </div>

            {/* Quick picks */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Quick Pick</label>
              <div className="grid grid-cols-4 gap-2">
                {quickPickOptions().map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickPick(val)}
                    className={`p-3 rounded-lg text-center text-sm font-semibold ${
                      Number(form.amount) === val ? "bg-indigo-600 text-white border border-green-500" : "bg-gray-800 border border-gray-700 hover:bg-gray-700"
                    }`}
                  >
                    {form.currency === "NGN" ? `₦${val}` : `${val}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Live calculation */}
            {form.amount && (
              <div className="bg-gray-800 p-4 rounded-xl text-sm text-gray-300 border border-gray-700">
                <p className="font-medium">
                  You will receive:{" "}
                  <span className="font-semibold text-indigo-400">{cryptoReceived.toFixed(6)} {crypto.symbol}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Equivalent to ≈ <span className="font-semibold text-red-400">₦{totalNgn.toLocaleString()}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Rate: <span className="font-semibold text-yellow-400">${crypto.price?.toLocaleString() ?? "—"}</span>
                </p>
              </div>
            )}

            {/* Wallet address + recent */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">{crypto.symbol} Wallet Address</label>

              <input
                name="wallet_address"
                type="text"
                placeholder={`Your ${crypto.symbol} wallet address`}
                value={form.wallet_address}
                onChange={handleChange}
                required
                className="w-full bg-gray-800 border border-gray-700 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
              />

              {/* Recently used (per crypto) */}
              {recentWallets.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-2">Recently used</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {recentWallets.map((addr) => (
                      <button
                        key={addr}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, wallet_address: addr }))}
                        className="flex-shrink-0 px-3 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:bg-gray-700 transition whitespace-nowrap"
                        title={addr}
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
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 transition shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Processing..." : `Buy ${crypto.symbol}`}
            </button>
          </form>

          {/* Full-screen staged loader */}
          {submitting && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999]">
              <AnimatedTransactionLoader />
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-md w-full border border-gray-700 shadow-xl">
            <h3 className="text-xl font-bold mb-3">Confirm Purchase</h3>
            <p className="text-sm mb-2">
              You are buying <span className="font-semibold">{crypto.symbol}</span> worth{" "}
              <span className="font-semibold text-indigo-400">{form.amount} {form.currency}</span>
            </p>
            <p className="text-sm mb-4">
              You will receive{" "}
              <span className="font-semibold text-indigo-400">{cryptoReceived.toFixed(6)} {crypto.symbol}</span>
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">Cancel</button>
              <button onClick={confirmAndSubmit} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Success overlay */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-[9999]">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-400">
            <span className="text-3xl">✅</span>
          </motion.div>
          <p className="text-green-300 mt-4 text-lg font-semibold">Transaction Successful</p>
        </div>
      )}

      {/* Receipt modal (shows when receiptData is set) */}
      <Receipt type="crypto" data={receiptData} onClose={() => setReceiptData(null)} />
    </>
  );
}

/* ---------- Animated transaction loader component ---------- */
function AnimatedTransactionLoader() {
  const messages = [
    "Confirming transaction…",
    "Finalizing purchase…",
    "Almost done…",
    "Securing your receipt…",
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s < messages.length - 1 ? s + 1 : s));
    }, 2400);
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
          animate={{ width: `${((step + 1) / messages.length) * 100}%` }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        />
      </div>

      <motion.p key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="text-indigo-200 text-lg font-medium">
        {messages[step]}
      </motion.p>

      <p className="text-gray-400 text-sm">Please don’t close this window…</p>
    </div>
  );
}
