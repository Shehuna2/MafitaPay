// FULL PREMIUM Assets.jsx – Upgraded with Unshakeable Sticky Header
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDown, Search, Clock, Star, ArrowLeft, AlertCircle } from "lucide-react";
import client from "../../api/client";

const triggerHaptic = () => {
  if ("vibrate" in navigator) navigator.vibrate?.(30);
};

// ────────────────────────────── Error Boundary ──────────────────────────────
class AssetCardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(e, i) {
    console.error("AssetCard error:", e, i);
  }
  render() {
    return this.state.hasError ? (
      <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 text-red-400 text-center text-xs">
        Failed to load
      </div>
    ) : this.props.children;
  }
}

// ────────────────────────────── Asset Card ──────────────────────────────
const AssetCard = React.memo(function AssetCard({ asset, onView, onToggleFavorite, isFavorite, isOffline }) {
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

  useEffect(() => {
    if (!isOffline) setPrice(asset.price);
  }, [asset.price, isOffline]);

  return (
    <AssetCardErrorBoundary>
      <div
        onClick={handleClick}
        className="group relative w-full bg-gray-800/80 backdrop-blur-xl p-3 rounded-xl border border-gray-700/50 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:border-indigo-500/50 cursor-pointer"
      >
        <div className="absolute inset-0 rounded-xl bg-indigo-600/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative flex items-center gap-2 sm:gap-3">
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
          <div className="text-right flex-shrink-0 flex items-center gap-1.5 sm:gap-2">
            <div className="text-right">
              <p className="text-sm font-mono font-bold text-white leading-tight">
                ${Number(price).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: price < 1 ? 6 : 2,
                })}
              </p>
              <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isPositive ? "text-green-400" : "text-red-400"}`}>
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(change)}%
              </p>
            </div>
            <button
              type="button"
              onClick={handleFavorite}
              className={`p-1.5 rounded-full transition-all duration-200 ${
                isFavorite
                  ? "text-yellow-400 bg-yellow-400/20"
                  : "text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10"
              }`}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </AssetCardErrorBoundary>
  );
});

// ────────────────────────────── Recently Viewed ──────────────────────────────
const RecentViewedList = ({ recentViewed }) => {
  const [maxItems, setMaxItems] = useState(window.innerWidth < 640 ? 4 : recentViewed.length);

  useEffect(() => {
    const handleResize = () => setMaxItems(window.innerWidth < 640 ? 4 : recentViewed.length);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [recentViewed.length]);

  return (
    <div className="mt-5">
      <p className="text-xs text-indigo-300 flex items-center gap-1.5 mb-2">
        <Clock className="w-4 h-4" /> Recently Viewed
      </p>
      <div className="flex overflow-x-auto gap-2 pb-2 hide-scroll-bar">
        {recentViewed.slice(0, maxItems).map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => {
              triggerHaptic();
              window.location.href = `/buy-crypto/${asset.id}`;
            }}
            className="flex-shrink-0 flex items-center gap-2 bg-gray-800/60 backdrop-blur-md border border-gray-700/50 rounded-full px-2.5 py-1.5 text-xs font-bold text-gray-300 hover:bg-indigo-600/20 transition"
          >
            <img
              src={`/images/${asset.symbol?.toLowerCase()}.png`}
              onError={(e) => (e.target.src = "/images/default.png")}
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

// ────────────────────────────── Main Component ──────────────────────────────
export default function Assets() {
  const ASSET_CACHE_KEY = "asset_cache_v1";
  const PRICE_TIMESTAMP_KEY = "asset_price_timestamp";
  const MAX_PRICE_AGE = 1 * 60 * 60 * 1000;
  const WS_RECONNECT_DELAY = 3000;
  const WS_MAX_RETRIES = 5;

  const wsRef = useRef(null);
  const wsRetryCountRef = useRef(0);
  const wsReconnectTimeoutRef = useRef(null);
  const retryRef = useRef(0);

  const [assets, setAssets] = useState([]);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [recentViewed, setRecentViewed] = useState(JSON.parse(localStorage.getItem("recentAssets") || "[]"));
  const [favorites, setFavorites] = useState(JSON.parse(localStorage.getItem("favoriteAssets") || "[]"));
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll detection for compact mode
  const handleScroll = useCallback(() => {
    const scrolled = window.scrollY > 80;
    if (scrolled !== isScrolled) {
      setIsScrolled(scrolled);
    }
  }, [isScrolled]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // ─────────────── Network Status ───────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false);
      fetchAssets();
      if (wsRef.current?.readyState === WebSocket.CLOSED) connectWebSocket();
    };
    const goOffline = () => setIsOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ─────────────── Cache Load ───────────────
  useEffect(() => {
    const cached = localStorage.getItem(ASSET_CACHE_KEY);
    if (cached) {
      const { assets: cachedAssets, exchangeRate: cachedRate } = JSON.parse(cached);
      setAssets(cachedAssets);
      setExchangeRate(cachedRate);
      setLoading(false);
    }
  }, []);

  // ─────────────── Fetch Assets ───────────────
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
      localStorage.setItem(PRICE_TIMESTAMP_KEY, Date.now().toString());
      setAssets(enriched);
    } catch (err) {
      console.error("Failed to fetch assets:", err);
      if (retryRef.current < 3 && !isOffline) {
        retryRef.current++;
        setTimeout(fetchAssets, 1500 * retryRef.current);
      } else {
        setError("Failed to load assets. Using cached data.");
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline, assets.length]);

  // ─────────────── WebSocket Live Updates ───────────────
  const connectWebSocket = useCallback(() => {
    if (isOffline) return;

    try {
      wsRef.current = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");

      wsRef.current.onopen = () => {
        console.log("[WS] Connected");
        setWsStatus("connected");
        wsRetryCountRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setAssets(prev =>
            prev.map(asset => {
              const ticker = data.find(t => t.s === asset.symbol + "USDT");
              if (ticker) {
                const newPrice = parseFloat(ticker.c);
                return {
                  ...asset,
                  price: newPrice,
                  changePct: ((newPrice - asset.price) / asset.price) * 100
                };
              }
              return asset;
            })
          );
        } catch (parseErr) {
          console.warn("[WS] Failed to parse message:", parseErr);
        }
      };

      wsRef.current.onerror = () => setWsStatus("error");

      wsRef.current.onclose = () => {
        setWsStatus("disconnected");
        if (!isOffline && wsRetryCountRef.current < WS_MAX_RETRIES) {
          wsRetryCountRef.current++;
          const delay = Math.min(WS_RECONNECT_DELAY * Math.pow(2, wsRetryCountRef.current - 1), 30000);
          wsReconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
        }
      };
    } catch (err) {
      console.error("[WS] Connection failed:", err);
      setWsStatus("error");
    }
  }, [isOffline]);

  useEffect(() => {
    fetchAssets();
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (wsReconnectTimeoutRef.current) clearTimeout(wsReconnectTimeoutRef.current);
    };
  }, [fetchAssets, connectWebSocket]);

  // ─────────────── Filtering & Handlers ───────────────
  const filteredAssets = useMemo(() =>
    assets.filter(a =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.symbol.toLowerCase().includes(search.toLowerCase())
    ),
    [assets, search]
  );

  const handleView = useCallback((asset) => {
    setRecentViewed(prev => {
      const exists = prev.find(a => a.id === asset.id);
      const updated = exists ? prev : [asset, ...prev].slice(0, 6);
      localStorage.setItem("recentAssets", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((assetId) => {
    setFavorites(prev => {
      const updated = prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId];
      localStorage.setItem("favoriteAssets", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const skeletonCards = () =>
    Array(8).fill().map((_, i) => (
      <div key={i} className="w-full bg-gray-800/60 backdrop-blur-md p-3 rounded-xl border border-gray-700/50 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-700/50" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-gray-700/50 rounded mb-1" />
            <div className="h-3 w-16 bg-gray-700/50 rounded" />
          </div>
          <div className="w-20 h-8 bg-gray-700/50 rounded" />
        </div>
      </div>
    ));

  if (error && !assets.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-3 text-center bg-gray-950">
        <div className="bg-red-900/20 backdrop-blur-xl p-8 rounded-2xl border border-red-500/30 max-w-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <p className="text-red-400 font-medium">{error}</p>
          <button
            type="button"
            onClick={fetchAssets}
            className="mt-6 px-6 py-3 bg-indigo-600 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Status Banners */}
      {isOffline && (
        <div className="bg-yellow-600/20 border-b border-yellow-500/40 text-yellow-300 text-xs p-2.5 text-center">
          Offline — showing cached prices
        </div>
      )}
      {wsStatus !== "connected" && !isOffline && (
        <div className="bg-blue-600/20 border-b border-blue-500/40 text-blue-300 text-xs p-2.5 text-center">
          {wsStatus === "disconnected" ? "Reconnecting to live prices..." : "Live price update unavailable"}
        </div>
      )}

      {/* Fixed Header - Unshakeable */}
      <header className="fixed top-0 left-0 right-0 z-50 px-3 pt-3 pb-2 pointer-events-none">
        <div className="pointer-events-auto max-w-2xl mx-auto">
          <div className="rounded-2xl bg-gradient-to-b from-gray-900/90 to-gray-900/70 backdrop-blur-2xl border border-gray-800/60 shadow-2xl p-4 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <ArrowLeft className="w-6 h-6 text-indigo-400 flex-shrink-0" />
              <h1 className={`font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight transition-all duration-300 ${
                isScrolled ? "text-xl" : "text-3xl"
              }`}>
                Assets
              </h1>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search 200+ assets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/10 backdrop-blur-xl pl-12 pr-5 py-4 rounded-xl border border-gray-700/80 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Recently Viewed - Collapses when scrolled */}
            <div className={`overflow-hidden transition-all duration-500 ease-out ${
              isScrolled ? "max-h-0 mt-0 opacity-0" : "max-h-32 mt-5 opacity-100"
            }`}>
              {recentViewed.length > 0 && <RecentViewedList recentViewed={recentViewed} />}
            </div>
          </div>
        </div>
      </header>

      {/* Main Scrollable Content - Starts below header */}
      <main className="flex-1 overflow-y-auto scrollbar-hide px-3 pt-40 pb-20" style={{ paddingTop: "180px" }}>
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-bold text-gray-300 mb-5 opacity-80">Supported Assets</h2>
          <div className="space-y-3">
            {loading ? (
              skeletonCards()
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-16">
                <Search className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-500">No assets match your search</p>
              </div>
            ) : (
              filteredAssets.map((asset, i) => (
                <div key={asset.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
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
      </main>
    </div>
  );
}