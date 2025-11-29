// Buy Data Engine v6 — PREMIUM EDITION (2025)

import { useEffect, useState } from "react";
import { 
  Loader2, CheckCircle, Zap, Crown, Gift, Shield, Sparkles, Lock 
} from "lucide-react";
import client from "../../api/client";
import { toast } from "react-toastify";
import Receipt from "../../components/Receipt";
import ShortFormLayout from "../../layouts/ShortFormLayout";

// NETWORK LOGOS
const NETWORK_LOGOS = {
  mtn: "/networks/mtn.png",
  airtel: "/networks/airtel.png",
  glo: "/networks/glo.png",
  "9mobile": "/networks/9mobile.png",
};

// PREMIUM CATEGORY STYLING
const CATEGORY_STYLES = {
  SME2: { 
    color: "text-yellow-400", 
    bg: "bg-yellow-500/10", 
    border: "border-yellow-500/50", 
    glow: "shadow-yellow-500/30",
    gradient: "from-yellow-400/20 to-amber-600/10",
    icon: Crown 
  },
  SME: { 
    color: "text-emerald-400", 
    bg: "bg-emerald-500/10", 
    border: "border-emerald-500/50", 
    glow: "shadow-emerald-500/30",
    gradient: "from-emerald-400/20 to-teal-600/10",
    icon: Zap 
  },
  GIFTING: { 
    color: "text-purple-400", 
    bg: "bg-purple-500/10", 
    border: "border-purple-500/50", 
    glow: "shadow-purple-500/30",
    gradient: "from-purple-400/20 to-pink-600/10",
    icon: Gift 
  },
  CORPORATE: { 
    color: "text-blue-400", 
    bg: "bg-blue-500/10", 
    border: "border-blue-500/50", 
    glow: "shadow-blue-500/30",
    gradient: "from-blue-400/20 to-cyan-600/10",
    icon: Shield 
  },
  REGULAR: { 
    color: "text-gray-400", 
    bg: "bg-gray-500/10", 
    border: "border-gray-500/50", 
    glow: "shadow-gray-500/20",
    gradient: "from-gray-400/10",
    icon: null 
  },
};

// PHONE DETECTION & VALIDATION (unchanged logic)
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

const formatPlanName = (rawName) => {
  if (!rawName) return "Unknown";
  rawName = rawName.toUpperCase();
  const size = rawName.match(/(\d+(\.\d+)?)\s*(GB|MB)/)?.[0] || "";
  const days = rawName.match(/(\d+)\s*DAY/)?.[1]
    ? rawName.match(/(\d+)\s*DAY/)[1] + " DAYS"
    : "";
  return [size, days].filter(Boolean).join(" • ") || rawName;
};

const CACHE_KEY = (nw) => `data_plans_${nw}_v6`;

