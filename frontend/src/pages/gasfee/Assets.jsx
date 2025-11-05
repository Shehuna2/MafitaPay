import React, { useEffect, useRef, useState, useCallback, useMemo, Component } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDown, Search } from "lucide-react";
import client from "../../api/client";
import PropTypes from "prop-types";

// ✅ Error Boundary for AssetCard
class AssetCardErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Error in AssetCard:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-5 rounded-xl bg-gray-900/80 text-red-400">Error rendering asset.</div>;
    }
    return this.props.children;
  }
}
AssetCardErrorBoundary.propTypes = { children: PropTypes.node.isRequired };

// ✅ Sparkline Component
const Sparkline = React.memo(({ points = [], color = "#10B981", width = 120, height = 40 }) => {
  if (!points || points.length === 0) return <svg width={width} height={height} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stride = width / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => `${i * stride},${height - ((p - min) / range) * (height - 6) - 3}`);
  const path = `M ${coords.join(" L ")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="drop-shadow-md">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1].split(",")[0]} cy={coords[coords.length - 1].split(",")[1]} r="3" fill={color} />
    </svg>
  );
});

// ✅ Initial sparkline generator
function makeInitialPoints(price, count = 12) {
  const points = [];
  let p = Number(price) || 0;
  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.5) * 0.006 * p;
    p = Math.max(0.000001, p + noise);
    points.push(Number(p.toFixed(8)));
  }
  return points;
}

// ✅ AssetCard
const AssetCard = ({ asset, onView }) => {
  const navigate = useNavigate();
  const handleClick = () => {
    onView(asset);
    navigate(`/buy-crypto/${asset.id}`);
  };
  const logo = asset.logo_url?.startsWith("http") ? asset.logo_url : `${window.location.origin}${asset.logo_url || ""}`;
  const change = Number(asset.changePct || 0);
  const changeColor = change >= 0 ? "text-green-400" : "text-red-400";
  return (
    <AssetCardErrorBoundary>
      <div
        onClick={handleClick}
        className="flex items-center justify-between p-5 rounded-xl backdrop-blur-md border border-indigo-600/20 hover:bg-gray-800/70 transition-all duration-300 shadow-lg hover:shadow-xl cursor-pointer"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-700 flex items-center justify-center">
            {logo ? (
              <img src={logo} alt={asset.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-400 font-semibold">{asset.symbol?.slice(0, 3)}</span>
            )}
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{asset.name}</div>
            <div className="text-sm text-gray-400">{asset.symbol}</div>
          </div>
        </div>

        <div className="flex-shrink-0 mx-6">
          <Sparkline points={asset.points} color={change >= 0 ? "#10B981" : "#EF4444"} />
        </div>

        <div className="text-right">
          <div className="text-lg font-mono text-white">${Number(asset.price).toLocaleString()}</div>
          <div className={`text-sm font-medium flex items-center gap-1 ${changeColor}`}>
            {change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />} {change.toFixed(2)}%
          </div>
        </div>
      </div>
    </AssetCardErrorBoundary>
  );
};

// ✅ Assets Page
export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [recentViewed, setRecentViewed] = useState([]);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("access");
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await client.get("/assets/", config);
      console.log("Assets response:", res.data);
      const cryptos = res.data.cryptos || res.data || [];

      const enriched = cryptos.map((c) => {
        const price = Number(c.price || 0);
        const points = makeInitialPoints(price, 12);
        const first = points[0];
        const last = points[points.length - 1];
        const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
        return { ...c, price, points, changePct };
      });
      setAssets(enriched);
    } catch (err) {
      console.error("Failed to fetch assets:", err);
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current += 1;
        setTimeout(fetchAssets, 1500 * retryCountRef.current);
      } else {
        setError("Failed to load assets.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const filteredAssets = useMemo(() => {
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.symbol.toLowerCase().includes(search.toLowerCase())
    );
  }, [assets, search]);

  const handleView = (asset) => {
    setRecentViewed((prev) => {
      const exists = prev.find((a) => a.id === asset.id);
      if (exists) return prev;
      const updated = [asset, ...prev];
      return updated.slice(0, 6);
    });
  };

  const renderSkeleton = () =>
    Array(5)
      .fill()
      .map((_, i) => (
        <div key={i} className="flex items-center justify-between p-5 rounded-xl bg-gray-900/80 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-700" />
            <div>
              <div className="h-5 w-24 bg-gray-700 rounded mb-2" />
              <div className="h-4 w-16 bg-gray-700 rounded" />
            </div>
          </div>
          <div className="w-24 h-10 bg-gray-700 rounded" />
        </div>
      ));

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center text-red-400">{error}</div>
    );

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* 🔍 Search Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-1/2">
            <Search className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>
        </div>

        {/* 🌀 Recently Viewed */}
        {recentViewed.length > 0 && (
          <div>
            <p className="text-sm text-gray-400 mb-2">Recently Viewed</p>
            <div className="flex overflow-x-auto gap-4 pb-2 hide-scroll-bar">
              {recentViewed.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => (window.location.href = `/buy-crypto/${asset.id}`)}
                  className="flex-shrink-0 flex items-center gap-2 bg-gray-800/60 px-4 py-2 rounded-full border border-gray-700 hover:bg-indigo-600/20 transition"
                >
                  <img
                    src={asset.logo_url}
                    alt={asset.name}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <span className="text-sm font-medium">{asset.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 💰 Assets List */}
        <h2 className="text-3xl font-bold mb-4">Supported Assets</h2>
        {loading ? (
          <div className="space-y-4">{renderSkeleton()}</div>
        ) : filteredAssets.length === 0 ? (
          <p className="text-gray-400 text-center">No assets found.</p>
        ) : (
          <div className="space-y-4">
            {filteredAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onView={handleView} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}