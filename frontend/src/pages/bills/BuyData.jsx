// src/pages/BuyData.jsx — FULL MERGED + FULL NUMBER VALIDATION FIX (2025)
import { useEffect, useState } from "react";
import { Loader2, Zap, Crown, Gift, Shield } from "lucide-react";
import client from "../../api/client";
import { toast } from "react-toastify";
import Receipt from "../../components/Receipt";
import ShortFormLayout from "../../layouts/ShortFormLayout";
import PINVerificationModal from "../../components/PIN/PINVerificationModal";
import { usePIN } from "../../hooks/usePIN";

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
   PHONE DETECTION — EXACT v6 ENGINE
---------------------------------------------------- */
const NETWORK_PREFIXES = {
  mtn: ["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916"],
  airtel: ["0802","0808","0708","0812","0701","0902","0907","0901","0912"],
  glo: ["0805","0807","0705","0815","0811","0905"],
  "9mobile": ["0809","0817","0818","0908","0909"],
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
  return Object.keys(NETWORK_PREFIXES).find(n => NETWORK_PREFIXES[n].includes(prefix)) || null;
};

const validateNigerianPhone = (phone) => {
  const normalized = normalizePhone(phone);
  if (!/^0\d{10}$/.test(normalized)) return { valid: false, normalized, detected: null };
  const detected = detectNetwork(normalized);
  return { valid: !!detected, normalized, detected };
};

