// src/pages/BuyAirtime.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
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
      <div className="absolute inset-0 pointer-events-none" />

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10">
        {loading && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
          </div>
        )}

        <div className="flex items-center gap-2 mb-5">
          <ArrowLeft className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-400">Buy Airtime</h2>
        </div>

        {message && (
          <div
            className={`p-3 rounded-xl mb-5 shadow-md backdrop-blur-md border ${
              message.type === "success"
                ? "bg-green-600/20 text-green-400 border-green-500/50"
                : "bg-red-600/20 text-red-400 border-red-500/50"
            }`}
          >
            {message.text}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-gray-800/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-gray-700/50 shadow-2xl"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Phone Number</label>
              <input
                name="phone"
                type="text"
                placeholder="08012345678"
                value={form.phone}
                onChange={handleChange}
                required
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
              />
            </div>
            <div className="sm:w-32">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Network</label>
              <select
                name="network"
                value={form.network}
                onChange={handleChange}
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 appearance-none cursor-pointer hover:border-indigo-500/50"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: "right 0.75rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "12px",
                }}
              >
                <option value="mtn">MTN</option>
                <option value="airtel">Airtel</option>
                <option value="glo">Glo</option>
                <option value="9mobile">9Mobile</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Quick Pick Amount</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[50, 100, 200, 500, 1000, 2000].map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => handleQuickPick(amt)}
                  className={`p-2.5 rounded-xl text-center text-xs font-bold transition-all duration-200 backdrop-blur-md border ${
                    Number(form.amount) === amt
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/30 transform -translate-y-0.5"
                      : "bg-gray-800/60 border-gray-700 hover:bg-gray-700/80 hover:border-indigo-500/50"
                  }`}
                >
                  ₦{amt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Custom Amount</label>
            <input
              name="amount"
              type="number"
              placeholder="Min ₦50"
              min="50"
              step="50"
              value={form.amount}
              onChange={handleChange}
              required
              className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Buy Airtime"}
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