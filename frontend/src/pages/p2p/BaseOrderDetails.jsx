// src/pages/p2p/BaseOrderDetails.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Dialog } from "@headlessui/react";
import client from "../../api/client";
import {
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Banknote,
  User,
  AlertTriangle,
  Copy,
  RefreshCw,
  MessageCircle,
  ArrowLeft,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function BaseOrderDetails({ type }) {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // ← Smooth refresh
  const [role, setRole] = useState(type === "withdraw" ? "seller" : "buyer");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const basePath = type === "withdraw" ? "p2p/withdraw-orders" : "p2p/orders";
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsBase = `${wsProtocol}://${window.location.host}`;
  const wsUrl = `${wsBase}/ws/order/${type === "withdraw" ? "withdraw329-order" : "order"}/${orderId}/`;

  // === ALL YOUR ORIGINAL LOGIC 100% PRESERVED ===
  const calculateTimeLeft = (createdAt) => {
    if (!createdAt) return 900;
    const created = new Date(createdAt);
    const now = new Date();
    const elapsedSeconds = Math.floor((now - created) / 1000);
    return Math.max(0, 15 * 60 - elapsedSeconds);
  };

  // Cached user (exactly as you wrote it)
  let __mafita_cached_user = null;
  let __mafita_cached_user_ts = 0;
  const PROFILE_CACHE_TTL = 5 * 60 * 1000;

  const getCachedUser = async (force = false) => {
    const now = Date.now();
    if (!force && __mafita_cached_user && now - __mafita_cached_user_ts < PROFILE_CACHE_TTL) {
      return __mafita_cached_user;
    }
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.email || parsed?.id) {
          __mafita_cached_user = parsed;
          __mafita_cached_user_ts = now;
          return parsed;
        }
      }
      const access = localStorage.getItem("access");
      if (!access) return null;
      if (force || !__mafita_cached_user_ts || now - __mafita_cached_user_ts > PROFILE_CACHE_TTL) {
        const res = await client.get(`/profile-api/?t=${Date.now()}`);
        if (res?.data) {
          __mafita_cached_user = res.data;
          __mafita_cached_user_ts = Date.now();
          localStorage.setItem("user", JSON.stringify(res.data));
          return res.data;
        }
      }
      return __mafita_cached_user;
    } catch (err) {
      console.warn("getCachedUser error:", err.message);
      return null;
    }
  };

  const refreshAccessToken = async () => {
    try {
      const refresh = localStorage.getItem("refresh");
      if (!refresh) throw new Error("No refresh token");
      const res = await client.post("/auth/token/refresh/", { refresh });
      if (res?.data?.access) {
        localStorage.setItem("access", res.data.access);
        return res.data.access;
      }
      throw new Error("Invalid response");
    } catch (err) {
      console.error("Token refresh failed:", err.message);
      localStorage.clear();
      window.location.href = "/login";
      return null;
    }
  };

  const detectRole = (o, user, t, fallback) => {
    if (!o || !user) return fallback || null;
    const merchantId = o.buyer_offer_detail?.merchant ?? o.sell_offer_detail?.merchant;
    if (merchantId && String(merchantId) === String(user.id)) return "merchant";
    if (user.is_merchant) return "merchant";

    const sellerEmail = o.seller_email?.toLowerCase();
    const buyerEmail = o.buyer_email?.toLowerCase();
    const userEmail = user.email?.toLowerCase();

    if (sellerEmail === userEmail) return "seller";
    if (buyerEmail === userEmail) return "buyer";
    return fallback || null;
  };

  const chooseDetail = (o, t) => t === "withdraw" ? o?.buyer_offer_detail : o?.sell_offer_detail;

  const chooseBank = (o, detail, t) => {
    if (t === "withdraw") {
      return o?.seller_profile || detail?.seller_profile || {};
    }
    return detail?.merchant_profile || o?.seller_profile || {};
  };

  const getWhatsAppLink = () => {
    if (!order) return null;
    let phoneNumber;
    if (type === "withdraw") {
      phoneNumber = role === "merchant"
        ? order.seller_profile?.phone_number
        : order.buyer_offer_detail?.merchant_profile?.phone_number;
    } else {
      phoneNumber = role === "merchant"
        ? order.buyer_profile?.phone_number
        : order.sell_offer_detail?.merchant_profile?.phone_number;
    }
    if (!phoneNumber) return null;
    const formatted = phoneNumber.startsWith("+") ? phoneNumber : `+234${phoneNumber.replace(/^0/, "")}`;
    const pretext = encodeURIComponent(`Hi, I'm contacting you about P2P ${type} order #${order.id}.`);
    return `https://wa.me/${formatted}?text=${pretext}`;
  };

  const fetchOrder = useCallback(async (showLoading = true) => {
    if (!orderId) return;
    if (showLoading) setLoading(true);
    try {
      const res = await client.get(`${basePath}/${orderId}/`);
      const data = res.data;
      setOrder(data);
      if (data.status === "pending" && data.created_at) {
        setTimeLeft(calculateTimeLeft(data.created_at));
      }
      const user = await getCachedUser(false);
      const detected = detectRole(data, user, type, type === "withdraw" ? "seller" : "buyer");
      setRole(detected);
    } catch (err) {
      if (showLoading) toast.error(err.response?.data?.detail || "Failed to load order");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [orderId, basePath, type]);

  // Manual smooth refresh
  const handleRefresh = async () => {
    if (loading || isRefreshing) return;
    setIsRefreshing(true);
    await fetchOrder(false);
    setIsRefreshing(false);
  };

  // Initial load + WebSocket
  useEffect(() => {
    fetchOrder(true);

    let ws = null;
    let reconnectTimer = null;

    const connectWebSocket = async () => {
      let access = localStorage.getItem("access");
      if (!access) return;
      try {
        const payload = JSON.parse(atob(access.split(".")[1]));
        if (Date.now() >= payload.exp * 1000) {
          access = await refreshAccessToken();
          if (!access) return;
        }
      } catch (_) {}

      const url = `${wsUrl}?token=${encodeURIComponent(access)}`;
      ws = new WebSocket(url);

      ws.onopen = () => console.debug("WS Connected");
      ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "order_update") {
          setOrder(msg.data);
          setTimeLeft(calculateTimeLeft(msg.data.created_at));
          const user = await getCachedUser(false);
          const detected = detectRole(msg.data, user, type, type === "withdraw" ? "seller" : "buyer");
          setRole(detected);
          toast.info("Order updated!", { autoClose: 2000 });
        }
      };
      ws.onclose = (e) => {
        if (!e.wasClean && navigator.onLine) {
          reconnectTimer = setTimeout(connectWebSocket, 5000);
        }
      };
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [orderId, type]);

  // Active polling fallback (still included!)
  useEffect(() => {
    if (!order || !["pending", "paid"].includes(order.status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await client.get(`${basePath}/${orderId}/`);
        if (res.data.status !== order.status) {
          setOrder(res.data);
          toast.info(`Status: ${res.data.status}`, { autoClose: 2000 });
        }
      } catch (_) {}
    }, 12000);

    return () => clearInterval(interval);
  }, [order?.status, orderId, basePath]);

  // Countdown timer
  useEffect(() => {
    if (!order || order.status !== "pending") return;
    const cancelRole = type === "withdraw" ? "merchant" : "buyer";
    if (role !== cancelRole) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          handleCancelOrder(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [order?.status, role, type]);

  const handleMarkPaid = async () => {
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/mark-paid/`);
      toast.success("Marked as paid!");
      await fetchOrder(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirmRelease = async () => {
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/confirm/`);
      toast.success("Funds released!");
      await fetchOrder(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCancelOrder = async (isAuto = false) => {
    if (isAuto) {
      setLoadingAction(true);
      try {
        await client.post(`${basePath}/${orderId}/cancel/`);
        toast.info("Order cancelled (timeout)");
        await fetchOrder(false);
      } catch (_) {}
      setLoadingAction(false);
    } else {
      setShowCancelModal(true);
    }
  };

  const confirmCancel = async () => {
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/cancel/`);
      toast.info("Order cancelled");
      await fetchOrder(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally {
      setShowCancelModal(false);
      setLoadingAction(false);
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied!", { autoClose: 1000 });
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;

  if (loading) return <LoadingSkeleton />;
  if (!order) return <NotFound />;

  const { amount_requested, status, total_price, created_at, buyer_email, seller_email } = order;
  const detail = chooseDetail(order, type);
  const bank = chooseBank(order, detail, type);
  const title = type === "withdraw" ? `Withdraw #${order.id}` : `Order #${order.id}`;

  const shouldShowCountdown =
    (type === "withdraw" && role === "merchant" && status === "pending") ||
    (type !== "withdraw" && role === "buyer" && status === "pending");

  const canMarkPaid = (role === "buyer" && status === "pending" && type !== "withdraw") ||
                     (role === "merchant" && status === "pending" && type === "withdraw");

  const canConfirmRelease = (role === "merchant" && status === "paid" && type !== "withdraw") ||
                           (role === "seller" && status === "paid" && type === "withdraw");

  const canCancel = status === "pending" &&
    ((type === "withdraw" && role === "merchant") || (type !== "withdraw" && role === "buyer"));

  const statusConfig = {
    pending: { label: "Awaiting Payment", color: "bg-yellow-500", icon: Clock },
    paid: { label: "Paid – Release Funds", color: "bg-blue-500", icon: AlertTriangle },
    completed: { label: "Completed", color: "bg-green-600", icon: CheckCircle },
    cancelled: { label: "Cancelled", color: "bg-red-600", icon: XCircle },
  };
  const currentStatus = statusConfig[status] || statusConfig.pending;

  return (
    <>
      <ToastContainer position="top-center" theme="dark" autoClose={3000} />

      <div className="min-h-screen bg-gray-950 text-white pb-24">
        {/* Sticky Header */}
        <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur-xl border-b border-gray-800">
          <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between">
            <Link to="/p2p" className="flex items-center gap-3 text-indigo-400 hover:text-indigo-300">
              <ArrowLeft className="w-6 h-6" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-3">
              <Banknote className="w-7 h-7 text-indigo-400" />
              {title}
            </h1>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="relative p-3 bg-gray-800/80 rounded-xl hover:bg-gray-700 transition-all"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-indigo-400' : 'text-gray-400'}`} />
              {isRefreshing && <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full animate-pulse" />}
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
          {/* Status Banner */}
          <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-700/50 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-3">
              <currentStatus.icon className="w-8 h-8" />
              <span className="text-2xl font-bold">{currentStatus.label}</span>
            </div>
            {shouldShowCountdown && (
              <div className="mt-5">
                <p className="text-lg mb-3">
                  <Clock className="inline w-5 h-5 text-yellow-400" /> Time left: {" "}
                  <span className="font-mono text-2xl text-yellow-400">{formatTime(timeLeft)}</span>
                </p>
                <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-1000"
                    style={{ width: `${(timeLeft / 900) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-6 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-indigo-400" />
                Transaction Details
              </h3>
              <div className="space-y-4 text-lg">
                <InfoRow label="Amount" value={`₦${Number(amount_requested).toLocaleString()}`} />
                <InfoRow label="Rate" value={`₦${Number(detail?.price_per_unit || 0).toLocaleString()}`} />
                <InfoRow label="Total" value={`₦${Number(total_price).toLocaleString()}`} bold />
                <InfoRow label="Created" value={new Date(created_at).toLocaleString()} />
                {role === "buyer" && <InfoRow label={type === "withdraw" ? "Seller" : "Merchant"} value={type === "withdraw" ? seller_email : detail?.merchant_email || "N/A"} />}
                {role === "merchant" && <InfoRow label={type === "withdraw" ? "Seller" : "Buyer"} value={type === "withdraw" ? seller_email : buyer_email || "N/A"} />}
                {role === "seller" && type === "withdraw" && <InfoRow label="Merchant" value={detail?.merchant_email || "N/A"} />}
              </div>
            </div>

            <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-6 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <Banknote className="w-6 h-6 text-green-400" />
                Payment Details
              </h3>
              <div className="bg-gray-800/70 rounded-xl p-5 space-y-4">
                <InfoRow label="Name" value={bank?.full_name || "Not provided"} />
                <InfoRow label="Bank" value={bank?.bank_name || detail?.bank_name || "Not provided"} />
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Account No</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg">{bank?.account_no || "N/A"}</span>
                    {bank?.account_no && (
                      <button onClick={() => copyToClipboard(bank.account_no)} className="p-2 bg-gray-700 hover:bg-indigo-600 rounded-lg transition">
                        <Copy className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {getWhatsAppLink() && (
                <a href={getWhatsAppLink()} target="_blank" rel="noopener noreferrer"
                  className="w-full inline-flex justify-center items-center gap-3 bg-green-600 hover:bg-green-500 py-4 rounded-xl font-semibold text-lg transition shadow-lg">
                  <MessageCircle className="w-6 h-6" />
                  Contact via WhatsApp
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {canMarkPaid && (
              <button onClick={handleMarkPaid} disabled={loadingAction}
                className="px-10 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-60 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition shadow-xl">
                {loadingAction ? <Loader2 className="w-6 h-6 animate-spin" /> : "I've Paid"}
              </button>
            )}
            {canConfirmRelease && (
              <button onClick={handleConfirmRelease} disabled={loadingAction}
                className="px-10 py-5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-60 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition shadow-xl">
                {loadingAction ? <Loader2 className="w-6 h-6 animate-spin" /> : "Release Funds"}
              </button>
            )}
            {canCancel && (
              <button onClick={() => setShowCancelModal(true)}
                className="px-10 py-5 bg-red-600 hover:bg-red-500 rounded-2xl font-bold text-lg transition shadow-xl">
                Cancel Order
              </button>
            )}
            {status === "completed" && (
              <div className="text-center text-2xl font-bold text-green-400 flex items-center gap-3">
                <CheckCircle className="w-10 h-10" /> Completed!
              </div>
            )}
            {status === "cancelled" && (
              <div className="text-center text-2xl font-bold text-red-400 flex items-center gap-3">
                <XCircle className="w-10 h-10" /> Cancelled
              </div>
            )}
          </div>
        </div>

        {/* Cancel Modal */}
        <Dialog open={showCancelModal} onClose={() => setShowCancelModal(false)} className="relative z-50">
          <div className="fixed inset-0 bg-black/80" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <Dialog.Title className="text-2xl font-bold text-red-400 mb-4">Cancel Order?</Dialog.Title>
              <p className="text-gray-300 mb-8">This cannot be undone.</p>
              <div className="flex gap-4 justify-end">
                <button onClick={() => setShowCancelModal(false)}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition">
                  Keep Order
                </button>
                <button onClick={confirmCancel} disabled={loadingAction}
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-medium transition flex items-center gap-2">
                  {loadingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : "Cancel"}
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* Mobile Bottom Nav */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-950/95 backdrop-blur border-t border-gray-800 px-4 py-4 sm:hidden z-40">
          <Link to="/p2p" className="flex items-center justify-center gap-2 text-indigo-400 font-medium">
            <ArrowLeft className="w-5 h-5" />
            Back to P2P
          </Link>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, bold }) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-gray-800 last:border-0">
      <span className="text-gray-400">{label}:</span>
      <span className={`font-medium ${bold ? "text-xl text-white" : ""}`}>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-400 mx-auto mb-4" />
        <p className="text-xl text-gray-400">Loading order...</p>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center">
      <div>
        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <p className="text-2xl text-gray-400">Order not found</p>
      </div>
    </div>
  );
}