/* ----------------------------------------------------
   FORMAT PLAN NAME
---------------------------------------------------- */
const formatPlanName = (rawName) => {
  if (!rawName) return rawName;

  rawName = rawName.toUpperCase();
  const size = rawName.match(/(\d+(\.\d+)?)\s*(GB|MB)/)?.[0] || null;
  const days = rawName.match(/(\d+)\s*DAY/)?.[1]
    ? rawName.match(/(\d+)\s*DAY/)[1] + " DAYS"
    : null;

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

  const [groupedPlans, setGroupedPlans] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("SME2");

  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [receiptData, setReceiptData] = useState(null);

  // PIN verification states
  const [showPINModal, setShowPINModal] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const { pinStatus } = usePIN();

  const [livePhoneInfo, setLivePhoneInfo] = useState({
    normalized: "",
    detected: null,
    valid: false,
    message: ""
  });

  const resetForm = () => {
    setForm({ phone: "", network: "mtn", variation_id: "" });
    setNetworkLocked(false);
    setLivePhoneInfo({ normalized: "", detected: null, valid: false, message: "" });
  };

  /* ----------------------------------------------------
     LOAD PLANS
  ---------------------------------------------------- */
  useEffect(() => {
    let mounted = true;
    const loadPlans = async () => {
      setLoadingPlans(true);
      const cacheKey = CACHE_KEY(form.network);

      // Load cached first
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached?.grouped) {
        setGroupedPlans(cached.grouped);
      }

      try {
        const res = await client.get(`/bills/data/plans/?network=${form.network}`);
        const grouped = res.data.plans || {};

        if (mounted) {
          setGroupedPlans(grouped);
        }

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), grouped }));
      } catch {
        toast.error("Using cached plans");
      } finally {
        if (mounted) setLoadingPlans(false);
      }
    };

    loadPlans();
    return () => (mounted = false);
  }, [form.network]);


  /* ----------------------------------------------------
     Auto-select first available category
  ---------------------------------------------------- */
  useEffect(() => {
    if (!loadingPlans && Object.keys(groupedPlans).length > 0) {
      const first = ["SME2", "SME", "GIFTING", "CORPORATE", "REGULAR"]
        .find(c => groupedPlans[c]?.length > 0);
      if (first) setSelectedCategory(first);
    }
  }, [groupedPlans, loadingPlans]);


  /* ----------------------------------------------------
     PHONE INPUT — EXACT v6 LOGIC
  ---------------------------------------------------- */
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

      if (detected) {
        if (networkLocked && detected !== prev.network) {
          setNetworkLocked(false);
          newNetwork = detected;
        }
        if (!networkLocked) newNetwork = detected;
      }

      return { ...prev, phone: value, network: newNetwork };
    });
  };

  const handleNetworkSelect = (network) => {
    setNetworkLocked(true);
    setForm(prev => ({ ...prev, network }));
  };


  /* ----------------------------------------------------
     PLAN CLICK - Show PIN Modal Directly
  ---------------------------------------------------- */
  const handlePlanClick = (plan) => {
    const { valid, detected } = validateNigerianPhone(form.phone);
    if (!valid) return toast.error("Invalid phone number");
    if (detected !== form.network)
      return toast.error(`This number belongs to ${detected.toUpperCase()}`);

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

    // Store pending transaction and show PIN modal
    setPendingTransaction({
      phone: validateNigerianPhone(form.phone).normalized,
      network: form.network,
      variation_id: plan.id,
      amount: plan.amount,
      plan: plan
    });
    
    setShowPINModal(true);
  };

  /* ----------------------------------------------------
     PROCESS PURCHASE - After PIN Verified
  ---------------------------------------------------- */
  const processPurchase = async () => {
    if (!pendingTransaction) return;
    
    setLoading(true);

    const payload = {
      phone: pendingTransaction.phone,
      network: pendingTransaction.network,
      variation_id: pendingTransaction.variation_id,
      amount: pendingTransaction.amount,
    };

    try {
      await client.post("/bills/data/", payload);

      toast.success("Data delivered instantly!");

      setReceiptData({
        status: "success",
        type: "data",
        ...payload,
        plan: pendingTransaction.plan.name,
        provider: pendingTransaction.plan.provider
      });

      setPendingTransaction(null);
    } catch (err) {
      const msg = err.response?.data?.message || "Purchase failed";

      setReceiptData({
        status: "failed",
        type: "data",
        ...payload,
        error: msg
      });

      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };


  /* ----------------------------------------------------
     UI
  ---------------------------------------------------- */
  return (
    <ShortFormLayout>

      {loading && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <Loader2 className="w-16 h-16 text-indigo-400 animate-spin" />
        </div>
      )}

      <div className="space-y-5">

        {/* Phone + Network */}
        <div className="flex flex-col sm:flex-row gap-4">
          
          

          {/* NETWORK SELECTOR */}
          <div className="w-full sm:w-80">
            <label className="text-xs text-gray-400">Network</label>
            <div className="mt-1 bg-gray-800/70 border border-gray-700 rounded-xl p-3 flex justify-around">
              {["mtn", "airtel", "glo", "9mobile"].map(network => (
                <button
                  key={network}
                  type="button"
                  onClick={() => handleNetworkSelect(network)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                    form.network === network
                      ? "bg-indigo-600/30 border-2 border-indigo-500 scale-105 shadow-lg"
                      : "border border-transparent hover:bg-gray-700/50 hover:scale-105"
                  }`}
                >
                  <img src={NETWORK_LOGOS[network]} className="w-10 h-10" />
                  <span className="text-xs text-white">{network.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* CATEGORY TABS */}
        <div className="flex flex-wrap gap-2">
          {["SME2","SME","GIFTING","CORPORATE","REGULAR"].map(cat => {
            const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES.REGULAR;
            const Icon = style.icon;
            const count = (groupedPlans[cat] || []).length;

            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  selectedCategory === cat
                    ? `${style.bg} ${style.border} ${style.color} shadow-lg`
                    : "bg-gray-800/60 border border-gray-700 text-gray-400 hover:bg-gray-700/80"
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {style.label}
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
        
        {/* PHONE INPUT */}
          <div className="flex-1">
            <label className="text-xs text-gray-400">Phone Number</label>
            <input
              type="number"
              placeholder="0803..."
              value={form.phone}
              onChange={handlePhoneChange}
              className={`w-full mt-1 bg-gray-800/70 rounded-xl px-4 py-3 text-gray-400
                border border-indigo-500/30 focus:border-indigo-400 focus:shadow-[0_0_8px_#a78bfa] outline-none
                ${
                  form.phone.length === 0
                    ? "border-gray-700"
                    : livePhoneInfo.detected && livePhoneInfo.detected !== form.network
                    ? "border-indigo-400 shadow-[0_0_8px_#facc15]"
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

            {/* DETECTED NETWORK DISPLAY */}
            {livePhoneInfo.detected && (
              <div className="mt-1 flex items-center gap-2 text-green-400 text-xs">
                <img src={NETWORK_LOGOS[livePhoneInfo.detected]} className="w-4 h-4" />
                <span>Detected: {livePhoneInfo.detected.toUpperCase()}</span>
              </div>
            )}
          </div>

        {/* PLANS */}
        <div>
          <p className="text-xs text-gray-400 mb-3">Available Plans ({selectedCategory})</p>
          <div className="max-h-96 overflow-y-auto">
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">

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
                    onClick={() => handlePlanClick(plan)}
                    className="relative p-3 rounded-lg bg-gray-800/60 border border-gray-700 hover:border-indigo-500/50 hover:shadow-md"
                  >
                    <p className="font-semibold text-[12px] text-white">{formatPlanName(plan.name)}</p>
                    <p className="text-[11px] font-bold text-indigo-300">
                      ₦{Number(plan.amount).toLocaleString()}
                    </p>

                    {plan.provider === "vtung" && (
                      <span className="absolute top-1 right-1 text-[9px] bg-green-500/20 text-green-400 px-1 rounded">
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

      <Receipt data={receiptData} onClose={() => { setReceiptData(null); resetForm(); }} />

      {/* PIN Verification Modal */}
      <PINVerificationModal
        isOpen={showPINModal}
        onClose={() => {
          setShowPINModal(false);
          setPendingTransaction(null);
        }}
        onVerified={processPurchase}
        transactionDetails={pendingTransaction ? {
          type: "Data Purchase",
          amount: pendingTransaction.amount,
          recipient: `${pendingTransaction.network.toUpperCase()} - ${pendingTransaction.phone}`,
          description: `${pendingTransaction.plan.name || 'Data Bundle'}`
        } : null}
      />

    </ShortFormLayout>
  );
}
