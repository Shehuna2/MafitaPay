// src/pages/BuyAirtime.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";

export default function BuyAirtime() {
  const [form, setForm] = useState({
    phone: "",
    network: "mtn",
    amount: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const navigate = useNavigate();

  const resetForm = () => {
    setForm({
      phone: "",
      network: "mtn",
      amount: "",
    });
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleQuickPick = (amount) => {
    setForm({ ...form, amount });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const payload = {
      phone: form.phone.trim(),
      network: form.network,
      amount: Number(form.amount),
    };

    try {
      const res = await client.post("/bills/airtime/", payload);
      setMessage({
        type: "success",
        text: res.data.message || "Airtime purchase successful",
      });
      setReceiptData({
        status: "success",
        type: "airtime",
        ...payload,
        reference: res.data.reference || null,
      });
      toast.success("Airtime purchase successful!");
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Purchase failed",
      });
      setReceiptData({
        status: "failed",
        type: "airtime",
        ...payload,
        reference: err.response?.data?.reference || null,
      });
      toast.error(err.response?.data?.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      <ToastContainer />
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />

      <div className="max-w-3xl mx-auto p-6 relative z-10">
        {loading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl z-20">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
          </div>
        )}

        <h2 className="text-2xl font-bold mb-6">Buy Airtime</h2>

        {message && (
          <div
            className={`p-3 rounded-lg mb-6 shadow-md ${
              message.type === "success"
                ? "bg-green-600/20 text-green-400 border border-green-500/50"
                : "bg-red-600/20 text-red-400 border border-red-500/50"
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl relative z-10">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2">Phone Number</label>
              <input
                name="phone"
                type="text"
                placeholder="08012345678"
                value={form.phone}
                onChange={handleChange}
                required
                className="w-full bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all placeholder-gray-400"
              />
            </div>
            <div className="w-32">
              <label className="block text-sm text-gray-400 mb-2">Network</label>
              <select
                name="network"
                value={form.network}
                onChange={handleChange}
                className="w-full bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
              >
                <option value="mtn">MTN</option>
                <option value="airtel">Airtel</option>
                <option value="glo">Glo</option>
                <option value="9mobile">9Mobile</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Quick Pick Amount</label>
            <div className="grid grid-cols-3 gap-3">
              {[50, 100, 200, 500, 1000, 2000].map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => handleQuickPick(amt)}
                  className={`p-3 rounded-lg text-center text-sm font-semibold ${
                    Number(form.amount) === amt
                      ? "bg-indigo-600 text-white border border-green-500 shadow-md"
                      : "bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-all"
                  }`}
                >
                  <span className="block text-base font-semibold">₦{amt}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Custom Amount</label>
            <input
              name="amount"
              type="number"
              placeholder="Enter custom amount (min ₦50)"
              min="50"
              step="50"
              value={form.amount}
              onChange={handleChange}
              required
              className="w-full bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all placeholder-gray-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Buy Airtime"}
          </button>
        </form>

        <Receipt
          type="airtime"
          data={receiptData}
          onClose={() => {
            setReceiptData(null);
            resetForm();
            navigate("/dashboard", { state: { transactionCompleted: true, fromTransaction: true } });
          }}
        />
      </div>
    </div>
  );
}