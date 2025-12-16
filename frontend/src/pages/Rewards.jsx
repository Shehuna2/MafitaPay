import { useEffect, useMemo, useState } from "react";
import client from "../api/client";
import {
  ArrowLeft,
  Lock,
  Unlock,
  Clock,
  Crown,
  Sparkles,
  Gift,
} from "lucide-react";
import Confetti from "react-confetti";

/* ---------------- helpers ---------------- */
const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const statusStyles = (status = "") => {
  switch (status.toLowerCase()) {
    case "unlocked":
      return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/30";
    case "used":
      return "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-400/30";
    case "locked":
      return "bg-amber-500/15 text-amber-400 ring-1 ring-amber-400/30";
    case "expired":
      return "bg-rose-500/15 text-rose-400 ring-1 ring-rose-400/30";
    default:
      return "bg-white/10 text-gray-300";
  }
};

export default function Rewards() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [activeBonus, setActiveBonus] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const filters = ["all", "welcome", "referral", "promo", "cashback", "deposit"];

  /* ------------ fetch ------------ */
  const loadBonuses = async () => {
    setLoading(true);
    const res = await client.get("/rewards/");
    setBonuses(Array.isArray(res.data) ? res.data : res.data?.results ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadBonuses();
  }, []);

  /* ------------ filter ------------ */
  const filteredBonuses = useMemo(() => {
    if (filter === "all") return bonuses;
    return bonuses.filter(
      (b) =>
        (b.bonus_type_name || "").toLowerCase().replace("_", "") === filter
    );
  }, [bonuses, filter]);

  /* ------------ grouping ------------ */
  const groupedBonuses = useMemo(() => {
    const unlocked = [];
    const locked = [];
    const history = [];

    filteredBonuses.forEach((b) => {
      const s = (b.status || "").toLowerCase();
      if (s === "unlocked") unlocked.push(b);
      else if (s === "locked") locked.push(b);
      else history.push(b);
    });

    return [
      { title: "Ready to Claim", data: unlocked },
      { title: "Locked Rewards", data: locked },
      { title: "History", data: history },
    ].filter((g) => g.data.length);
  }, [filteredBonuses]);

  /* ------------ totals ------------ */
  const totalValue = useMemo(
    () =>
      bonuses
        .filter((b) =>
          ["unlocked", "used"].includes((b.status || "").toLowerCase())
        )
        .reduce((s, b) => s + Number(b.amount || 0), 0),
    [bonuses]
  );

  /* ------------ claim ------------ */
  const claimBonus = async () => {
    if (!activeBonus) return;
    setClaiming(true);
    try {
      await client.post(`/rewards/${activeBonus.id}/claim/`);
      await client.post("/wallet/sync/").catch(() => {});
      await loadBonuses();
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
      setActiveBonus(null);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <>
      {showConfetti && (
        <Confetti
          width={Math.min(window.innerWidth, 480)}
          height={window.innerHeight}
        />
      )}

      <div className="min-h-screen text-white pb-32 overflow-x-hidden">
        {/* ---------------- header ---------------- */}
        <header className="sticky top-0 z-30 border-b border-white/5">
          <div className="px-4 pt-4 pb-5 sm:max-w-xl sm:mx-auto">
            <button
              onClick={() => history.back()}
              className="flex items-center gap-2 text-sm text-violet-400"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <h1 className="text-sm font-semibold">Rewards</h1>
              </div>

              <p className="mt-3 text-2xl sm:text-3xl font-extrabold text-emerald-400">
                {formatCurrency(totalValue)}
              </p>
              <p className="text-xs text-gray-400">Total unlocked value</p>
            </div>
          </div>

          {/* filters */}
          <div className="px-4 pb-3">
            <div className="flex justify-center gap-2 min-w-max">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-3 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${
                    filter === f
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-gray-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ---------------- content ---------------- */}
        <main className="px-4 mt-6 space-y-8 sm:max-w-xl sm:mx-auto">
          {loading &&
            [...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-2xl bg-white/5 animate-pulse"
              />
            ))}

          {!loading &&
            groupedBonuses.map((group) => (
              <section key={group.title} className="space-y-4">
                <h3 className="text-xs uppercase tracking-widest text-gray-500">
                  {group.title}
                </h3>

                {group.data.map((b) => {
                  const unlocked =
                    (b.status || "").toLowerCase() === "unlocked";

                  return (
                    <div
                      key={b.id}
                      className="relative rounded-2xl bg-white/5 border border-white/10 p-4 overflow-hidden"
                    >
                      {unlocked && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] rounded-full bg-emerald-500 text-black font-semibold">
                          Ready
                        </span>
                      )}

                      <div className="flex justify-between items-start">
                        <h4 className="text-sm font-semibold flex gap-1">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          {b.bonus_type_name?.replace("_", " ") || "Bonus"}
                        </h4>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${statusStyles(
                            b.status
                          )}`}
                        >
                          {b.status}
                        </span>
                      </div>

                      <p className="text-xl font-bold text-emerald-400 mt-2">
                        {formatCurrency(b.amount)}
                      </p>

                      {b.description && (
                        <p className="text-xs text-gray-400 mt-1">
                          {b.description}
                        </p>
                      )}

                      <div className="flex justify-between text-[10px] text-gray-400 mt-3">
                        <span className="flex items-center gap-1">
                          {unlocked ? (
                            <Unlock className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Lock className="w-3 h-3 text-amber-400" />
                          )}
                          {b.status}
                        </span>

                        {b.expires_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-rose-400" />
                            {new Date(b.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => unlocked && setActiveBonus(b)}
                        disabled={!unlocked}
                        className={`mt-4 w-full py-3 rounded-xl text-sm font-semibold ${
                          unlocked
                            ? "bg-emerald-500 text-black"
                            : "bg-white/10 text-gray-400"
                        }`}
                      >
                        {unlocked ? "Claim Reward" : "Not Claimable"}
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}

          {!loading && bonuses.length === 0 && (
            <div className="text-center py-24 text-gray-500">
              <Gift className="mx-auto mb-3 w-8 h-8" />
              No rewards yet
            </div>
          )}
        </main>
      </div>

      {/* ---------------- bottom sheet ---------------- */}
      {activeBonus && (
        <>
          <div
            onClick={() => setActiveBonus(null)}
            className="fixed inset-0 bg-black/70 z-40"
          />

          <div className="fixed bottom-0 inset-x-0 z-50 bg-[#0F0F14] rounded-t-2xl p-5 pb-8 border-t border-white/10">
            <div className="mx-auto w-12 h-1 rounded-full bg-white/20 mb-4" />

            <div className="text-center">
              <Sparkles className="mx-auto text-amber-400 w-5 h-5" />
              <h2 className="text-lg font-bold mt-2">Confirm Claim</h2>

              <p className="text-2xl font-extrabold text-emerald-400 mt-3">
                {formatCurrency(activeBonus.amount)}
              </p>

              <p className="text-xs text-gray-400 mt-1">
                Instantly credited to your wallet.
              </p>
            </div>

            <button
              onClick={claimBonus}
              disabled={claiming}
              className={`w-full mt-5 py-4 rounded-xl font-semibold ${
                claiming
                  ? "bg-gray-600 text-gray-300"
                  : "bg-emerald-500 text-black"
              }`}
            >
              {claiming ? "Processing…" : "Confirm Claim"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
