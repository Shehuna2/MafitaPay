// src/pages/BuyAirtime.jsx
import { useState } from "react";
import { Loader2 } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";
import ShortFormLayout from "../../layouts/ShortFormLayout";

// ----------------------------------------
// NETWORK LOGOS
// ----------------------------------------
const NETWORK_LOGOS = {
  mtn: "/networks/mtn.png",
  airtel: "/networks/airtel.png",
  glo: "/networks/glo.png",
  "9mobile": "/networks/9mobile.png",
};

// ----------------------------------------
// Nigerian Phone Validation + Network Detection
// ----------------------------------------
const NETWORK_PREFIXES = {
  mtn: ["0803", "0806", "0703", "0706", "0813","0816","0810","0814","0903","0906","0913","0916"],
  airtel: ["0802","0808","0708","0812","0701","0902","0907","0901","0912"],
  glo: ["0805","0807","0705","0815","0811","0905"],
  "9mobile": ["0809","0817","0818","0908","0909"]
};

const normalizePhone = (phone) => {
  let p = phone.trim();
  if (p.startsWith("+234")) p = "0" + p.slice(4);
  if (p.startsWith("234")) p = "0" + p.slice(3);
  return p;
};

const detectNetwork = (phone) => {
  const p = normalizePhone(phone);
  if (p.length < 4) return null;
  const prefix4 = p.slice(0, 4);

  for (const network in NETWORK_PREFIXES) {
    if (NETWORK_PREFIXES[network].includes(prefix4)) {
      return network;
    }
  }
  return null;
};

const validateNigerianPhone = (phone) => {
  const p = normalizePhone(phone);
  if (!/^0\d{10}$/.test(p)) return { valid: false, normalized: p };

  const prefix4 = p.slice(0, 4);
  const valid = Object.values(NETWORK_PREFIXES).flat().includes(prefix4);
  return { valid, normalized: p };
};

// ----------------------------------------

export default function BuyAirtime() {
  const [form, setForm] = useState({
    phone: "",
    network: "mtn",
    amount: ""
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [receiptData, setReceiptData] = useState(null);

  // -------------------------------
  // PHONE CHANGE WITH REAL-TIME NETWORK DETECTION
  // -------------------------------
  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, phone: val }));

    const detected = detectNetwork(val);
    if (detected) {
      setForm((prev) => ({ ...prev, network: detected }));
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleQuickPick = (amount) => {
    setForm({ ...form, amount });
  };

  const resetForm = () => {
    setForm({
      phone: "",
      network: "mtn",
      amount: ""
    });
  };

  const phoneValid = form.phone
    ? validateNigerianPhone(form.phone).valid
    : true;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { valid, normalized } = validateNigerianPhone(form.phone);

    if (!valid) {
      toast.error("Invalid Nigerian phone number");
      setLoading(false);
      return;
    }

    const detectedNetwork = detectNetwork(normalized);
    if (detectedNetwork && detectedNetwork !== form.network) {
      toast.error(
        `Number belongs to ${detectedNetwork.toUpperCase()}, but you selected ${form.network.toUpperCase()}`
      );
      setLoading(false);
      return;
    }

    const payload = {
      phone: normalized,
      network: form.network,
      amount: Number(form.amount)
    };

    try {
      const res = await client.post("/bills/airtime/", payload);

      setMessage({
        type: "success",
        text: res.data.message || "Airtime purchase successful"
      });

      setReceiptData({
        status: "success",
        type: "airtime",
        ...payload,
        reference: res.data.reference || null
      });

      toast.success("Airtime purchase successful!");
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Purchase failed"
      });

      setReceiptData({
        status: "failed",
        type: "airtime",
        ...payload,
        reference: err.response?.data?.reference || null
      });

      toast.error(err.response?.data?.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ShortFormLayout title="Buy Airtime">
      <ToastContainer position="top-right" />

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

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-gray-800/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-gray-700/50 shadow-2xl"
        >
          <div className="flex flex-row gap-3">
            {/* PHONE */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Phone Number
              </label>
              <input
                name="phone"
                type="text"
                placeholder="08012345678"
                value={form.phone}
                onChange={handlePhoneChange}
                required
                className={`w-full bg-gray-800/60 backdrop-blur-md border p-2.5 rounded-xl text-white text-sm placeholder-gray-500
                focus:outline-none transition-all duration-200
                ${
                  !phoneValid && form.phone
                    ? "border-red-500 focus:ring-red-500/30"
                    : "border-gray-700/80 focus:ring-indigo-500/50 focus:border-indigo-500"
                }`}
              />
              {!phoneValid && form.phone && (
                <p className="text-red-400 text-xs mt-1">❌ Invalid Nigerian phone number</p>
              )}
            </div>

            {/* NETWORK */}
            <div className="w-36 sm:w-40">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Network
              </label>
              <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl backdrop-blur-md">
                <img
                  src={NETWORK_LOGOS[form.network]}
                  alt={form.network}
                  className="w-6 h-6 rounded-full object-contain"
                />
                <select
                  name="network"
                  value={form.network}
                  onChange={handleChange}
                  className="bg-transparent appearance-none text-white flex-1 outline-none cursor-pointer text-sm border-none"
                  style={{ WebkitAppearance: "none" }}
                >
                  <option className="bg-gray-800" value="mtn">MTN</option>
                  <option className="bg-gray-800" value="airtel">Airtel</option>
                  <option className="bg-gray-800" value="glo">Glo</option>
                  <option className="bg-gray-800" value="9mobile">9Mobile</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quick pick */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Quick Pick Amount
            </label>
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

          {/* Custom amount */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Custom Amount
            </label>
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

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Buy Airtime"}
          </button>
        </form>
      </div>

      <Receipt
        type="airtime"
        data={receiptData}
        onClose={() => {
          setReceiptData(null);
          resetForm();
        }}
      />
    </ShortFormLayout>
  );
}
