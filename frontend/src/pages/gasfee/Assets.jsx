// src/pages/Assets.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDown, Search, Clock, Star } from "lucide-react";
import client from "../../api/client";

// ──────────────────────────────────────── HAPTIC
const triggerHaptic = () => {
  if ("vibrate" in navigator) navigator.vibrate?.(30);
};

// ──────────────────────────────────────── ERROR BOUNDARY
class AssetCardErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, i) { console.error("AssetCard error:", e, i); }
  render() {
    return this.state.hasError
      ? <div className="p-5 rounded-2xl bg-red-900/20 border border-red-500/30 text-red-400 text-center">Failed to load</div>
      : this.props.children;
  }
}

// ──────────────────────────────────────── SPARKLINE
const Sparkline = React.memo(({ points = [], color = "#10B981", width = 90, height = 36 }) => {
  if (!points?.length) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stride = width / (points.length - 1);
  const coords = points.map((p, i) => `${i * stride},${height - ((p - min) / range) * (height - 8) - 4}`);
  const path = `M ${coords.join(" L ")}`;
  const [lastX, lastY] = coords[coords.length - 1].split(",");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="drop-shadow-sm">
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
});

// ──────────────────────────────────────── HELPERS
const makeInitialPoints = (price, count = 14) => {
  const p = Number(price) || 0;
  const points = [];
  let base = p;
  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.5) * 0.008 * base;
    base = Math.max(0.000001, base + noise);
    points.push(Number(base.toFixed(8)));
  }
  return points;
};