export default function BuyData() {
  const [form, setForm] = useState({ phone: "", network: "mtn", variation_id: "" });
  const [networkLocked, setNetworkLocked] = useState(false);
  const [livePhoneInfo, setLivePhoneInfo] = useState({
    normalized: "", detected: null, valid: false, message: ""
  });

  const [groupedPlans, setGroupedPlans] = useState({});
  const [plans, setPlans] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("SME2");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingPurchase, setLoadingPurchase] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const networkMismatch = form.phone.length >= 4 && livePhoneInfo.detected && livePhoneInfo.detected !== form.network;
  const selectedPlan = plans.find(p => p.id === form.variation_id);

  // LOAD PLANS (same logic, faster UX)
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
        toast.error("Using cached plans");
      } finally {
        if (mounted) setLoadingPlans(false);
      }
    };
    loadPlans();
    return () => (mounted = false);
  }, [form.network]);

  useEffect(() => {
    if (!loadingPlans && Object.keys(groupedPlans).length > 0) {
      const order = ["SME2","SME","GIFTING","CORPORATE","REGULAR"];
      const first = order.find(c => groupedPlans[c]?.length > 0);
      if (first) setSelectedCategory(first);
    }
  }, [groupedPlans, loadingPlans]);

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    const normalized = normalizePhone(value);
    const detected = detectNetwork(normalized);
    const validFormat = /^0\d{10}$/.test(normalized);

    let message = "";
    if (value.length < 4) message = "Enter phone number";
    else if (!normalized.startsWith("0")) message = "Must start with 0";
    else if (normalized.length < 11) message = "Incomplete number";
    else if (!detected) message = "Unknown network";
    else message = `Valid ${detected.toUpperCase()} number`;

    setLivePhoneInfo({ valid: validFormat && !!detected, normalized, detected, message });

    setForm(prev => {
      let newNetwork = prev.network;
      if (detected && !networkLocked) newNetwork = detected;
      if (detected && networkLocked && detected !== prev.network) setNetworkLocked(false);
      return { ...prev, phone: value, network: newNetwork };
    });
  };

  const handleNetworkSelect = (network) => {
    setNetworkLocked(true);
    setForm(prev => ({ ...prev, network }));
  };

  const handlePlanClick = (plan) => {
    const { valid, detected } = validateNigerianPhone(form.phone);
    if (!valid) return toast.error("Invalid phone number");
    if (detected !== form.network) return toast.error(`This is a ${detected?.toUpperCase()} number`);
    setForm(prev => ({ ...prev, variation_id: plan.id }));
    setShowConfirm(true);
  };

  const confirmPurchase = async () => {
    setShowConfirm(false);
    const { valid, normalized, detected } = validateNigerianPhone(form.phone);
    if (!valid || detected !== form.network || !selectedPlan) {
      toast.error("Invalid details");
      return;
    }

    const payload = {
      phone: normalized,
      network: form.network,
      variation_id: selectedPlan.id,
      amount: selectedPlan.amount
    };

    setLoadingPurchase(true);
    try {
      await client.post("/bills/data/", payload);
      setReceiptData({ status: "success", type: "data", ...payload, plan: selectedPlan.name });
      toast.success("Data delivered instantly!");
    } catch (err) {
      const msg = err.response?.data?.message || "Purchase failed";
      setReceiptData({ status: "failed", type: "data", ...payload, error: msg });
      toast.error(msg);
    } finally {
      setLoadingPurchase(false);
    }
  };

  return (
    <ShortFormLayout>
      {/* FULL SCREEN LOADER */}
      {loadingPurchase && (
        <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-black to-blue-900 flex items-center justify-center z-50">
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-cyan-400 animate-spin mx-auto mb-4" />
            <p className="text-cyan-300 text-lg font-medium">Delivering your data...</p>
          </div>
        </div>
      )}

      <div className="space-y-8 pb-10">
        {/* PREMIUM HERO HEADER */}
        <div className="text-center py-6  rounded-2xl border border-white/10 backdrop-blur-xl">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            Buy Data Instantly
          </h1>
          <p className="text-gray-300 mt-2 flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            Cheapest Rates • Instant Delivery • 100% Reliable
            <Sparkles className="w-5 h-5 text-yellow-400" />
          </p>
        </div>

        {/* STICKY INPUT SECTION */}
        <div className="sticky top-0 z-40 bg-black/80 backdrop-blur-2xl border-b border-white/10 pb-6 space-y-6 rounded-2xl p-6 shadow-2xl">
          {/* PHONE + NETWORK ROW */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* PHONE INPUT - PREMIUM FLOATING LABEL */}
            <div className="relative">
              <input
                type="text"
                placeholder=" "
                value={form.phone}
                onChange={handlePhoneChange}
                className={`peer w-full px-5 py-4 bg-white/5 border ${
                  networkMismatch ? "border-yellow-500/80" : 
                  livePhoneInfo.valid ? "border-cyan-500/80" : "border-white/20"
                } rounded-2xl text-white placeholder-transparent focus:outline-none focus:border-cyan-400 transition-all duration-300 backdrop-blur-xl`}
              />
              <label className="absolute left-5 -top-3 bg-black px-2 text-sm text-gray-400 peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:-top-3 peer-focus:text-cyan-400 transition-all">
                Phone Number
              </label>
              {livePhoneInfo.detected && (
                <div className="absolute right-3 top-3.5 flex items-center gap-2">
                  <img src={NETWORK_LOGOS[livePhoneInfo.detected]} className="w-6 h-6 rounded" />
                  {networkLocked && <Lock className="w-4 h-4 text-cyan-400" />}
                </div>
              )}
              <p className={`mt-2 text-xs ${livePhoneInfo.valid ? "text-cyan-400" : "text-red-400"} flex items-center gap-1`}>
                {livePhoneInfo.message}
              </p>
            </div>

            {/* NETWORK SELECTOR - GLASS CARDS */}
            <div>
              <p className="text-sm text-gray-400 mb-3">Select Network {networkLocked && "(Locked)"}</p>
              <div className="grid grid-cols-4 gap-3">
                {["mtn", "airtel", "glo", "9mobile"].map((network) => (
                  <button
                    key={network}
                    onClick={() => handleNetworkSelect(network)}
                    className={`group relative p-4 rounded-2xl overflow-hidden transition-all duration-300 ${
                      form.network === network
                        ? "ring-2 ring-cyan-400 shadow-2xl shadow-cyan-500/30"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition" />
                    <img src={NETWORK_LOGOS[network]} className="w-10 h-10 mx-auto relative z-10" />
                    <p className="text-xs text-center mt-2 font-medium uppercase tracking-wider">
                      {network}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CATEGORY TABS - GLOWING */}
          <div className="flex flex-wrap gap-3 justify-center">
            {["SME2","SME","GIFTING","CORPORATE","REGULAR"].map((cat) => {
              const style = CATEGORY_STYLES[cat];
              const Icon = style.icon;
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`relative px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 overflow-hidden group ${
                    isActive 
                      ? `${style.bg} ${style.border} ${style.color} shadow-lg ${style.glow} shadow-2xl` 
                      : "bg-white/5 text-gray-400 border border-white/10"
                  }`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-r ${style.gradient} opacity-50 group-hover:opacity-80 transition`} />
                  <span className="relative flex items-center gap-2">
                    {Icon && <Icon className="w-5 h-5" />}
                    {cat}
                    <span className="text-xs opacity-70">
                      ({(groupedPlans[cat] || []).length})
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PLANS GRID - EXACT SAME LAYOUT AS BEFORE */}
        <div className="px-2">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">
              {selectedCategory} Plans
            </h2>
            <p className="text-gray-400">Choose your preferred data bundle</p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {loadingPlans ? (
              [...Array(15)].map((_, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
                  <div className="h-4 bg-white/20 rounded mb-3" />
                  <div className="h-6 bg-white/30 rounded" />
                </div>
              ))
            ) : (
              (groupedPlans[selectedCategory] || []).map(plan => (
                <button
                  key={plan.id}
                  onClick={() => handlePlanClick(plan)}
                  className="group relative p-5 bg-white/5 border border-white/10 rounded-2xl hover:border-cyan-500/50 hover:bg-white/10 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition" />
                  
                  <p className="font-bold text-sm text-white relative z-10">
                    {formatPlanName(plan.name)}
                  </p>
                  <p className="text-xl font-extrabold text-cyan-400 mt-2 relative z-10">
                    ₦{Number(plan.amount).toLocaleString()}
                  </p>

                  {plan.provider === "vtung" && (
                    <div className="absolute top-2 right-2 bg-gradient-to-r from-green-400 to-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                      BEST PRICE
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CONFIRM MODAL - PREMIUM */}
      {showConfirm && selectedPlan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-gray-900 via-purple-900/20 to-black p-8 rounded-3xl border border-white/20 shadow-2xl max-w-md w-full">
            <h3 className="text-2xl font-bold text-white mb-6 text-center">Confirm Purchase</h3>
            
            <div className="space-y-4 text-lg">
              <div className="flex justify-between"><span className="text-gray-400">Phone</span><span className="text-cyan-400 font-bold">{form.phone}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Network</span><span className="text-white font-bold uppercase">{form.network}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Plan</span><span className="text-white">{selectedPlan.name}</span></div>
              <div className="flex justify-between text-2xl font-bold"><span className="text-gray-400">Amount</span><span className="text-cyan-400">₦{selectedPlan.amount}</span></div>
            </div>

            <div className="flex gap-4 mt-8">
              <button 
                onClick={confirmPurchase}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-600 py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-cyan-500/50 transition"
              >
                Confirm & Pay
              </button>
              <button 
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-white/10 border border-white/20 py-4 rounded-2xl font-bold hover:bg-white/20 transition"
              >
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