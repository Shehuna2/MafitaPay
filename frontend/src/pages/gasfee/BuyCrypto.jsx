// src/pages/BuyCrypto.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import client from "../../api/client";
import { Loader2, RefreshCw, ArrowLeft } from "lucide-react";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";

const ASSET_CACHE_KEY = "asset_cache_v1";
const RATE_CACHE_KEY = (id) => `buycrypto_cache_${id}`;
const MARGIN_INFO_KEY = (id) => `buycrypto_margin_${id}`;

const MIN_AMOUNT = 200;
const MAX_AMOUNT = 10000000;

// TTL constants
const RATE_TTL = 10 * 60 * 1000; // 10 minutes
const ASSET_TTL = 2 * 60 * 60 * 1000; // 2 hours
const RATE_FETCH_TIMEOUT = 6000; // 6 seconds
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes auto-refresh

// Helper functions for cache staleness checks
function isCacheStale(timestamp, ttl) {
  if (! timestamp) return true;
  return Date.now() - timestamp > ttl;
}

function parseBackendError(err) {
  if (! err?.response?.data) return "Network error.  Please try again.";
  const data = err.response.data;
  if (typeof data. error === "string") return data.error;
  if (data.detail) return data.detail;
  if (data.amount_required) return "Amount is required. ";
  if (data.invalid_amount) return "Invalid amount entered.";
  if (data. unsupported_currency) return "Unsupported currency.";
  if (data.invalid_wallet_address) return "Invalid wallet address. ";
  if (data.amount_too_small) return "Amount is below the minimum allowed.";
  if (data. amount_too_large) return "Amount exceeds the maximum limit.";
  if (data. insufficient_funds) return "Insufficient funds in system wallet.";
  if (data. transaction_failed) return "Transaction failed — please try again.";
  if (data.post_processing_failed) return "Your order went through but syncing failed.  Support has been notified.";
  return "Transaction failed.  Please try again.";
}