// ──────────────────────────────────────── ASSET CARD (ONLY ONE CARD, STAR INSIDE)
const AssetCard = React.memo(({ asset, onView, onToggleFavorite, isFavorite }) => {
  const navigate = useNavigate();
  const logo = asset.logo_url?.startsWith("http")
    ? asset.logo_url
    : `${window.location.origin}${asset.logo_url || ""}`;
  const change = Number(asset.changePct || 0).toFixed(2);
  const isPositive = change >= 0;
  const color = isPositive ? "#10B981" : "#EF4444";

  const [price, setPrice] = useState(asset.price);
  const [points, setPoints] = useState(asset.points || makeInitialPoints(price, 14));

  useEffect(() => {
    const interval = setInterval(() => {
      const noise = (Math.random() - 0.5) * 0.003;
      const newPrice = Number(price) * (1 + noise);
      setPrice(newPrice);
      setPoints((prev) => [...prev.slice(1), newPrice].map(p => Number(p.toFixed(8))));
    }, 2000);
    return () => clearInterval(interval);
  }, [price]);

  const handleClick = (e) => {
    e.stopPropagation();
    onView(asset);
    triggerHaptic();
    navigate(`/buy-crypto/${asset.id}`);
  };

  const handleFavorite = (e) => {
    e.stopPropagation();
    onToggleFavorite(asset.id);
    triggerHaptic();
  };

  return (
    <AssetCardErrorBoundary>
      <div
        onClick={handleClick}
        className="group relative w-full bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl p-4 rounded-2xl border border-indigo-600/20 shadow-wallet transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-indigo-500/40 cursor-pointer animate-fade-in-up haptic-feedback"
      >
        <div className="absolute inset-0 rounded-2xl bg-indigo-600/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative flex items-center justify-between gap-3">
          {/* Left: Logo + Name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/10 p-0.5 bg-white/5 flex-shrink-0">
              {logo ? (
                <img src={logo} alt={asset.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                  {asset.symbol?.[0]}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate group-hover:text-indigo-300 transition">
                {asset.name}
              </h3>
              <p className="text-xs text-gray-400 uppercase">{asset.symbol}</p>
            </div>
          </div>

          {/* Middle: Sparkline */}
          <div className="flex-shrink-0">
            <Sparkline points={points} color={color} width={window.innerWidth < 640 ? 70 : 90} height={36} />
          </div>

          {/* Right: Price + Change + Star */}
          <div className="text-right flex-shrink-0 flex items-center gap-2">
            <div>
              <p className="text-base font-mono font-bold text-white transition-all duration-300">
                ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isPositive ? "text-green-400" : "text-red-400"}`}>
                {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                {Math.abs(change)}%
              </p>
            </div>
            <button
              onClick={handleFavorite}
              className={`p-1.5 rounded-full transition-all duration-200 ${
                isFavorite
                  ? "text-yellow-400 bg-yellow-400/20"
                  : "text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10"
              }`}
            >
              <Star className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </AssetCardErrorBoundary>
  );
});

// ──────────────────────────────────────── MAIN PAGE
export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [recentViewed, setRecentViewed] = useState(
    JSON.parse(localStorage.getItem("recentAssets") || "[]")
  );
  const [favorites, setFavorites] = useState(
    JSON.parse(localStorage.getItem("favoriteAssets") || "[]")
  );
  const retryRef = useRef(0);

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("access");
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await client.get("/assets/", config);
      const cryptos = res.data.cryptos || res.data || [];

      const enriched = cryptos.map((c) => {
        const price = Number(c.price || 0);
        const points = makeInitialPoints(price, 14);
        const first = points[0];
        const last = points[points.length - 1];
        const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
        return { ...c, price, points, changePct };
      });
      setAssets(enriched);
    } catch (err) {
      console.error("Failed to fetch assets:", err);
      if (retryRef.current < 3) {
        retryRef.current++;
        setTimeout(fetchAssets, 1500 * retryRef.current);
      } else {
        setError("Failed to load assets.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();

    const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setAssets(prev => prev.map(asset => {
        const ticker = data.find(t => t.s === asset.symbol + "USDT");
        if (ticker) {
          const newPrice = parseFloat(ticker.c);
          const changePct = ((newPrice - asset.price) / asset.price) * 100;
          return {
            ...asset,
            price: newPrice,
            changePct,
            points: [...asset.points.slice(1), newPrice]
          };
        }
        return asset;
      }));
    };

    return () => ws.close();
  }, [fetchAssets]);

  const filteredAssets = useMemo(() => {
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.symbol.toLowerCase().includes(search.toLowerCase())
    );
  }, [assets, search]);

  const handleView = useCallback((asset) => {
    setRecentViewed((prev) => {
      const exists = prev.find((a) => a.id === asset.id);
      const updated = exists ? prev : [asset, ...prev].slice(0, 6);
      localStorage.setItem("recentAssets", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((assetId) => {
    setFavorites(prev => {
      const updated = prev.includes(assetId)
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId];
      localStorage.setItem("favoriteAssets", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const skeletonCards = () =>
    Array(5).fill().map((_, i) => (
      <div key={i} className="w-full bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl p-4 rounded-2xl border border-indigo-600/20 animate-pulse">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-11 h-11 rounded-full bg-gray-700 flex-shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-28 bg-gray-700 rounded mb-1" />
              <div className="h-3 w-14 bg-gray-700 rounded" />
            </div>
          </div>
          <div className="w-20 h-9 bg-gray-700 rounded" />
          <div className="w-20 h-8 bg-gray-700 rounded text-right" />
        </div>
      </div>
    ));

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-900/20 backdrop-blur-xl p-8 rounded-3xl border border-red-500/30 max-w-md">
          <p className="text-red-400 font-medium">{error}</p>
          <button
            onClick={fetchAssets}
            className="mt-4 px-6 py-2 bg-indigo-600 rounded-full text-sm font-medium hover:bg-indigo-700 transition haptic-feedback"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out; }

        .shadow-wallet {
          box-shadow: 0 8px 32px rgba(0,0,0,0.25),
                      inset 0 1px 0 rgba(255,255,255,0.1);
        }

        .input-glow:focus {
          outline: none;
          ring: 2px solid #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.3);
        }

        .haptic-feedback {
          transition: transform 0.1s;
        }
        .haptic-feedback:active {
          transform: scale(0.96);
        }

        .hide-scroll-bar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scroll-bar::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="min-h-screen text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-12 space-y-8">
          {/* Search */}
          <div className="relative max-w-md mx-auto sm:mx-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800/70 backdrop-blur-xl pl-12 pr-4 py-3 rounded-2xl border border-indigo-600/20 focus:outline-none input-glow transition-all duration-300 placeholder-gray-500"
            />
          </div>

          {/* Recently Viewed */}
          {recentViewed.length > 0 && (
            <div>
              <p className="text-sm text-indigo-300 flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4" /> Recently Viewed
              </p>
              <div className="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory hide-scroll-bar">
                {recentViewed.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => {
                      triggerHaptic();
                      window.location.href = `/buy-crypto/${asset.id}`;
                    }}
                    className="flex-shrink-0 flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 hover:bg-indigo-600/20 hover:border-indigo-500/50 hover:scale-105 haptic-feedback snap-center"
                  >
                    {asset.logo_url ? (
                      <img src={asset.logo_url} alt="" className="w-5 h-5 rounded-full" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white font-bold">
                        {asset.symbol[0]}
                      </div>
                    )}
                    <span>{asset.symbol}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assets List */}
          <div>
            <h2 className="text-xl font-bold mb-4 text-white">Supported Assets</h2>
            {loading ? (
              <div className="space-y-4">{skeletonCards()}</div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Search className="w-10 h-10 mx-auto mb-3 text-gray-500" />
                <p>No assets found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAssets.map((asset, i) => (
                  <div key={asset.id} style={{ animationDelay: `${i * 50}ms` }}>
                    <AssetCard
                      asset={asset}
                      onView={handleView}
                      onToggleFavorite={toggleFavorite}
                      isFavorite={favorites.includes(asset.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}