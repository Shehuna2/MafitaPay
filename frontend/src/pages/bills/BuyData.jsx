// src/pages/BuyData.jsx
import { useEffect, useState, useRef } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Receipt from "../../components/Receipt";
import ShortFormLayout from "../../layouts/ShortFormLayout";

/* ----------------------------------------------------
   NETWORK LOGOS
---------------------------------------------------- */
const NETWORK_LOGOS = {
  mtn: "/networks/mtn.png",
  airtel: "/networks/airtel.png",
  glo: "/networks/glo.png",
  "9mobile": "/networks/9mobile.png",
};

/* ----------------------------------------------------
   PHONE NORMALIZATION & NETWORK DETECTION
---------------------------------------------------- */
const NETWORK_PREFIXES = {
  mtn: ["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916"],
  airtel: ["0802","0808","0708","0812","0701","0902","0907","0901","0912"],
  glo: ["0805","0807","0705","0815","0811","0905"],
  "9mobile": ["0809","0817","0818","0908","0909"]
};

const normalizePhone = (phone) => {
  let p = phone.replace(/\D/g, "");

  if (p.startsWith("234")) p = p.slice(3);
  if (p.startsWith("0")) p = p.slice(1);

  return "0" + p;
};

const detectNetwork = (phone) => {
  const p = normalizePhone(phone);
  if (p.length < 4) return null;

  const prefix = p.slice(0, 4);

  return (
    Object.keys(NETWORK_PREFIXES).find((n) =>
      NETWORK_PREFIXES[n].includes(prefix)
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

/* ----------------------------------------------------
   MAIN COMPONENT
---------------------------------------------------- */
export default function BuyData() {
  const [form, setForm] = useState({
    phone: "",
    network: "mtn",
    variation_code: "",
  });

  const [networkLocked, setNetworkLocked] = useState(false);
  const [plans, setPlans] = useState([]);
  const [groupedPlans, setGroupedPlans] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [message, setMessage] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const modalRef = useRef(null);

  const resetForm = () => {
    setForm({ phone: "", network: "mtn", variation_code: "" });
    setSelectedCategory("all");
    setNetworkLocked(false);
  };

  /* ----------------------------------------------------
     FETCH PLANS WHEN NETWORK CHANGES
  ---------------------------------------------------- */
  useEffect(() => {
    async function fetchPlans() {
      setLoadingPlans(true);
      try {
        const res = await client.get(`/bills/data-plans/?network=${form.network}`);
        const grouped = res.data.plans || {};
        setGroupedPlans(grouped);
        setPlans(Object.values(grouped).flat());
      } catch (err) {
        console.error("Error fetching plans:", err);
        toast.error("Failed to load data plans.");
        setGroupedPlans({});
        setPlans([]);
      } finally {
        setLoadingPlans(false);
      }
    }
    fetchPlans();
  }, [form.network]);

  /* ----------------------------------------------------
     PHONE INPUT WITH AUTO-DETECTION
  ---------------------------------------------------- */
  const handlePhoneChange = (e) => {
    const value = e.target.value;
    const detected = detectNetwork(value);

    setForm((prev) => ({
      ...prev,
      phone: value,
      network: !networkLocked && detected ? detected : prev.network,
    }));
  };

  /* ----------------------------------------------------
     GENERIC INPUT CHANGE (LOCK NETWORK IF USER CHANGES IT)
  ---------------------------------------------------- */
  const handleChange = (e) => {
    if (e.target.name === "network") {
      setNetworkLocked(true);
      setSelectedCategory("all");
    }

    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /* ----------------------------------------------------
     QUICK PICK DATA PLAN
  ---------------------------------------------------- */
  const handleQuickPick = (variation_code) => {
    setForm({ ...form, variation_code });
  };

  const filteredPlans =
    selectedCategory === "all"
      ? plans
      : groupedPlans[selectedCategory] || [];

  const formatPlanTitle = (text = "") => {
    if (!text) return "Unknown Plan";

    const str = text.toLowerCase().trim();

    const dataMatch = str.match(/(\d+(\.\d+)?\s*(mb|gb|tb))/i);
    const dataAmount = dataMatch ? dataMatch[0].toUpperCase() : "";

    const validityMatch = str.match(
      /\b(\d+\s*(day|days|week|weeks|month|months))\b/i
    );

    let validity = validityMatch
      ? validityMatch[0]
          .replace(/days?/i, "Day")
          .replace(/weeks?/i, "Week")
          .replace(/months?/i, "Month")
          .replace(/\s+/g, "")
      : "";

    if (!validity) {
      const fallback = str.match(/\b(daily|weekly|monthly)\b/i)?.[0];
      validity = fallback ? fallback.replace("ly", "y") : "";
    }

    return dataAmount ? `${dataAmount} - ${validity || "Valid"}` : "View Plan";
  };

  /* ----------------------------------------------------
     FIRST FORM SUBMIT → SHOW CONFIRMATION MODAL
  ---------------------------------------------------- */
  const handleSubmit = (e) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  /* ----------------------------------------------------
     CONFIRM PURCHASE
  ---------------------------------------------------- */
  const confirmPurchase = async () => {
    setShowConfirm(false);
    setLoading(true);
    setMessage(null);

    const { valid, normalized, detected } = validateNigerianPhone(form.phone);

    if (!valid) {
      toast.error("Invalid Nigerian phone number");
      setLoading(false);
      return;
    }

    if (detected !== form.network) {
      toast.error(
        `Number belongs to ${detected.toUpperCase()}, but you selected ${form.network.toUpperCase()}`
      );
      setLoading(false);
      return;
    }

    const selectedPlan = plans.find(
      (p) => p.variation_code === form.variation_code
    );

    const payload = {
      phone: normalized,
      network: form.network,
      variation_code: form.variation_code,
      amount: selectedPlan ? Number(selectedPlan.variation_amount) : null,
    };

    try {
      const res = await client.post("/bills/data/", payload);

      setMessage({
        type: "success",
        text: res.data.message || "Data purchase successful",
      });

      setReceiptData({
        status: "success",
        type: "data",
        ...payload,
        reference: res.data.reference || null,
      });

      toast.success("Data purchase successful!");
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Purchase failed",
      });

      setReceiptData({
        status: "failed",
        type: "data",
        ...payload,
        reference: err.response?.data?.reference || null,
      });

      toast.error(err.response?.data?.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------------------------
     MODAL CLICK + ESC CLOSE
  ---------------------------------------------------- */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setShowConfirm(false);
      }
    };
    if (showConfirm) document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [showConfirm]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setShowConfirm(false);
    };
    if (showConfirm) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showConfirm]);

  /* ----------------------------------------------------
     UI RENDER
  ---------------------------------------------------- */
  return (
    <ShortFormLayout title="Buy Data">
      <ToastContainer position="top-right" />

      {loading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
        </div>
      )}

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
        {/* PHONE + NETWORK */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* PHONE INPUT */}
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
              className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
            />
          </div>

          {/* NETWORK WITH LOGO */}
          <div className="sm:w-40">
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
                <option value="mtn">MTN</option>
                <option value="airtel">Airtel</option>
                <option value="glo">Glo</option>
                <option value="9mobile">9Mobile</option>
              </select>
            </div>
          </div>
        </div>

        {/* CATEGORY FILTER */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Filter by Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm"
          >
            <option value="all">All</option>
            {Object.keys(groupedPlans).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* QUICK PICK PLANS */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Quick Pick Plans
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {loadingPlans ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-gray-800/60 border border-gray-700/80 animate-pulse"
                >
                  <div className="h-4 bg-gray-700/60 rounded w-full mb-1"></div>
                  <div className="h-3 bg-gray-700/50 rounded w-3/4"></div>
                </div>
              ))
            ) : filteredPlans.length > 0 ? (
              filteredPlans.slice(0, 6).map((plan) => (
                <button
                  type="button"
                  key={plan.variation_code}
                  onClick={() => handleQuickPick(plan.variation_code)}
                  className={`p-2.5 rounded-xl text-center text-xs font-bold transition-all duration-200 backdrop-blur-md border ${
                    form.variation_code === plan.variation_code
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/30 transform -translate-y-0.5"
                      : "bg-gray-800/60 border-gray-700 hover:bg-gray-700/80 hover:border-indigo-500/50"
                  }`}
                >
                  <span className="block font-bold">
                    {formatPlanTitle(plan.description)}
                  </span>
                  <span className="text-xs text-gray-400">
                    ₦{plan.variation_amount}
                  </span>
                </button>
              ))
            ) : (
              <p className="col-span-full text-center text-gray-500 text-xs py-4">
                No plans found
              </p>
            )}
          </div>
        </div>

        {/* MORE PLANS DROPDOWN */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            More Plans
          </label>

          {loadingPlans ? (
            <div className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl animate-pulse">
              <div className="h-4 bg-gray-700/60 rounded w-3/4"></div>
            </div>
          ) : (
            <select
              name="variation_code"
              value={form.variation_code}
              onChange={handleChange}
              required
              className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 p-2.5 rounded-xl text-white text-sm appearance-none"
            >
              <option value="">Select Plan</option>

              {(selectedCategory === "all"
                ? Object.entries(groupedPlans)
                : [[selectedCategory, groupedPlans[selectedCategory] || []]]
              ).map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((plan) => (
                    <option key={plan.variation_code} value={plan.variation_code}>
                      {formatPlanTitle(plan.description)} – ₦
                      {plan.variation_amount}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {/* SUBMIT BUTTON */}
        <button
          type="submit"
          disabled={loading || !form.variation_code}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            "Buy Data"
          )}
        </button>
      </form>

      {/* CONFIRMATION MODAL */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            ref={modalRef}
            className="bg-gray-800/90 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl p-6 max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Confirm Purchase
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Phone:</span>
                <span className="font-medium text-white">{form.phone}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Network:</span>
                <span className="font-medium text-white">
                  {form.network.toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Plan:</span>
                <span className="font-medium text-white">
                  {(() => {
                    const plan = plans.find(
                      (p) => p.variation_code === form.variation_code
                    );
                    return plan ? formatPlanTitle(plan.description) : "Unknown";
                  })()}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Amount:</span>
                <span className="font-bold text-indigo-400">
                  ₦
                  {(() => {
                    const plan = plans.find(
                      (p) => p.variation_code === form.variation_code
                    );
                    return plan?.variation_amount || "0";
                  })()}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={confirmPurchase}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-xl font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-green-500/30 transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm
              </button>

              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-red-500/30 transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Receipt
        type="data"
        data={receiptData}
        onClose={() => {
          setReceiptData(null);
          resetForm();
        }}
      />
    </ShortFormLayout>
  );
}
