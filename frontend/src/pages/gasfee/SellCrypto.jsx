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

  useEffect(() => {
    if (!form.amount_asset || !rate) {
      setCalculatedNaira(0);
      return;
    }
    setCalculatedNaira(Number(form.amount_asset) * Number(rate));
  }, [form.amount_asset, rate]);

  useEffect(() => { fetchAssets(); fetchExchanges(); fetchPendingOnLoad(); }, []);
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

  const handleChange = (e) => { const { name, value } = e.target; setForm(s => ({ ...s, [name]: value })); };
  const handleCopy = (text) => { navigator.clipboard.writeText(text).then(() => toast.success("Copied!", { autoClose: 1500 })); };

  const handleStartOrder = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const res = await client.post("/sell/", form);
      const { success, order: createdOrder, exchange_details, expires_in } = res.data;
      if (success && createdOrder) {
        setOrder(createdOrder); setBackendAmountNgn(createdOrder.amount_ngn);
        setExchangeInfo(exchange_details || createdOrder?.details?.exchange_contact);
        setTimer(expires_in || 1800); setStatus(createdOrder.status); setStep(2);
      }
    } catch {} finally { setSubmitting(false); }
  };

  const handleUploadProof = async (e) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    const formData = new FormData(); formData.append("proof", file);
    try {
      const res = await client.post(`/sell/${order.order_id}/upload-proof/`, formData);
      if (res.data.success) { setStatus("awaiting_admin"); setStep(3); }
    } catch {} finally { setSubmitting(false); }
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
      if (order?.order_id === id) { setOrder(null); setStep(1); }
      const res = await client.get("/sell/pending/"); setPendingOrders(res.data.orders || []);
      setConfirmCancelId(null); toast.success("Cancelled");
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/40 to-slate-950 text-white">
      <ToastContainer theme="dark" position="top-center" autoClose={2000} />

      <div className="px-4 pt-4 pb-6 max-w-xl mx-auto">
        {/* Compact Header */}
        <div className="flex justify-between items-center mb-5">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
            <ArrowLeft className="w-5 h-5" />
            Sell Crypto
          </h1>
          <button onClick={openPendingOrders} className="p-2.5 rounded-xl bg-white/10">
            <History className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Stepper */}
        <div className="flex items-center justify-center gap-3 mb-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold
                ${step > i ? "bg-emerald-500" : step === i ? "bg-indigo-500 shadow-lg shadow-indigo-500/50" : "bg-gray-700"}`}>
                {step > i ? <CheckCircle className="w-4 h-4" /> : i}
              </div>
              {i < 3 && <div className={`w-12 h-1 ${step > i ? "bg-emerald-500" : "bg-gray-700"}`} />}
            </div>
          ))}
        </div>

        {/* Ultra-Compact Card */}
        <div className="bg-gradient-to-b from-gray-900/95 to-black/70 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl">
          <div className="p-5 space-y-6">

            {/* STEP 1 - Fits in <500px */}
            {step === 1 && (
              <form onSubmit={handleStartOrder} className="space-y-4">

                <div>
                  <label className="text-xs text-gray-400">Send From</label>
                  <select name="source" value={form.source} onChange={handleChange} required
                    className="mt-1 w-full px-4 py-3 bg-white/10 border border-white/10 rounded-2xl focus:border-indigo-500 text-base">
                    <option value="">Select</option>
                    {exchanges.map((ex, i) => {
                      const val = typeof ex === "string" ? ex : ex.exchange || ex.name;
                      const label = typeof ex === "string" ? ex : ex.name || ex.exchange;
                      return <option key={i} value={val}>{label}</option>;
                    })}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400">Asset</label>
                  <select name="asset" value={form.asset} onChange={handleChange} required
                    className="mt-1 w-full px-4 py-3 bg-white/10 border border-white/10 rounded-2xl focus:border-indigo-500 text-base">
                    <option value="">Choose</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.symbol.toLowerCase()}>
                        {a.symbol.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                

                <div>
                  <label className="text-xs text-gray-400">Amount</label>
                  <input type="number" name="amount_asset" value={form.amount_asset} onChange={handleChange} required placeholder="0.00"
                    className="mt-1 w-full px-4 py-3 bg-white/10 border border-white/10 rounded-2xl text-right text-2xl font-bold" />
                </div>

                {form.amount_asset && rate && (
                  <div className="p-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-2xl text-center border border-indigo-500/30">
                    <p className="text-xs text-gray-400">You receive</p>
                    <p className="text-3xl font-bold text-white">{formatFiat(calculatedNaira)}</p>
                  </div>
                )}

                <button type="submit" disabled={submitting || !form.asset || !form.source || !form.amount_asset}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-lg disabled:opacity-50">
                  {submitting ? <Loader2 className="w-7 h-7 mx-auto animate-spin" /> : "Continue"}
                </button>
              </form>
            )}

            {/* STEP 2 - Minimal scrolling */}
            {step === 2 && order && (
              <div className="space-y-5">
                <div className="flex justify-between items-center p-3 bg-amber-500/20 rounded-2xl border border-amber-500/40">
                  <span className="text-sm font-bold flex items-center gap-2">
                    <Timer className="w-5 h-5" /> Time Left
                  </span>
                  <span className="font-mono text-2xl font-bold text-amber-300">
                    {`${Math.floor(timer / 60)}`.padStart(2, "0")}:{`${timer % 60}`.padStart(2, "0")}
                  </span>
                </div>

                <div className="text-center py-5 bg-gradient-to-br from-emerald-600/20 to-teal-600/20 rounded-2xl border border-emerald-500/40">
                  <p className="text-sm text-gray-300">You receive</p>
                  <p className="text-4xl font-bold text-white mt-1">{formatFiat(backendAmountNgn)}</p>
                </div>

                <div className="p-4 bg-white/10 rounded-2xl border border-white/20">
  <p className="text-xs text-gray-400 mb-2">Send to</p>

  <div className="flex flex-col gap-3">

    {/* EMAIL */}
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between w-full">
          <p className="text-gray-400 text-xs">Email:</p>
          <p className="font-mono text-sm break-all text-indigo-300 text-right ml-2">
            {safeString(exchangeInfo.email || order.source.email)}
          </p>
        </div>
      </div>

      <button
        onClick={() =>
          handleCopy(safeString(exchangeInfo.email || order.source.email))
        }
        className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition flex-shrink-0"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>

    {/* UID */}
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between w-full">
          <p className="text-gray-400 text-xs">UID:</p>
          <p className="font-mono text-sm break-all text-indigo-300 text-right ml-2">
            {safeString(exchangeInfo.uid || order.source.uid)}
          </p>
        </div>
      </div>

      <button
        onClick={() =>
          handleCopy(safeString(exchangeInfo.uid || order.source.uid))
        }
        className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition flex-shrink-0"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>

  </div>
</div>


                <label className="block">
                  <span className="text-sm font-medium mb-2 block">Upload Proof</span>
                  <label className="flex items-center justify-center h-20 border-2 border-dashed border-white/30 rounded-2xl cursor-pointer hover:border-indigo-500/70">
                    {file ? (
                      <span className="text-indigo-400 font-medium text-sm">{file.name}</span>
                    ) : (
                      <Upload className="w-10 h-10 text-gray-500" />
                    )}
                    <input type="file" className="hidden" onChange={e => setFile(e.target.files[0])} accept="image/*" />
                  </label>
                </label>

                <div className="flex gap-3">
                  <button onClick={handleUploadProof} disabled={submitting || !file}
                    className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold disabled:opacity-50">
                    {submitting ? <Loader2 className="w-7 h-7 mx-auto animate-spin" /> : "Submit"}
                  </button>
                  <button onClick={() => setConfirmCancelId(order.order_id)}
                    className="px-5 py-4 rounded-2xl bg-red-600/20 border border-red-500/50 text-red-400 font-bold">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 - Super compact */}
            {step === 3 && order && (
              <div className="text-center py-10">
                {status === "completed" ? (
                  <>
                    <CheckCircle className="w-20 h-20 mx-auto text-emerald-400 mb-4" />
                    <h2 className="text-2xl font-bold text-emerald-400 mb-3">Success!</h2>
                    <p className="text-4xl font-bold">{formatFiat(backendAmountNgn)}</p>
                  </>
                ) : status === "failed" ? (
                  <>
                    <AlertCircle className="w-20 h-20 mx-auto text-red-500 mb-4" />
                    <h2 className="text-2xl font-bold text-red-400">Failed</h2>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-16 h-16 mx-auto animate-spin text-indigo-400 mb-4" />
                    <h2 className="text-2xl font-bold">Processing...</h2>
                  </>
                )}
                <button onClick={() => { setStep(1); setOrder(null); setForm({ asset: "usdt", source: "", amount_asset: "" }); setFile(null); }}
                  className="mt-8 w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-lg">
                  New Order
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compact Bottom Sheets */}
      <Transition show={showPendingModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowPendingModal(false)}>
          <Transition.Child enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100">
            <div className="fixed inset-0 bg-black/80" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-end">
            <Transition.Child enter="ease-out duration-300" enterFrom="translate-y-full" enterTo="translate-y-0">
              <Dialog.Panel className="w-full bg-gray-900 rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto">
                <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
                <h3 className="text-xl font-bold text-center mb-4">Pending Orders</h3>
                {pendingOrders.map(o => (
                  <div key={o.order_id} className="mb-3 p-4 bg-white/10 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="font-bold text-indigo-300">{getAssetSymbol(o.asset)} → {formatFiat(o.amount_ngn)}</p>
                    </div>
                    <button onClick={() => handleResumeOrder(o)} className="px-5 py-2 bg-indigo-600 rounded-xl text-sm font-bold">
                      Resume
                    </button>
                  </div>
                ))}
                <button onClick={() => setShowPendingModal(false)} className="w-full mt-4 py-3 bg-white/10 rounded-2xl font-bold">
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
          <div className="fixed inset-0 flex items-end">
            <Transition.Child enter="ease-out duration-300" enterFrom="translate-y-full" enterTo="translate-y-0">
              <Dialog.Panel className="w-full bg-gray-900 rounded-t-3xl p-6">
                <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                <h3 className="text-xl font-bold text-center mb-6">Cancel Order?</h3>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmCancelId(null)} className="flex-1 py-4 bg-white/10 rounded-2xl font-bold">Keep</button>
                  <button onClick={() => handleCancelOrder(confirmCancelId)} className="flex-1 py-4 bg-red-600 rounded-2xl font-bold">Cancel</button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}