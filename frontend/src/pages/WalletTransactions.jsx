// src/pages/WalletTransactions.jsx
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
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

  // 🌀 Scroll listener for sticky bar animation
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
      console.error("Error fetching transactions:", err.response?.data || err.message);
      setError("Failed to load transactions. Please try again later.");
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

  const SkeletonRow = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="animate-pulse flex justify-between items-center py-4"
    >
      <div>
        <div className="h-4 w-32 bg-gray-700 rounded mb-2"></div>
        <div className="h-3 w-24 bg-gray-800 rounded"></div>
      </div>
      <div className="text-right">
        <div className="h-4 w-16 bg-gray-700 rounded mb-2"></div>
        <div className="h-3 w-10 bg-gray-800 rounded"></div>
      </div>
    </motion.div>
  );

  if (error)
    return <p className="text-red-400 text-center p-4">{error}</p>;

  return (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      <div className="max-w-5xl mx-auto p-6 relative z-10 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold">Wallet Transactions</h2>
          <button
            onClick={() => fetchTransactions()}
            className="px-4 py-2 bg-indigo-600/50 hover:bg-indigo-600 rounded-lg text-white transition"
          >
            Refresh
          </button>
        </div>

        {/* Sticky Filter Bar with scroll animation */}
        <motion.div
          initial={{ scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)" }}
          animate={{
            scale: isScrolled ? 0.98 : 1,
            boxShadow: isScrolled
              ? "0 4px 25px rgba(99,102,241,0.2)"
              : "0 0 0 rgba(0,0,0,0)",
            backdropFilter: "blur(12px)",
          }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className={`sticky top-0 z-40 border border-indigo-600/20 rounded-xl p-6 shadow-lg transition-all ${
            isScrolled
              ? "bg-indigo-600/40"
              : "bg-indigo-600/20"
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <input
              type="text"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
              placeholder="Search reference/request ID"
              className="bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 col-span-2"
            />
            <select
              name="category"
              value={filters.category}
              onChange={handleFilterChange}
              className="bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Categories</option>
              <option value="airtime">Airtime</option>
              <option value="data">Data</option>
              <option value="crypto">Gas Fee</option>
              <option value="other">Other</option>
            </select>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <input
              type="date"
              name="start_date"
              value={filters.start_date}
              onChange={handleFilterChange}
              className="bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="date"
              name="end_date"
              value={filters.end_date}
              onChange={handleFilterChange}
              className="bg-gray-800/70 border border-gray-700 p-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={clearFilters}
            className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            Clear Filters
          </button>
        </motion.div>

        {/* Transactions List */}
        <div className="bg-indigo-600/30 backdrop-blur-md border border-indigo-600/20 rounded-xl p-6 shadow-lg relative overflow-hidden">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </motion.div>
            ) : transactions.length === 0 ? (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-gray-400 text-center py-6"
              >
                No transactions found.
              </motion.p>
            ) : (
              <motion.ul
                key="transactions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="divide-y divide-gray-700"
              >
                {transactions.map((tx) => {
                  const explorerUrl = getExplorerUrl(tx);
                  return (
                    <motion.li
                      key={tx.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="py-4 flex justify-between items-center hover:bg-gray-800/50 transition rounded-lg px-2"
                    >
                      <div>
                        <p className="font-medium capitalize text-lg">
                          {tx.category} ({tx.tx_type})
                        </p>
                        <p className="text-sm text-gray-400">
                          {new Date(tx.created_at).toLocaleString()}
                        </p>
                        {explorerUrl && (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:underline mt-1 inline-block"
                          >
                            View on Explorer
                          </a>
                        )}
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold text-xl ${
                            tx.tx_type === "debit"
                              ? "text-red-400"
                              : "text-green-400"
                          }`}
                        >
                          {tx.tx_type === "debit" ? "-" : "+"}₦
                          {parseFloat(tx.amount).toFixed(2)}
                        </p>
                        <p
                          className={`text-sm capitalize ${
                            tx.status === "success"
                              ? "text-green-400"
                              : tx.status === "pending"
                              ? "text-yellow-400"
                              : "text-red-400"
                          } mt-1`}
                        >
                          {tx.status}
                        </p>
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
          <button
            disabled={!pagination.previous}
            onClick={() => fetchTransactions(pagination.previous)}
            className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Previous
          </button>
          <span className="text-sm text-gray-300">
            Page {pagination.page} of {totalPages}
          </span>
          <div className="flex space-x-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => fetchTransactions(`/wallet/transactions/?page=${page}`)}
                className={`px-3 py-1 rounded-lg ${
                  pagination.page === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-700 text-white hover:bg-gray-600"
                } transition`}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            disabled={!pagination.next}
            onClick={() => fetchTransactions(pagination.next)}
            className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 transition"
          >
            Next
          </button>
        </div>
      </div>

      {/* Reload Overlay */}
      <AnimatePresence>
        {reloading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center z-50"
          >
            <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
