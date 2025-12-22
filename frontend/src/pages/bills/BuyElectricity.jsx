// src/pages/bills/BuyElectricity.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";
import PINVerificationModal from "../../components/PIN/PINVerificationModal";
import { usePIN } from "../../hooks/usePIN";

const DISCOS = {
  ikeja: "Ikeja Electric (IKEDC)",
  abuja: "Abuja Electricity (AEDC)",
  ibadan: "Ibadan Electricity (IBEDC)",
  enugu: "Enugu Electricity (EEDC)",
  kaduna: "Kaduna Electric",
  kano: "Kano Electricity",
  jos: "Jos Electricity",
  portharcourt: "Port Harcourt (PHED)",
};

export default function BuyElectricity() {
  const [form, setForm] = useState({
    disco: "ikeja",
    meter_number: "",
    amount: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const navigate = useNavigate();

  // PIN verification states
  const [showPINModal, setShowPINModal] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const { pinStatus } = usePIN();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Check if user has PIN set up
    if (!pinStatus.hasPin) {
      toast.error("Please set up your transaction PIN first in Settings");
      return;
    }

    // Check if PIN is locked
    if (pinStatus.isLocked) {
      toast.error("Your PIN is locked. Please try again later or reset your PIN.");
      return;
    }

    // Store transaction details and show PIN modal
    setPendingTransaction({
      disco: form.disco,
      meter_number: form.meter_number,
      amount: Number(form.amount),
      phone: form.phone || undefined,
    });
    
    setShowPINModal(true);
  };

  const processPurchase = async () => {
    if (!pendingTransaction) return;

    setLoading(true);

    try {
      await client.post("/bills/electricity/", pendingTransaction);
      setReceiptData({ status: "success", type: "electricity", ...pendingTransaction });
      toast.success("Electricity paid!");
      setPendingTransaction(null);
    } catch (err) {
      setReceiptData({ status: "failed", type: "electricity", ...pendingTransaction });
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      <ToastContainer />
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-gray-900/5 pointer-events-none" />

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10">
        {loading && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
          </div>
        )}

        <div className="flex items-center gap-2 mb-5">
          <ArrowLeft className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-400">Pay Electricity Bill</h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-gray-800/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-gray-700/50 shadow-2xl"
        >
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">DISCO</label>
            <select
              name="disco"
              value={form.disco}
              onChange={handleChange}
              className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 appearance-none cursor-pointer hover:border-indigo-500/50"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: "right 0.75rem center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "12px",
              }}
            >
              {Object.entries(DISCOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Meter Number</label>
            <input
              name="meter_number"
              value={form.meter_number}
              onChange={handleChange}
              placeholder="12345678901"
              required
              className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Amount</label>
              <input
                name="amount"
                type="number"
                min="500"
                step="100"
                value={form.amount}
                onChange={handleChange}
                required
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Phone (optional)</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="080..."
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !form.amount || !form.meter_number}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Pay Bill"}
          </button>
        </form>

        <Receipt
          type="electricity"
          data={receiptData}
          onClose={() => {
            setReceiptData(null);
            navigate("/dashboard", { state: { transactionCompleted: true } });
          }}
        />

        {/* PIN Verification Modal */}
        <PINVerificationModal
          isOpen={showPINModal}
          onClose={() => {
            setShowPINModal(false);
            setPendingTransaction(null);
          }}
          onVerified={processPurchase}
          transactionDetails={pendingTransaction ? {
            type: "Electricity Payment",
            amount: pendingTransaction.amount,
            recipient: DISCOS[pendingTransaction.disco],
            description: `Meter: ${pendingTransaction.meter_number}`
          } : null}
        />
      </div>
    </div>
  );
}