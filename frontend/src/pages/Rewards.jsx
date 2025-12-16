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

/* ---------------- component ---------------- */
export default function Rewards() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [activeBonus, setActiveBonus] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const filters = ["all", "welcome", "referral", "promo", "cashback", "deposit"];

  /* ------------ fetch rewards ------------ */
  const loadBonuses = async () => {
    setLoading(true);
    const res = await client.get("/rewards/");
    const list = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
    setBonuses(list);
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
        (b.bonus_type_name || "")
          .toLowerCase()
          .replace("_", "") === filter
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

  /* ------------ claim ------------ */
  const claimBonus = async () => {
    if (!activeBonus) return;
    setClaiming(true);
    try {
      await client.post(`/rewards/${activeBonus.id}/claim/`);
      await client.post("/wallet/sync/").catch(() => {});
      await loadBonuses();
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2500);
      setActiveBonus(null);
    } finally {
      setClaiming(false);
    }
  };

  /* ------------ total ------------ */
  const totalValue = useMemo(
    () =>
      bonuses
        .filter((b) =>
          ["unlocked", "used"].includes((b.status || "").toLowerCase())
        )
        .reduce((s, b) => s + Number(b.amount || 0), 0),
    [bonuses]
  );

  return (
    <>
      {showConfetti && (
        <Confetti width={window.innerWidth} height={window.innerHeight} />
      )}

      <div className="min-h-screen bg-gradient-to-br from-[#0A0A0F] via-[#0B0B14] to-black text-white pb-32">
        {/* ---------------- header ---------------- */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-black/60 border-b border-white/5">
          <div className="max-w-xl mx-auto px-3 sm:px-4 pt-4 sm:pt-5 pb-4 sm:pb-6">
            <button
              onClick={() => history.back()}
              className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="mt-4 sm:mt-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-violet-600/25 to-indigo-600/10 border border-white/10 p-4 sm:p-5 shadow-xl">
              <div className="flex items-center gap-2">
                <Crown className="text-amber-400 w-4 h-4 sm:w-5 sm:h-5" />
                <h1 className="text-base sm:text-lg font-bold">Rewards</h1>
              </div>

              <p className="mt-3 sm:mt-4 text-2xl sm:text-3xl font-extrabold text-emerald-400 break-words">
                {formatCurrency(totalValue)}
              </p>
              <p className="text-xs text-gray-400">Total unlocked value</p>
            </div>
          </div>

          {/* filters */}
          <div className="flex gap-2 px-3 sm:px-4 pb-3 sm:pb-4 overflow-x-auto scrollbar-none">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 sm:px-4 py-2 rounded-full text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                  filter === f
                    ? "bg-violet-600 text-white shadow-lg"
                    : "bg-white/5 text-gray-300 hover:bg-white/10"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </header>

        {/* ---------------- content ---------------- */}
        <main className="max-w-xl mx-auto px-3 sm:px-4 mt-4 sm:mt-6 space-y-6 sm:space-y-8">
          {loading &&
            [...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 sm:h-36 rounded-2xl sm:rounded-3xl bg-white/5 animate-pulse"
              />
            ))}

          {!loading &&
            groupedBonuses.map((group) => (
              <section key={group.title} className="space-y-3 sm:space-y-4">
                <h3 className="text-xs uppercase tracking-widest text-gray-500">
                  {group.title}
                </h3>

                {group.data.map((b) => {
                  const unlocked =
                    (b.status || "").toLowerCase() === "unlocked";

                  return (
                    <div
                      key={b.id}
                      className="relative rounded-2xl sm:rounded-3xl bg-white/5 border border-white/10 p-4 sm:p-5 shadow-lg hover:shadow-2xl transition active:scale-[0.98]"
                    >
                      {unlocked && (
                        <span className="absolute -top-2 -right-2 px-2 sm:px-3 py-1 text-xs rounded-full bg-emerald-500 text-black font-semibold">
                          Ready
                        </span>
                      )}

                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-semibold capitalize flex gap-2 items-center text-sm sm:text-base">
                          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span className="break-words">{b.bonus_type_name?.replace("_", " ") || "Bonus"}</span>
                        </h4>

                        <span
                          className={`text-xs px-2 sm:px-3 py-1 rounded-full whitespace-nowrap ${statusStyles(
                            b.status
                          )}`}
                        >
                          {b.status}
                        </span>
                      </div>

                      <p className="text-xl sm:text-2xl font-bold text-emerald-400 mt-2 sm:mt-3 break-words">
                        {formatCurrency(b.amount)}
                      </p>

                      {b.description && (
                        <p className="text-xs sm:text-sm text-gray-400 mt-2 break-words">
                          {b.description}
                        </p>
                      )}

                      <div className="flex justify-between text-xs text-gray-400 mt-3 sm:mt-4 gap-2">
                        <span className="flex items-center gap-1">
                          {unlocked ? (
                            <Unlock className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          )}
                          <span className="break-words">{b.status}</span>
                        </span>

                        {b.expires_at && (
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-rose-400 flex-shrink-0" />
                            {new Date(b.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => unlocked && setActiveBonus(b)}
                        disabled={!unlocked}
                        className={`mt-4 sm:mt-5 w-full py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-semibold transition-all ${
                          unlocked
                            ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg"
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
            <div className="text-center py-16 sm:py-24 text-gray-500">
              <Gift className="mx-auto mb-3 w-6 h-6 sm:w-8 sm:h-8" />
              <p className="text-sm sm:text-base">No rewards yet</p>
            </div>
          )}
        </main>
      </div>

      {/* ---------------- bottom sheet ---------------- */}
      {activeBonus && (
        <>
          <div
            onClick={() => setActiveBonus(null)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
          />

          <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0F0F14] rounded-t-2xl sm:rounded-t-3xl p-5 sm:p-6 animate-slideUp border-t border-white/10 max-h-[85vh] overflow-y-auto">
            <div className="mx-auto w-12 h-1 rounded-full bg-white/20 mb-4 sm:mb-5" />

            <div className="text-center">
              <Sparkles className="mx-auto text-amber-400 w-5 h-5 sm:w-6 sm:h-6" />
              <h2 className="text-lg sm:text-xl font-bold mt-2">Confirm Claim</h2>

              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-3 sm:mt-4 break-words px-4">
                {formatCurrency(activeBonus.amount)}
              </p>

              <p className="text-xs sm:text-sm text-gray-400 mt-2 px-4">
                Instantly credited to your wallet.
              </p>
            </div>

            <button
              onClick={claimBonus}
              disabled={claiming}
              className={`w-full mt-5 sm:mt-6 py-3 sm:py-4 rounded-xl text-sm sm:text-base font-semibold transition-all ${
                claiming
                  ? "bg-gray-600 text-gray-300"
                  : "bg-emerald-500 text-black hover:bg-emerald-400 shadow-xl"
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
