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

const AssetCard = React.memo(({ asset, onView, onToggleFavorite, isFavorite, isOffline }) => {
  const navigate = useNavigate();
  const logo = `/images/${asset.symbol?.toLowerCase()}.png`;
  const fallbackLogo = asset.logo_url || "/images/default.png";

  const change = Number(asset.changePct || 0).toFixed(2);
  const isPositive = change >= 0;

  const [price, setPrice] = useState(asset.price);

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

  // Update price dynamically if online
  useEffect(() => {
    if (!isOffline) {
      setPrice(asset.price);
    }
  }, [asset.price, isOffline]);

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
  const [maxItems, setMaxItems] = useState(window.innerWidth < 640 ? 4 : recentViewed.length);

  useEffect(() => {
    const handleResize = () => setMaxItems(window.innerWidth < 640 ? 4 : recentViewed.length);
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
  const ASSET_CACHE_KEY = "asset_cache_v1";

  const [assets, setAssets] = useState([]);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [recentViewed, setRecentViewed] = useState(JSON.parse(localStorage.getItem("recentAssets") || "[]"));
  const [favorites, setFavorites] = useState(JSON.parse(localStorage.getItem("favoriteAssets") || "[]"));
  const retryRef = useRef(0);

  // --- ONLINE / OFFLINE DETECTION ---
  useEffect(() => {
    const goOnline = () => { setIsOffline(false); fetchAssets(); };
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // --- INSTANT CACHE LOAD ---
  useEffect(() => {
    const cached = localStorage.getItem(ASSET_CACHE_KEY);
    if (cached) {
      const { assets: cachedAssets, exchangeRate: cachedRate } = JSON.parse(cached);
      setAssets(cachedAssets);
      setExchangeRate(cachedRate);
      setLoading(false);
    }
  }, []);

  // --- FETCH ASSETS ---
  const fetchAssets = useCallback(async () => {
    if (isOffline) return;
    try {
      setError(null);
      setLoading(prev => prev && !assets.length);

      const token = localStorage.getItem("access");
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await client.get("/assets/", config);
      const cryptos = res.data.cryptos || res.data || [];
      setExchangeRate(res.data.exchange_rate);

      const cached = JSON.parse(localStorage.getItem(ASSET_CACHE_KEY) || "{}");
      const cachedAssets = cached.assets || [];

      const enriched = cryptos.map((c) => {
        const rawPrice = Number(c.price || 0);
        const oldAsset = cachedAssets.find(a => a.id === c.id);
        const price = rawPrice < 1 && oldAsset ? oldAsset.price : rawPrice;
        const changePct = oldAsset && oldAsset.price ? ((price - oldAsset.price) / oldAsset.price) * 100 : 0;
        return { ...c, price, changePct };
      });

      localStorage.setItem(ASSET_CACHE_KEY, JSON.stringify({ assets: enriched, exchangeRate: res.data.exchange_rate }));
      setAssets(enriched);

    } catch (err) {
      console.error("Failed to fetch assets:", err);
      if (retryRef.current < 3 && !isOffline) {
        retryRef.current++;
        setTimeout(fetchAssets, 1500 * retryRef.current);
      } else {
        setError("Failed to load assets.");
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline, assets.length]);

  // --- WEBSOCKET LIVE UPDATES ---
  useEffect(() => {
    if (isOffline) return;
    fetchAssets();
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setAssets(prev =>
        prev.map(asset => {
          const ticker = data.find(t => t.s === asset.symbol + "USDT");
          if (ticker) {
            const newPrice = parseFloat(ticker.c);
            return { ...asset, price: newPrice, changePct: ((newPrice - asset.price) / asset.price) * 100 };
          }
          return asset;
        })
      );
    };
    return () => ws.close();
  }, [fetchAssets, isOffline]);

  // --- SEARCH FILTER ---
  const filteredAssets = useMemo(() =>
    assets.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.symbol.toLowerCase().includes(search.toLowerCase())),
    [assets, search]
  );

  // --- RECENT VIEWED ---
  const handleView = useCallback(asset => {
    setRecentViewed(prev => {
      const exists = prev.find(a => a.id === asset.id);
      const updated = exists ? prev : [asset, ...prev].slice(0, 6);
      localStorage.setItem("recentAssets", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // --- FAVORITES ---
  const toggleFavorite = useCallback(assetId => {
    setFavorites(prev => {
      const updated = prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId];
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
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10 flex flex-col" style={{ height: '100vh' }}>

        {/* Offline Banner */}
        {isOffline && (
          <div className="bg-yellow-600/20 border border-yellow-500/40 text-yellow-300 
                          text-xs p-2 rounded-lg mb-3 text-center flex-shrink-0">
            Offline mode — prices may be outdated
          </div>
        )}

        {/* Static Top Area */}
        <div className="flex-shrink-0">
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
              className="w-full bg-gray-800/60 backdrop-blur-md pl-10 pr-3 py-2.5 rounded-xl border border-gray-700/80 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
            />
          </div>

          {/* Recently Viewed */}
          {recentViewed.length > 0 && <RecentViewedList recentViewed={recentViewed} />}

          {/* Supported Assets Title */}
          <h2 className="text-base sm:text-lg font-bold mb-3 text-white">Supported Assets</h2>
        </div>

        {/* Scrollable Assets List */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-3">
          {loading ? (
            skeletonCards()
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Search className="w-10 h-10 mx-auto mb-2 text-gray-500" />
              <p className="text-sm">No assets found.</p>
            </div>
          ) : (
            filteredAssets.map((asset, i) => (
              <div key={asset.id} style={{ animationDelay: `${i * 50}ms` }} className="animate-fade-in-up">
                <AssetCard
                  asset={asset}
                  onView={handleView}
                  onToggleFavorite={toggleFavorite}
                  isFavorite={favorites.includes(asset.id)}
                  isOffline={isOffline}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
