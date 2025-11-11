// src/pages/sell/SellCrypto.jsx
import { useEffect, useState, Fragment } from "react";
import client from "../../api/client";
import { CheckCircle, Loader2, History, Copy, X, ArrowLeft } from "lucide-react";
import { Dialog, Transition } from "@headlessui/react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function SellCrypto() {
  const [step, setStep] = useState(1);
  const [exchanges, setExchanges] = useState([]); // may be array of strings or objects
  const [exchangeInfo, setExchangeInfo] = useState(null);
  const [timer, setTimer] = useState(0);

  const [rate, setRate] = useState(null);
  const [form, setForm] = useState({ asset: "usdt", source: "", amount_asset: "" });
  const [errors, setErrors] = useState({});
  const [order, setOrder] = useState(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  const [calculatedNaira, setCalculatedNaira] = useState(0);

  useEffect(() => {
    if (!form.amount_asset || !rate) {
      setCalculatedNaira(0);
      return;
    }
    const val = Number(form.amount_asset) * Number(rate);
    setCalculatedNaira(val);
  }, [form.amount_asset, rate]);


  // ---------- fetch available exchanges (for dropdown) ----------
  useEffect(() => {
    async function fetchExchanges() {
      try {
        const res = await client.get("/sell/exchanges/");
        // backend returns an array of strings (e.g. ["Binance","Bybit"...])
        setExchanges(res.data.exchanges || []);
      } catch (err) {
        console.error("Failed to fetch exchanges:", err);
        setExchanges([]);
      }
    }
    fetchExchanges();
  }, []);

  // ---------- rate lookup ----------
  useEffect(() => {
    async function fetchRate() {
      if (!form.asset) return;
      try {
        const res = await client.get(`sell/rate/${form.asset}/`);
        setRate(res.data.rate_ngn);
      } catch {
        setRate(null);
      }
    }
    fetchRate();
  }, [form.asset]);

  const [assets, setAssets] = useState([]);

  // ---------- fetch available assets ----------
  useEffect(() => {
    async function fetchAssets() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/sell/assets/`);
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }
        const data = await res.json();
        setAssets(data.assets || []);
      } catch (err) {
        console.error("Failed to fetch assets:", err);
        setAssets([]);
      }
    }
    fetchAssets();
  }, []);


  // ---------- poll order status when in step 3 ----------
  useEffect(() => {
    let interval;
    if (step === 3 && order) {
      interval = setInterval(async () => {
        try {
          const res = await client.get(`/sell/${order.order_id}/`); // note: backend url may or may not include /api prefix depending on client baseURL
          // backend returns { success: true, order: {...}, exchange_details: {...} }
          const _status = res.data.order?.status || res.data?.order?.status || null;
          setStatus(_status);
          if (["completed", "failed", "expired", "cancelled"].includes(_status)) {
            clearInterval(interval);
          }
        } catch (err) {
          // ignore transient errors
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [step, order]);

  // ---------- pending orders on load (resume) ----------
  useEffect(() => {
    async function fetchPending() {
      try {
        const res = await client.get("/sell/pending/");
        if (res.data.orders?.length > 0) {
          const lastOrder = res.data.orders[0];
          setOrder(lastOrder);
          setExchangeInfo(lastOrder.details?.exchange_contact || null);
          setStep(lastOrder.status === "pending" || lastOrder.status === "pending_payment" ? 2 : 3);
          setStatus(lastOrder.status);
        }
      } catch (err) {
        // ignore
      }
    }
    fetchPending();
  }, []);

  // tiny interval placeholder used previously — removed (not needed)

  // ---------- form helpers ----------
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
    setErrors((errs) => ({ ...errs, [name]: null }));
  };

  // ---------- start order (Step 1 -> Step 2) ----------
  const handleStartOrder = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      // POST to backend
      const res = await client.post("/sell/", {
        asset: form.asset,
        source: form.source,
        amount_asset: form.amount_asset,
      });

      // backend returns { success, order, exchange_details, expires_in }
      const { success, order: createdOrder, exchange_details, expires_in } = res.data;

      if (success && createdOrder) {
        setOrder(createdOrder);
        // exchange_details prefer top-level value, fallback to order.details.exchange_contact
        setExchangeInfo(exchange_details || createdOrder?.details?.exchange_contact || null);
        setTimer(expires_in || 1800);
        setStatus(createdOrder.status || null);
        setStep(2);
      } else {
        setErrors(res.data || { general: ["Failed to start order"] });
      }
    } catch (err) {
      // Normalize backend error shapes
      setErrors(err.response?.data || { general: ["Failed to start order"] });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- fallback fetch if needed (defensive) ----------
  useEffect(() => {
    async function fallbackFetchExchange() {
      if (step !== 2 || exchangeInfo || !order?.source) return;
      try {
        // If backend didn't give details, try exchange-info endpoint
        const res = await client.get("/sell/exchange-info/", { params: { exchange: order.source } });
        setExchangeInfo(res.data.contact_info || null);
      } catch {
        // swallow
      }
    }
    fallbackFetchExchange();
  }, [step, order, exchangeInfo]);

  // ---------- countdown timer ----------
  useEffect(() => {
    if (step !== 2 || !timer) return;
    const interval = setInterval(() => setTimer((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [step, timer]);

  // ---------- upload proof ----------
  const handleUploadProof = async (e) => {
    e.preventDefault();
    if (!file) {
      setErrors({ payment_proof: ["Please upload payment proof"] });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const formData = new FormData();
      formData.append("payment_proof", file);
      const res = await client.post(`/sell/${order.order_id}/upload-proof/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        // update order status and move to step 3
        setStatus("awaiting_admin");
        setStep(3);
      } else {
        setErrors(res.data || { general: ["Failed to upload proof"] });
      }
    } catch (err) {
      setErrors(err.response?.data || { general: ["Failed to upload proof"] });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- pending modal / resume / cancel ----------
  const openPendingOrders = async () => {
    setLoadingPending(true);
    setShowPendingModal(true);
    try {
      const res = await client.get("/sell/pending/");
      setPendingOrders(res.data.orders || []);
    } catch {
      setPendingOrders([]);
    } finally {
      setLoadingPending(false);
    }
  };

  const handleResumeOrder = (o) => {
    setOrder(o);
    setExchangeInfo(o.details?.exchange_contact || null);
    setStep(o.status === "pending" || o.status === "pending_payment" ? 2 : 3);
    setShowPendingModal(false);
  };

  const handleCancelOrder = async (orderId) => {
  try {
    await client.delete(`/sell/${orderId}/cancel/`);

    // If the active order is the one you cancelled
    if (order?.order_id === orderId) {
      setOrder(null);
      setStatus("cancelled");
      setStep(1);
    }

    // Refresh pending orders to clean up the modal list
    const res = await client.get("/sell/pending/");
    setPendingOrders(res.data.orders || []);
    setConfirmCancelId(null);

    toast.success("Order cancelled successfully");
  } catch (err) {
    console.error("Cancel failed:", err);
    toast.error("Failed to cancel order");
  }
};


  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!", { autoClose: 1500 })).catch(() => toast.error("Copy failed"));
  };

  // ---------- helpers for UI timing/progress ----------
  const getTimeLeft = (createdAt) => {
    const expiry = new Date(createdAt).getTime() + 30 * 60 * 1000;
    const now = Date.now();
    const diff = Math.max(0, expiry - now);
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return status === "cancelled" ? { mins: 0, secs: 0 } : { mins, secs };
  };

  const getProgress = (createdAt) => {
    const expiry = new Date(createdAt).getTime() + 30 * 60 * 1000;
    const now = Date.now();
    const diff = Math.max(0, expiry - now);
    return status === "cancelled" ? 100 : 100 - (diff / (30 * 60 * 1000)) * 100;
  };

  const formatCrypto = (val) => (val == null ? "—" : Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const formatFiat = (val) => (val == null ? "—" : Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 }));

  // ---------- normalized option rendering helper ----------
  const renderExchangeOption = (ex, idx) => {
    // ex can be string like "Binance" or object like { exchange: "Binance", id: 1 }
    if (typeof ex === "string") {
      return <option key={ex} value={ex}>{ex}</option>;
    }
    if (ex && typeof ex === "object") {
      const val = ex.exchange || ex.name || ex.label || String(ex);
      const key = ex.id ?? idx ?? val;
      return <option key={key} value={val}>{val}</option>;
    }
    return <option key={idx} value={String(ex)}>{String(ex)}</option>;
  };

  // ---------- render ----------
  return (
    <div className="min-h-screen text-white">
      <ToastContainer />
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6">
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl p-4 sm:p-5 relative overflow-hidden border border-gray-800/50">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-gray-900/5 pointer-events-none" />
          <div className="relative z-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-5">
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-indigo-400">
                <ArrowLeft className="w-5 h-5" />
                Sell Crypto
              </h1>
              <button onClick={openPendingOrders} className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-all duration-200">
                <History className="w-4 h-4 group-hover:rotate-12 transition-transform" /> History
              </button>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-between mb-6">
              {["Asset & Amount", "Send Asset", "Done"].map((label, idx) => {
                const current = idx + 1;
                const active = step === current;
                const completed = step > current;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center relative">
                    {idx < 2 && (
                      <div className="absolute top-4 left-12 right-0 h-0.5 bg-gray-700">
                        <div className={`h-full transition-all duration-500 ${completed ? "bg-green-600" : active ? "bg-indigo-600 w-1/2" : ""}`} />
                      </div>
                    )}
                    <div className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300 ${completed ? "bg-green-600 border-green-600 shadow-lg shadow-green-500/30" : active ? "bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-500/30 animate-pulse" : "bg-gray-800/80 border-gray-700"} text-white`}>
                      {completed ? <CheckCircle className="w-4 h-4" /> : current}
                    </div>
                    <p className={`mt-1.5 text-xs font-medium transition-all ${active ? "text-indigo-300" : completed ? "text-green-400" : "text-gray-500"}`}>{label}</p>
                  </div>
                );
              })}
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <form onSubmit={handleStartOrder} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Asset</label>
                  <select
                    name="asset"
                    value={form.asset}
                    onChange={handleChange}
                    required
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 appearance-none"
                  >
                    <option value="">Select Asset</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.symbol.toLowerCase()}>
                        {a.symbol}
                      </option>
                    ))}
                  </select>
                  {errors.asset && <p className="text-red-400 text-xs mt-1">{errors.asset}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Send From</label>
                  {/* Use a slightly lighter background so native option text is visible */}
                  <select
                    name="source"
                    value={form.source}
                    onChange={handleChange}
                    required
                    className="w-full bg-gray-700 border border-gray-600 p-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 cursor-pointer"
                  >
                    <option value="">Select Exchange</option>
                    {exchanges.map((ex, idx) => renderExchangeOption(ex, idx))}
                  </select>
                  {errors.source && <p className="text-red-400 text-xs mt-1">{errors.source}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Amount</label>
                  <input
                    type="number"
                    name="amount_asset"
                    value={form.amount_asset}
                    onChange={handleChange}
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm"
                    placeholder="Enter amount"
                    required
                    min="0"
                    step="any"
                  />
                  {errors.amount_asset && <p className="text-red-400 text-xs mt-1">{errors.amount_asset}</p>}
                </div>

                {form.amount_asset && rate && (
                  <div className="bg-indigo-900/30 backdrop-blur-md p-3 rounded-xl text-xs text-gray-300 border border-indigo-800/30 transition-all duration-300 ease-in-out">
                    <p className="flex items-center justify-between">
                      <span>You will receive:</span>
                      <span className="text-green-400 font-bold text-base">
                        ₦{formatFiat(calculatedNaira)}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Rate: 1 {form.asset.toUpperCase()} = ₦{formatFiat(rate)}
                    </p>
                  </div>
                )}


                {errors.general && <p className="text-red-400 text-xs mt-1">{Array.isArray(errors.general) ? errors.general[0] : errors.general}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-indigo-600 py-2.5 rounded-xl hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-300 disabled:opacity-75"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Continue"}
                </button>
              </form>
            )}

            {/* STEP 2 */}
            {step === 2 && order && (
              <form onSubmit={handleUploadProof} className="space-y-4">
                <div className="flex items-center justify-between bg-yellow-900/30 backdrop-blur-md p-3 rounded-xl text-sm border border-yellow-700/30">
                  <p className="text-gray-300 font-medium flex items-center gap-2">Time Remaining</p>
                  <span className="bg-yellow-500 text-black font-bold px-3 py-1 rounded-full text-xs shadow-md">
                    {`${Math.floor(timer / 60)}m ${String(timer % 60).padStart(2, "0")}s`}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-gray-800/60 backdrop-blur-md p-3 rounded-xl text-center text-sm border border-gray-700/50">
                    <p className="text-gray-400">You Send</p>
                    <p className="font-semibold text-yellow-400">{formatCrypto(order.amount_asset)} {order.asset?.symbol ? order.asset.symbol.toUpperCase() : (order.asset || "").toUpperCase()}</p>
                  </div>
                  <div className="bg-gray-800/60 backdrop-blur-md p-3 rounded-xl text-center text-sm border border-gray-700/50">
                    <p className="text-gray-400">You Will Receive</p>
                    <p className="font-semibold text-green-400">₦{formatFiat(order.amount_ngn)}</p>
                  </div>
                </div>

                <div className="bg-gray-800/60 backdrop-blur-md p-3 rounded-xl space-y-2 text-sm border border-gray-700/50">
                  <p className="font-semibold text-gray-300 flex items-center gap-2">Receiving Details</p>

                  {exchangeInfo ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">UID</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{exchangeInfo.uid || exchangeInfo.id || "—"}</span>
                          <button onClick={() => handleCopy(exchangeInfo.uid || exchangeInfo.id || "")} className="text-indigo-400 hover:text-indigo-300 p-1 rounded-full hover:bg-gray-700" title="Copy">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Email</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium break-all">{exchangeInfo.email || "—"}</span>
                          <button onClick={() => handleCopy(exchangeInfo.email || "")} className="text-indigo-400 hover:text-indigo-300 p-1 rounded-full hover:bg-gray-700" title="Copy">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-500 italic">Loading exchange details...</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1.5">Upload Proof of Payment</label>
                  <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2 rounded-xl text-white text-sm" />
                  {errors.payment_proof && <p className="text-red-400 text-xs mt-1">{Array.isArray(errors.payment_proof) ? errors.payment_proof[0] : errors.payment_proof}</p>}
                </div>

                {errors.general && <p className="text-red-400 text-xs mt-1">{Array.isArray(errors.general) ? errors.general[0] : errors.general}</p>}

                <div className="flex gap-3">
                  <button type="button" onClick={() => { setStep(1); setOrder(null); setExchangeInfo(null); }} className="flex-1 bg-gray-700 py-2.5 rounded-xl hover:bg-gray-600 text-white font-semibold text-sm transition-all">Back</button>
                  <button type="submit" disabled={submitting} className="flex-1 bg-green-600 py-2.5 rounded-xl hover:bg-green-500 text-white font-semibold text-sm transition-all disabled:opacity-75">
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "I have sent the asset"}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3 */}
            {step === 3 && order && (
              <div className="space-y-4 text-center">
                <h2 className="text-xl font-bold text-indigo-400 flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" /> Order Submitted
                </h2>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-gray-800/60 backdrop-blur-md p-3 rounded-xl border border-gray-700/50">
                    <p className="text-xs text-gray-400">You Sent</p>
                    <p className="font-semibold text-yellow-400">{formatCrypto(order.amount_asset)} {order.asset?.symbol ? order.asset.symbol.toUpperCase() : (order.asset || "").toUpperCase()}</p>
                  </div>
                  <div className="bg-gray-800/60 backdrop-blur-md p-3 rounded-xl border border-gray-700/50">
                    <p className="text-xs text-gray-400">You Will Receive</p>
                    <p className="font-semibold text-green-400">₦{formatFiat(order.amount_ngn)}</p>
                  </div>
                </div>

                <div className="bg-gray-800/60 backdrop-blur-md p-3 rounded-xl border border-gray-700/50">
                  <p className="text-xs text-gray-400">From</p>
                  <p className="font-semibold text-indigo-400">{order.source}</p>
                </div>

                <div className="w-full bg-gray-800/70 rounded-lg h-3.5 relative overflow-hidden">
                  <div className={`absolute inset-0 h-full rounded-lg transition-all duration-500 ${status === "cancelled" ? "bg-gray-600" : getProgress(order.created_at) < 70 ? "bg-green-600" : getProgress(order.created_at) < 90 ? "bg-yellow-500" : "bg-red-600"}`} style={{ width: `${getProgress(order.created_at)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-bold drop-shadow-md">{Math.floor(getProgress(order.created_at))}%</span>
                </div>

                <span className="bg-yellow-500 text-black font-bold px-3 py-1 rounded-full text-xs shadow-md">{`${Math.floor(timer / 60)}m ${String(timer % 60).padStart(2, 0)}s`}</span>

                <p className={`text-lg font-bold ${status === "completed" ? "text-green-400" : status === "failed" || status === "cancelled" ? "text-red-400" : "text-yellow-400"}`}>Status: {status || "pending"}</p>

                <div className="flex gap-3 justify-center flex-wrap">
                  {status !== "completed" && status !== "cancelled" && (confirmCancelId === order.order_id ? (
                    <>
                      <button onClick={() => handleCancelOrder(order.order_id)} className="px-4 py-2 bg-red-600 rounded-xl hover:bg-red-500 text-white text-sm font-bold">Confirm Cancel</button>
                      <button onClick={() => setConfirmCancelId(null)} className="px-4 py-2 bg-gray-700 rounded-xl hover:bg-gray-600 text-white text-sm font-bold">Undo</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmCancelId(order.order_id)} className="px-4 py-2 bg-red-600 rounded-xl hover:bg-red-500 text-white text-sm font-bold">Cancel Order</button>
                  ))}

                  <button disabled={!["completed", "failed", "cancelled"].includes(status)} onClick={() => { setForm({ asset: "usdt", source: "", amount_asset: "" }); setOrder(null); setStatus(null); setStep(1); }} className={`px-4 py-2 rounded-xl text-sm font-bold ${["completed", "failed", "cancelled"].includes(status) ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-gray-700 text-gray-400 cursor-not-allowed"}`}>New Sell Order</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pending Orders Modal */}
        <Transition appear show={showPendingModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setShowPendingModal(false)}>
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-3 text-center">
                <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-gray-900/90 backdrop-blur-2xl p-5 text-left align-middle shadow-2xl transition-all border border-gray-800/50">
                    <Dialog.Title className="text-lg sm:text-xl font-bold text-white flex items-center justify-between mb-4">
                      <span className="flex items-center gap-2"><History className="w-5 h-5 text-indigo-400" /> Incomplete Orders</span>
                      <button onClick={() => setShowPendingModal(false)} className="text-gray-400 hover:text-white transition"><X className="w-5 h-5" /></button>
                    </Dialog.Title>

                    {loadingPending ? (
                      <p className="text-gray-400 text-sm text-center flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</p>
                    ) : pendingOrders.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center">No incomplete orders</p>
                    ) : (
                      <ul className="divide-y divide-gray-700">
                        {pendingOrders.map((o) => {
                          const { mins, secs } = getTimeLeft(o.created_at);
                          const progress = getProgress(o.created_at);
                          const barColor = progress < 70 ? "bg-green-600" : progress < 90 ? "bg-yellow-500" : "bg-red-600";
                          const isConfirming = confirmCancelId === o.order_id;
                          return (
                            <li key={o.order_id} className="py-3 space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <div>
                                  <div className="font-semibold text-yellow-400">{formatCrypto(o.amount_asset)} {o.asset?.symbol ? o.asset.symbol.toUpperCase() : (o.asset || "").toUpperCase()}</div>
                                  <div className="text-xs text-indigo-400">From: {o.source}</div>
                                  <div className="text-xs text-gray-400">Time left: {mins}:{secs.toString().padStart(2, "0")}</div>
                                </div>
                                <div className="flex gap-1.5">
                                  {isConfirming ? (
                                    <>
                                      <button onClick={() => handleCancelOrder(o.order_id)} className="px-2.5 py-1 bg-red-600 rounded-lg hover:bg-red-500 text-xs text-white font-bold">Confirm</button>
                                      <button onClick={() => setConfirmCancelId(null)} className="px-2.5 py-1 bg-gray-700 rounded-lg hover:bg-gray-600 text-xs text-white font-bold">Undo</button>
                                    </>
                                  ) : (
                                    <>
                                      <button onClick={() => handleResumeOrder(o)} className="px-2.5 py-1 bg-indigo-600 rounded-lg hover:bg-indigo-500 text-xs text-white font-bold">Resume</button>
                                      <button onClick={() => setConfirmCancelId(o.order_id)} className="px-2.5 py-1 bg-red-600 rounded-lg hover:bg-red-500 text-xs text-white font-bold">Cancel</button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="w-full bg-gray-800/70 rounded-lg h-2.5 relative mt-1.5 overflow-hidden">
                                <div className={`${barColor} h-2.5 rounded-lg transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                                <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-bold drop-shadow-md">{Math.floor(Math.max(0, Math.min(100, progress))) }%</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>
      </div>
    </div>
  );
}