import React from "react";
import { useEffect, useRef, useState, useCallback, useMemo, Component } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDown } from "lucide-react";
import client from "../../api/client";
import PropTypes from "prop-types";

// ✅ Error Boundary for AssetCard
class AssetCardErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error in AssetCard:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-5 rounded-xl bg-gray-900/80 text-red-400">
          Error rendering asset. Please try again.
        </div>
      );
    }
    return this.props.children;
  }
}

AssetCardErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

// ✅ Sparkline component (memoized for performance)
const Sparkline = React.memo(({ points = [], color = "#10B981", width = 120, height = 40 }) => {
  if (!points || points.length === 0) return <svg width={width} height={height} />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stride = width / Math.max(1, points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stride;
    const y = height - ((p - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  const path = `M ${coords.join(" L ")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="drop-shadow-md"
      aria-label="Price trend sparkline"
    >
      <defs>
        <linearGradient id="spark" x1="0" x2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={coords[coords.length - 1].split(",")[0]}
        cy={coords[coords.length - 1].split(",")[1]}
        r="3"
        fill={color}
      />
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

// ✅ AssetCard component with fixed logoSrc
const AssetCard = ({ asset }) => {
  // Define logoSrc before usage
  const logoSrc = (url) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return `${window.location.origin}${url}`;
  };

  const formatCurrency = (v) => {
    if (!v) return "—";
    return `$${Number(v).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const change = Number(asset.changePct || 0);
  const changePositive = change >= 0;
  const changeColor = changePositive ? "text-green-400" : "text-red-400";
  const logo = asset.logo_url ? logoSrc(asset.logo_url) : null;

  return (
    <AssetCardErrorBoundary>
      <Link
        to={`/buy-crypto/${asset.id}`}
        className="flex items-center justify-between p-5 rounded-xl backdrop-blur-md border border-indigo-600/20 hover:bg-gray-800/70 transition-all duration-300 shadow-lg hover:shadow-xl"
        aria-label={`View details for ${asset.name}`}
      >
        {/* Left: Logo + name */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center rounded-full overflow-hidden border border-gray-700">
            {logo ? (
              <img
                src={logo}
                alt={`${asset.name} logo`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-gray-300">
                {asset.symbol?.slice(0, 3)}
              </span>
            )}
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{asset.name}</div>
            <div className="text-sm text-gray-400">{asset.symbol}</div>
          </div>
        </div>

        {/* Middle: Sparkline */}
        <div className="flex-shrink-0 mx-6">
          <Sparkline
            points={asset.points}
            color={changePositive ? "#10B981" : "#EF4444"}
            width={120}
            height={40}
          />
        </div>

        {/* Right: Price + % */}
        <div className="text-right">
          <div className="text-lg font-mono text-white">{formatCurrency(asset.price)}</div>
          <div className={`text-sm font-medium ${changeColor} flex items-center gap-1`}>
            {changePositive ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDown className="w-4 h-4" />
            )}
            {change.toFixed(2)}%
          </div>
        </div>
      </Link>
    </AssetCardErrorBoundary>
  );
};

AssetCard.propTypes = {
  asset: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    symbol: PropTypes.string,
    price: PropTypes.number,
    changePct: PropTypes.number,
    points: PropTypes.arrayOf(PropTypes.number),
    logo_url: PropTypes.string,
  }).isRequired,
};

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const pollingIntervalRef = useRef(null);

  // ✅ Fetch assets with retry logic and auth token
  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Assuming access token is stored in localStorage after login
      const accessToken = localStorage.getItem("accessToken");
      const config = accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : {};

      const res = await client.get("/assets/", config);
      const cryptos = res.data.cryptos || [];

      const enriched = cryptos.map((c) => {
        const price = Number(c.price || 0);
        const points = makeInitialPoints(price, 12);
        const first = points[0] || price || 0;
        const last = points[points.length - 1] || price || 0;
        const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
        return {
          ...c,
          price,
          points,
          changePct,
          logo_url: c.logo_url || null,
        };
      });

      setAssets(enriched);
      retryCountRef.current = 0;
    } catch (err) {
      console.error("❌ Failed to fetch assets:", err.response?.data || err.message);
      if (err.response?.status === 401) {
        setError("Unauthorized. Please log in again.");
      } else if (retryCountRef.current < maxRetries) {
        retryCountRef.current += 1;
        setTimeout(fetchAssets, 2000 * retryCountRef.current);
      } else {
        setError("Failed to load assets. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Polling for pseudo-real-time updates
  useEffect(() => {
    fetchAssets();

    // Poll every 30 seconds
    pollingIntervalRef.current = setInterval(() => {
      fetchAssets();
    }, 30000);

    return () => {
      clearInterval(pollingIntervalRef.current);
    };
  }, [fetchAssets]);

  // ✅ Sorting logic
  const sortedAssets = useMemo(() => {
    return [...assets].sort((a, b) => {
      const multiplier = sortOrder === "asc" ? 1 : -1;
      if (sortBy === "name") return multiplier * a.name.localeCompare(b.name);
      if (sortBy === "price") return multiplier * (a.price - b.price);
      if (sortBy === "change") return multiplier * (a.changePct - b.changePct);
      return 0;
    });
  }, [assets, sortBy, sortOrder]);

  // ✅ Sort handler
  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  // ✅ Loading skeleton
  const renderSkeleton = () =>
    Array(5)
      .fill()
      .map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-5 rounded-xl bg-gray-900/80 animate-pulse"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-700" />
            <div>
              <div className="h-5 w-24 bg-gray-700 rounded mb-2" />
              <div className="h-4 w-16 bg-gray-700 rounded" />
            </div>
          </div>
          <div className="w-24 h-10 bg-gray-700 rounded" />
          <div className="text-right">
            <div className="h-5 w-20 bg-gray-700 rounded mb-2" />
            <div className="h-4 w-16 bg-gray-700 rounded" />
          </div>
        </div>
      ));

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 text-white pt-16">
        <div className="max-w-5xl mx-auto p-6">
          <p className="text-center p-6 text-red-400">{error}</p>
          <button
            onClick={fetchAssets}
            className="mx-auto block px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500"
            aria-label="Retry loading assets"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 text-white pt-16">
      <div className="max-w-5xl mx-auto p-6">
        <h2 className="text-3xl font-bold mb-6 text-white">Supported Assets</h2>

        {/* Sort Controls */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => handleSort("name")}
            className={`px-4 py-2 rounded ${sortBy === "name" ? "bg-indigo-600" : "bg-gray-700"}`}
            aria-label="Sort by name"
          >
            Name {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
          </button>
          <button
            onClick={() => handleSort("price")}
            className={`px-4 py-2 rounded ${sortBy === "price" ? "bg-indigo-600" : "bg-gray-700"}`}
            aria-label="Sort by price"
          >
            Price {sortBy === "price" && (sortOrder === "asc" ? "↑" : "↓")}
          </button>
          <button
            onClick={() => handleSort("change")}
            className={`px-4 py-2 rounded ${sortBy === "change" ? "bg-indigo-600" : "bg-gray-700"}`}
            aria-label="Sort by change percentage"
          >
            Change {sortBy === "change" && (sortOrder === "asc" ? "↑" : "↓")}
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">{renderSkeleton()}</div>
        ) : sortedAssets.length === 0 ? (
          <p className="text-center p-6 text-gray-400">No assets available.</p>
        ) : (
          <div className="space-y-4">
            {sortedAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}