// src/pages/bills/BuyElectricity.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import Receipt from "../../components/Receipt";

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

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      disco: form.disco,
      meter_number: form.meter_number,
      amount: Number(form.amount),
      phone: form.phone || undefined,
    };

    try {
      const res = await client.post("/bills/electricity/", payload);
      setReceiptData({ status: "success", type: "electricity", ...payload });
      toast.success("Electricity paid!");
    } catch (err) {
      setReceiptData({ status: "failed", type: "electricity", ...payload });
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <ToastContainer />
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Pay Electricity Bill</h2>

        <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 p-6 rounded-2xl border border-gray-700">
          <div>
            <label className="block text-sm text-gray-400 mb-2">DISCO</label>
            <select name="disco" value={form.disco} onChange={handleChange} className="input-style">
              {Object.entries(DISCOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Meter Number</label>
            <input name="meter_number" value={form.meter_number} onChange={handleChange} placeholder="12345678901" required className="input-style" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Amount</label>
              <input name="amount" type="number" min="500" step="100" value={form.amount} onChange={handleChange} required className="input-style" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Phone (optional)</label>
              <input name="phone" value={form.phone} onChange={handleChange} placeholder="080..." className="input-style" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Pay Bill"}
          </button>
        </form>

        <Receipt type="electricity" data={receiptData} onClose={() => { setReceiptData(null); navigate("/dashboard"); }} />
      </div>
    </div>
  );
}