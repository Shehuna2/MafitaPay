// src/pages/admin/AdminSellOrders.jsx
import { useEffect, useState, useRef } from "react";
import client from "../../api/client";
import { Loader2, Check, X, RefreshCcw, Download, Search, AlertCircle } from "lucide-react";
import Modal from "react-modal";

Modal.setAppElement("#root");

export default function AdminSellOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(10);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalImage, setModalImage] = useState("");
  const [highlighted, setHighlighted] = useState([]);
  const prevOrderIds = useRef(new Set());
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    proof_submitted: 0,
    completed: 0,
    cancelled: 0,
  });

  // ---------------- Fetch Orders ----------------
  const fetchOrders = async (silent = false) => {
    try {
      if (!silent && !refreshing) setLoading(true);
      const res = await client.get("/admin/sell-orders/");
      const newOrders = res.data.orders || [];

      setStats({
        total: newOrders.length,
        pending: newOrders.filter((o) => o.status === "pending_payment").length,
        proof_submitted: newOrders.filter((o) => o.status === "proof_submitted").length,
        completed: newOrders.filter((o) => o.status === "completed").length,
        cancelled: newOrders.filter((o) => o.status === "cancelled").length,
      });

      const newProofIds = newOrders
        .filter((o) => o.status === "proof_submitted")
        .map((o) => o.order_id);

      const unseen = newProofIds.filter((id) => !prevOrderIds.current.has(id));
      if (unseen.length > 0) {
        showToast(`${unseen.length} new order(s) awaiting review`, "success");
        setHighlighted((prev) => [...prev, ...unseen]);
        setTimeout(() => setHighlighted((prev) => prev.filter((id) => !unseen.includes(id))), 6000);
      }

      prevOrderIds.current = new Set(newOrders.map((o) => o.order_id));
      setOrders(newOrders);
      setLastUpdated(new Date());
    } catch {
      showToast("Failed to load orders", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // ---------------- Real-time Polling ----------------
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await client.get("/admin/sell-orders/");
        const newOrders = res.data.orders || [];

        const existingIds = new Set(orders.map((o) => o.order_id));
        const newOnes = newOrders.filter((o) => !existingIds.has(o.order_id));
        const updatedOnes = newOrders.filter((o) => {
          const old = orders.find((x) => x.order_id === o.order_id);
          return old && old.status !== o.status;
        });

        if (newOnes.length > 0 || updatedOnes.length > 0) {
          setOrders([...newOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

          if (newOnes.length > 0) {
            showToast(`${newOnes.length} new order(s) detected`, "success");
            new Audio("/media/notify.mp3").play().catch(() => {});
            setHighlighted(newOnes.map((o) => o.order_id));
            setTimeout(() => setHighlighted([]), 6000);
          }
        }
      } catch (e) {
        console.warn("Auto-refresh failed:", e);
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [orders]);

  // ---------------- Update Order Status ----------------
  const handleUpdateStatus = async (orderId, status) => {
    setUpdating(orderId);
    try {
      await client.post(`/admin/sell-orders/${orderId}/update/`, { status });
      setOrders((prev) =>
        prev.map((o) => (o.order_id === orderId ? { ...o, status } : o))
      );
      showToast(`Order ${status}`, "success");
    } catch {
      showToast("Failed to update order", "error");
    } finally {
      setUpdating(null);
    }
  };

  // ---------------- CSV Export ----------------
  const exportToCSV = () => {
    const headers = ["Order ID", "Asset", "Amount Asset", "Amount NGN", "Source", "Status", "Created At"];
    const rows = [
      headers.join(","),
      ...orders.map((o) =>
        [
          o.order_id,
          typeof o.asset === "object" ? o.asset.symbol : o.asset,
          o.amount_asset,
          o.amount_ngn,
          o.source || "N/A",
          o.status,
          o.created_at ? new Date(o.created_at).toLocaleString() : "N/A",
        ].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sell_orders_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------- Filtering, Sorting, Pagination ----------------
  const filteredOrders = orders
    .filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      const assetName = typeof o.asset === "object" ? o.asset.symbol : o.asset;
      return (
        o.order_id.toString().includes(s) ||
        String(assetName || "").toLowerCase().includes(s) ||
        String(o.source || "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const aVal = a[sortBy] || "";
      const bVal = b[sortBy] || "";
      if (sortBy === "created_at") {
        return sortOrder === "asc"
          ? new Date(aVal) - new Date(bVal)
          : new Date(bVal) - new Date(aVal);
      }
      return sortOrder === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

  const indexOfLast = currentPage * ordersPerPage;
  const indexOfFirst = indexOfLast - ordersPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);

  const getStatusClass = (s) =>
    s === "completed"
      ? "text-green-400"
      : s === "cancelled" || s === "failed"
      ? "text-red-400"
      : s === "proof_submitted"
      ? "text-blue-400"
      : s === "pending_payment"
      ? "text-yellow-400"
      : "text-gray-400";

  const showToast = (msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------------- Loading ----------------
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-3 sm:px-4 py-8">
        <p className="text-gray-400 mt-8 text-sm animate-pulse text-center">
          Fetching your data securely...
        </p>
      </div>
    );
  }

  // ---------------- Main Render ----------------
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 rounded-xl text-white">
      <div className="max-w-8xl mx-auto px-3 sm:px-4 py-6">
        {toast && (
          <div
            className={`fixed top-16 sm:top-20 right-3 sm:right-6 px-4 py-2 rounded-lg shadow-lg text-xs sm:text-sm ${
              toast.type === "error" ? "bg-red-600/80" : "bg-green-600/80"
            } backdrop-blur-md animate-fade-in-out`}
          >
            {toast.msg}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-indigo-400" },
            { label: "Pending", value: stats.pending, color: "text-yellow-400" },
            { label: "Review", value: stats.proof_submitted, color: "text-blue-400" },
            { label: "Completed", value: stats.completed, color: "text-green-400" },
            { label: "Cancelled", value: stats.cancelled, color: "text-red-400" },
          ].map((s, i) => (
            <div
              key={i}
              className="bg-gray-800/50 border border-gray-700/50 rounded-xl text-center p-3 sm:p-4 shadow-sm hover:border-indigo-500/30 transition"
            >
              <p className="text-xs text-gray-400 uppercase tracking-wide">{s.label}</p>
              <p className={`text-xl sm:text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <h1 className="text-xl sm:text-2xl font-semibold">Sell Orders</h1>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => {
                setRefreshing(true);
                fetchOrders(true);
              }}
              className="px-3 sm:px-4 py-2 bg-indigo-600/60 hover:bg-indigo-600 rounded-lg flex items-center gap-1.5 sm:gap-2 text-sm transition"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Refresh
            </button>
            <button
              onClick={exportToCSV}
              className="px-3 sm:px-4 py-2 bg-green-600/60 hover:bg-green-600 rounded-lg flex items-center gap-1.5 sm:gap-2 text-sm transition"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30 backdrop-blur-md mb-6">
          <div className="flex items-center gap-2 bg-gray-900/60 px-3 py-1.5 rounded-lg">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order..."
              className="bg-transparent outline-none text-sm text-white w-32 sm:w-48"
            />
          </div>
          {["all", "pending_payment", "proof_submitted", "completed", "cancelled"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm rounded-lg capitalize transition ${
                filter === f
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-900/50 text-gray-400 hover:bg-gray-800/70"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Orders List */}
        {currentOrders.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400">
            <AlertCircle className="w-8 h-8 mb-2 text-gray-500" />
            <p>No orders found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentOrders.map((o) => (
              <div
                key={o.order_id}
                className={`relative flex justify-between items-center bg-gray-900/70 border border-gray-800 rounded-xl p-3 sm:p-4 shadow-sm transition-all overflow-hidden ${
                  highlighted.includes(o.order_id)
                    ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-950 animate-blink focus-within:ring-indigo-400"
                    : "hover:border-indigo-500/30"
                }`}
              >
                {highlighted.includes(o.order_id) && (
                  <div className="absolute inset-0 rounded-xl border-2 border-blue-500 animate-glow-ring pointer-events-none"></div>
                )}
                <div className="text-xs sm:text-sm space-y-0.5">
                  <p>
                    <span className="text-gray-500">Asset:</span>{" "}
                    <span className="font-semibold text-yellow-400">
                      {o.asset?.symbol?.toUpperCase?.() || o.asset?.toUpperCase?.() || o.asset || "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-gray-500">Amount:</span> {o.amount_asset} → ₦{o.amount_ngn}
                  </p>
                  <p>
                    <span className="text-gray-500">Source:</span> {o.source || "N/A"}
                  </p>
                  <p>
                    <span className="text-gray-500">Status:</span>{" "}
                    <span className={getStatusClass(o.status)}>{o.status.replace("_", " ")}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Created: {new Date(o.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {o.payment_proof && (
                    <img
                      src={o.payment_proof}
                      alt="proof"
                      className="w-20 sm:w-24 h-20 sm:h-24 object-cover rounded-lg cursor-pointer border border-gray-700 hover:border-indigo-500 transition"
                      onClick={() => {
                        setModalImage(o.payment_proof);
                        setModalIsOpen(true);
                      }}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(o.order_id, "completed")}
                      disabled={
                        updating === o.order_id ||
                        o.status === "completed" ||
                        o.status === "cancelled"
                      }
                      className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm flex items-center gap-1 transition ${
                        updating === o.order_id
                          ? "bg-green-600/50"
                          : o.status === "completed" || o.status === "cancelled"
                          ? "bg-gray-700/70 cursor-not-allowed text-gray-400"
                          : "bg-green-600/70 hover:bg-green-600"
                      }`}
                    >
                      {updating === o.order_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Approve
                    </button>

                    <button
                      onClick={() => handleUpdateStatus(o.order_id, "cancelled")}
                      disabled={
                        updating === o.order_id ||
                        o.status === "completed" ||
                        o.status === "cancelled"
                      }
                      className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm flex items-center gap-1 transition ${
                        updating === o.order_id
                          ? "bg-red-600/50"
                          : o.status === "completed" || o.status === "cancelled"
                          ? "bg-gray-700/70 cursor-not-allowed text-gray-400"
                          : "bg-red-600/70 hover:bg-red-600"
                      }`}
                    >
                      {updating === o.order_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-3 pt-5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-1.5 bg-gray-800/70 rounded-lg hover:bg-gray-700 disabled:opacity-40 text-sm"
            >
              Prev
            </button>
            <span className="text-xs sm:text-sm text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-1.5 bg-gray-800/70 rounded-lg hover:bg-gray-700 disabled:opacity-40 text-sm"
            >
              Next
            </button>
          </div>
        )}

        {/* Modal */}
        <Modal
          isOpen={modalIsOpen}
          onRequestClose={() => setModalIsOpen(false)}
          className="bg-gray-900/90 backdrop-blur-md rounded-xl p-5 max-w-4xl mx-auto mt-20 sm:mt-24 outline-none shadow-lg"
          overlayClassName="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center"
        >
          <h2 className="text-lg sm:text-xl font-semibold mb-3">Payment Proof</h2>
          <img src={modalImage} alt="Proof" className="w-full rounded-lg" />
          <button
            onClick={() => setModalIsOpen(false)}
            className="mt-4 px-5 sm:px-6 py-2 bg-indigo-600/70 hover:bg-indigo-600 rounded-lg text-white text-sm transition"
          >
            Close
          </button>
        </Modal>
      </div>
    </div>
  );
}