export default function BuyCrypto() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [crypto, setCrypto] = useState(null);
  const [priceUsd, setPriceUsd] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [priceNgn, setPriceNgn] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({
    amount: false,
    wallet_address: false,
  });
  const [marginInfo, setMarginInfo] = useState(null); // NEW:  track margin transparency

  const [form, setForm] = useState({
    amount: "",
    currency: "NGN",
    wallet_address:  "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [rateLoading, setRateLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [recentWallets, setRecentWallets] = useState([]);
  const autoRefreshIntervalRef = useRef(null); // NEW: track auto-refresh timer

  // NEW: Track form activity to know if user is still on the page
  const formActivityRef = useRef(Date.now());

  // NEW: Setup auto-refresh every 5 minutes if user is still on form
  useEffect(() => {
    if (! crypto) return;

    autoRefreshIntervalRef.current = setInterval(async () => {
      const timeSinceActivity = Date.now() - formActivityRef.current;
      // Only auto-refresh if user hasn't touched form in last minute (to avoid annoying them)
      if (timeSinceActivity > 60000) {
        console.log("[BuyCrypto] Auto-refreshing rate (5min interval)");
        await fetchFreshRate({ silent: true });
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (autoRefreshIntervalRef.current) clearInterval(autoRefreshIntervalRef.current);
    };
  }, [crypto]);

  // Update form activity timestamp on any user input
  const updateFormActivity = useCallback(() => {
    formActivityRef. current = Date.now();
  }, []);

  // NEW: Validate cache age and show warning
  const validateCacheAge = (timestamp) => {
    if (!timestamp) return null;
    const age = Date.now() - timestamp;
    if (age > 30 * 60 * 1000) { // 30 minutes
      return `⚠️ Rate is ${Math.round(age / 60000)} minutes old. Consider refreshing.`;
    }
    return null;
  };

  // ---------------- FETCH RATE WITH CACHE, TIMEOUT, AND EXPIRATION CHECK ----------------
  const fetchFreshRate = useCallback(async (options = {}) => {
    const { silent = false } = options;
    if (! silent) setRateLoading(true);

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RATE_FETCH_TIMEOUT);

      const res = await client.get(`/buy-crypto/${id}/`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = {
        price_usd: res.data.price_usd,
        usd_ngn_rate: res.data. usd_ngn_rate,
        price_ngn: res.data. price_ngn,
        timestamp: Date.now(),
        margin_type: res.data.margin_type || "buy", // NEW: backend sends margin info
        margin_amount: res.data.margin_amount || 0, // NEW: margin transparency
      };
      
      localStorage.setItem(RATE_CACHE_KEY(id), JSON.stringify(data));
      localStorage.setItem(MARGIN_INFO_KEY(id), JSON.stringify({
        margin_type: data.margin_type,
        margin_amount: data.margin_amount,
      }));
      
      setPriceUsd(data.price_usd);
      setExchangeRate(data.usd_ngn_rate);
      setPriceNgn(data. price_ngn);
      setMarginInfo({
        margin_type: data. margin_type,
        margin_amount: data.margin_amount,
      });
      setMessage(null);
      return true;
    } catch (err) {
      const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY(id)) || "null");
      const isTimeout = err.name === 'AbortError';

      if (cached) {
        // Keep cached values in state
        setPriceUsd(cached.price_usd);
        setExchangeRate(cached.usd_ngn_rate);
        setPriceNgn(cached.price_ngn);
        setMarginInfo({
          margin_type: cached.margin_type,
          margin_amount: cached.margin_amount,
        });

        // NEW: Show age warning
        const ageWarning = validateCacheAge(cached.timestamp);

        if (isTimeout) {
          setMessage({
            type: "warning",
            text: `Rate refresh timed out. Using cached rate. ${ageWarning || "Click refresh to try again."}`
          });
        } else {
          setMessage({
            type: "warning",
            text: `Failed to refresh.  Using last known rate. ${ageWarning || ""}`
          });
        }
      } else {
        if (isTimeout) {
          setMessage({
            type: "error",
            text: "Rate request timed out. Please try again."
          });
        } else {
          setMessage({
            type: "error",
            text:  "Failed to fetch rate. Please try again."
          });
        }
      }
      return false;
    } finally {
      if (!silent) setRateLoading(false);
    }
  }, [id]);

  // ---------------- INITIAL LOAD (CACHE FIRST WITH PARALLEL FETCHES) ----------------
  useEffect(() => {
    let mounted = true;

    async function load() {
      // Step 1: Check cache and populate state immediately
      let cryptoFromCache = null;
      let rateFromCache = null;
      let hasValidCache = false;

      const assetCache = JSON.parse(localStorage.getItem(ASSET_CACHE_KEY) || "null");
      if (assetCache?. assets) {
        cryptoFromCache = assetCache.assets.find((a) => String(a.id) === String(id));
        if (cryptoFromCache) {
          setCrypto(cryptoFromCache);
        }
      }

      const cachedRate = JSON.parse(localStorage.getItem(RATE_CACHE_KEY(id)) || "null");
      if (cachedRate) {
        rateFromCache = cachedRate;
        setPriceUsd(cachedRate.price_usd);
        setExchangeRate(cachedRate.usd_ngn_rate);
        setPriceNgn(cachedRate.price_ngn);
        setMarginInfo({
          margin_type: cachedRate.margin_type,
          margin_amount: cachedRate.margin_amount,
        });
        hasValidCache = true;
      }

      // Step 2: If we have cache, clear loading immediately to show the form
      if (hasValidCache && cryptoFromCache) {
        setLoading(false);
      } else {
        // Keep loading state for initial skeleton
        setLoading(true);
      }

      // Step 3: Check staleness and decide whether to refresh
      const rateIsStale = ! rateFromCache || isCacheStale(rateFromCache. timestamp, RATE_TTL);
      const assetsAreStale = !assetCache || isCacheStale(assetCache.timestamp, ASSET_TTL);

      // Show notice if using stale cache
      if (hasValidCache && rateIsStale) {
        setMessage({
          type: "info",
          text: "Refreshing rate in background..."
        });
      }

      // Step 4: Parallelize network calls - don't block rendering
      try {
        const promises = [];

        // Always refresh rate if stale or missing (in parallel)
        if (rateIsStale) {
          promises.push(
            fetchFreshRate({ silent:  hasValidCache }).catch(() => {
              // Error already handled in fetchFreshRate
            })
          );
        }

        // Refresh assets if stale or missing (in parallel)
        if (assetsAreStale || !cryptoFromCache) {
          promises.push(
            client.get("/assets/")
              .then((listRes) => {
                if (! mounted) return;
                const cryptos = listRes.data.cryptos || [];
                const found = cryptos.find((c) => String(c.id) === String(id));
                if (found) setCrypto(found);

                localStorage.setItem(
                  ASSET_CACHE_KEY,
                  JSON.stringify({
                    assets: cryptos,
                    exchangeRate: listRes.data.exchange_rate,
                    timestamp: Date.now(),
                  })
                );
              })
              .catch((err) => {
                // Asset fetch failed, but don't block if we have cached crypto
                console.error("Asset fetch failed:", err);
              })
          );
        }

        // Wait for all parallel requests
        if (promises.length > 0) {
          await Promise.allSettled(promises);
        }
      } catch (err) {
        // Catch-all for unexpected errors
        console.error("Load error:", err);
      } finally {
        // Always clear loading state
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => (mounted = false);
  }, [id, fetchFreshRate]);

  // ---------------- RECENT WALLETS ----------------
  useEffect(() => {
    if (! crypto) return;
    const key = `recent_wallets_${crypto.symbol}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(stored)) setRecentWallets(stored. slice(0, 5));
    } catch {
      setRecentWallets([]);
    }
  }, [crypto]);

  const saveWalletToRecent = (address) => {
    if (!crypto || !address) return;
    const key = `recent_wallets_${crypto.symbol}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const updated = [address, ...existing. filter((a) => a !== address)].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(updated));
    setRecentWallets(updated);
  };

  const getAmountInNgn = (amt, currency) => {
    if (!priceUsd || !exchangeRate) return 0;
    const num = Number(amt);

    if (currency === "NGN") return num;
    if (currency === "USDT") return num * exchangeRate;
    if (currency === crypto?. symbol) return num * priceUsd * exchangeRate;
    return 0;
  };

  // ---------------- LIVE VALIDATION ----------------
  const validateField = (name, value) => {
    switch (name) {
      case "amount":  {
        if (! value) return "Amount is required";
        if (isNaN(Number(value))) return "Amount must be a number";

        const ngnValue = getAmountInNgn(value, form.currency);

        if (ngnValue < MIN_AMOUNT)
          return `Minimum amount is ₦${MIN_AMOUNT. toLocaleString()}`;

        if (ngnValue > MAX_AMOUNT)
          return `Maximum amount is ₦${MAX_AMOUNT.toLocaleString()}`;

        return "";
      }

      case "wallet_address": {
        if (! value) return "Wallet address is required";

        const symbol = crypto?.symbol?. toUpperCase();

        /* ---------- EVM Chains ---------- */
        const EVM = [
          "ETH-ERC20", "BNB", "POL-MATIC", "AVAX", "BNB-USDT", "BASE-USDC", 
          "OP-ETH", "ARB-ETH", "BASE-ETH", "LINEA-ETH"
        ]; 
        if (EVM.includes(symbol)) {
          if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
            return "Invalid EVM address (must be 0x followed by 40 hex chars)";
          }
          return "";
        }

        /* ---------- TRON (TRC20 USDT) ---------- */
        if (symbol === "USDT-TRC20" || symbol === "TRX") {
          if (!/^T[a-zA-Z0-9]{33}$/.test(value)) {
            return "Invalid TRON (TRC20) address";
          }
          return "";
        }

        /* ---------- SOLANA ---------- */
        if (symbol === "SOL") {
          const base58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
          if (!base58.test(value)) return "Invalid Solana address";
          return "";
        }

        /* ---------- NEAR ---------- */
        if (symbol === "NEAR") {
          if (/^[a-z0-9._-]+\.(near|tg)$/i.test(value)) return "";
          if (/^[a-fA-F0-9]{64}$/.test(value)) return "";
          return "Invalid NEAR wallet address";
        }

        /* ---------- TON ---------- */
        if (symbol === "TON") {
          const tonBase64 = /^[EU][A-Za-z0-9_-]{47,48}$/;
          const tonHex = /^[a-fA-F0-9]{64}$/;
          if (tonBase64.test(value) || tonHex.test(value)) return "";
          return "Invalid TON wallet address";
        }

        /* ---------- Fallback (unknown asset) ---------- */
        return "Invalid wallet address format for this asset";
      }

      default:
        return "";
    }
  };

  const handleChange = (e) => {
    let { name, value } = e.target;

    // prevent paste spacing issues
    if (name === "wallet_address") {
      value = value.trim();
    }

    setForm((prev) => ({ ...prev, [name]: value }));
    updateFormActivity(); // NEW: track form activity

    // live validation
    setErrors((prev) => ({
      ...prev,
      [name]: validateField(name, value),
    }));
  };

  const handleQuickPick = (val) => {
    setForm((prev) => ({ ...prev, amount: String(val) }));
    updateFormActivity(); // NEW: track form activity
    setErrors((prev) => ({ ...prev, amount: validateField("amount", val) }));
  };

  const quickPickOptions = () => {
    if (!crypto) return [];
    if (form.currency === "NGN") return [500, 1000, 2000, 5000, 10000, 20000];
    if (form.currency === "USDT") return [0.5, 1.0, 2.0, 5.0, 10.0, 20.0];
    return [0.001, 0.005, 0.01, 0.02, 0.05, 0.10];
  };

  const validateForm = () => {
    const newErrors = {};
    Object.keys(form).forEach((key) => {
      const errMsg = validateField(key, form[key]);
      if (errMsg) newErrors[key] = errMsg;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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

  // NEW: Show cache age indicator
  const cachedRate = JSON.parse(localStorage.getItem(RATE_CACHE_KEY(id)) || "null");
  const cacheAgeWarning = cachedRate ?  validateCacheAge(cachedRate. timestamp) : null;

  // ---------------- SUBMIT ----------------
  const confirmAndSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    setMessage(null);
    setShowConfirm(false);

    try {
      const res = await client.post(`/buy-crypto/${id}/`, form);

      saveWalletToRecent(form.wallet_address);

      // 🔥 Prevent double submission + clear form safely
      setSubmitted(true);
      setForm({ amount: "", currency: "NGN", wallet_address: "" });
      setErrors({});
      setTouched({ amount: false, wallet_address: false });

      // Optional: re-enable submit after success overlay disappears
      setTimeout(() => setSubmitted(false), 1500);

      setReceiptData({
        status: "success",
        type: "crypto",
        crypto: crypto. symbol,
        amount: totalNgn,
        wallet_address: form.wallet_address,
        tx_hash: res.data?. tx_hash ??  null,
        reference: res.data?.reference ?? null,
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1200);

    } catch (err) {
      const pretty = parseBackendError(err);
      setMessage({ type: "error", text: pretty });
      setReceiptData({
        status: "failed",
        type: "crypto",
        crypto: crypto?. symbol ??  "CRYPTO",
        amount: totalNgn,
        wallet_address: form.wallet_address,
        backend_error: pretty,
        raw:  err?. response?.data || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const trimAddress = (addr) => (addr && addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr);

  if (loading) return <LoadingSkeleton />;
  if (! crypto) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="max-w-md w-full text-center text-red-400">
        <p>Crypto not found. </p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-indigo-600 rounded-xl text-white font-bold">Go back</button>
      </div>
    </div>
  );

  return (
    <>
      <ToastContainer />
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Back Arrow */}
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4 text-indigo-400 hover:text-indigo-300 transition">
            <ArrowLeft className="w-5 h-5" /><span className="text-sm font-medium">Back</span>
          </button>

          {submitting && <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"><AnimatedTransactionLoader /></div>}

          <div className="bg-gray-800/80 p-5 rounded-2xl border border-gray-700/50">
            {/* Refresh */}
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs text-gray-400">
                {cachedRate && (
                  <span>Rate cached {Math.round((Date.now() - cachedRate.timestamp) / 1000 / 60)}m ago</span>
                )}
              </div>
              <button
                onClick={fetchFreshRate}
                disabled={rateLoading}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                {rateLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh rate
              </button>
            </div>

            {/* Rate panel */}
            <div className="bg-gray-800/60 p-3 rounded-xl mb-5 border border-gray-700/50 flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-xs text-gray-300">
                  <span className="text-gray-400">1 USD =</span>{" "}
                  <span className="font-bold text-green-400">
                    ₦{exchangeRate?. toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>{" "}
                  <span className="text-[10px] text-green-300">(incl. fees)</span>
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  <span className="text-gray-400">1 {crypto. symbol} =</span>{" "}
                  <span className="font-bold text-indigo-400">
                    ${priceUsd?.toLocaleString(undefined, { minimumFractionDigits: 2 })} → ₦
                    {(priceUsd * exchangeRate)?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </p>
                {/* NEW: Margin Transparency */}
                {marginInfo && (
                  <p className="text-xs text-amber-300 mt-1">
                    📊 <span className="capitalize">{marginInfo.margin_type}</span> margin applied • See full breakdown at checkout
                  </p>
                )}
              </div>
              <img
                src={`/images/${crypto.symbol?. toLowerCase()}.png`}
                alt={crypto.name}
                onError={(e) => (e.target.src = crypto.logo_url || "/images/default. png")}
                className="w-10 h-10 rounded-full border border-indigo-500/30 object-contain bg-gray-900"
              />
            </div>

            {/* Message */}
            {message && (
              <div
                className={`p-3 rounded-xl mb-5 text-xs border ${
                  message.type === "success"
                    ? "bg-green-600/20 text-green-400 border-green-500/50"
                    : message.type === "warning"
                    ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/50"
                    :  message.type === "info"
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/50"
                    :  "bg-red-600/20 text-red-400 border-red-500/50"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Cache Age Warning */}
            {cacheAgeWarning && (
              <div className="p-3 rounded-xl mb-5 text-xs bg-amber-600/20 text-amber-300 border border-amber-500/50">
                {cacheAgeWarning}
              </div>
            )}

            {/* FORM */}
            <form
              onSubmit={(e) => {
                e. preventDefault();
                if (validateForm()) setShowConfirm(true);
              }}
              className="space-y-4"
            >
              {/* Amount & currency */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs mb-1.5">Amount</label>
                  <input
                    name="amount"
                    type="number"
                    placeholder="Enter amount"
                    value={form.amount}
                    onChange={handleChange}
                    onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                    required
                    className={`w-full bg-gray-800/60 backdrop-blur-md p-2.5 rounded-xl text-gray-400 text-sm border 
                      ${
                        touched.amount && errors.amount
                          ? "border-red-500"
                          : "border-gray-700/80"
                      }
                    `}
                  />
                  {touched.amount && errors. amount && (
                    <p className="text-red-500 text-xs mt-1">{errors.amount}</p>
                  )}
                </div>

                <div className="w-28">
                  <label className="block text-xs mb-1.5">Currency</label>
                  <select
                    name="currency"
                    value={form.currency}
                    onChange={handleChange}
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm"
                  >
                    <option value="NGN">NGN</option>
                    <option value="USDT">USDT</option>
                    <option value={crypto. symbol}>{crypto.symbol}</option>
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
                          :  "bg-gray-800/60 border border-gray-700"
                      }`}
                    >
                      {form.currency === "NGN" ?  `₦${val}` : val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculation */}
              {form.amount && (
                <div className="bg-gray-800/60 p-3 rounded-xl text-xs border border-gray-700/50">
                  <p>
                    You pay:  <span className="text-orange-400 font-bold">₦{totalNgn.toLocaleString()}</span>
                  </p>
                  <p className="mt-1">
                    You receive: <span className="text-indigo-400 font-bold">{cryptoReceived.toFixed(8)} {crypto.symbol}</span>
                  </p>
                  <p className="mt-2 text-[11px] text-gray-500">Rate locked • Includes all fees</p>
                </div>
              )}

              {/* Wallet */}
              <div>
                <label className="block text-xs mb-1.5">{crypto.symbol} Wallet Address</label>
                <input
                  name="wallet_address"
                  type="text"
                  placeholder={`Enter your ${crypto.symbol} wallet address`}
                  value={form. wallet_address}
                  onChange={(e) => {
                    const v = e.target.value. trim();
                    handleChange({ target: { name: "wallet_address", value:  v } });
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, wallet_address: true }))}
                  required
                  className={`w-full bg-gray-800/60 backdrop-blur-md p-2.5 rounded-xl text-gray-400 text-sm border 
                    ${
                      touched.wallet_address && errors.wallet_address
                        ? "border-red-500"
                        : "border-gray-700/80"
                    }
                  `}
                />
                {touched. wallet_address && errors.wallet_address && (
                  <p className="text-red-500 text-xs mt-1">{errors.wallet_address}</p>
                )}
                {recentWallets.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">Recently used</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {recentWallets.map((addr) => (
                        <button
                          key={addr}
                          type="button"
                          onClick={() => {
                            setForm((p) => ({ ...p, wallet_address: addr }));
                            setErrors((prev) => ({
                              ...prev,
                              wallet_address: validateField("wallet_address", addr),
                            }));
                            updateFormActivity(); // NEW: track activity
                          }}
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
                disabled={
                  loading ||
                  submitted ||
                  ! form.amount ||
                  ! form.wallet_address ||
                  !priceUsd ||
                  ! exchangeRate ||
                  Object.values(errors).some((e) => e)
                }
                className={`w-full py-3 rounded-xl font-medium text-white transition
                  ${
                    loading || submitted ||
                    !form.amount ||
                    !form.wallet_address ||
                    !priceUsd ||
                    !exchangeRate ||
                    Object. values(errors).some((e) => e)
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }
                `}
              >
                {submitted ? "Submitted" : loading ? "Processing..." : "Buy Crypto"}
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

        {/* Success */}
        {showSuccess && <SuccessOverlay />}

        <Receipt type="crypto" data={receiptData} onClose={() => setReceiptData(null)} />
      </div>
    </>
  );
}

/* ---------------- HELPER COMPONENTS ---------------- */
function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <style>{`
        @keyframes shimmer {0% { background-position: -200% 0; } 100% { background-position:  200% 0; }}
        .shimmer { background:  linear-gradient(110deg, rgba(55,65,81,0.28) 8%, rgba(99,102,241,0.14) 18%, rgba(55,65,81,0.28) 33%); background-size: 200% 100%; animation: shimmer 1.8s linear infinite; }
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
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-xl shimmer" />)}</div>
          <div className="h-24 rounded-xl shimmer" />
          <div className="h-12 rounded-xl shimmer" />
        </div>
        <p className="text-sm text-gray-400 mt-5 text-center">Fetching secure rate & crypto data…</p>
      </div>
    </div>
  );
}

function AnimatedTransactionLoader() {
  const messages = ["Confirming transaction…", "Finalizing purchase…", "Almost done…", "Securing your receipt…"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s < messages.length - 1 ?  s + 1 : s)), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center space-y-6">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />
        <motion.div className="w-16 h-16 border-4 border-indigo-400 border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} />
      </div>
      <div className="w-72 h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div className="h-full bg-indigo-500" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ repeat: Infinity, duration: 2 }} />
      </div>
      <p className="text-sm text-gray-300">{messages[step]}</p>
    </div>
  );
}

function SuccessOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <motion.div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center text-white text-xl font-bold" initial={{ scale: 0 }} animate={{ scale: 1.2 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
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
          You are about to buy <span className="text-indigo-400 font-bold">{cryptoReceived.toFixed(8)} {crypto.symbol}</span> using <span className="font-bold">{form.amount} {form.currency}</span>
        </p>
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel} className="flex-1 py-2 bg-gray-700 rounded-xl text-sm">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-indigo-600 rounded-xl text-sm">Confirm</button>
        </div>
      </div>
    </div>
  );
}
