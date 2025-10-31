// src/pages/bills/BuyCableTV.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
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
      setPlans(res.data.variations);
      if (res.data.variations.length > 0) {
        const defaultPlan = res.data.variations[0];
        setForm(f => ({ ...f, variation_code: defaultPlan.variation_code, amount: defaultPlan.variation_amount }));
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
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <ToastContainer />
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Cable TV Subscription</h2>

        <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 p-6 rounded-2xl border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Network</label>
              <select name="network" value={form.network} onChange={handleChange} className="input-style">
                {Object.entries(NETWORKS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Decoder / Smartcard</label>
              <input name="decoder_number" value={form.decoder_number} onChange={handleChange} placeholder="1234567890" required className="input-style" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Select Bouquet</label>
            {fetchingPlans ? <p>Loading plans...</p> : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {plans.map(plan => (
                  <button
                    key={plan.variation_code}
                    type="button"
                    onClick={() => handlePlanSelect(plan)}
                    className={`p-3 rounded-lg text-sm font-medium transition-all ${form.variation_code === plan.variation_code ? "bg-indigo-600 text-white" : "bg-gray-700 hover:bg-gray-600"}`}
                  >
                    {plan.description} <br /> ₦{plan.variation_amount}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Amount</label>
              <input name="amount" value={form.amount} readOnly className="input-style bg-gray-700" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Phone (optional)</label>
              <input name="phone" value={form.phone} onChange={handleChange} placeholder="080..." className="input-style" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Pay Now"}
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