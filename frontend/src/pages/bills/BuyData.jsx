// ⭐ Buy Data Engine v6 — Fastest, Cleanest, Most Stable Version (2025)

import { useEffect, useState } from "react";
import { 
  Loader2, CheckCircle, Zap, Crown, Gift, Shield 
} from "lucide-react";
import client from "../../api/client";
import { toast } from "react-toastify";
import Receipt from "../../components/Receipt";
import ShortFormLayout from "../../layouts/ShortFormLayout";

// -----------------------------------------------
// NETWORK LOGOS
// -----------------------------------------------
const NETWORK_LOGOS = {
  mtn: "/networks/mtn.png",
  airtel: "/networks/airtel.png",
  glo: "/networks/glo.png",
  "9mobile": "/networks/9mobile.png",
};

// -----------------------------------------------
// CATEGORY STYLING
// -----------------------------------------------
const CATEGORY_STYLES = {
  SME2: { color: "text-yellow-400", border: "border-yellow-500/40", icon: Crown },
  SME: { color: "text-green-400", border: "border-green-500/40", icon: Zap },
  GIFTING: { color: "text-purple-400", border: "border-purple-500/40", icon: Gift },
  CORPORATE: { color: "text-blue-400", border: "border-blue-500/40", icon: Shield },
  REGULAR: { color: "text-gray-400", border: "border-gray-500/40", icon: null },
};

// -----------------------------------------------
// PHONE DETECTION
// -----------------------------------------------
const NETWORK_PREFIXES = {
  mtn: ["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916"],
  airtel: ["0802","0808","0708","0812","0701","0902","0907","0901","0912"],
  glo: ["0805","0807","0705","0815","0811","0905"],
  "9mobile": ["0809","0817","0818","0908","0909"]
};

const normalizePhone = (p) => {
  p = p.replace(/\D/g, "");
  if (p.startsWith("234")) p = p.slice(3);
  if (!p.startsWith("0")) p = "0" + p;
  return p.slice(0, 11);
};

const detectNetwork = (phone) => {
  const p = normalizePhone(phone);
  const prefix = p.slice(0, 4);
  return Object.keys(NETWORK_PREFIXES)
    .find(n => NETWORK_PREFIXES[n].includes(prefix)) || null;
};

const validateNigerianPhone = (phone) => {
  const normalized = normalizePhone(phone);
  if (!/^0\d{10}$/.test(normalized)) return { valid: false, normalized, detected: null };
  const detected = detectNetwork(normalized);
  return { valid: !!detected, normalized, detected };
};

// -----------------------------------------------
// PLAN NAME FORMATTER
// -----------------------------------------------
const formatPlanName = (rawName) => {
  if (!rawName) return "Unknown";
  rawName = rawName.toUpperCase();
  const size = rawName.match(/(\d+(\.\d+)?)\s*(GB|MB)/)?.[0] || "";
  const days = rawName.match(/(\d+)\s*DAY/)?.[1]
    ? rawName.match(/(\d+)\s*DAY/)[1] + " DAYS"
    : "";
  return [size, days].filter(Boolean).join(" - ") || rawName;
};

// -----------------------------------------------
// CACHE KEY
// -----------------------------------------------
const CACHE_KEY = (nw) => `data_plans_${nw}_v6`;

