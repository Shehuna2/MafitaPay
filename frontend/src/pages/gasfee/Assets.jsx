// PREMIUM Assets.jsx – Optimized with Virtual Scrolling & Performance Enhancements
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDown, Search, Clock, Star, ArrowLeft, TrendingUp, Filter, RefreshCw } from "lucide-react";
import { List } from "react-window";
import client from "../../api/client";

// Debounce utility function
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// Sanitize input to prevent XSS
const sanitizeInput = (input) => {
  return input
    .replace(/[<>'"&]/g, (char) => {
      const escapeMap = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return escapeMap[char] || char;
    })
    .trim();
};

const triggerHaptic = () => {
  if ("vibrate" in navigator) navigator.vibrate?.(30);
};

// ────────────────────────────── Error Boundary ──────────────────────────────
class AssetCardErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, i) { console.error("AssetCard error:", e, i); }
  render() {
    return this.state.hasError ? (
      <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 text-red-400 text-center text-xs">
        Failed to load
      </div>
    ) : this.props.children;
  }
}

// ────────────────────────────── Lazy Image Component ──────────────────────────────
const LazyImage = React.memo(({ src, alt, fallback, className }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const imgRef = useRef();

  useEffect(() => {
    const currentRef = imgRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "50px" }
    );

    observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [src]);

  return (
    <div ref={imgRef} className={className}>
      {isLoading && (
        <div className="w-full h-full bg-gray-700/50 animate-pulse rounded-full" />
      )}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={alt}
          onError={(e) => (e.target.src = fallback)}
          onLoad={() => setIsLoading(false)}
          className={`w-full h-full rounded-full object-contain bg-gray-900 ${isLoading ? "hidden" : ""}`}
        />
      )}
    </div>
  );
});

