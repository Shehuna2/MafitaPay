import React, { useEffect, useState } from "react";
import client from "../../api/client";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightCircle,
  RefreshCcw,
} from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

/* Relative path — baseURL already includes /api/ */
const P2P = (path) => `p2p/${path}`;

export default function MyWithdrawOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  // Fetch user withdraw orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await client.get(P2P("withdraw-orders/"));
      setOrders(res.data || []);
    } catch (err) {
      toast.error("Failed to load withdraw orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Mark as paid
  const markPaid = async (id) => {
    if (!window.confirm("Confirm you've made payment?")) return;
    setProcessingId(id);
    try {
      await client.post(P2P(`withdraw-orders/${id}/mark-paid/`));
      toast.success("Order marked as paid.", { position: "top-right" });
      await fetchOrders();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to mark as paid.");
    } finally {
      setProcessingId(null);
    }
  };

  // Cancel order
  const cancelOrder = async (id) => {
    if (!window.confirm("Cancel this order?")) return;
    setProcessingId(id);
    try {
      await client.post(P2P(`withdraw-orders/${id}/cancel/`));
      toast.info("Order cancelled.", { position: "top-right" });
      await fetchOrders();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to cancel order.");
    } finally {
      setProcessingId(null);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case "paid":
        return "text-yellow-400";
      case "completed":
        return "text-green-400";
      case "cancelled":
        return "text-red-400";
      default:
        return "text-gray-300";
    }
  };

  return (
    <div className="p-6 text-white max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-400" /> My Withdraw Orders
        </h2>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
        >
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      {/* Orders */}
      {loading ? (
        <div className="text-gray-300">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-gray-400">No withdraw orders yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((o) => (
            <div
              key={o.id}
              className="bg-gray-800 p-5 rounded-2xl shadow-md hover:shadow-lg transition space-y-3"
            >
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold text-indigo-400">
                  ₦{o.amount.toLocaleString()}
                </h3>
                <p className={`text-sm font-semibold ${statusColor(o.status)}`}>
                  {o.status?.toUpperCase()}
                </p>
              </div>

              <div className="text-sm text-gray-400">
                <p>Buyer: {o.buyer?.username || "N/A"}</p>
                <p>Seller: {o.seller?.username || "N/A"}</p>
              </div>

              <div className="flex justify-between items-center pt-3">
                <Link
                  to={`/p2p/withdraw-orders/${o.id}`}
                  className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
                >
                  View <ArrowRightCircle size={14} />
                </Link>

                <div className="flex gap-2">
                  {o.status === "pending" && (
                    <>
                      <button
                        onClick={() => markPaid(o.id)}
                        disabled={processingId === o.id}
                        className="bg-yellow-600 hover:bg-yellow-500 px-3 py-1 rounded-lg text-sm flex items-center gap-1 disabled:opacity-60"
                      >
                        <CheckCircle2 size={14} />
                        {processingId === o.id ? "..." : "I've Paid"}
                      </button>
                      <button
                        onClick={() => cancelOrder(o.id)}
                        disabled={processingId === o.id}
                        className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded-lg text-sm flex items-center gap-1 disabled:opacity-60"
                      >
                        <XCircle size={14} />
                        {processingId === o.id ? "..." : "Cancel"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
