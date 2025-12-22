// src/pages/BuyAirtime.jsx
import { useState } from "react";
import { Loader2 } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";
import ShortFormLayout from "../../layouts/ShortFormLayout";
import PINVerificationModal from "../../components/PIN/PINVerificationModal";
import { usePIN } from "../../hooks/usePIN";

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
// Nigerian Network Prefixes
// ----------------------------------------
const NETWORK_PREFIXES = {
  mtn: ["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916"],
  airtel: ["0802","0808","0708","0812","0701","0902","0907","0901","0912"],
  glo: ["0805","0807","0705","0815","0811","0905"],
  "9mobile": ["0809","0817","0818","0908","0909"]
};

// ----------------------------------------
// Phone Normalization
// ----------------------------------------
const normalizePhone = (phone) => {
  let p = phone.replace(/\D/g, ""); // remove non-digits

  // remove country code 234
  if (p.startsWith("234")) p = p.slice(3);

  // remove double zero (e.g., 00234)
  if (p.startsWith("00")) p = p.replace(/^0+/, "");

  // ensure leading zero
  if (!p.startsWith("0")) p = "0" + p;

  return p;
};

const detectNetwork = (phone) => {
  const p = normalizePhone(phone);
  if (p.length < 4) return null;

  const prefix = p.slice(0, 4);
  return (
    Object.keys(NETWORK_PREFIXES).find((net) =>
      NETWORK_PREFIXES[net].includes(prefix)
    ) || null
  );
};

const validateNigerianPhone = (phone) => {
  const p = normalizePhone(phone);

  if (!/^0\d{10}$/.test(p)) {
    return { valid: false, normalized: p, detected: null };
  }

  const detected = detectNetwork(p);
  return { valid: !!detected, normalized: p, detected };
};

// ----------------------------------------

export default function BuyAirtime() {
  const [form, setForm] = useState({
    phone: "",
    network: "mtn",
    amount: "",
  });

  // Tracks if the user manually changed the network
  const [networkLocked, setNetworkLocked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [receiptData, setReceiptData] = useState(null);

  // PIN verification states
  const [showPINModal, setShowPINModal] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const { pinStatus } = usePIN();

  // ----------------------------------------
  // Handle Phone Input with Auto-Detection
  // ----------------------------------------
  const handlePhoneChange = (e) => {
    const phoneVal = e.target.value;
    const detected = detectNetwork(phoneVal);

    setForm((prev) => ({
      ...prev,
      phone: phoneVal,
      network: !networkLocked && detected ? detected : prev.network,
    }));
  };

  // ----------------------------------------
  // Handle Manual Network Change
  // ----------------------------------------
  const handleChange = (e) => {
    if (e.target.name === "network") {
      setNetworkLocked(true);
    }

    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ----------------------------------------
  // Quick Pick
  // ----------------------------------------
  const handleQuickPick = (amount) => {
    setForm((prev) => ({ ...prev, amount }));
  };

  const resetForm = () => {
    setForm({ phone: "", network: "mtn", amount: "" });
    setNetworkLocked(false);
  };

  // ----------------------------------------
  // Validation State
  // ----------------------------------------
  const phoneValid = form.phone
    ? validateNigerianPhone(form.phone).valid
    : true;

  // ----------------------------------------
  // Submit - Show PIN Modal First
  // ----------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const { valid, normalized, detected } = validateNigerianPhone(form.phone);

    if (!valid) {
      toast.error("Invalid Nigerian phone number");
      return;
    }

    // Cross-check network selection
    if (detected && detected !== form.network) {
      toast.error(
        `Number belongs to ${detected.toUpperCase()}, but you selected ${form.network.toUpperCase()}`
      );
      return;
    }

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
      phone: normalized,
      network: form.network,
      amount: Number(form.amount),
    });
    
    setShowPINModal(true);
  };

  // ----------------------------------------
  // Process Transaction After PIN Verified
  // ----------------------------------------
  const processPurchase = async () => {
    if (!pendingTransaction) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await client.post("/bills/airtime/", pendingTransaction);

      setMessage({
        type: "success",
        text: res.data.message || "Airtime purchase successful",
      });

      setReceiptData({
        status: "success",
        type: "airtime",
        ...pendingTransaction,
        reference: res.data.reference || null,
      });

      toast.success("Airtime purchase successful!");
      setPendingTransaction(null);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Purchase failed",
      });

      setReceiptData({
        status: "failed",
        type: "airtime",
        ...pendingTransaction,
        reference: err.response?.data?.reference || null,
      });

      toast.error(err.response?.data?.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------
  // Component Render
  // ----------------------------------------
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
          {/* PHONE + NETWORK */}
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

          {/* Quick Pick */}
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

          {/* Custom Amount */}
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

          {/* Submit */}
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

      {/* PIN Verification Modal */}
      <PINVerificationModal
        isOpen={showPINModal}
        onClose={() => {
          setShowPINModal(false);
          setPendingTransaction(null);
        }}
        onVerified={processPurchase}
        transactionDetails={pendingTransaction ? {
          type: "Airtime Purchase",
          amount: pendingTransaction.amount,
          recipient: `${pendingTransaction.network.toUpperCase()} - ${form.phone}`,
          description: `${pendingTransaction.network.toUpperCase()} Airtime`
        } : null}
      />
    </ShortFormLayout>
  );
}
