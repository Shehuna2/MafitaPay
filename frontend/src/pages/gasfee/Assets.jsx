// src/pages/Assets.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDown, Search, Clock, Star, ArrowLeft } from "lucide-react";
import client from "../../api/client";

const triggerHaptic = () => {
  if ("vibrate" in navigator) navigator.vibrate?.(30);
};

class AssetCardErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, i) { console.error("AssetCard error:", e, i); }
  render() {
    return this.state.hasError
      ? <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 text-red-400 text-center text-xs">Failed to load</div>
      : this.props.children;
  }
}

const Sparkline = React.memo(({ points = [], color = "#10B981" }) => {
  if (!points?.length) return null;

  const width = 90;
  const height = 36;
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

const AssetCard = React.memo(({ asset, onView, onToggleFavorite, isFavorite }) => {
  const navigate = useNavigate();
  const logo = `/images/${asset.symbol?.toLowerCase()}.png`;
  const fallbackLogo = asset.logo_url || "/images/default.png";

  const change = Number(asset.changePct || 0).toFixed(2);
  const isPositive = change >= 0;
  const color = isPositive ? "#10B981" : "#EF4444";

  const [price, setPrice] = useState(asset.price);
  const [points, setPoints] = useState(asset.points || makeInitialPoints(price, 14));

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
        className="group relative w-full bg-gray-800/80 backdrop-blur-xl p-3 rounded-xl border border-gray-700/50 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:border-indigo-500/50 cursor-pointer"
      >
        <div className="absolute inset-0 rounded-xl bg-indigo-600/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative flex items-center gap-2 sm:gap-3">
          {/* Logo + Name */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border border-gray-600/50 bg-gray-700/50 flex-shrink-0">
              <img
                src={logo}
                alt={asset.name}
                onError={(e) => (e.target.src = fallbackLogo)}
                className="w-full h-full rounded-full object-contain bg-gray-900"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-white truncate group-hover:text-indigo-300 transition">
                {asset.name}
              </h3>
              <p className="text-xs text-gray-400 uppercase">{asset.symbol}</p>
            </div>
          </div>

          {/* Sparkline */}
          <div className="hidden xs:block flex-shrink-0">
            <Sparkline points={points} color={color} />
          </div>

          {/* Price + Star */}
          <div className="text-right flex-shrink-0 flex items-center gap-1.5 sm:gap-2">
            <div className="text-right">
              <p className="text-sm font-mono font-bold text-white leading-tight">
                ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isPositive ? "text-green-400" : "text-red-400"}`}>
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
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
              <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </AssetCardErrorBoundary>
  );
});

// 🔹 Recent Viewed List Component
const RecentViewedList = ({ recentViewed }) => {
  const [maxItems, setMaxItems] = useState(
    window.innerWidth < 640 ? 4 : recentViewed.length
  );

  useEffect(() => {
    const handleResize = () => {
      setMaxItems(window.innerWidth < 640 ? 4 : recentViewed.length);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [recentViewed.length]);

  return (
    <div className="mb-5">
      <p className="text-xs text-indigo-300 flex items-center gap-1.5 mb-2">
        <Clock className="w-4 h-4" /> Recently Viewed
      </p>
      <div className="flex overflow-x-auto gap-2 pb-2 hide-scroll-bar">
        {recentViewed.slice(0, maxItems).map((asset) => (
          <button
            key={asset.id}
            onClick={() => {
              triggerHaptic();
              window.location.href = `/buy-crypto/${asset.id}`;
            }}
            className="flex-shrink-0 flex items-center gap-2 bg-gray-800/60 backdrop-blur-md border border-gray-700/50 rounded-full px-2.5 py-1.5 text-xs font-bold text-gray-300 hover:bg-indigo-600/20 hover:border-indigo-500/50 hover:scale-105 transition-all duration-300 haptic-feedback"
          >
            <img
              src={`/images/${asset.symbol?.toLowerCase()}.png`}
              onError={(e) => (e.target.src = '/images/default.png')}
              alt={asset.symbol}
              className="w-5 h-5 rounded-full bg-gray-900 object-contain"
            />
            <span className="truncate max-w-16">{asset.symbol}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [exchangeRate, setExchangeRate] = useState(null); // ← now exposed globally if you want context later
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
      setExchangeRate(res.data.exchange_rate);

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
          return {
            ...asset,
            price: newPrice,
            changePct: asset.price ? ((newPrice - asset.price) / asset.price) * 100 : 0,
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
      <div key={i} className="w-full bg-gray-800/60 backdrop-blur-md p-3 rounded-xl border border-gray-700/50 animate-pulse">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-700/50 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="h-4 w-24 sm:w-28 bg-gray-700/50 rounded mb-1" />
            <div className="h-3 w-12 sm:w-14 bg-gray-700/50 rounded" />
          </div>
          <div className="hidden xs:block w-20 h-9 bg-gray-700/50 rounded" />
          <div className="w-16 sm:w-20 h-8 bg-gray-700/50 rounded" />
        </div>
      </div>
    ));

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-3 text-center">
        <div className="bg-red-900/20 backdrop-blur-xl p-6 rounded-2xl border border-red-500/30 w-full max-w-xs sm:max-w-md">
          <p className="text-red-400 font-medium text-sm">{error}</p>
          <button
            onClick={fetchAssets}
            className="mt-4 px-5 py-2 bg-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-500 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out; }

        .input-glow:focus {
          outline: none;
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

        @media (max-width: 340px) {
          .xs\\:block { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10">
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <ArrowLeft className="w-5 h-5 text-indigo-400 flex-shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold text-indigo-400 truncate">Crypto Assets</h1>
          </div>

          {/* Search */}
          <div className="relative w-full mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800/60 backdrop-blur-md pl-10 pr-3 py-2.5 rounded-xl border border-gray-700/80 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 input-glow"
            />
          </div>

          {/* Recently Viewed */}
          {recentViewed.length > 0 && <RecentViewedList recentViewed={recentViewed} />}


          {/* Assets List */}
          <div>
            <h2 className="text-base sm:text-lg font-bold mb-3 text-white">Supported Assets</h2>
            {loading ? (
              <div className="space-y-3">{skeletonCards()}</div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Search className="w-10 h-10 mx-auto mb-2 text-gray-500" />
                <p className="text-sm">No assets found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAssets.map((asset, i) => (
                  <div key={asset.id} style={{ animationDelay: `${i * 50}ms` }} className="animate-fade-in-up">
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