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
import useAudioNotification from "../../hooks/useAudioNotification";

const P2P = (path) => `p2p/${path}`;

export default function MerchantWithdrawOrders() {
  const [orders, setOrders] = useState([]);
  const [prevOrders, setPrevOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Use audio notification hook
  const { playNotification } = useAudioNotification();

  // Fetch merchant withdraw orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await client.get(P2P("merchant-withdraw-orders/"));
      const data = res.data?.results || res.data || [];
      const ordersArray = Array.isArray(data) ? data : [];
      
      // Detect new pending orders for audio notification
      if (!isInitialLoading && prevOrders.length > 0) {
        const prevOrderIds = new Set(prevOrders.map((o) => o.id));
        const newPendingOrders = ordersArray.filter(
          (o) => !prevOrderIds.has(o.id) && o.status === "pending"
        );
        if (newPendingOrders.length > 0) {
          playNotification();
          toast.info(`${newPendingOrders.length} new pending withdraw order(s) received!`);
        }
      }
      
      setOrders(ordersArray);
      setPrevOrders(ordersArray);
    } catch (err) {
      console.error("Failed to load merchant withdraw orders:", err);
      toast.error("Failed to load merchant withdraw orders.");
    } finally {
      setLoading(false);
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Poll for new orders every 10 seconds
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  // Confirm release
  const confirmRelease = async (id) => {
    if (!window.confirm("Confirm release for this order?")) return;
    setProcessingId(id);
    try {
      await client.post(P2P(`withdraw-orders/${id}/confirm/`));
      toast.success("Funds released successfully.");
      await fetchOrders();
    } catch (err) {
      console.error("Failed to confirm release:", err);
      toast.error(err?.response?.data?.detail || "Failed to confirm release.");
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
      toast.info("Order cancelled.");
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
          <Clock className="w-6 h-6 text-indigo-400" /> Merchant Withdraw Orders
        </h2>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
        >
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-gray-300">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-gray-400">No withdraw orders yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((o) => {
            const shouldAnimate = o.status === "pending";
            
            return (
              <div
                key={o.id}
                className={`bg-gray-800 p-5 rounded-2xl shadow-md hover:shadow-lg transition space-y-3 ${
                  shouldAnimate ? "animate-pulse-glow" : ""
                }`}
              >
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold text-indigo-400">
                  ₦{Number(o.amount || 0).toLocaleString()}
                </h3>
                <p className={`text-sm font-semibold ${statusColor(o.status)}`}>
                  {o.status?.toUpperCase()}
                </p>
              </div>

              <div className="text-sm text-gray-400">
                <p>Buyer: {o.buyer?.email || "N/A"}</p>
                <p>Seller: {o.seller?.email || "N/A"}</p>
              </div>

              <div className="flex justify-between items-center pt-3">
                <Link
                  to={`/p2p/withdraw-orders/${o.id}`}
                  className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
                >
                  View <ArrowRightCircle size={14} />
                </Link>

                <div className="flex gap-2">
                  {o.status === "paid" && (
                    <button
                      onClick={() => confirmRelease(o.id)}
                      disabled={processingId === o.id}
                      className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded-lg text-sm flex items-center gap-1 disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} />
                      {processingId === o.id ? "..." : "Release"}
                    </button>
                  )}

                  {o.status === "pending" && (
                    <button
                      onClick={() => cancelOrder(o.id)}
                      disabled={processingId === o.id}
                      className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded-lg text-sm flex items-center gap-1 disabled:opacity-60"
                    >
                      <XCircle size={14} />
                      {processingId === o.id ? "..." : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}
