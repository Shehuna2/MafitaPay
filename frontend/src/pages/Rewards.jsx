import { useEffect, useState, useMemo } from "react";
import client from "../api/client";
import {
  ArrowLeft,
  Lock,
  Unlock,
  Clock,
  Gift,
  Sparkles,
  Filter,
  Award,
  BadgePercent,
  Wallet,
  Smartphone,
  CheckCircle,
} from "lucide-react";
import BonusPopup from "../components/BonusPopup";

export default function Rewards() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [popupBonus, setPopupBonus] = useState(null);
  const [claimingBonusId, setClaimingBonusId] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const filterOptions = [
    { key: "all", label: "All" },
    { key: "welcome", label: "Welcome" },
    { key: "referral", label: "Referral" },
    { key: "promo", label: "Promo" },
    { key: "cashback", label: "Cashback" },
    { key: "deposit", label: "Deposit" },
    { key: "airtime_data", label: "Airtime/Data" },
  ];

  const fetchBonuses = async () => {
    try {
      const res = await client.get("/rewards/");
      setBonuses(res.data);
    } catch (err) {
      console.error("Failed to fetch bonuses:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBonuses();
  }, []);

  // Detect new unlocked bonuses → show popup
  useEffect(() => {
    const unlocked = bonuses.filter((b) => b.status === "unlocked");

    const lastSeen = JSON.parse(localStorage.getItem("last_seen_rewards") || "[]");
    const unseen = unlocked.filter((u) => !lastSeen.includes(u.id));

    if (unseen.length > 0) {
      setPopupBonus(unseen[0]); // show the first new one
      localStorage.setItem("last_seen_rewards", JSON.stringify(unlocked.map((b) => b.id)));
    }
  }, [bonuses]);

  const handleClaimBonus = async (bonusId) => {
    setClaimingBonusId(bonusId);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await client.post(`/rewards/claim/${bonusId}/`);
      
      if (res.data.success) {
        setSuccessMessage(res.data.message);
        
        // Refresh bonuses list to reflect updated status
        await fetchBonuses();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to claim bonus. Please try again.";
      setError(errorMsg);
      
      // Clear error message after 5 seconds
      setTimeout(() => setError(null), 5000);
    } finally {
      setClaimingBonusId(null);
    }
  };

  const filteredBonuses = useMemo(() => {
    if (filter === "all") return bonuses;
    return bonuses.filter((b) => b.bonus_type_name === filter);
  }, [bonuses, filter]);

  const statusColor = {
    locked: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    unlocked: "text-green-400 bg-green-400/10 border-green-400/20",
    used: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    expired: "text-red-400 bg-red-400/10 border-red-400/20",
    reversed: "text-gray-400 bg-gray-400/10 border-gray-400/20",
  };

  const ruleIcon = {
    withdrawal_restricted: <Lock className="w-4 h-4 text-yellow-400" />,
    bills_only: <Smartphone className="w-4 h-4 text-blue-400" />,
    airtime_only: <Smartphone className="w-4 h-4 text-purple-400" />,
  };

  const progressForBonus = (b) => {
    const rules = b.metadata || {};

    const needsDeposit = rules.require_deposit;
    const needsTx = rules.require_transaction;

    const progress = [
      needsDeposit ? (rules.has_deposit ? 1 : 0) : 1,
      needsTx ? (rules.has_transaction ? 1 : 0) : 1,
    ];

    const outOf = progress.length;
    const total = progress.reduce((a, b) => a + b, 0);
    return Math.floor((total / outOf) * 100);
  };

  return (
    <>
      {popupBonus && (
        <BonusPopup bonus={popupBonus} onClose={() => setPopupBonus(null)} />
      )}

      <div className="min-h-screen bg-gray-900 text-white relative">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-gray-900/5 pointer-events-none" />

        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 p-8 rounded-3xl shadow-2xl border border-gray-700/50">
              <Gift className="w-12 h-12 text-indigo-400 animate-pulse mx-auto mb-4" />
              <p className="text-center text-lg text-indigo-300">Loading rewards...</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
            <div className="bg-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-down">
              <CheckCircle className="w-6 h-6 flex-shrink-0" />
              <p className="text-sm font-medium">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
            <div className="bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-down">
              <Gift className="w-6 h-6 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        <div className="relative z-10 px-4 py-6">
          {/* Back */}
          <button
            onClick={() => window.history.back()}
            className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition mb-4"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </button>

          {/* Header */}
          <h1 className="text-3xl font-bold text-indigo-400 flex items-center gap-2 mb-6">
            <Gift className="w-7 h-7" />
            Rewards
          </h1>

          {/* Filter Bar */}
          <div className="flex overflow-x-auto gap-2 pb-3 mb-4 scrollbar-none">
            {filterOptions.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 whitespace-nowrap rounded-xl text-sm border transition ${
                  filter === f.key
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Bonuses List */}
          {filteredBonuses.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Award className="w-16 h-16 mx-auto text-gray-600 mb-3" />
              <p className="text-sm">No rewards found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBonuses.map((b, i) => (
                <div
                  key={b.id}
                  className="bg-gray-800/70 border border-gray-700/40 rounded-xl p-5 backdrop-blur-sm animate-fade-in-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Top Section */}
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-semibold text-indigo-300 capitalize">
                      {b.bonus_type_name.replace("_", " ")}
                    </h3>

                    <span
                      className={`px-3 py-1 rounded-full text-xs border capitalize ${statusColor[b.status]}`}
                    >
                      {b.status}
                    </span>
                  </div>

                  <p className="text-4xl font-bold text-green-400">₦{b.amount}</p>

                  {b.description && (
                    <p className="text-xs text-gray-400 mt-1 mb-3">{b.description}</p>
                  )}

                  {/* Rules Section */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {b.metadata?.withdrawal_restricted && (
                      <div className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-1 rounded-md">
                        <Lock className="w-3 h-3" /> Locked to wallet
                      </div>
                    )}

                    {b.metadata?.bills_only && (
                      <div className="flex items-center gap-1 text-xs text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2 py-1 rounded-md">
                        <Smartphone className="w-3 h-3" /> Bills Only
                      </div>
                    )}

                    {b.metadata?.airtime_only && (
                      <div className="flex items-center gap-1 text-xs text-purple-400 bg-purple-400/10 border border-purple-400/20 px-2 py-1 rounded-md">
                        <Smartphone className="w-3 h-3" /> Airtime/Data Only
                      </div>
                    )}
                  </div>

                  {/* Locked Bonus Progress Bar */}
                  {b.status === "locked" && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-400 mb-1">Unlock progress</p>

                      <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full transition-all"
                          style={{
                            width: `${progressForBonus(b)}%`,
                          }}
                        ></div>
                      </div>

                      <p className="text-xs text-gray-500 mt-1">
                        {progressForBonus(b)}% complete
                      </p>
                    </div>
                  )}

                  {/* Claim Button for Unlocked Bonuses */}
                  {b.status === "unlocked" && (
                    <button
                      onClick={() => handleClaimBonus(b.id)}
                      disabled={claimingBonusId === b.id}
                      className="w-full mt-3 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {claimingBonusId === b.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Claiming...
                        </>
                      ) : (
                        <>
                          <Gift className="w-4 h-4" />
                          Claim Bonus
                        </>
                      )}
                    </button>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
                    <span className="flex items-center gap-1">
                      {b.status === "locked" ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {b.status === "locked" ? "Awaiting requirements" : b.status === "unlocked" ? "Ready to claim" : "Activated"}
                    </span>

                    {b.expires_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires {new Date(b.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.35s ease-out; }
        
        @keyframes slide-down {
          from { opacity: 0; transform: translate(-50%, -100%); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-down { animation: slide-down 0.35s ease-out; }
      `}</style>
    </>
  );
}
