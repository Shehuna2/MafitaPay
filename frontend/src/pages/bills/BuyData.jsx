// src/pages/BuyData.jsx → FULL MERGED 2025 VERSION (VTU.ng + VTpass)
import { useEffect, useState, useRef } from "react";
import { Loader2, CheckCircle, XCircle, Zap, Crown, Gift, Shield } from "lucide-react";
import client from "../../api/client";
import { toast } from "react-toastify";
import Receipt from "../../components/Receipt";
import ShortFormLayout from "../../layouts/ShortFormLayout";

/* ----------------------------------------------------
   NETWORK LOGOS + CATEGORY STYLES
---------------------------------------------------- */
const NETWORK_LOGOS = {
  mtn: "/networks/mtn.png",
  airtel: "/networks/airtel.png",
  glo: "/networks/glo.png",
  "9mobile": "/networks/9mobile.png",
};

const CATEGORY_STYLES = {
  SME2: { color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/50", icon: Crown, label: "SME 2" },
  SME: { color: "text-green-400", bg: "bg-green-500/20", border: "border-green-500/50", icon: Zap, label: "SME" },
  GIFTING: { color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/50", icon: Gift, label: "Gifting" },
  CORPORATE: { color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/50", icon: Shield, label: "Corporate" },
  REGULAR: { color: "text-gray-400", bg: "bg-gray-700/30", border: "border-gray-600", icon: null, label: "Regular" },
};

/* ----------------------------------------------------
   PHONE DETECTION
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
  return Object.keys(NETWORK_PREFIXES).find(n => NETWORK_PREFIXES[n].includes(prefix)) || null;
};

const validateNigerianPhone = (phone) => {
  const p = normalizePhone(phone);
  if (!/^0\d{10}$/.test(p)) return { valid: false, normalized: p, detected: null };
  const detected = detectNetwork(p);
  return { valid: !!detected, normalized: p, detected };
};

// FORMAT PLAN NAME CLEANLY → "1GB - 7 DAYS"
const formatPlanName = (rawName) => {
  if (!rawName) return rawName;

  rawName = rawName.toUpperCase();

  const sizeMatch = rawName.match(/(\d+(\.\d+)?)\s*(GB|MB)/);
  const size = sizeMatch ? sizeMatch[0] : null;

  const daysMatch = rawName.match(/(\d+)\s*DAY/);
  const days = daysMatch ? `${daysMatch[1]} DAYS` : null;

  if (size && days) return `${size} - ${days}`;
  if (size) return size;
  return rawName;
};




/* ----------------------------------------------------
   CACHING
---------------------------------------------------- */
const CACHE_KEY = (network) => `mafitapay_data_plans_${network}_v3`;

/* ----------------------------------------------------
   MAIN COMPONENT
---------------------------------------------------- */
export default function BuyData() {
  const [form, setForm] = useState({ phone: "", network: "mtn", variation_id: "" });
  const [networkLocked, setNetworkLocked] = useState(false);
  const [plans, setPlans] = useState([]);
  const [groupedPlans, setGroupedPlans] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("SME2");
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [receiptData, setReceiptData] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const modalRef = useRef(null);

  const resetForm = () => {
    setForm({ phone: "", network: "mtn", variation_id: "" });
    setNetworkLocked(false);
  };

  /* ----------------------------------------------------
     LOAD PLANS (VTU.ng + VTpass merged)
  ---------------------------------------------------- */
  useEffect(() => {
    let mounted = true;
    const loadPlans = async () => {
      setLoadingPlans(true);
      const cacheKey = CACHE_KEY(form.network);

      // Load from cache first
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

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), grouped, plans: flat }));
      } catch (err) {
        console.error("Failed to load plans:", err);
        toast.error("Using cached plans");
      } finally {
        if (mounted) setLoadingPlans(false);
      }
    };

    loadPlans();
    return () => { mounted = false };
  }, [form.network]);

  /* ----------------------------------------------------
     Auto-select first available category
  ---------------------------------------------------- */
  useEffect(() => {
    if (!loadingPlans && Object.keys(groupedPlans).length > 0) {
      const available = ["SME2","SME","GIFTING","CORPORATE","REGULAR"].find(cat => groupedPlans[cat]?.length > 0);
      if (available && selectedCategory !== available) {
        setSelectedCategory(available);
      }
    }
  }, [groupedPlans, loadingPlans, selectedCategory]);

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    const detected = detectNetwork(value);
    setForm(prev => ({
      ...prev,
      phone: value,
      network: !networkLocked && detected ? detected : prev.network
    }));
  };

  const handleNetworkSelect = (network) => {
    setNetworkLocked(true);
    setForm(prev => ({ ...prev, network }));
  };

  const handlePlanClick = (plan) => {
    const { valid, detected } = validateNigerianPhone(form.phone);
    if (!valid) return toast.error("Invalid phone number");
    if (detected !== form.network) return toast.error(`This number is ${detected.toUpperCase()}, not ${form.network.toUpperCase()}`);

    setForm(prev => ({ ...prev, variation_id: plan.id }));
    setShowConfirm(true);
  };

  const selectedPlan = plans.find(p => p.id === form.variation_id);

  const confirmPurchase = async () => {
    setShowConfirm(false);
    setLoading(true);

    const { valid, normalized, detected } = validateNigerianPhone(form.phone);
    if (!valid) return toast.error("Invalid phone number");
    if (detected !== form.network) return toast.error(`This number is ${detected.toUpperCase()}, not ${form.network.toUpperCase()}`);
    if (!selectedPlan) return toast.error("Select a valid plan");

    try {
      const payload = {
        phone: normalized,
        network: form.network,
        variation_id: form.variation_id,
        amount: selectedPlan.amount,
      };
      const res = await client.post("/bills/data/", payload);

      toast.success("Data delivered instantly!");
      setReceiptData({
        status: "success",
        type: "data",
        ...payload,
        plan: selectedPlan.name,
        provider: selectedPlan.provider.toUpperCase(),
        amount: selectedPlan.amount
      });

    } catch (err) {
      const msg = err.response?.data?.message || "Purchase failed";
      toast.error(msg);
      setReceiptData({
        status: "failed",
        type: "data",
        ...payload,
        error: msg
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ShortFormLayout title="Buy Data - Cheapest in Nigeria">
      {loading && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <Loader2 className="w-16 h-16 text-indigo-400 animate-spin" />
        </div>
      )}

      <div className="space-y-5">
        {/* Phone + Network */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-xs text-gray-400">Phone Number</label>
            <input
              type="text"
              placeholder="0803..."
              value={form.phone}
              onChange={handlePhoneChange}
              className="w-full mt-1 bg-gray-800/70 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>
          <div className="w-full sm:w-80">
            <label className="text-xs text-gray-400">Network</label>
            <div className="mt-1 bg-gray-800/70 border border-gray-700 rounded-xl p-3 flex justify-around">
              {["mtn", "airtel", "glo", "9mobile"].map(network => (
                <button
                  key={network}
                  type="button"
                  onClick={() => handleNetworkSelect(network)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 ${
                    form.network === network
                      ? "bg-indigo-600/30 border-2 border-indigo-500 scale-105 shadow-lg"
                      : "border border-transparent hover:bg-gray-700/50 hover:scale-105"
                  }`}
                >
                  <img src={NETWORK_LOGOS[network]} alt={network.toUpperCase()} className="w-10 h-10 sm:w-12 sm:h-12" />
                  <span className="text-xs text-white font-medium">{network.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {["SME2","SME","GIFTING","CORPORATE","REGULAR"].map(cat => {
            const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES.REGULAR;
            const Icon = style.icon;
            const count = (groupedPlans[cat] || []).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  selectedCategory === cat
                    ? `${style.bg} ${style.border} ${style.color} shadow-lg shadow-current/20`
                    : "bg-gray-800/60 border border-gray-700 text-gray-400 hover:bg-gray-700/80"
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {style.label}
                <span className="ml-1 text-xs opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Plans */}
        <div>
          <p className="text-xs text-gray-400 mb-3">Available Plans ({selectedCategory})</p>
          <div className="max-h-96 overflow-y-auto">
            <div className="
                grid 
                grid-cols-3         
                sm:grid-cols-3      
                md:grid-cols-4      
                lg:grid-cols-5      
                gap-2 sm:gap-3
              ">

              {loadingPlans ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-gray-700 rounded mb-2"></div>
                    <div className="h-3 bg-gray-700 rounded w-20"></div>
                  </div>
                ))
              ) : (
                (groupedPlans[selectedCategory] || []).map(plan => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => handlePlanClick(plan)}
                    className="
                      relative p-3 
                      rounded-lg text-left 
                      transition-all
                      border border-gray-700 
                      bg-gray-800/60 
                      hover:border-indigo-500/50 
                      hover:shadow-md hover:shadow-indigo-500/20
                      flex flex-col gap-1
                    "
                    style={{ minHeight: "70px" }}
                  >
                    {/* Compact name */}
                    <p className="font-semibold text-[12px] leading-tight text-white">
                      {formatPlanName(plan.name)}
                    </p>

                    {/* Compact price */}
                    <p className="text-[11px] font-bold text-indigo-300">
                      ₦{Number(plan.amount).toLocaleString()}
                    </p>

                    {/* Cheaper tag */}
                    {plan.provider === "vtung" && (
                      <span className="absolute top-1 right-1 text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
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

      {/* Confirmation Modal */}
      {showConfirm && selectedPlan && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirm(false)}>
          <div ref={modalRef} className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">Confirm Purchase</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Phone:</span> <span>{form.phone}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Plan:</span> <span className="font-bold">{selectedPlan.name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Price:</span> <span className="text-xl font-bold text-indigo-400">₦{selectedPlan.amount}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Provider:</span> <span className="text-green-400 font-bold">{selectedPlan.provider === "vtung" ? "VTU.ng" : "VTpass"}</span></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={confirmPurchase} className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded-xl font-bold">Confirm</button>
              <button onClick={() => setShowConfirm(false)} className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-xl font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <Receipt data={receiptData} onClose={() => { setReceiptData(null); resetForm(); }} />
    </ShortFormLayout>
  );
}
