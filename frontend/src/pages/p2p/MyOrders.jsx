// File: src/pages/p2p/MyOrders.jsx
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import client from "../../api/client";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  RefreshCcw,
  Search,
  Filter,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function MyOrders() {
  const [activeTab, setActiveTab] = useState("deposit");
  const [depositOrders, setDepositOrders] = useState([]);
  const [withdrawOrders, setWithdrawOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Fetch both deposit + withdraw orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const [depositRes, withdrawRes] = await Promise.all([
        client.get("p2p/my-orders/"),
        client.get("p2p/my-withdraw-orders/"),
      ]);

      const deposits = Array.isArray(depositRes.data.results)
        ? depositRes.data.results
        : Array.isArray(depositRes.data)
        ? depositRes.data
        : [];

      const withdraws = Array.isArray(withdrawRes.data.results)
        ? withdrawRes.data.results
        : Array.isArray(withdrawRes.data)
        ? withdrawRes.data
        : [];

      setDepositOrders(deposits);
      setWithdrawOrders(withdraws);
    } catch (err) {
      console.error("Error fetching orders:", err);
      toast.error("Failed to load your orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Status badge helper
  const getStatusBadge = (status) => {
    const base = "text-xs px-2 py-1 rounded-full flex items-center gap-1";
    switch (status) {
      case "pending":
        return (
          <span className={`bg-yellow-600 ${base}`}>
            <Clock className="w-3 h-3" /> Awaiting Payment
          </span>
        );
      case "paid":
        return (
          <span className={`bg-blue-600 ${base}`}>
            <Clock className="w-3 h-3" /> Awaiting Release
          </span>
        );
      case "completed":
        return (
          <span className={`bg-green-600 ${base}`}>
            <CheckCircle className="w-3 h-3" /> Completed
          </span>
        );
      case "cancelled":
        return (
          <span className={`bg-red-600 ${base}`}>
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  // Filtered + searched list
  const filteredOrders = useMemo(() => {
    const orders = activeTab === "deposit" ? depositOrders : withdrawOrders;
    return orders.filter((o) => {
      const matchSearch =
        !search ||
        String(o.id).includes(search) ||
        String(o.amount_requested || o.amount).includes(search) ||
        o.sell_offer_detail?.merchant_email?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [activeTab, depositOrders, withdrawOrders, search, statusFilter]);

  const renderOrders = (orders, type) => {
    if (loading)
      return (
        <div className="flex justify-center items-center h-64 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading {type} orders...
        </div>
      );

    if (!orders.length)
      return (
        <p className="text-center text-gray-400 mt-8">
          You have no P2P {type} orders yet.
        </p>
      );

    return (
      <div className="space-y-4">
        {orders.map((order) => {
          const shouldAnimate = type === "deposit" ? order.status === "paid" : order.status === "pending";

          return (
            <div
              key={order.id}
              className={`bg-gray-800 hover:bg-gray-700 p-5 rounded-xl shadow border border-gray-700 transition ${
                shouldAnimate ? "animate-pulse-glow" : ""
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg">
                    {type === "deposit"
                      ? `Deposit Order #${order.id}`
                      : `Withdraw Order #${order.id}`}
                  </p>
                  <p className="text-sm text-gray-400">
                    Amount: ₦{Number(order.amount_requested || order.amount).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-400">
                    Date: {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div>{getStatusBadge(order.status)}</div>
              </div>

              <Link
                to={
                  type === "deposit"
                    ? `/p2p/order/${order.id}`
                    : `/p2p/withdraw-orders/${order.id}`
                }
                className="mt-3 inline-block text-indigo-400 hover:underline text-sm"
              >
                View Details →
              </Link>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-6 text-white">
      <ToastContainer />
      <div className="flex items-center justify-between mb-6 mt-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Banknote className="w-6 h-6 text-indigo-400" /> My P2P Orders
        </h2>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
        >
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-800 rounded-xl p-1 mb-6">
        <button
          onClick={() => setActiveTab("deposit")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "deposit"
              ? "bg-indigo-600 text-white"
              : "text-gray-300 hover:text-white"
          }`}
        >
          Deposit Orders
        </button>
        <button
          onClick={() => setActiveTab("withdraw")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "withdraw"
              ? "bg-indigo-600 text-white"
              : "text-gray-300 hover:text-white"
          }`}
        >
          Withdraw Orders
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2 flex-1">
          <Search className="w-4 h-4 text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Search by ID, amount, or merchant email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent w-full text-sm outline-none text-gray-200 placeholder-gray-400"
          />
        </div>

        <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
          <Filter className="w-4 h-4 text-gray-400 mr-2" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-sm text-gray-200 outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders */}
      {activeTab === "deposit"
        ? renderOrders(filteredOrders, "deposit")
        : renderOrders(filteredOrders, "withdraw")}
    </div>
  );
}