// src/pages/sell/SellCrypto.jsx
import { useEffect, useState, Fragment } from "react";
import client from "../../api/client";
import {
  CheckCircle,
  Loader2,
  History,
  Copy,
  ArrowLeft,
  Upload,
  Timer,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Dialog, Transition } from "@headlessui/react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function SellCrypto() {
  const [step, setStep] = useState(1);
  const [exchanges, setExchanges] = useState([]);
  const [exchangeInfo, setExchangeInfo] = useState(null);
  const [timer, setTimer] = useState(0);
  const [rate, setRate] = useState(null);
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState({ asset: "usdt", source: "", amount_asset: "" });
  const [errors, setErrors] = useState({});
  const [order, setOrder] = useState(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [backendAmountNgn, setBackendAmountNgn] = useState(null);
  const [calculatedNaira, setCalculatedNaira] = useState(0);

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  // Safe String Helper
  const safeString = (value) => {
    if (!value) return "—";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      return (
        value.address ||
        value.wallet ||
        value.email ||
        value.uid ||
        value.contact ||
        value.name ||
        Object.values(value).join(" • ")
      ).trim() || "Invalid contact";
    }
    return String(value);
  };

  const getAssetSymbol = (asset) => (asset ? String(asset).toUpperCase() : "—");
  const formatCrypto = (val) => (val == null ? "—" : Number(val).toLocaleString(undefined, { maximumFractionDigits: 6 }));
  const formatFiat = (val) => (val == null ? "—" : `₦${Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

  // Live Naira Preview
  useEffect(() => {
    if (!form.amount_asset || !rate) {
      setCalculatedNaira(0);
      return;
    }
    setCalculatedNaira(Number(form.amount_asset) * Number(rate));
  }, [form.amount_asset, rate]);

  // Load initial data
  useEffect(() => {
    fetchAssets();
    fetchExchanges();
    fetchPendingOnLoad();
  }, []);

  useEffect(() => { if (form.asset) fetchRate(); }, [form.asset]);
  useEffect(() => { if (step === 2 && timer > 0) { const id = setInterval(() => setTimer(t => t - 1), 1000); return () => clearInterval(id); } }, [step, timer]);
  useEffect(() => { if (step === 3 && order) pollStatus(); }, [step, order]);

  const pollStatus = () => {
    const id = setInterval(async () => {
      try {
        const res = await client.get(`/sell/${order.order_id}/`);
        const newStatus = res.data.order?.status;
        setStatus(newStatus);
        if (["completed", "failed", "expired", "cancelled"].includes(newStatus)) clearInterval(id);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  };

  const fetchAssets = async () => { try { const res = await fetch(`${import.meta.env.VITE_API_URL}/sell/assets/`); const data = await res.json(); setAssets(data.assets || []); } catch {} };
  const fetchExchanges = async () => { try { const res = await client.get("/sell/exchanges/"); setExchanges(res.data.exchanges || []); } catch {} };
  const fetchRate = async () => { try { const res = await client.get(`sell/rate/${form.asset}/`); setRate(res.data.rate_ngn); } catch {} };
  const fetchPendingOnLoad = async () => {
    try {
      const res = await client.get("/sell/pending/");
      if (res.data.orders?.length > 0) {
        const last = res.data.orders[0];
        setOrder(last); setBackendAmountNgn(last.amount_ngn); setExchangeInfo(last.details?.exchange_contact);
        setStep(["pending", "pending_payment"].includes(last.status) ? 2 : 3);
        setStatus(last.status); setTimer(last.expires_in || 1800);
      }
    } catch {}
  };

  const handleChange = (e) => { const { name, value } = e.target; setForm(s => ({ ...s, [name]: value })); setErrors(e => ({ ...e, [name]: null })); };
  const handleCopy = (text) => { navigator.clipboard.writeText(text).then(() => toast.success("Copied!")); };

  const handleStartOrder = async (e) => {
    e.preventDefault(); setSubmitting(true); setErrors({});
    try {
      const res = await client.post("/sell/", form);
      const { success, order: createdOrder, exchange_details, expires_in } = res.data;
      if (success && createdOrder) {
        setOrder(createdOrder); setBackendAmountNgn(createdOrder.amount_ngn);
        setExchangeInfo(exchange_details || createdOrder?.details?.exchange_contact);
        setTimer(expires_in || 1800); setStatus(createdOrder.status); setStep(2);
      }
    } catch (err) { setErrors(err.response?.data || { general: "Failed" }); }
    finally { setSubmitting(false); }
  };

  const handleUploadProof = async (e) => {
    e.preventDefault();
    if (!file) return setErrors({ payment_proof: "Upload proof" });
    setSubmitting(true);
    const formData = new FormData(); formData.append("proof", file);
    try {
      const res = await client.post(`/sell/${order.order_id}/upload-proof/`, formData);
      if (res.data.success) { setStatus("awaiting_admin"); setStep(3); }
    } catch { setErrors({ general: "Upload failed" }); }
    finally { setSubmitting(false); }
  };

  const openPendingOrders = async () => {
    setLoadingPending(true); setShowPendingModal(true);
    try { const res = await client.get("/sell/pending/"); setPendingOrders(res.data.orders || []); }
    finally { setLoadingPending(false); }
  };

  const handleResumeOrder = (o) => {
    setOrder(o); setBackendAmountNgn(o.amount_ngn); setExchangeInfo(o.details?.exchange_contact);
    setStep(["pending", "pending_payment"].includes(o.status) ? 2 : 3);
    setStatus(o.status); setTimer(o.expires_in || 1800); setShowPendingModal(false);
  };

  const handleCancelOrder = async (id) => {
    try {
      await client.delete(`/sell/${id}/cancel/`);
      if (order?.order_id === id) { setOrder(null); setStep(1); setStatus("cancelled"); }
      const res = await client.get("/sell/pending/"); setPendingOrders(res.data.orders || []);
      setConfirmCancelId(null); toast.success("Cancelled");
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="min-h-screen  text-white pb-24">
      <ToastContainer theme="dark" position="top-center" />

      {/* Mobile-First Layout */}
      <div className="px-4 pt-6 pb-10 max-w-xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
            <ArrowLeft className="w-6 h-6" />
            Sell Crypto
          </h1>
          <button onClick={openPendingOrders} className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <History className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Step Indicator */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${step > i ? "bg-emerald-500 text-white" : step === i ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/50" : "bg-gray-700 text-gray-400"}`}>
                {step > i ? <CheckCircle className="w-5 h-5" /> : i}
              </div>
              {i < 3 && <div className={`w-16 h-1 ${step > i ? "bg-emerald-500" : "bg-gray-700"}`} />}
            </div>
          ))}
        </div>

        {/* Main Card */}
        <div className="bg-gradient-to-b from-gray-900/90 to-black/60 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
          <div className="p-6 space-y-8">

            {/* STEP 1 */}
            {step === 1 && (
              <form onSubmit={handleStartOrder} className="space-y-6">
                <div>
                  <label className="text-sm text-gray-300">Asset</label>
                  <select name="asset" value={form.asset} onChange={handleChange} required
                    className="mt-2 w-full px-5 py-4 bg-white/10 border border-white/10 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/30 transition-all text-lg">
                    <option value="">Choose crypto</option>
                    {assets.map(a => <option key={a.id} value={a.symbol.toLowerCase()}>{a.symbol.toUpperCase()} — {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-300">Send From</label>
                  <select name="source" value={form.source} onChange={handleChange} required
                    className="mt-2 w-full px-5 py-4 bg-white/10 border border-white/10 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/30 transition-all text-lg">
                    <option value="">Select wallet/exchange</option>
                    {exchanges.map((ex, i) => {
                      const val = typeof ex === "string" ? ex : ex.exchange || ex.name;
                      const label = typeof ex === "string" ? ex : ex.name || ex.exchange;
                      return <option key={i} value={val}>{label}</option>;
                    })}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-300">Amount</label>
                  <input type="number" name="amount_asset" value={form.amount_asset} onChange={handleChange} required placeholder="0.00"
                    className="mt-2 w-full px-5 py-4 bg-white/10 border border-white/10 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/30 text-right text-3xl font-bold" />
                </div>

                {form.amount_asset && rate && (
                  <div className="p-6 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl text-center">
                    <p className="text-gray-300 text-sm">You receive</p>
                    <p className="text-4xl font-extrabold mt-2">{formatFiat(calculatedNaira)}</p>
                    <p className="text-sm text-gray-400 mt-2">Rate: 1 {form.asset.toUpperCase()} = {formatFiat(rate)}</p>
                  </div>
                )}

                <button type="submit" disabled={submitting || !form.asset || !form.source || !form.amount_asset}
                  className="w-full py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-xl shadow-lg disabled:opacity-50">
                  {submitting ? <Loader2 className="w-8 h-8 mx-auto animate-spin" /> : "Continue"}
                </button>
              </form>
            )}

            {/* STEP 2 */}
            {step === 2 && order && (
              <div className="space-y-8">
                <div className="flex items-center justify-between p-5 bg-amber-500/20 border border-amber-500/50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <Timer className="w-7 h-7 text-amber-400" />
                    <span className="font-bold">Time Left</span>
                  </div>
                  <span className="font-mono text-3xl font-bold text-amber-300">
                    {`${Math.floor(timer / 60)}`.padStart(2, "0")}:{`${timer % 60}`.padStart(2, "0")}
                  </span>
                </div>

                <div className="text-center p-8 bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/40 rounded-2xl">
                  <p className="text-gray-300 text-lg">You will receive</p>
                  <p className="text-5xl font-extrabold mt-3">{formatFiat(backendAmountNgn)}</p>
                  <p className="text-lg mt-4 text-gray-300">
                    Send {formatCrypto(order.amount_asset)} {getAssetSymbol(order.asset)}
                  </p>
                </div>

                <div className="p-6 bg-white/10 rounded-2xl border border-white/20">
                  <p className="text-sm text-gray-400 mb-3">Send to this address</p>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-mono text-lg break-all text-indigo-300">{safeString(exchangeInfo || order.source)}</p>
                    <button onClick={() => handleCopy(safeString(exchangeInfo || order.source))}
                      className="p-4 bg-white/20 rounded-xl flex-shrink-0">
                      <Copy className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-lg font-medium mb-4">Upload Proof</label>
                  <label className="block border-2 border-dashed border-white/30 rounded-2xl p-10 text-center cursor-pointer hover:border-indigo-500/70 transition-all">
                    {file ? (
                      <div className="text-indigo-400">
                        <Upload className="w-12 h-12 mx-auto mb-3" />
                        <p className="font-medium">{file.name}</p>
                      </div>
                    ) : (
                      <div className="text-gray-400">
                        <Upload className="w-16 h-16 mx-auto mb-4" />
                        <p>Tap to upload screenshot</p>
                      </div>
                    )}
                    <input type="file" className="hidden" onChange={e => setFile(e.target.files[0])} accept="image/*" />
                  </label>
                </div>

                <div className="flex gap-4">
                  <button onClick={handleUploadProof} disabled={submitting || !file}
                    className="flex-1 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-xl disabled:opacity-50">
                    {submitting ? <Loader2 className="w-8 h-8 mx-auto animate-spin" /> : "Submit Proof"}
                  </button>
                  <button onClick={() => setConfirmCancelId(order.order_id)}
                    className="px-6 py-5 rounded-2xl bg-red-600/20 border border-red-500/50 text-red-400 font-bold">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && order && (
              <div className="text-center py-12">
                {status === "completed" ? (
                  <>
                    <CheckCircle className="w-24 h-24 mx-auto text-emerald-400 mb-6" />
                    <h2 className="text-3xl font-bold text-emerald-400 mb-6">Success!</h2>
                    <p className="text-5xl font-extrabold mb-8">{formatFiat(backendAmountNgn)}</p>
                  </>
                ) : status === "failed" ? (
                  <>
                    <AlertCircle className="w-24 h-24 mx-auto text-red-500 mb-6" />
                    <h2 className="text-3xl font-bold text-red-400">Failed</h2>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-20 h-20 mx-auto animate-spin text-indigo-400 mb-8" />
                    <h2 className="text-3xl font-bold">Processing...</h2>
                  </>
                )}
                <button onClick={() => { setStep(1); setOrder(null); setForm({ asset: "usdt", source: "", amount_asset: "" }); setFile(null); }}
                  className="mt-8 w-full py-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-xl">
                  New Order
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals - Mobile Optimized */}
      <Transition show={showPendingModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowPendingModal(false)}>
          <Transition.Child enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100">
            <div className="fixed inset-0 bg-black/80" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-end justify-center">
            <Transition.Child enter="ease-out duration-300" enterFrom="translate-y-full" enterTo="translate-y-0">
              <Dialog.Panel className="w-full bg-gray-900 rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto">
                <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-6" />
                <h3 className="text-2xl font-bold text-indigo-400 mb-6">Pending Orders</h3>
                {pendingOrders.map(o => (
                  <div key={o.order_id} className="mb-4 p-5 bg-white/10 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="font-bold text-indigo-300">{getAssetSymbol(o.asset)} → {formatFiat(o.amount_ngn)}</p>
                      <p className="text-sm text-gray-400">{o.status.replace("_", " ")}</p>
                    </div>
                    <button onClick={() => handleResumeOrder(o)} className="px-6 py-3 bg-indigo-600 rounded-xl font-bold">
                      Resume
                    </button>
                  </div>
                ))}
                <button onClick={() => setShowPendingModal(false)} className="w-full py-4 mt-6 bg-white/10 rounded-2xl font-bold">
                  Close
                </button>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      <Transition show={!!confirmCancelId} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setConfirmCancelId(null)}>
          <Transition.Child enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100">
            <div className="fixed inset-0 bg-black/80" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-end justify-center">
            <Transition.Child enter="ease-out duration-300" enterFrom="translate-y-full" enterTo="translate-y-0">
              <Dialog.Panel className="w-full bg-gray-900 rounded-t-3xl p-8">
                <AlertCircle className="w-20 h-20 mx-auto text-red-500 mb-6" />
                <h3 className="text-2xl font-bold text-center mb-4">Cancel Order?</h3>
                <div className="flex gap-4">
                  <button onClick={() => setConfirmCancelId(null)} className="flex-1 py-5 bg-white/20 rounded-2xl font-bold">Keep</button>
                  <button onClick={() => handleCancelOrder(confirmCancelId)} className="flex-1 py-5 bg-red-600 rounded-2xl font-bold">Cancel</button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}