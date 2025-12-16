import { useEffect, useState, useMemo } from "react";
import client from "../api/client";
import {
  ArrowLeft,
  Lock,
  Unlock,
  Clock,
  Gift,
  Award,
  Smartphone,
  Star,
  Crown,
} from "lucide-react";
import BonusPopup from "../components/BonusPopup";
import Confetti from "react-confetti";

function formatCurrency(amount) {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `₦${n.toLocaleString()}`;
  }
}

function formatDate(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  return d.toLocaleString();
}

function statusLabel(status) {
  if (!status) return "unknown";
  switch (status.toLowerCase()) {
    case "locked":
      return "Locked";
    case "unlocked":
      return "Unlocked";
    case "used":
      return "Used";
    case "expired":
      return "Expired";
    case "reversed":
      return "Reversed";
    default:
      return status;
  }
}

export default function Rewards() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [popupBonus, setPopupBonus] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [totalRewards, setTotalRewards] = useState(0);
  const [error, setError] = useState(null);
  const [claimingIds, setClaimingIds] = useState([]); // track which bonus(es) being claimed

  const filterOptions = [
    { key: "all", label: "All" },
    { key: "welcome", label: "Welcome" },
    { key: "referral", label: "Referral" },
    { key: "promo", label: "Promo" },
    { key: "cashback", label: "Cashback" },
    { key: "deposit", label: "Deposit" },
  ];

  const loadBonuses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.get("/rewards/");
      const payload = res?.data;
      const list = Array.isArray(payload) ? payload : payload?.results ?? [];
      const normalized = list.map((b) => ({
        ...b,
        amount: Number(b.amount ?? 0),
      }));
      setBonuses(normalized);

      const total = normalized.reduce((sum, b) => {
        const s = (b.status || "").toLowerCase();
        if (s === "unlocked" || s === "used") {
          return sum + (Number(b.amount) || 0);
        }
        return sum;
      }, 0);
      setTotalRewards(total);
    } catch (err) {
      console.error("Failed to load rewards", err);
      setError(err?.response?.data || err?.message || "Failed to load rewards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBonuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlocked = bonuses.filter((b) => (b.status || "").toLowerCase() === "unlocked");
    const lastSeen = JSON.parse(localStorage.getItem("seen_rewards") || "[]");
    const unseen = unlocked.find((b) => !lastSeen.includes(b.id));

    if (unseen) {
      setPopupBonus(unseen);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
      localStorage.setItem(
        "seen_rewards",
        JSON.stringify(unlocked.map((b) => b.id))
      );
    }
  }, [bonuses]);

  const filteredBonuses = useMemo(() => {
    if (filter === "all") return bonuses;
    return bonuses.filter((b) => {
      const typeName = b.bonus_type_name || (b.bonus_type && b.bonus_type.name) || "";
      return (typeName || "").toLowerCase() === filter.toLowerCase();
    });
  }, [bonuses, filter]);

  const handleClaim = async (bonus) => {
    if (!bonus || !bonus.id) return;
    // avoid double clicks
    if (claimingIds.includes(bonus.id)) return;
    setClaimingIds((s) => [...s, bonus.id]);

    try {
      // axios client likely uses baseURL '/api' so path is '/rewards/{id}/claim/'
      const res = await client.post(`/rewards/${bonus.id}/claim/`);
      // on success refresh list
      await loadBonuses();
      // show popup with updated bonus (optional)
      setPopupBonus(res.data);
      // small confetti to celebrate claim
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2500);
    } catch (err) {
      console.error("Claim failed", err);
      const message = err?.response?.data?.detail || err?.message || "Failed to claim bonus";
      // basic UI feedback: set error (you may replace with a toast)
      setError(message);
      // optionally show popup with error
      alert(message);
    } finally {
      setClaimingIds((s) => s.filter((id) => id !== bonus.id));
    }
  };

  return (
    <>
      {showConfetti && (
        <Confetti width={window.innerWidth} height={window.innerHeight} />
      )}
      {popupBonus && (
        <BonusPopup bonus={popupBonus} onClose={() => setPopupBonus(null)} />
      )}

      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white">
        {/* Sticky Premium Header */}
        <div className="sticky top-0 z-30 bg-black/70 backdrop-blur-xl border-b border-white/5">
          <div className="px-4 pt-4 pb-3 max-w-2xl mx-auto">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-sm text-violet-400 mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/10 border border-violet-500/20 p-4">
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6 text-amber-400" />
                <h1 className="text-xl font-bold">Premium Rewards</h1>
              </div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-400">
                {formatCurrency(totalRewards)}
              </p>
              <p className="text-xs text-gray-400">Unlocked value</p>
            </div>
          </div>

          {/* Mobile-first filter chips */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
            {filterOptions.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-full text-xs font-medium border transition ${
                  filter === f.key
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-300"
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={loadBonuses}
              className="px-3 py-2 rounded-full text-xs font-medium border bg-gray-800 border-gray-700 text-gray-300 ml-2"
              title="Refresh"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-6 max-w-2xl mx-auto space-y-5">
          {loading ? (
            <div className="text-center text-gray-400 py-20">
              <Gift className="w-10 h-10 mx-auto mb-3 animate-pulse" />
              Loading rewards…
            </div>
          ) : error ? (
            <div className="text-center py-20 text-rose-400">
              <Award className="w-12 h-12 mx-auto mb-3" />
              <p>Error loading rewards</p>
              <pre className="text-xs text-red-300">{String(error)}</pre>
              <button
                onClick={loadBonuses}
                className="mt-3 px-4 py-2 rounded bg-violet-600 text-white text-sm"
              >
                Retry
              </button>
            </div>
          ) : filteredBonuses.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Award className="w-12 h-12 mx-auto mb-3" />
              No rewards yet
            </div>
          ) : (
            filteredBonuses.map((b) => {
              const typeName =
                (b.bonus_type_name &&
                  String(b.bonus_type_name).replace("_", " ")) ||
                (b.bonus_type && (b.bonus_type.display_name || b.bonus_type.name)) ||
                "bonus";

              const isClaiming = claimingIds.includes(b.id);
              const isUnlocked = String(b.status || "").toLowerCase() === "unlocked";

              return (
                <div
                  key={b.id}
                  className="rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10 p-5 shadow-lg active:scale-[0.99] transition"
                >
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold capitalize flex gap-2">
                      <Star className="w-4 h-4 text-amber-400" />
                      {typeName}
                    </h3>
                    <span className="text-xs px-3 py-1 rounded-full bg-black/40 border border-white/10">
                      {statusLabel(b.status)}
                    </span>
                  </div>

                  <p className="text-3xl font-extrabold text-emerald-400 mt-2">
                    {formatCurrency(b.amount)}
                  </p>

                  {b.description && (
                    <p className="text-sm text-gray-400 mt-2">{b.description}</p>
                  )}

                  {/* metadata / trigger info */}
                  {b.metadata && (
                    <div className="text-xs text-gray-400 mt-2">
                      {b.metadata.trigger_event && (
                        <div>
                          <strong>Trigger:</strong> {b.metadata.trigger_event}
                        </div>
                      )}
                      {b.metadata.trigger_context && (
                        <div>
                          <strong>Context:</strong>{" "}
                          <span className="break-all">
                            {JSON.stringify(b.metadata.trigger_context)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs text-gray-400 mt-4">
                    <span className="flex items-center gap-1">
                      {String(b.status || "").toLowerCase() === "locked" ? (
                        <Lock className="w-3 h-3 text-amber-400" />
                      ) : (
                        <Unlock className="w-3 h-3 text-emerald-400" />
                      )}
                      {statusLabel(b.status)}
                    </span>

                    {b.expires_at ? (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-rose-400" />
                        Expires {new Date(b.expires_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">No expiry</span>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setPopupBonus(b)}
                      className="px-3 py-2 rounded bg-violet-600 text-white text-xs"
                    >
                      View details
                    </button>

                    {isUnlocked && (
                      <button
                        onClick={() => handleClaim(b)}
                        disabled={isClaiming}
                        className={`px-3 py-2 rounded text-xs ${
                          isClaiming
                            ? "bg-gray-600 text-gray-200"
                            : "bg-emerald-500 text-black"
                        }`}
                      >
                        {isClaiming ? "Claiming..." : "Claim"}
                      </button>
                    )}

                    {!isUnlocked && (
                      <button
                        onClick={() => alert("This reward is not claimable yet")}
                        className="px-3 py-2 rounded bg-gray-800 text-gray-300 text-xs"
                      >
                        {String(b.status || "").toLowerCase() === "used" ? "Claimed" : "Not claimable"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}