// ────────────────────────────── Asset Card ──────────────────────────────
const AssetCard = React.memo(({ asset, onView, onToggleFavorite, isFavorite, isOffline, style }) => {
  const navigate = useNavigate();
  const logo = `/images/${asset.symbol?.toLowerCase()}.png`;
  const fallbackLogo = asset.logo_url || "/images/default.png";

  const change = useMemo(() => Number(asset.changePct || 0).toFixed(2), [asset.changePct]);
  const isPositive = change >= 0;
  const [price, setPrice] = useState(asset.price);
  const [priceAnimation, setPriceAnimation] = useState("");

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
    if (!isOffline && asset.price !== price) {
      const isIncrease = asset.price > price;
      setPriceAnimation(isIncrease ? "price-up" : "price-down");
      setPrice(asset.price);
      setTimeout(() => setPriceAnimation(""), 1000);
    }
  }, [asset.price, isOffline, price]);

  return (
    <AssetCardErrorBoundary>
      <div style={{...style, paddingLeft: '12px', paddingRight: '12px'}}>
        <div
          onClick={handleClick}
          className="group relative w-full bg-gradient-to-br from-gray-800/90 to-gray-800/70 backdrop-blur-xl p-3 rounded-xl border border-gray-700/50 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:border-indigo-500/50 cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label={`View ${asset.name} details`}
          onKeyPress={(e) => e.key === "Enter" && handleClick(e)}
        >
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600/10 to-purple-600/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border border-gray-600/50 bg-gray-700/50 flex-shrink-0">
                <LazyImage
                  src={logo}
                  alt={asset.name}
                  fallback={fallbackLogo}
                  className="w-full h-full"
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
                <p className={`text-sm font-mono font-bold text-white leading-tight transition-all duration-300 ${priceAnimation}`}>
                  ${Number(price).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: price < 1 ? 6 : 2,
                  })}
                </p>
                <p className={`text-xs font-medium flex items-center justify-end gap-0.5 transition-colors duration-300 ${isPositive ? "text-green-400" : "text-red-400"}`}>
                  {isPositive ? <ArrowUpRight className="w-3 h-3 animate-bounce-subtle" /> : <ArrowDown className="w-3 h-3 animate-bounce-subtle" />}
                  {Math.abs(change)}%
                </p>
              </div>
              <button
                onClick={handleFavorite}
                className={`p-1.5 rounded-full transition-all duration-200 hover:scale-110 ${
                  isFavorite
                    ? "text-yellow-400 bg-yellow-400/20 animate-star-pulse"
                    : "text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10"
                }`}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AssetCardErrorBoundary>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.asset.id === nextProps.asset.id &&
    prevProps.asset.price === nextProps.asset.price &&
    prevProps.asset.changePct === nextProps.asset.changePct &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.isOffline === nextProps.isOffline
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
            className="flex-shrink-0 flex items-center gap-2 bg-gray-800/60 backdrop-blur-md border border-gray-700/50 rounded-full px-2.5 py-1.5 text-xs font-bold text-gray-300 hover:bg-indigo-600/20 hover:border-indigo-500/50 hover:scale-105 transition-all duration-300"
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
  const scrollContainerRef = useRef(null);
  const listRef = useRef(null);
  const wsRef = useRef(null);
  const [scrollY, setScrollY] = useState(0);
  const [isSticky, setIsSticky] = useState(false);
  const [containerHeight, setContainerHeight] = useState(600);

  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [recentViewed, setRecentViewed] = useState(JSON.parse(localStorage.getItem("recentAssets") || "[]"));
  const [favorites, setFavorites] = useState(JSON.parse(localStorage.getItem("favoriteAssets") || "[]"));
  const [sortBy, setSortBy] = useState("name"); // name, price, change, marketcap
  const [filterBy, setFilterBy] = useState("all"); // all, favorites, gainers, losers
  const [isRefreshing, setIsRefreshing] = useState(false);
  const retryRef = useRef(0);

  // ─────────────── Debounced search ───────────────
  useEffect(() => {
    const debouncedUpdate = debounce((value) => {
      setDebouncedSearch(sanitizeInput(value));
    }, 300);
    
    debouncedUpdate(search);
  }, [search]);

  // ─────────────── Container Height with ResizeObserver ───────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const rect = container.getBoundingClientRect();
      setContainerHeight(rect.height - 100); // Subtract header and padding
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // ─────────────── Scroll tracking for sticky header ───────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => setScrollY(container.scrollTop);
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setIsSticky(scrollY > 80), [scrollY]);

  const progress = Math.min(scrollY / 180, 1);
  const scale = 1 - progress * 0.08;

  // ─────────────── Network Status ───────────────
  useEffect(() => {
    const goOnline = () => { 
      setIsOffline(false); 
      // Fetch will be triggered by the isOffline change in WebSocket effect
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
      const { assets: cachedAssets } = JSON.parse(cached);
      setAssets(cachedAssets);
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

  // ─────────────── Initial fetch on mount ───────────────
  useEffect(() => {
    if (!isOffline) {
      fetchAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // ─────────────── WebSocket Live Updates with Memory Leak Fix ───────────────
  useEffect(() => {
    if (isOffline) return;
    
    // Close existing WebSocket if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    let reconnectTimeout;
    let isSubscribed = true;

    const connectWebSocket = () => {
      if (!isSubscribed) return;

      try {
        const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("WebSocket connected");
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          
          try {
            const data = JSON.parse(event.data);
            
            // Batch update with memoized calculations
            setAssets(prev => {
              const updatedAssets = prev.map(asset => {
                const ticker = data.find(t => t.s === asset.symbol + "USDT");
                if (ticker) {
                  const newPrice = parseFloat(ticker.c);
                  const oldPrice = asset.price || newPrice;
                  const changePct = oldPrice ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
                  return { ...asset, price: newPrice, changePct };
                }
                return asset;
              });
              return updatedAssets;
            });
          } catch (err) {
            console.error("Error parsing WebSocket message:", err);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          console.log("WebSocket closed");
          // Reconnect after 5 seconds if still subscribed
          if (isSubscribed && !isOffline) {
            reconnectTimeout = setTimeout(connectWebSocket, 5000);
          }
        };
      } catch (err) {
        console.error("Error connecting to WebSocket:", err);
      }
    };

    connectWebSocket();

    return () => {
      isSubscribed = false;
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOffline]);

  // ─────────────── Advanced Filtering & Sorting ───────────────
  const filteredAndSortedAssets = useMemo(() => {
    let filtered = assets;

    // Search filter with debounced input
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(searchLower) ||
        a.symbol.toLowerCase().includes(searchLower)
      );
    }

    // Category filter
    if (filterBy === "favorites") {
      filtered = filtered.filter(a => favorites.includes(a.id));
    } else if (filterBy === "gainers") {
      filtered = filtered.filter(a => Number(a.changePct || 0) > 0);
    } else if (filterBy === "losers") {
      filtered = filtered.filter(a => Number(a.changePct || 0) < 0);
    }

    // Sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "price":
          return (b.price || 0) - (a.price || 0);
        case "change":
          return (b.changePct || 0) - (a.changePct || 0);
        case "marketcap":
          return (b.market_cap || 0) - (a.market_cap || 0);
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return sorted;
  }, [assets, debouncedSearch, favorites, filterBy, sortBy]);

  const handleView = useCallback(asset => {
    setRecentViewed(prev => {
      const exists = prev.find(a => a.id === asset.id);
      const updated = exists ? prev : [asset, ...prev].slice(0, 6);
      localStorage.setItem("recentAssets", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback(assetId => {
    setFavorites(prev => {
      const updated = prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId];
      localStorage.setItem("favoriteAssets", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ─────────────── Pull to Refresh ───────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchAssets();
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [fetchAssets]);

  // ─────────────── Virtual List Row Renderer ───────────────
  const RowComponent = useCallback(({ ariaAttributes, index, style }) => {
    const asset = filteredAndSortedAssets[index];
    
    // Safety check for out-of-bounds access
    if (!asset) return null;
    
    return (
      <div {...ariaAttributes}>
        <AssetCard
          key={asset.id}
          asset={asset}
          onView={handleView}
          onToggleFavorite={toggleFavorite}
          isFavorite={favorites.includes(asset.id)}
          isOffline={isOffline}
          style={style}
        />
      </div>
    );
  }, [filteredAndSortedAssets, handleView, toggleFavorite, favorites, isOffline]);

  const skeletonCards = () =>
    Array(8).fill().map((_, i) => (
      <div key={i} className="w-full bg-gray-800/60 backdrop-blur-md p-3 rounded-xl border border-gray-700/50 animate-pulse mb-3 mx-3">
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

  // ─────────────── Render ───────────────
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-3 text-center bg-gray-950">
        <div className="bg-red-900/20 backdrop-blur-xl p-8 rounded-2xl border border-red-500/30 max-w-sm">
          <p className="text-red-400 font-medium">{error}</p>
          <button onClick={fetchAssets} className="mt-6 px-6 py-3 bg-indigo-600 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-lg">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .price-up {
          animation: priceFlash 1s ease-out;
          color: #4ade80 !important;
        }
        .price-down {
          animation: priceFlash 1s ease-out;
          color: #f87171 !important;
        }
        @keyframes priceFlash {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-bounce-subtle {
          animation: bounceSub 2s infinite;
        }
        @keyframes bounceSub {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .animate-star-pulse {
          animation: starPulse 1.5s ease-in-out infinite;
        }
        @keyframes starPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          animation: shimmer 2s infinite;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className="min-h-screen flex flex-col text-white bg-gray-950">

        {isOffline && (
          <div className="bg-yellow-600/20 border border-yellow-500/40 text-yellow-300 text-xs p-2.5 text-center backdrop-blur-xl">
            <span className="font-medium">⚠️ Offline Mode</span> — showing cached prices
          </div>
        )}

        <div className="w-full flex flex-col h-screen">

          {/* Sticky Header */}
          <div className="sticky top-0 z-50 pointer-events-auto">
            <div
              className="rounded-2xl border border-gray-800/50 bg-gradient-to-b from-gray-900/95 to-gray-900/80 backdrop-blur-2xl shadow-2xl transition-all duration-500 ease-out m-3 p-4"
              style={{
                transform: `scale(${scale})`,
                padding: isSticky ? "12px" : "20px",
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <ArrowLeft className="w-6 h-6 text-indigo-400 flex-shrink-0 cursor-pointer hover:text-indigo-300 transition" onClick={() => window.history.back()} />
                  <h1
                    className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight"
                    style={{ fontSize: `${2 - progress * 0.5}rem` }}
                  >
                    Assets
                  </h1>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing || loading}
                  className="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 transition-all disabled:opacity-50"
                  aria-label="Refresh assets"
                >
                  <RefreshCw className={`w-5 h-5 text-indigo-400 ${isRefreshing ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search 1000+ assets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/10 backdrop-blur-xl pl-12 pr-5 py-3.5 rounded-xl border border-gray-700/80 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 focus:border-indigo-500 transition-all font-medium"
                  style={{
                    height: isSticky ? "48px" : "56px",
                    fontSize: isSticky ? "1rem" : "1.1rem",
                  }}
                  aria-label="Search assets"
                />
              </div>

              {/* Filter and Sort Controls */}
              {!isSticky && (
                <div className="flex gap-2 mb-3 overflow-x-auto hide-scroll-bar">
                  <select
                    value={filterBy}
                    onChange={(e) => setFilterBy(e.target.value)}
                    className="flex-shrink-0 px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    aria-label="Filter assets"
                  >
                    <option value="all">All Assets</option>
                    <option value="favorites">⭐ Favorites</option>
                    <option value="gainers">📈 Top Gainers</option>
                    <option value="losers">📉 Top Losers</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-shrink-0 px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    aria-label="Sort assets"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="price">Sort: Price</option>
                    <option value="change">Sort: 24h Change</option>
                    <option value="marketcap">Sort: Market Cap</option>
                  </select>
                </div>
              )}

              {recentViewed.length > 0 && (
                <div
                  className="mt-5 transition-all duration-500 origin-top overflow-hidden"
                  style={{
                    opacity: isSticky ? 0 : 1,
                    transform: `scaleY(${isSticky ? 0.8 : 1})`,
                    height: isSticky ? "0px" : "auto",
                    marginTop: isSticky ? "0" : "20px",
                  }}
                >
                  <RecentViewedList recentViewed={recentViewed} />
                </div>
              )}
            </div>
          </div>

          {/* Virtual Scrolling Asset List */}
          <div
            className="flex-1 pb-20"
            ref={scrollContainerRef}
          >
            <div className="flex items-center justify-between px-3 mb-3">
              <h2 className="text-sm font-bold text-gray-400 opacity-80 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {filteredAndSortedAssets.length} Assets
              </h2>
            </div>
            
            {loading ? (
              <div className="space-y-3 overflow-y-auto" style={{ maxHeight: `${containerHeight}px` }}>
                {skeletonCards()}
              </div>
            ) : filteredAndSortedAssets.length === 0 ? (
              <div className="text-center py-16 px-6">
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/30">
                  <Search className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <h3 className="text-lg font-bold text-gray-400 mb-2">No Assets Found</h3>
                  <p className="text-sm text-gray-500">Try adjusting your search or filters</p>
                </div>
              </div>
            ) : (
              <List
                listRef={listRef}
                defaultHeight={containerHeight}
                rowCount={filteredAndSortedAssets.length}
                rowHeight={85}
                rowComponent={RowComponent}
                rowProps={{}}
                overscanCount={5}
                style={{ height: `${containerHeight}px` }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
