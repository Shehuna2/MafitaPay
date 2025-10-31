// src/pages/bills/BuyEducation.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import Receipt from "../../components/Receipt";

const EXAMS = { waec: "WAEC", neco: "NECO", jamb: "JAMB" };

export default function BuyEducation() {
  const [form, setForm] = useState({
    exam_type: "waec",
    pin: "",
    amount: "15000",
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
      exam_type: form.exam_type,
      pin: form.pin,
      amount: Number(form.amount),
      phone: form.phone || undefined,
    };

    try {
      const res = await client.post("/bills/education/", payload);
      setReceiptData({ status: "success", type: "education", ...payload });
      toast.success("Scratch card purchased!");
    } catch (err) {
      setReceiptData({ status: "failed", type: "education", ...payload });
      toast.error(err.response?.data?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <ToastContainer />
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Buy Exam Scratch Card</h2>

        <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 p-6 rounded-2xl border border-gray-700">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Exam Type</label>
            <select name="exam_type" value={form.exam_type} onChange={handleChange} className="input-style">
              {Object.entries(EXAMS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Serial / PIN</label>
            <input name="pin" value={form.pin} onChange={handleChange} placeholder="WAEC202512345678" required className="input-style" />
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
            {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Buy Card"}
          </button>
        </form>

        <Receipt type="education" data={receiptData} onClose={() => { setReceiptData(null); navigate("/dashboard"); }} />
      </div>
    </div>
  );
}