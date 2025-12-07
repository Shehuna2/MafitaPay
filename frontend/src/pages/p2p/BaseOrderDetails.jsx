// src/pages/p2p/BaseOrderDetails.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Dialog } from "@headlessui/react";
import client from "../../api/client";
import {
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Banknote,
  User,
  AlertCircle,
  Copy,
  RefreshCcw,
  MessageCircle,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function BaseOrderDetails({ type }) {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [role, setRole] = useState(type === "withdraw" ? "seller" : "buyer");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const basePath = type === "withdraw" ? "p2p/withdraw-orders" : "p2p/orders";

  // WebSocket URL (protocol-aware)
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsBase = `${wsProtocol}://${window.location.host}`;
  const wsUrl = `${wsBase}/ws/order/${
    type === "withdraw" ? "withdraw-order" : "order"
  }/${orderId}/`;

  const calculateTimeLeft = (createdAt) => {
    if (!createdAt) return 900;
    const created = new Date(createdAt);
    const now = new Date();
    const elapsedSeconds = Math.floor((now - created) / 1000);
    const maxTime = 15 * 60;
    return Math.max(0, maxTime - elapsedSeconds);
  };

  let __mafita_cached_user = null;
  let __mafita_cached_user_ts = 0;
  const PROFILE_CACHE_TTL = 5 * 60 * 1000;

  const getCachedUser = async (force = false) => {
    try {
      const now = Date.now();

      // In-memory cache
      if (!force && __mafita_cached_user && (now - __mafita_cached_user_ts) < PROFILE_CACHE_TTL) {
        return __mafita_cached_user;
      }

      // LocalStorage fallback
      try {
        const raw = localStorage.getItem("user");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.email || parsed.id || parsed.user_id)) {
            __mafita_cached_user = parsed;
            __mafita_cached_user_ts = now;
            return parsed;
          }
        }
      } catch {}

      // No access → don't spam profile api
      const access = localStorage.getItem("access");
      if (!access) return null;

      // Rate-limited profile fetch
      if (!force && __mafita_cached_user_ts && (now - __mafita_cached_user_ts) < PROFILE_CACHE_TTL) {
        return __mafita_cached_user;
      }

      const res = await client.get(`/profile-api/?t=${Date.now()}`);
      if (res?.data) {
        __mafita_cached_user = res.data;
        __mafita_cached_user_ts = Date.now();
        localStorage.setItem("user", JSON.stringify(res.data));
        return res.data;
      }

      return null;
    } catch (err) {
      console.warn("getCachedUser() error:", err.message);
      return null;
    }
  };

  // ---- Token Refresh ----
  const refreshAccessToken = async () => {
    try {
      const refresh = localStorage.getItem("refresh");
      if (!refresh) throw new Error("No refresh token");

      const res = await client.post("/auth/token/refresh/", { refresh });
      if (res?.data?.access) {
        localStorage.setItem("access", res.data.access);
        return res.data.access;
      }
      throw new Error("Invalid refresh response");
    } catch (err) {
      console.error("Token refresh failed:", err.message);
      localStorage.clear();
      window.location.href = "/login";
      return null;
    }
  };


  const detectRole = (o, user, t, fallbackRole) => {
    if (!o) return fallbackRole || null;
    if (!user) return null;

    const merchantId =
      o.buyer_offer_detail?.merchant ?? o.sell_offer_detail?.merchant;
    if (merchantId && String(merchantId) === String(user.id)) return "merchant";
    if (user.is_merchant) return "merchant";

    const sellerEmail = o.seller_email?.toLowerCase();
    const buyerEmail = o.buyer_email?.toLowerCase();
    const userEmail = user.email?.toLowerCase();

    if (sellerEmail === userEmail) return "seller";
    if (buyerEmail === userEmail) return "buyer";
    return fallbackRole || null;
  };

  const chooseDetail = (o, t) =>
    t === "withdraw" ? o?.buyer_offer_detail : o?.sell_offer_detail;

  // IMPORTANT: use the fields that exist on your UserProfile:
  // full_name, bank_name, account_no (not account_number/account_name)
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
      phoneNumber =
        role === "merchant"
          ? order.seller_profile?.phone_number
          : order.buyer_offer_detail?.merchant_profile?.phone_number;
    } else {
      phoneNumber =
        role === "merchant"
          ? order.buyer_profile?.phone_number
          : order.sell_offer_detail?.merchant_profile?.phone_number;
    }
    if (!phoneNumber) return null;
    const formattedPhone = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+234${phoneNumber.replace(/^0/, "")}`;
    const pretext = encodeURIComponent(
      `Hi, I'm contacting you regarding P2P ${type} order #${order.id}.`
    );
    return `https://wa.me/${formattedPhone}?text=${pretext}`;
  };

  // ---- Fetch Order (no profile spam) ----
  const fetchOrder = useCallback(
    async (isManual = false) => {
      if (!orderId) {
        if (isManual) toast.error("Invalid order ID");
        return;
      }

      if (isManual) setLoading(true);

      try {
        const res = await client.get(`${basePath}/${orderId}/`);
        const data = res.data;

        setOrder(data);

        if (data.status === "pending" && data.created_at) {
          setTimeLeft(calculateTimeLeft(data.created_at));
        }

        // Use cached user (never spam profile API)
        let user = await getCachedUser(false);

        // If manual reload and user missing → fetch profile once
        if (!user && isManual) {
          user = await getCachedUser(true);
        }

        const detected = detectRole(
          data,
          user,
          type,
          type === "withdraw" ? "seller" : "buyer"
        );

        setRole(detected);
      } catch (err) {
        if (isManual) {
          toast.error(
            err.response?.data?.detail ||
            err.response?.data?.error ||
            "Failed to load order"
          );
        }
        console.error("fetchOrder error", err.message);
      } finally {
        setLoading(false);
      }
    },
    [orderId, basePath, type]
  );

  useEffect(() => {
    if (!orderId) return;

    fetchOrder();
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
      } catch (err) {
        console.error("Failed to decode token:", err);
        return;
      }

      const wsUrlWithToken = `${wsUrl}?token=${encodeURIComponent(access)}`;
      ws = new WebSocket(wsUrlWithToken);

      ws.onopen = () => console.debug("WebSocket connected:", wsUrlWithToken);

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "order_update") {
          console.debug("WebSocket order update:", data.data);
          setOrder(data.data);
          setTimeLeft(calculateTimeLeft(data.data.created_at));
          // Use cached user (never spam profile API)
          const user = await getCachedUser(false);
          const detected = detectRole(data.data, user, type, type === "withdraw" ? "seller" : "buyer");
          setRole(detected);
          toast.dismiss();
          toast.info("Order updated!", { autoClose: 2000 });
        }
      };

      ws.onclose = (e) => {
        console.warn("Order WebSocket closed:", wsUrlWithToken, "Code:", e.code, "Reason:", e.reason);
        if (!e.wasClean && navigator.onLine) {
          reconnectTimer = setTimeout(connectWebSocket, 5000);
        }
      };

      ws.onerror = (err) => console.error("WebSocket error:", err);
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [orderId, fetchOrder, type]);

  // ---- Adaptive Polling (no storming) ----
  useEffect(() => {
    if (!orderId || !order) return;

    const isActive = ["pending", "paid"].includes(order.status);
    if (!isActive) return;

    let timer = null;
    let attempt = 0;

    const BASE = 10000; // 10s
    const MAX = 60000;

    const poll = async () => {
      try {
        const res = await client.get(`${basePath}/${orderId}/`);
        const data = res.data;

        // reset backoff
        attempt = 0;

        if (data.status !== order.status) {
          setOrder(data);
          toast.info(`Order updated: ${data.status}`, { autoClose: 2000 });
        }

        timer = setTimeout(poll, BASE);
      } catch (err) {
        attempt++;
        const delay = Math.min(BASE * Math.pow(1.5, attempt), MAX);
        console.warn("Polling failed → backoff:", delay);
        timer = setTimeout(poll, delay);
      }
    };

    timer = setTimeout(poll, BASE);

    return () => clearTimeout(timer);
  }, [order?.status, orderId]);


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
    if (loadingAction) return;
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/mark-paid/`);
      toast.success("Marked as paid!", { autoClose: 3000 });
      await fetchOrder(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update status");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirmRelease = async () => {
    if (loadingAction) return;
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/confirm/`);
      toast.success("Funds released successfully!", { autoClose: 3000 });
      await fetchOrder(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to confirm release");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCancelOrder = async (isAutoCancel = false) => {
    if (loadingAction) return;
    if (isAutoCancel) {
      setLoadingAction(true);
      try {
        await client.post(`${basePath}/${orderId}/cancel/`);
        toast.info("Order cancelled due to timeout!", { autoClose: 3000 });
        await fetchOrder(true);
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Failed to cancel order");
      } finally {
        setLoadingAction(false);
      }
    } else {
      setShowCancelModal(true);
    }
  };

  const confirmCancel = async () => {
    if (loadingAction) return;
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/cancel/`);
      toast.info("Order cancelled!", { autoClose: 3000 });
      await fetchOrder(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to cancel order");
    } finally {
      setShowCancelModal(false);
      setLoadingAction(false);
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (t) => {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (loading)
    return (
      <div className="flex justify-center mt-16 text-gray-400">
        <Loader2 className="animate-spin w-6 h-6" /> Loading order...
      </div>
    );

  if (!order) return <p className="text-center text-gray-400 mt-16">Order not found.</p>;

  // Keep original email vars
  const { amount_requested, status, total_price, created_at, buyer_email, seller_email } = order;
  const detail = chooseDetail(order, type);
  const bank = chooseBank(order, detail, type); // bank uses full_name, bank_name, account_no

  const renderStatusBadge = () => {
    const map = {
      pending: { label: "Awaiting Payment", color: "bg-yellow-500" },
      paid: { label: "Paid - Awaiting Release", color: "bg-blue-500" },
      completed: { label: "Completed", color: "bg-green-600" },
      cancelled: { label: "Cancelled", color: "bg-red-600" },
    };
    const cfg = map[status] || map.pending;
    return (
      <span className={`px-3 py-1 rounded-full text-xs ${cfg.color} text-white`}>
        {cfg.label}
      </span>
    );
  };

  const title = type === "withdraw" ? `Withdraw Order #${order.id}` : `Order #${order.id}`;

  const shouldShowCountdown =
    (type === "withdraw" && role === "merchant" && status === "pending") ||
    (type === "deposit" && role === "buyer" && status === "pending");

  const canMarkPaid =
    (role === "buyer" && status === "pending" && type === "deposit") ||
    (role === "merchant" && status === "pending" && type === "withdraw");

  const canConfirmRelease =
    (role === "merchant" && status === "paid" && type === "deposit") ||
    (role === "seller" && status === "paid" && type === "withdraw");

  const canCancel =
    status === "pending" &&
    ((type === "withdraw" && (role === "merchant")) ||
      (type === "deposit" && role === "buyer"));

  return (
    <div className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-white min-h-screen">
      <ToastContainer />
      <div className="bg-gray-900 rounded-2xl shadow-xl p-6 relative z-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Banknote className="w-6 h-6 text-indigo-400" /> {title}
            </h2>
            <div className="flex items-center gap-3">
              {renderStatusBadge()}
              <button
                onClick={() => fetchOrder(true)}
                disabled={loading || polling}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
              >
                <RefreshCcw size={16} className={polling ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {shouldShowCountdown && (
            <div className="text-center mb-4 text-sm text-gray-300">
              <div className="flex justify-center items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                Complete payment within{" "}
                <span className="font-semibold text-yellow-400">
                  {formatTime(timeLeft)}
                </span>
              </div>
              <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-yellow-400 h-full transition-all"
                  style={{ width: `${(timeLeft / 900) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-indigo-400" /> Transaction Info
              </h3>
              <div className="bg-gray-800 p-4 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Amount:</span>
                  <span className="text-lg">₦{amount_requested?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Rate:</span>
                  <span className="text-lg">{detail?.price_per_unit?.toLocaleString() ?? "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total:</span>
                  <span className="text-lg">₦{total_price?.toLocaleString()}</span>
                </div>

                {/* keep the original role/email logic */}
                {role === "buyer" && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">{type === "withdraw" ? "Seller" : "Merchant"}:</span>
                    <span className="text-lg">
                      {type === "withdraw" ? seller_email || "N/A" : detail?.merchant_email || "N/A"}
                    </span>
                  </div>
                )}
                {role === "merchant" && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">{type === "withdraw" ? "Seller" : "Buyer"}:</span>
                    <span className="text-lg">
                      {type === "withdraw" ? seller_email || "N/A" : buyer_email || "N/A"}
                    </span>
                  </div>
                )}
                {role === "seller" && type === "withdraw" && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Merchant:</span>
                    <span className="text-lg">{detail?.merchant_email || "N/A"}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Created:</span>
                  <span className="text-lg">{created_at ? new Date(created_at).toLocaleString() : "N/A"}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-400" /> Receiving Details
              </h3>
              <div className="bg-gray-800 p-4 rounded-xl space-y-2">
                {/* **CORRECT FIELDS** from UserProfile */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Name:</span>
                  <span className="text-lg">{bank?.full_name || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Bank:</span>
                  <span className="text-lg">{bank?.bank_name || detail?.bank_name || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Account No:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{bank?.account_no || "Unavailable"}</span>
                    <button
                      onClick={() =>
                        bank?.account_no
                          ? copyToClipboard(bank.account_no)
                          : toast.error("Account number unavailable", { position: "top-right", autoClose: 3000 })
                      }
                      className="text-gray-400 hover:text-indigo-400"
                      aria-label="Copy account number"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {copied && <span className="text-xs text-green-400">Copied!</span>}
                  </div>
                </div>

                {getWhatsAppLink() && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Contact:</span>
                    <a
                      href={getWhatsAppLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-green-600 hover:bg-green-700 px-4 py-1 rounded-lg text-sm flex items-center gap-1"
                    >
                      <MessageCircle size={14} />
                      Contact
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-3">
            {canMarkPaid && (
              <button
                onClick={handleMarkPaid}
                disabled={loadingAction}
                className="bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded-lg transition disabled:opacity-60"
              >
                {loadingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : "I’ve Paid"}
              </button>
            )}
            {canConfirmRelease && (
              <button
                onClick={handleConfirmRelease}
                disabled={loadingAction}
                className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg transition disabled:opacity-60"
              >
                {loadingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Release"}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg transition"
              >
                Cancel
              </button>
            )}
            {status === "completed" && (
              <div className="flex items-center text-green-400 gap-2">
                <CheckCircle className="w-5 h-5" /> Completed Successfully
              </div>
            )}
            {status === "cancelled" && (
              <div className="flex items-center text-red-400 gap-2">
                <XCircle className="w-5 h-5" /> Order Cancelled
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showCancelModal} onClose={() => setShowCancelModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700 shadow-lg">
            <Dialog.Title className="text-lg font-semibold text-white mb-4">Confirm Cancellation</Dialog.Title>
            <Dialog.Description className="text-gray-300 mb-6">
              Are you sure you want to cancel this order? This action cannot be undone.
            </Dialog.Description>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCancelModal(false)} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition">
                Keep Order
              </button>
              <button onClick={confirmCancel} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition">
                Cancel Order
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