// -----------------------------------------------
// COMPONENT
// -----------------------------------------------
export default function BuyData() {
  const [form, setForm] = useState({ phone: "", network: "mtn", variation_id: "" });
  const [networkLocked, setNetworkLocked] = useState(false);

  const [livePhoneInfo, setLivePhoneInfo] = useState({
    normalized: "",
    detected: null,
    valid: false,
    message: ""
  });

  const [groupedPlans, setGroupedPlans] = useState({});
  const [plans, setPlans] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("SME2");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingPurchase, setLoadingPurchase] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const networkMismatch =
    form.phone.length >= 4 &&
    livePhoneInfo.detected &&
    livePhoneInfo.detected !== form.network;

  // ----------------------------------------------------
  // LOAD PLANS FAST
  // ----------------------------------------------------
  useEffect(() => {
    let mounted = true;

    const loadPlans = async () => {
      setLoadingPlans(true);
      const cacheKey = CACHE_KEY(form.network);

      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached?.grouped) {
        setGroupedPlans(cached.grouped);
        setPlans(Object.values(cached.grouped).flat());
      }

      try {
        const res = await client.get(`/bills/data/plans/?network=${form.network}`);
        const grouped = res.data.plans || {};
        const flat = Object.values(grouped).flat();

        if (mounted) {
          setGroupedPlans(grouped);
          setPlans(flat);
        }

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), grouped }));
      } catch (err) {
        toast.error("Failed to refresh plans. Using cached.");
      } finally {
        if (mounted) setLoadingPlans(false);
      }
    };

    loadPlans();
    return () => (mounted = false);
  }, [form.network]);

  // ----------------------------------------------------
  // AUTO-SELECT FIRST CATEGORY
  // ----------------------------------------------------
  useEffect(() => {
    if (!loadingPlans && Object.keys(groupedPlans).length > 0) {
      const order = ["SME2","SME","GIFTING","CORPORATE","REGULAR"];
      const first = order.find(c => groupedPlans[c]?.length > 0);
      if (first) setSelectedCategory(first);
    }
  }, [groupedPlans, loadingPlans]);

  // ----------------------------------------------------
  // LIVE PHONE VALIDATION + NETWORK AUTO-DETECT
  // ----------------------------------------------------
  const handlePhoneChange = (e) => {
    const value = e.target.value;

    const normalized = normalizePhone(value);
    const detected = detectNetwork(normalized);
    const validFormat = /^0\d{10}$/.test(normalized);


    let message = "";
    if (value.length < 4) message = "Enter phone number";
    else if (!normalized.startsWith("0")) message = "Number must start with 0";
    else if (normalized.length < 11) message = "Incomplete number";
    else if (!detected) message = "Unknown Nigerian network";
    else message = `✔ Valid ${detected.toUpperCase()} number`;

    setLivePhoneInfo({ valid: validFormat && !!detected, normalized, detected, message });

    setForm(prev => {
      let newNetwork = prev.network;

      // If a network is detected
      if (detected) {
        // If user selected manually BUT phone number is clearly another network
        if (networkLocked && detected !== prev.network) {
          setNetworkLocked(false); // unlock auto-selection
          newNetwork = detected;
        }

        // If auto mode is enabled
        if (!networkLocked) {
          newNetwork = detected;
        }
      }

      return {
        ...prev,
        phone: value,
        network: newNetwork,
      };
    });
  };

  const handleNetworkSelect = (network) => {
    setNetworkLocked(true);
    setForm(prev => ({ ...prev, network }));
  };

  // ----------------------------------------------------
  // PLAN SELECT
  // ----------------------------------------------------
  const handlePlanClick = (plan) => {
    const { valid, detected } = validateNigerianPhone(form.phone);
    if (!valid) return toast.error("Invalid phone number");
    if (detected !== form.network)
      return toast.error(`This number belongs to ${detected?.toUpperCase()}`);

    setForm(prev => ({ ...prev, variation_id: plan.id }));
    setShowConfirm(true);
  };

  const selectedPlan = plans.find(p => p.id === form.variation_id);

  // ----------------------------------------------------
  // CONFIRM PURCHASE
  // ----------------------------------------------------
  const confirmPurchase = async () => {
    setShowConfirm(false);

    const { valid, normalized, detected } = validateNigerianPhone(form.phone);
    if (!valid) return toast.error("Invalid phone number");
    if (detected !== form.network) return toast.error("Wrong network selected.");
    if (!selectedPlan) return toast.error("Please select a plan.");

    const payload = {
      phone: normalized,
      network: form.network,
      variation_id: selectedPlan.id,
      amount: selectedPlan.amount
    };

    setLoadingPurchase(true);

    try {
      await client.post("/bills/data/", payload);

      setReceiptData({
        status: "success",
        type: "data",
        ...payload,
        plan: selectedPlan.name,
        provider: selectedPlan.provider
      });

      toast.success("Data delivered!");

    } catch (err) {
      const msg = err.response?.data?.message || "Purchase failed";

      setReceiptData({ status: "failed", type: "data", ...payload, error: msg });

      toast.error(msg);

    } finally {
      setLoadingPurchase(false);
    }
  };

  // ----------------------------------------------------
  // UI
  // ----------------------------------------------------
  return (
    <ShortFormLayout>

      {loadingPurchase && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <Loader2 className="w-14 h-14 text-indigo-400 animate-spin" />
        </div>
      )}

      <div className="space-y-6">
        {/* 🔒 Sticky Top Section */}
        <div className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-md pb-4 space-y-6">
          {/* Phone + Network */}
          <div className="flex flex-col sm:flex-row gap-4">
            
            {/* PHONE INPUT */}
            <div className="flex-1">
              <label className="text-xs text-gray-400">Phone Number</label>
              <input
                type="text"
                placeholder="0803..."
                value={form.phone}
                onChange={handlePhoneChange}
                className={`w-full mt-1 bg-gray-800/70 rounded-xl px-4 py-3 text-white
                  border 
                  ${
                    form.phone.length === 0
                      ? "border-gray-700"
                      : networkMismatch
                      ? "border-yellow-400 shadow-[0_0_8px_#facc15]"
                      : livePhoneInfo.valid
                      ? "border-green-500"
                      : "border-red-500"
                  }
                `}
              />
              {/* LIVE FEEDBACK */}
              {form.phone.length > 0 && (
                <p className={`mt-1 text-xs ${livePhoneInfo.valid ? "text-green-400" : "text-red-400"}`}>
                  {livePhoneInfo.message}
                </p>
              )}

              {/* DETECTED NETWORK */}
              {livePhoneInfo.detected && (
                <div className="mt-1 flex items-center gap-2 text-green-400 text-xs">
                  <img src={NETWORK_LOGOS[livePhoneInfo.detected]} className="w-4 h-4" />
                  <span>Detected: {livePhoneInfo.detected.toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* NETWORK SELECTOR */}
            <div className="w-full sm:w-72">
              <label className="text-xs text-gray-400">Network</label>
              <div className="mt-1 grid grid-cols-4 gap-2 bg-gray-800/50 p-3 rounded-xl">
                {["mtn", "airtel", "glo", "9mobile"].map((network) => (
                  <button
                    key={network}
                    type="button"
                    onClick={() => handleNetworkSelect(network)}
                    className={`p-2 rounded-xl transition border ${
                      form.network === network
                        ? "border-indigo-500 bg-indigo-600/20"
                        : "border-transparent bg-gray-800/30 hover:bg-gray-700/40"
                    }`}
                  >
                    <img src={NETWORK_LOGOS[network]} className="w-9 h-9 mx-auto" />
                    <p className="text-[10px] text-white text-center mt-1">{network.toUpperCase()}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CATEGORY TABS */}
          <div className="flex gap-2 flex-wrap">
            {["SME2","SME","GIFTING","CORPORATE","REGULAR"].map((cat) => {
              const style = CATEGORY_STYLES[cat];
              const Icon = style.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-1 ${
                    selectedCategory === cat
                      ? `${style.border} ${style.color} bg-gray-900`
                      : "bg-gray-800 text-gray-400 border-gray-700"
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {cat}
                  <span className="text-xs opacity-60">
                    ({(groupedPlans[cat] || []).length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* PLANS */}
          <div>
            <div className="overflow-y-auto max-h-[70vh] pr-1 scroll-smooth">
              <p className="text-xs text-gray-400 mb-2">Available ({selectedCategory})</p>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {loadingPlans ? (
                  [...Array(8)].map((_, i) => (
                    <div key={i} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 animate-pulse" />
                  ))
                ) : (
                  (groupedPlans[selectedCategory] || []).map(plan => (
                    <button
                      key={plan.id}
                      onClick={() => handlePlanClick(plan)}
                      className="p-3 rounded-xl bg-gray-800/60 border border-gray-700 hover:border-indigo-500 transition text-left relative"
                    >
                      <p className="font-semibold text-[12px] text-white">
                        {formatPlanName(plan.name)}
                      </p>
                      <p className="text-[11px] font-bold text-indigo-300">
                        ₦{Number(plan.amount).toLocaleString()}
                      </p>

                      {plan.provider === "vtung" && (
                        <span className="text-[9px] text-green-400 bg-green-500/20 px-1 rounded absolute right-1 top-1">
                          CHEAPEST
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRM MODAL */}
      {showConfirm && selectedPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 p-6 rounded-xl w-full max-w-sm border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Confirm Purchase</h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-300"><span>Phone</span><span>{form.phone}</span></div>
              <div className="flex justify-between text-gray-300"><span>Plan</span><span>{selectedPlan.name}</span></div>
              <div className="flex justify-between text-gray-300"><span>Price</span><span className="font-bold">₦{selectedPlan.amount}</span></div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={confirmPurchase} className="flex-1 bg-green-600 py-3 rounded-xl font-bold">
                Confirm
              </button>
              <button onClick={() => setShowConfirm(false)} className="flex-1 bg-red-600 py-3 rounded-xl font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Receipt data={receiptData} onClose={() => setReceiptData(null)} />
    </ShortFormLayout>
  );
}
