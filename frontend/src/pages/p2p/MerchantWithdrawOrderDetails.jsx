import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import client from "../../api/client";
import { toast } from "react-toastify";
import { ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

const P2P = (path) => `p2p/${path}`;

export default function MerchantWithdrawOrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await client.get(P2P(`withdraw-orders/${orderId}/`));
      setOrder(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load order details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const confirmRelease = async () => {
    setProcessing(true);
    try {
      await client.post(P2P(`withdraw-orders/${orderId}/confirm/`));
      toast.success("Funds released successfully.");
      await fetchOrder();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to confirm release.");
    } finally {
      setProcessing(false);
    }
  };

  const cancelOrder = async () => {
    if (!window.confirm("Cancel this order?")) return;
    setProcessing(true);
    try {
      await client.post(P2P(`withdraw-orders/${orderId}/cancel/`));
      toast.info("Order cancelled.");
      navigate("/p2p/merchant-withdraw-orders");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to cancel order.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-300">Loading order details...</div>;
  if (!order) return <div className="p-6 text-gray-400">Order not found.</div>;

  const formatAmount = (val) => Number(val || 0).toLocaleString();

  return (
    <div className="p-6 text-white max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-400" /> Merchant Withdraw Order #{order.id}
        </h2>
        <Link
          to="/p2p/merchant-withdraw-orders"
          className="flex items-center gap-1 text-gray-300 hover:text-white text-sm"
        >
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      {/* Order Info Card */}
      <div className="bg-gray-800 p-6 rounded-2xl shadow-md space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Amount Requested</p>
            <p className="text-lg font-semibold">₦{formatAmount(order.amount_requested)}</p>
          </div>
          <div>
            <p className="text-gray-400">Total Price</p>
            <p className="text-lg font-semibold">₦{formatAmount(order.total_price)}</p>
          </div>

          <div>
            <p className="text-gray-400">Seller (User)</p>
            <p>{order.seller_email || "N/A"}</p>
          </div>
          <div>
            <p className="text-gray-400">Merchant</p>
            <p>{order.buyer_offer_detail?.merchant_email || "N/A"}</p>
          </div>

          <div>
            <p className="text-gray-400">Rate</p>
            <p>₦{formatAmount(order.buyer_offer_detail?.price_per_unit)}</p>
          </div>
          <div>
            <p className="text-gray-400">Status</p>
            <p
              className={`text-lg font-semibold ${
                order.status === "paid"
                  ? "text-yellow-400"
                  : order.status === "completed"
                  ? "text-green-400"
                  : order.status === "cancelled"
                  ? "text-red-400"
                  : "text-gray-300"
              }`}
            >
              {order.status?.toUpperCase()}
            </p>
          </div>

          <div className="col-span-2">
            <p className="text-gray-400">Created At</p>
            <p>{new Date(order.created_at).toLocaleString()}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-4">
          {order.status === "paid" && (
            <button
              onClick={confirmRelease}
              disabled={processing}
              className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
            >
              <CheckCircle2 size={18} />
              {processing ? "Processing..." : "Confirm Release"}
            </button>
          )}

          {order.status === "pending" && (
            <button
              onClick={cancelOrder}
              disabled={processing}
              className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
            >
              <XCircle size={18} />
              {processing ? "Processing..." : "Cancel Order"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
