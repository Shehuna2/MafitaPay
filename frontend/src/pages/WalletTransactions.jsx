import { useEffect, useState } from "react";
import {
  Loader2,
  ArrowLeft,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Calendar,
  Clock,
  AlertCircle,
} from "lucide-react";
import client from "../api/client";

export default function WalletTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    status: "",
    start_date: "",
    end_date: "",
  });
  const [pagination, setPagination] = useState({
    next: null,
    previous: null,
    count: 0,
    page: 1,
  });

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function fetchTransactions(url = null) {
    if (transactions.length > 0) setReloading(true);
    else setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      ).toString();

      const res = await client.get(url || `/wallet/transactions/?${query}`);
      const data = res.data;

      let items = [];
      if (Array.isArray(data)) items = data;
      else if (Array.isArray(data.results)) items = data.results;

      setTransactions(items);
      setPagination({
        next: data.next || null,
        previous: data.previous || null,
        count: data.count || items.length,
        page: getPageNumber(url || res.config.url),
      });
    } catch (err) {
      setError("Failed to load transactions. Please try again.");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  useEffect(() => {
    fetchTransactions();
  }, [filters]);

  const handleFilterChange = (e) =>
    setFilters({ ...filters, [e.target.name]: e.target.value });

  const clearFilters = () =>
    setFilters({
      search: "",
      category: "",
      status: "",
      start_date: "",
      end_date: "",
    });

  const getPageNumber = (url) => {
    if (!url) return 1;
    const params = new URLSearchParams(url.split("?")[1]);
    return parseInt(params.get("page") || 1, 10);
  };

  const getExplorerUrl = (tx) => {
    if (tx.category !== "crypto" || !tx.reference) return null;
    const explorerUrls = {
      BNB: "https://bscscan.com/tx/",
      ETH: "https://etherscan.io/tx/",
      "BASE-ETH": "https://basescan.org/tx/",
      SOL: "https://solscan.io/tx/",
      TON: "https://tonscan.org/tx/",
      NEAR: "https://explorer.near.org/transactions/",
      BTC: "https://mempool.space/tx/",
    };
    const baseUrl = explorerUrls[tx.network?.toUpperCase()];
    return baseUrl ? `${baseUrl}${tx.reference}` : null;
  };

  const totalPages = Math.ceil(pagination.count / 10) || 1;

  return (
    <>
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .shimmer {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.08),
            transparent
          );
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite;
        }
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.4s ease-out;
        }
      `}</style>

      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" />

        {/* Full-Screen Loading */}
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping"></div>
                </div>
                <p className="text-lg font-medium text-indigo-300">
                  Loading transactions...
                </p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto p-6 relative z-10">
          {/* Back Arrow */}
          <button
            onClick={() => window.history.back()}
            className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-all duration-200 mb-4"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </button>

          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-indigo-400">
              Wallet Transactions
            </h2>
            <button
              onClick={() => fetchTransactions()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/50 hover:bg-indigo-600 rounded-xl text-white font-medium text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <RefreshCw className={`w-4 h-4 ${reloading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Sticky Filter Bar */}
          <div
            className={`sticky top-0 z-40 bg-gray-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl border border-gray-700/50 transition-all duration-300 ${
              isScrolled ? "scale-98" : ""
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="relative col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  name="search"
                  value={filters.search}
                  onChange={handleFilterChange}
                  placeholder="Search reference..."
                  className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                />
              </div>

              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <select
                  name="category"
                  value={filters.category}
                  onChange={handleFilterChange}
                  className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 appearance-none"
                >
                  <option value="">All Categories</option>
                  <option value="airtime">Airtime</option>
                  <option value="data">Data</option>
                  <option value="crypto">Gas Fee</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <select
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 appearance-none"
              >
                <option value="">All Status</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>

              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  name="start_date"
                  value={filters.start_date}
                  onChange={handleFilterChange}
                  className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                />
              </div>

              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  name="end_date"
                  value={filters.end_date}
                  onChange={handleFilterChange}
                  className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                />
              </div>
            </div>

            <button
              onClick={clearFilters}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-medium underline transition"
            >
              Clear All Filters
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="mt-6 p-5 bg-red-900/20 backdrop-blur-sm border border-red-500/30 rounded-xl text-sm text-red-300 text-center flex items-center justify-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {/* Transactions List */}
          <div className="mt-6 bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 overflow-hidden">
            {transactions.length === 0 && !loading ? (
              <div className="p-12 text-center text-gray-400">
                <div className="w-16 h-16 mx-auto mb-3 bg-gray-700/50 rounded-full flex items-center justify-center">
                  <Clock className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-lg font-medium">No transactions found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {transactions.map((tx, idx) => {
                  const explorerUrl = getExplorerUrl(tx);
                  return (
                    <div
                      key={tx.id}
                      className="p-5 hover:bg-gray-700/30 transition-all duration-200 animate-fade-in-up"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            {tx.network && (
                              <img
                                src={`/images/${tx.network.toLowerCase()}.png`}
                                alt={tx.network}
                                className="w-6 h-6 rounded-full border border-gray-700"
                                onError={(e) =>
                                  (e.target.style.display = "none")
                                }
                              />
                            )}
                            <div>
                              <p className="font-semibold text-lg capitalize text-indigo-300">
                                {tx.category}
                              </p>
                              <p className="text-sm text-gray-400 capitalize">
                                {tx.tx_type}
                              </p>
                            </div>
                          </div>

                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(tx.created_at).toLocaleString()}
                          </p>

                          {explorerUrl && (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-2 transition"
                            >
                              View on Explorer
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        <div className="text-right">
                          <p
                            className={`font-bold text-xl ${
                              tx.tx_type === "debit"
                                ? "text-red-400"
                                : "text-green-400"
                            }`}
                          >
                            {tx.tx_type === "debit" ? "-" : "+"}₦
                            {parseFloat(tx.amount).toFixed(2)}
                          </p>
                          <p
                            className={`text-xs font-medium mt-1 capitalize ${
                              tx.status === "success"
                                ? "text-green-400"
                                : tx.status === "pending"
                                ? "text-yellow-400"
                                : "text-red-400"
                            }`}
                          >
                            {tx.status}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-wrap justify-center items-center gap-2">
              <button
                disabled={!pagination.previous}
                onClick={() => fetchTransactions(pagination.previous)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition"
              >
                Previous
              </button>

              <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      onClick={() =>
                        fetchTransactions(`/wallet/transactions/?page=${page}`)
                      }
                      className={`w-10 h-10 rounded-xl text-sm font-medium transition ${
                        pagination.page === page
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                {totalPages > 5 && (
                  <span className="px-3 py-2 text-sm text-gray-500">...</span>
                )}
              </div>

              <button
                disabled={!pagination.next}
                onClick={() => fetchTransactions(pagination.next)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
