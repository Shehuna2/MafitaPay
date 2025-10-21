import { useEffect, useState } from "react";
import client from "../../api/client";
import { CheckCircle, Loader2, History, Copy } from "lucide-react";
import { Dialog } from "@headlessui/react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function SellCrypto() {
  const [step, setStep] = useState(1);
  const [exchanges, setExchanges] = useState([]);
  const [exchangeInfo, setExchangeInfo] = useState(null);
  const [rate, setRate] = useState(null);
  const [form, setForm] = useState({ asset: "usdt", source: "", amount_asset: "" });
  const [errors, setErrors] = useState({});
  const [order, setOrder] = useState(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  // Pending orders modal
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [tick, setTick] = useState(0);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  // Load exchanges
  useEffect(() => {
    async function fetchExchanges() {
      try {
        const res = await client.get("/sell/exchanges/");
        setExchanges(res.data.exchanges || []);
      } catch (err) {
        console.error("❌ Failed to fetch exchanges:", err);
      }
    }
    fetchExchanges();
  }, []);

  // Fetch live rate
  useEffect(() => {
    async function fetchRate() {
      if (!form.asset) return;
      try {
        const res = await client.get(`/rate/${form.asset}/`);
        setRate(res.data.rate_ngn);
      } catch {
        setRate(null);
      }
    }
    fetchRate();
  }, [form.asset]);

  // Fetch ExchangeInfo when entering Step 2
  useEffect(() => {
    if (step === 2 && order && order.source) {
      async function fetchExchangeInfo() {
        try {
          const res = await client.get(`/sell/exchanges/?exchange=${order.source}`);
          const info = res.data.exchanges?.find((ex) => ex.exchange === order.source) || null;
          setExchangeInfo(info);
        } catch (err) {
          console.error("❌ Failed to fetch exchange info:", err);
          setExchangeInfo(null);
        }
      }
      fetchExchangeInfo();
    }
  }, [step, order]);

  // Poll order status
  useEffect(() => {
    let interval;
    if (step === 3 && order) {
      interval = setInterval(async () => {
        try {
          const res = await client.get(`/sell/${order.order_id}/`);
          setStatus(res.data.order.status);
          if (["completed", "failed", "expired", "cancelled"].includes(res.data.order.status)) {
            clearInterval(interval);
          }
        } catch {}
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [step, order]);

  // Auto-resume last pending order
  useEffect(() => {
    async function fetchPending() {
      try {
        const res = await client.get("/sell/pending/");
        if (res.data.orders?.length > 0) {
          const lastOrder = res.data.orders[0];
          setOrder(lastOrder);
          setStep(lastOrder.status === "pending_payment" ? 2 : 3);
          setStatus(lastOrder.status);
        }
      } catch {}
    }
    fetchPending();
  }, []);

  // Live ticking
  useEffect(() => {
    let interval;
    if (step === 2 && order && status !== "cancelled") {
      interval = setInterval(() => setTick((t) => t + 1), 1000);
    }
    if (step === 3 && order && status !== "cancelled") {
      interval = setInterval(() => setTick((t) => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, order, status]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: null });
  };

  const handleStartOrder = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const res = await client.post("/sell/", form);
      if (res.data.success) {
        setOrder(res.data.order);
        setStep(2);
      }
    } catch (err) {
      setErrors(err.response?.data || { general: ["Failed to start order"] });
    } finally {
      setSubmitting(false);
    }
  };

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
      if (res.data.success) setStep(3);
    } catch (err) {
      setErrors(err.response?.data || { general: ["Failed to upload proof"] });
    } finally {
      setSubmitting(false);
    }
  };

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
    setStep(o.status === "pending_payment" ? 2 : 3);
    setShowPendingModal(false);
  };

  const handleCancelOrder = async (orderId) => {
    try {
      await client.delete(`/sell/${orderId}/cancel/`);
      if (order?.order_id === orderId) {
        const res = await client.get(`/sell/${orderId}/`);
        setOrder(res.data.order);
        setStatus(res.data.order.status);
      }
      const res = await client.get("/sell/pending/");
      setPendingOrders(res.data.orders || []);
      setConfirmCancelId(null);
    } catch {
      console.error("❌ Failed to cancel order");
      toast.error("Failed to cancel order");
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied to clipboard!", {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }).catch((err) => {
      console.error("Failed to copy:", err);
      toast.error("Failed to copy to clipboard");
    });
  };

  const getTimeLeft = (createdAt) => {
    const expiry = new Date(createdAt).getTime() + 30 * 60 * 1000;
    const now = Date.now();
    const diff = Math.max(0, expiry - now);
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return status === "cancelled" ? { mins: 0, secs: 0, diff: 0 } : { mins, secs, diff };
  };

  const getProgress = (createdAt) => {
    const expiry = new Date(createdAt).getTime() + 30 * 60 * 1000;
    const now = Date.now();
    const diff = Math.max(0, expiry - now);
    return status === "cancelled" ? 100 : 100 - (diff / (30 * 60 * 1000)) * 100;
  };

  const formatCrypto = (val) => Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const formatFiat = (val) => Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen text-white"> {/* Removed pt-16 */}
      <ToastContainer />
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-gray-900 rounded-2xl shadow-xl p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />
          <div className="relative z-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <img src="/crypto-icon.svg" alt="Crypto" className="w-6 h-6" /> {/* Placeholder for crypto icon */}
                Sell Crypto
              </h1>
              <button
                onClick={openPendingOrders}
                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition"
              >
                <History className="w-4 h-4" /> History
              </button>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-between mb-8">
              {["Asset & Amount", "Send Asset", "Done"].map((label, idx) => {
                const current = idx + 1;
                const active = step === current;
                const completed = step > current;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center">
                    <div
                      className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${
                        completed
                          ? "bg-green-600 border-green-600"
                          : active
                          ? "bg-indigo-600 border-indigo-600"
                          : "bg-gray-800 border-gray-700"
                      } text-white font-semibold transition`}
                    >
                      {completed ? <CheckCircle className="w-5 h-5" /> : current}
                    </div>
                    <p className={`mt-2 text-sm ${active ? "text-indigo-400" : completed ? "text-green-400" : "text-gray-400"}`}>{label}</p>
                  </div>
                );
              })}
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <form
                onSubmit={handleStartOrder}
                className="space-y-6"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Asset</label>
                  <select
                    name="asset"
                    value={form.asset}
                    onChange={handleChange}
                    className="w-full bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="usdt">USDT</option>
                    <option value="sidra">SIDRA</option>
                    <option value="pi">PI</option>
                    <option value="bnb">BNB</option>
                  </select>
                  {errors.asset && <p className="text-red-400 text-xs mt-1">{errors.asset}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Send From</label>
                  <select
                    name="source"
                    value={form.source}
                    onChange={handleChange}
                    required
                    className="w-full bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Exchange</option>
                    {exchanges.map((ex) => (
                      <option key={ex.id} value={ex.exchange}>
                        {ex.exchange}
                      </option>
                    ))}
                  </select>
                  {errors.source && <p className="text-red-400 text-xs mt-1">{errors.source}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Amount</label>
                  <input
                    type="number"
                    name="amount_asset"
                    value={form.amount_asset}
                    onChange={handleChange}
                    className="w-full bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter amount"
                    required
                    min="0"
                    step="any"
                  />
                  {errors.amount_asset && <p className="text-red-400 text-xs mt-1">{errors.amount_asset}</p>}
                </div>

                {form.amount_asset && rate && (
                  <div className="bg-gray-800/70 p-4 rounded-xl text-sm text-gray-300">
                    <p>
                      You will receive:{" "}
                      <span className="text-green-400 font-semibold">
                        ₦{formatFiat(Number(form.amount_asset) * Number(rate))}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Rate: 1 {form.asset.toUpperCase()} = ₦{formatFiat(rate)}
                    </p>
                  </div>
                )}

                {errors.general && (
                  <p className="text-red-400 text-xs mt-1">{Array.isArray(errors.general) ? errors.general[0] : errors.general}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-indigo-600 py-3 rounded-lg hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-75"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Continue"}
                </button>
              </form>
            )}

            {/* STEP 2 */}
            {step === 2 && order && (
              <form
                onSubmit={handleUploadProof}
                className="space-y-6"
              >
                {/* Timer */}
                <div className="flex items-center justify-between bg-gray-800/70 p-4 rounded-xl">
                  <p className="text-gray-300 text-sm font-medium flex items-center gap-2">
                    ⏳ Time Remaining
                  </p>
                  <span className="bg-yellow-400 text-black text-xs font-semibold px-3 py-1 rounded-full">
                    {(() => {
                      const t = getTimeLeft(order.created_at);
                      return status === "cancelled" ? "0m 0s" : `${t.mins}m ${t.secs}s`;
                    })()}
                  </span>
                </div>

                {/* Amounts */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-gray-800/70 p-4 rounded-xl text-center">
                    <p className="text-sm text-gray-400">You Send</p>
                    <p className="text-lg font-semibold text-yellow-400">
                      {formatCrypto(order.amount_asset)} {order.asset.toUpperCase()}
                    </p>
                  </div>
                  <div className="bg-gray-800/70 p-4 rounded-xl text-center">
                    <p className="text-sm text-gray-400">You Will Receive</p>
                    <p className="text-lg font-semibold text-green-400">
                      ₦{formatFiat(order.amount_ngn)}
                    </p>
                  </div>
                </div>

                {/* Receiving Details */}
                <div className="bg-gray-800/70 p-4 rounded-xl space-y-3">
                  <p className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <img src="/wallet-icon.svg" alt="Wallet" className="w-5 h-5" /> {/* Placeholder icon */}
                    Receiving Details
                  </p>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">UID</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{exchangeInfo?.contact_info?.id || "—"}</span>
                      <button
                        onClick={() => handleCopy(exchangeInfo?.contact_info?.id || "")}
                        className="text-indigo-400 hover:text-indigo-300 transition p-1 rounded-full hover:bg-gray-700"
                        title="Copy UID"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Email</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium break-all">{exchangeInfo?.contact_info?.email || "—"}</span>
                      <button
                        onClick={() => handleCopy(exchangeInfo?.contact_info?.email || "")}
                        className="text-indigo-400 hover:text-indigo-300 transition p-1 rounded-full hover:bg-gray-700"
                        title="Copy Email"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Upload Proof */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Upload Proof of Payment
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="w-full bg-gray-800/70 border border-gray-700 p-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {errors.payment_proof && (
                    <p className="text-red-400 text-xs mt-1">{Array.isArray(errors.payment_proof) ? errors.payment_proof[0] : errors.payment_proof}</p>
                  )}
                </div>

                {errors.general && (
                  <p className="text-red-400 text-xs mt-1">{Array.isArray(errors.general) ? errors.general[0] : errors.general}</p>
                )}

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setOrder(null);
                    }}
                    className="flex-1 bg-gray-700 py-3 rounded-lg hover:bg-gray-600 text-white font-semibold transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-green-600 py-3 rounded-lg hover:bg-green-700 text-white font-semibold transition disabled:opacity-75"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      "I have sent the asset"
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3 */}
            {step === 3 && order && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white text-center flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-indigo-400" />
                  Order Submitted
                </h2>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-gray-800/70 p-4 rounded-xl text-center">
                    <p className="text-sm text-gray-400">You Sent</p>
                    <p className="text-lg font-semibold text-yellow-400">
                      {formatCrypto(order.amount_asset)} {order.asset.toUpperCase()}
                    </p>
                  </div>
                  <div className="bg-gray-800/70 p-4 rounded-xl text-center">
                    <p className="text-sm text-gray-400">You Will Receive</p>
                    <p className="text-lg font-semibold text-green-400">
                      ₦{formatFiat(order.amount_ngn)}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-800/70 p-4 rounded-xl text-center">
                  <p className="text-sm text-gray-400">From</p>
                  <p className="text-lg font-semibold text-indigo-400">{order.source}</p>
                </div>

                {/* Progress + countdown */}
                <div className="w-full bg-gray-800 rounded-lg h-4 relative">
                  <div
                    className={`h-4 rounded-lg ${
                      status === "cancelled"
                        ? "bg-gray-600"
                        : getProgress(order.created_at) < 70
                        ? "bg-green-600"
                        : getProgress(order.created_at) < 90
                        ? "bg-yellow-500"
                        : "bg-red-600"
                    } transition-all duration-500`}
                    style={{ width: `${getProgress(order.created_at)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-semibold">
                    {Math.floor(getProgress(order.created_at))}%
                  </span>
                </div>

                <div className="text-sm text-gray-400 text-center">
                  Time left:{" "}
                  {status === "cancelled" ? "0:00" : (() => {
                    const t = getTimeLeft(order.created_at);
                    return `${t.mins}:${String(t.secs).padStart(2, "0")}`;
                  })()}
                </div>

                <p
                  className={`text-lg font-semibold text-center ${
                    status === "completed"
                      ? "text-green-400"
                      : status === "failed"
                      ? "text-red-400"
                      : status === "cancelled"
                      ? "text-gray-400"
                      : "text-yellow-400"
                  }`}
                >
                  Status: {status || "pending"}
                </p>

                <div className="flex gap-3 justify-center">
                  {status !== "completed" && status !== "cancelled" && (
                    confirmCancelId === order.order_id ? (
                      <>
                        <button
                          onClick={() => handleCancelOrder(order.order_id)}
                          className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 text-white font-semibold transition"
                        >
                          Confirm Cancel
                        </button>
                        <button
                          onClick={() => setConfirmCancelId(null)}
                          className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 text-white font-semibold transition"
                        >
                          Undo
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmCancelId(order.order_id)}
                        className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 text-white font-semibold transition"
                      >
                        Cancel Order
                      </button>
                    )
                  )}

                  <button
                    disabled={status !== "completed" && status !== "failed" && status !== "cancelled"}
                    onClick={() => {
                      setForm({ asset: "usdt", source: "", amount_asset: "" });
                      setOrder(null);
                      setStatus(null);
                      setStep(1);
                    }}
                    className={`px-4 py-2 rounded-lg ${
                      status === "completed" || status === "failed" || status === "cancelled"
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition"
                        : "bg-gray-700 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    New Sell Order
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pending Orders Modal */}
        <Dialog open={showPendingModal} onClose={() => setShowPendingModal(false)} className="relative z-50">
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
            <Dialog.Panel className="bg-gray-900 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-xl relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />
              <div className="relative z-10">
                <button
                  onClick={() => setShowPendingModal(false)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-white transition"
                >
                  ✕
                </button>
                <Dialog.Title className="text-xl font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-400" />
                  Incomplete Orders
                </Dialog.Title>

                {loadingPending ? (
                  <p className="text-gray-400 text-sm text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading...
                  </p>
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
                        <li key={o.order_id} className="py-4 space-y-2">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="text-sm font-semibold text-yellow-400">
                                {formatCrypto(o.amount_asset)} {o.asset.toUpperCase()}
                              </div>
                              <div className="text-xs text-indigo-400">From: {o.source}</div>
                              <div className="text-xs text-gray-400">
                                Time left: {mins}:{secs.toString().padStart(2, "0")}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {isConfirming ? (
                                <>
                                  <button
                                    onClick={() => handleCancelOrder(o.order_id)}
                                    className="px-3 py-1 bg-red-600 rounded-lg hover:bg-red-700 text-sm text-white font-semibold transition"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmCancelId(null)}
                                    className="px-3 py-1 bg-gray-700 rounded-lg hover:bg-gray-600 text-sm text-white font-semibold transition"
                                  >
                                    Undo
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleResumeOrder(o)}
                                    className="px-3 py-1 bg-indigo-600 rounded-lg hover:bg-indigo-700 text-sm text-white font-semibold transition"
                                  >
                                    Resume
                                  </button>
                                  <button
                                    onClick={() => setConfirmCancelId(o.order_id)}
                                    className="px-3 py-1 bg-red-600 rounded-lg hover:bg-red-700 text-sm text-white font-semibold transition"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="w-full bg-gray-800 rounded-lg h-3 relative mt-2">
                            <div
                              className={`${barColor} h-3 rounded-lg transition-all duration-500`}
                              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-semibold">
                              {Math.floor(Math.max(0, Math.min(100, progress)))}%
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      </div>
    </div>
  );
}