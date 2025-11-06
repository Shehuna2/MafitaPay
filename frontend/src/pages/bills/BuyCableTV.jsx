// src/pages/bills/BuyCableTV.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";

const NETWORKS = { dstv: "DSTV", gotv: "GOTV", startimes: "Startimes" };

export default function BuyCableTV() {
  const [form, setForm] = useState({
    network: "dstv",
    decoder_number: "",
    variation_code: "",
    amount: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [fetchingPlans, setFetchingPlans] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (form.network) fetchPlans();
  }, [form.network]);

  const fetchPlans = async () => {
    setFetchingPlans(true);
    try {
      const res = await client.get(`/bills/variations/?service_type=${form.network}`);
      setPlans(res.data.variations || []);
      if (res.data.variations?.length > 0) {
        const defaultPlan = res.data.variations[0];
        setForm(f => ({
          ...f,
          variation_code: defaultPlan.variation_code,
          amount: defaultPlan.variation_amount
        }));
      }
    } catch (err) {
      toast.error("Failed to load plans");
    } finally {
      setFetchingPlans(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePlanSelect = (plan) => {
    setForm({ ...form, variation_code: plan.variation_code, amount: plan.variation_amount });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      network: form.network,
      decoder_number: form.decoder_number,
      variation_code: form.variation_code,
      amount: Number(form.amount),
      phone: form.phone || undefined,
    };

    try {
      const res = await client.post("/bills/cable-tv/", payload);
      setReceiptData({ status: "success", type: "cable_tv", ...payload });
      toast.success("Subscription successful!");
    } catch (err) {
      setReceiptData({ status: "failed", type: "cable_tv", ...payload });
      toast.error(err.response?.data?.message || "Failed");
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
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-400">Cable TV Subscription</h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-gray-800/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-gray-700/50 shadow-2xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
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
                {Object.entries(NETWORKS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Decoder / Smartcard</label>
              <input
                name="decoder_number"
                value={form.decoder_number}
                onChange={handleChange}
                placeholder="1234567890"
                required
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Select Bouquet</label>
            {fetchingPlans ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {plans.slice(0, 6).map((plan) => (
                  <button
                    key={plan.variation_code}
                    type="button"
                    onClick={() => handlePlanSelect(plan)}
                    className={`p-2.5 rounded-xl text-center text-xs font-bold transition-all duration-200 backdrop-blur-md border ${
                      form.variation_code === plan.variation_code
                        ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/30 transform -translate-y-0.5"
                        : "bg-gray-800/60 border-gray-700 hover:bg-gray-700/80 hover:border-indigo-500/50"
                    }`}
                  >
                    <span className="block font-bold">{plan.description}</span>
                    <span className="text-xs text-gray-400">₦{plan.variation_amount}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Amount</label>
              <input
                name="amount"
                value={form.amount}
                readOnly
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm bg-gray-700/70 cursor-not-allowed"
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
            disabled={loading || !form.variation_code}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Pay Now"}
          </button>
        </form>

        <Receipt
          type="cable_tv"
          data={receiptData}
          onClose={() => {
            setReceiptData(null);
            navigate("/dashboard", { state: { transactionCompleted: true } });
          }}
        />
      </div>
    </div>
  );
}