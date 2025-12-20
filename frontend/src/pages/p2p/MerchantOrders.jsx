// File: src/pages/p2p/MerchantOrders.jsx
import React, { useEffect, useState } from "react";
import client from "../../api/client";
import { useNavigate, Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCcw,
  Banknote,
  AlertCircle,
} from "lucide-react";
import { Dialog } from "@headlessui/react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import useAudioNotification from "../../hooks/useAudioNotification";

export default function MerchantOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [prevOrders, setPrevOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [user, setUser] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  // Use audio notification hook
  const { playNotification } = useAudioNotification();

  // Retrieve user from localStorage
  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };



  // Load user on mount
  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  const fetchOrders = async (isManual = false) => {
    if (isManual) setLoading(true);
    setPolling(true);
    try {
      const [depositRes, withdrawRes] = await Promise.all([
        client.get("p2p/merchant-orders/"),
        client.get("p2p/merchant-withdraw-orders/"),
      ]);

      const deposits = (depositRes.data?.results || depositRes.data || []).map(
        (o) => ({ ...o, type: "deposit" })
      );

      const withdraws = (
        withdrawRes.data?.results || withdrawRes.data || []
      ).map((o) => ({ ...o, type: "withdraw" }));

      const combined = [...deposits, ...withdraws].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      // Detect new orders
      if (!isInitialLoading) {
        const prevOrderIds = new Set(prevOrders.map((o) => `${o.type}-${o.id}`));
        const newOrders = combined.filter(
          (o) =>
            !prevOrderIds.has(`${o.type}-${o.id}`) &&
            ((o.type === "deposit" && o.status === "paid") ||
             (o.type === "withdraw" && o.status === "pending"))
        );
        if (newOrders.length > 0) {
          playNotification();
        }
      }

      setOrders(combined);
      setPrevOrders(combined);
      setFiltered(typeFilter === "all" ? combined : combined.filter((o) => o.type === typeFilter));
    } catch (err) {
      console.error("❌ Error loading merchant orders:", err);
      if (isManual) toast.error("Failed to load merchant orders.");
    } finally {
      setLoading(false);
      setPolling(false);
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders(false), 10000);
    return () => clearInterval(interval);
  }, [typeFilter]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/merchant-orders/`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "order_update" || data.type === "order_list_update") {
          fetchOrders(false);
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        console.log("WS reconnecting...");
      }, 3000);
    };

    return () => ws.close();
  }, []);


  const handleFilter = (type) => {
    setTypeFilter(type);
    if (type === "all") setFiltered(orders);
    else setFiltered(orders.filter((o) => o.type === type));
  };

  const confirmRelease = async (order) => {
    setSelectedOrder(order);
    setShowReleaseModal(true);
  };

  const handleConfirmRelease = async () => {
    if (!selectedOrder || processingId) return;
    const { id, type } = selectedOrder;
    setProcessingId(id);
    try {
      const url =
        type === "withdraw"
          ? `p2p/withdraw-orders/${id}/confirm/`
          : `p2p/orders/${id}/confirm/`;
      await client.post(url);
      toast.success("Funds released successfully.");
      await fetchOrders(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to confirm release.");
    } finally {
      setProcessingId(null);
      setShowReleaseModal(false);
      setSelectedOrder(null);
    }
  };

  const confirmCancel = (order) => {
    setCancelTarget(order);
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    const { id, type } = cancelTarget;
    setProcessingId(id);
    try {
      const url =
        type === "withdraw"
          ? `p2p/withdraw-orders/${id}/cancel/`
          : `p2p/orders/${id}/cancel/`;

      await client.post(url);
      toast.info("Order cancelled.");
      await fetchOrders(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to cancel order.");
    } finally {
      setProcessingId(null);
      setShowCancelModal(false);
      setCancelTarget(null);
    }
  };

  const cancelOrder = async (order) => {
    const { id, type } = order;
    if (!window.confirm("Cancel this order?")) return;
    setProcessingId(id);
    try {
      const url =
        type === "withdraw"
          ? `p2p/withdraw-orders/${id}/cancel/`
          : `p2p/orders/${id}/cancel/`;
      await client.post(url);
      toast.info("Order cancelled.");
      await fetchOrders(true);
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

  // WhatsApp link with pretext
  const whatsappMessage = user
    ? encodeURIComponent(
        `Hi, I am ${user.first_name} ${user.last_name} (${user.email}). I want to apply to become a merchant on Zunhub.`
      )
    : encodeURIComponent("Hi, I want to apply to become a merchant on Zunhub.");

  // Access-denied UI for non-merchants
  if (!user?.is_merchant) {
    return (
      <div className="p-6 text-white max-w-lg mx-auto">
        <div className="bg-gray-800 p-6 rounded-2xl shadow-xl text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-200 mb-4">Access Denied</h2>
          <p className="text-gray-300 mb-6">
            Only merchants can view merchant orders. To become a merchant, contact our support team via WhatsApp.
          </p>
          <div className="flex justify-center gap-4">
            <a
              href={`https://wa.me/1234567890?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 py-2 px-4 rounded-lg transition hover:scale-105"
              aria-label="Contact support on WhatsApp"
            >
              Contact Support
            </a>
            <Link
              to="/p2p/marketplace"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 py-2 px-4 rounded-lg transition hover:scale-105"
              aria-label="Go to P2P Marketplace"
            >
              Go to Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-6xl mx-auto">
      <ToastContainer />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Banknote className="w-6 h-6 text-indigo-400" /> Merchant Orders
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => handleFilter(e.target.value)}
            className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 text-sm"
          >
            <option value="all">All Orders</option>
            <option value="deposit">Deposit Orders</option>
            <option value="withdraw">Withdraw Orders</option>
          </select>
          <button
            onClick={() => fetchOrders(true)}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
          >
            <RefreshCcw size={16} className={polling ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Orders */}
      {isInitialLoading || loading ? (
        <div className="text-gray-300 text-center py-12">
          <Clock className="inline w-5 h-5 mr-2 animate-spin text-indigo-400" />
          Loading merchant orders...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 text-center py-12">
          No {typeFilter !== "all" ? typeFilter : ""} orders yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const isWithdraw = o.type === "withdraw";
            const amount = o.amount_requested || o.amount || 0;
            const shouldAnimate = isWithdraw ? o.status === "pending" : o.status === "paid";

            return (
              <div
                key={`${o.type}-${o.id}`}
                className={`bg-gray-800 p-5 rounded-2xl shadow-md hover:shadow-lg transition space-y-3 ${
                  shouldAnimate ? "animate-pulse-glow" : ""
                }`}
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-semibold text-indigo-400">
                    {isWithdraw ? "Withdraw" : "Deposit"}: ₦{Number(amount).toLocaleString()}
                  </h3>
                  <p className={`text-sm font-semibold ${statusColor(o.status)}`}>
                    {o.status?.toUpperCase()}
                  </p>
                </div>

                <div className="text-sm text-gray-400 space-y-1">
                  {isWithdraw ? (
                    <div className="flex justify-between">
                      <span className="text-left">Seller:</span>
                      <span className="text-right">
                        {o.seller_email || "N/A"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-left">Buyer:</span>
                      <span className="text-right">
                        {o.buyer_email || o.buyer?.username || "N/A"}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-left">Time:</span>
                    <span className="text-right">
                      {new Date(o.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 justify-center">
                  <Link
                    to={
                      isWithdraw
                        ? `/p2p/withdraw-orders/${o.id}`
                        : `/p2p/order/${o.id}`
                    }
                    className="mt-3 inline-block text-indigo-400 hover:underline text-sm"
                  >
                    View Details →
                  </Link>
                  {o.status === "paid" && (
                    <button
                      onClick={() => confirmRelease(o)}
                      disabled={processingId === o.id}
                      className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded-lg text-sm flex items-center gap-1 disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} />
                      {processingId === o.id ? "..." : "Release"}
                    </button>
                  )}
                  {isWithdraw && o.status === "pending" && (
                    <button
                      onClick={() => confirmCancel(o)}
                      disabled={processingId === o.id}
                      className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded-lg text-sm flex items-center gap-1 disabled:opacity-60"
                    >
                      <XCircle size={14} />
                      {processingId === o.id ? "..." : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Release Confirmation Modal */}
      <Dialog
        open={showReleaseModal}
        onClose={() => setShowReleaseModal(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700 shadow-lg">
            <Dialog.Title className="text-lg font-semibold text-white mb-4">
              Confirm Fund Release
            </Dialog.Title>
            <Dialog.Description className="text-gray-300 mb-6">
              Are you sure you want to release funds for {selectedOrder?.type} order #{selectedOrder?.id} amounting to ₦{selectedOrder ? Number(selectedOrder.amount_requested || selectedOrder.amount || 0).toLocaleString() : "N/A"}? This action cannot be undone.
            </Dialog.Description>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowReleaseModal(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
              >
                Keep Order
              </button>
              <button
                onClick={handleConfirmRelease}
                disabled={processingId}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition disabled:opacity-60"
              >
                {processingId ? "..." : "Release Funds"}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
      <Dialog
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700 shadow-lg">
            <Dialog.Title className="text-lg font-semibold text-white mb-4">
              Cancel Order
            </Dialog.Title>
            <Dialog.Description className="text-gray-300 mb-6">
              Are you sure you want to cancel withdraw order #
              {cancelTarget?.id}? This action cannot be undone.
            </Dialog.Description>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Keep Order
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={processingId}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg disabled:opacity-60"
              >
                {processingId ? "..." : "Cancel Order"}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

    </div>
  );
}