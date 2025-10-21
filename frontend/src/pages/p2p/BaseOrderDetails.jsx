// File: src/pages/p2p/BaseOrderDetails.jsx
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
  MessageCircle, // Added for WhatsApp
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

  // --- Helpers ---
  const calculateTimeLeft = (createdAt) => {
    if (!createdAt) return 900;
    const created = new Date(createdAt);
    const now = new Date();
    const elapsedSeconds = Math.floor((now - created) / 1000);
    const maxTime = 15 * 60;
    return Math.max(0, maxTime - elapsedSeconds);
  };

  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const detectRole = (o, user, t, fallbackRole) => {
    if (!o) return fallbackRole || null;
    if (user?.is_merchant) return "merchant";

    const sellerEmail = o.seller_email?.toLowerCase();
    const buyerEmail = o.buyer_email?.toLowerCase();
    const userEmail = user?.email?.toLowerCase();

    if (sellerEmail && userEmail && sellerEmail === userEmail) return "seller";
    if (buyerEmail && userEmail && buyerEmail === userEmail) return "buyer";

    const merchantId = o.buyer_offer_detail?.merchant ?? o.sell_offer_detail?.merchant;
    if (merchantId != null && user?.id != null) {
      if (String(merchantId) === String(user.id)) return "merchant";
    }

    return fallbackRole || null;
  };

  const chooseDetail = (o, t) =>
    t === "withdraw" ? o?.buyer_offer_detail : o?.sell_offer_detail;

  const chooseBank = (o, detail, t) => {
    if (t === "withdraw") {
      return o?.seller_profile || detail?.seller_profile || {};
    }
    return detail?.merchant_profile || {};
  };

  // WhatsApp link
  const getWhatsAppLink = () => {
    if (!order) return null;
    let phoneNumber;
    let contactRole;

    if (type === "withdraw") {
      // Withdraw: Merchant contacts seller, seller contacts merchant
      phoneNumber = role === "merchant"
        ? order.seller_profile?.phone_number
        : order.buyer_offer_detail?.merchant_profile?.phone_number;
      contactRole = role === "merchant" ? "seller" : "merchant";
    } else {
      // Deposit: Buyer contacts merchant, merchant contacts buyer
      phoneNumber = role === "merchant"
        ? order.buyer_profile?.phone_number
        : order.sell_offer_detail?.merchant_profile?.phone_number;
      contactRole = role === "merchant" ? "buyer" : "merchant";
    }

    if (!phoneNumber) return null;

    // Ensure phone number is in international format (assume Nigerian numbers)
    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+234${phoneNumber.replace(/^0/, "")}`;
    const pretext = encodeURIComponent(
      `Hi, I'm contacting you regarding P2P ${type} order #${order.id}.`
    );
    return `https://wa.me/${formattedPhone}?text=${pretext}`;
  };

  // --- Fetch ---
  const fetchOrder = useCallback(
    async (isManual = false) => {
      if (!orderId) {
        if (isManual) {
          toast.error("Invalid order ID", { position: "top-right", autoClose: 3000 });
        }
        setLoading(false);
        setPolling(false);
        return;
      }

      if (isManual) setLoading(true);
      setPolling(true);
      try {
        const res = await client.get(`${basePath}/${orderId}/`);
        const data = res.data;
        setOrder(data);

        if (data.status === "pending" && data.created_at) {
          setTimeLeft(calculateTimeLeft(data.created_at));
        }

        const user = getStoredUser();
        const detected = detectRole(data, user, type, type === "withdraw" ? "seller" : "buyer");
        setRole(detected);

        console.debug("Role detected:", detected);
        console.debug("Order debug:", {
          buyer_email: data.buyer_email,
          seller_email: data.seller_email,
          buyer_offer_detail: data.buyer_offer_detail,
          sell_offer_detail: data.sell_offer_detail,
          seller_profile: data.seller_profile,
          buyer_profile: data.buyer_profile,
          user,
        });
      } catch (err) {
        const msg =
          err.response?.data?.detail ||
          err.response?.data?.error ||
          "Failed to load order";
        if (isManual) {
          toast.error(msg, { position: "top-right", autoClose: 3000 });
        }
      } finally {
        setLoading(false);
        setPolling(false);
      }
    },
    [orderId, basePath, type]
  );

  useEffect(() => {
    if (!orderId) return;
    fetchOrder();
    const interval = setInterval(() => fetchOrder(false), 5000);
    return () => clearInterval(interval);
  }, [orderId, fetchOrder]);

  // Countdown and auto-cancel
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

  // --- Actions ---
  const handleMarkPaid = async () => {
    if (loadingAction) return;
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/mark-paid/`);
      toast.success("Marked as paid!", { position: "top-right", autoClose: 3000 });
      await fetchOrder(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update status", {
        position: "top-right",
        autoClose: 3000,
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirmRelease = async () => {
    if (loadingAction) return;
    setLoadingAction(true);
    try {
      await client.post(`${basePath}/${orderId}/confirm/`);
      toast.success("Funds released successfully!", { position: "top-right", autoClose: 3000 });
      await fetchOrder(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to confirm release", {
        position: "top-right",
        autoClose: 3000,
      });
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
        toast.info("Order cancelled due to timeout!", { position: "top-right", autoClose: 3000 });
        await fetchOrder(true);
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Failed to cancel order", {
          position: "top-right",
          autoClose: 3000,
        });
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
      toast.info("Order cancelled!", { position: "top-right", autoClose: 3000 });
      await fetchOrder(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to cancel order", {
        position: "top-right",
        autoClose: 3000,
      });
    } finally {
      setShowCancelModal(false);
      setLoadingAction(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (t) => {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // --- Render guards ---
  if (loading)
    return (
      <div className="flex justify-center mt-16 text-gray-400">
        <Loader2 className="animate-spin w-6 h-6" /> Loading order...
      </div>
    );

  if (!order)
    return <p className="text-center text-gray-400 mt-16">Order not found.</p>;

  // --- Data plumbing for render ---
  const {
    amount_requested,
    status,
    total_price,
    created_at,
    buyer_email,
    seller_email,
  } = order;

  const detail = chooseDetail(order, type);
  const bank = chooseBank(order, detail, type);

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
    ((type === "withdraw" && (role === "seller" || role === "merchant")) ||
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
                  <span className="text-lg">
                    ₦{detail?.price_per_unit?.toLocaleString() ?? "N/A"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total:</span>
                  <span className="text-lg">₦{total_price?.toLocaleString()}</span>
                </div>

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
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Name:</span>
                  <span className="text-lg">{bank.full_name || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Bank:</span>
                  <span className="text-lg">{bank.bank_name || detail?.bank_name || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Account No:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{bank.account_no || "Unavailable"}</span>
                    <button
                      onClick={() =>
                        bank.account_no
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
                      aria-label={`Contact ${role === "merchant" ? (type === "withdraw" ? "seller" : "buyer") : "merchant"} via WhatsApp`}
                    >
                      <MessageCircle size={14} />
                      Contact {role === "merchant" ? (type === "withdraw" ? "Seller" : "Buyer") : "Merchant"}
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