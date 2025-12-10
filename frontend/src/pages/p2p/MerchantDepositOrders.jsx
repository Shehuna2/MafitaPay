import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  RefreshCcw,
  User,
  Eye,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function MerchantDepositOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // ✅ Fetch merchant orders
  const fetchOrders = async () => {
    try {
      const res = await client.get("p2p/merchant-orders/");
      const data = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.results)
        ? res.data.results
        : [];
      setOrders(data);
    } catch (err) {
      console.error("❌ Error loading orders:", err);
      setError(err.response?.data?.error || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000); // auto-refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const handleConfirmOrder = async (orderId) => {
    try {
      await client.post(`p2p/orders/${orderId}/confirm/`);
      toast.success("✅ Funds released successfully!");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to confirm order.");
    }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      await client.post(`p2p/orders/${orderId}/cancel/`);
      toast.success("❌ Order cancelled.");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to cancel order.");
    }
  };

  const renderStatusBadge = (status) => {
    const map = {
      pending: { label: "Awaiting Payment", color: "bg-yellow-500" },
      paid: { label: "Paid - Awaiting Release", color: "bg-blue-500" },
      completed: { label: "Completed", color: "bg-green-600" },
      cancelled: { label: "Cancelled", color: "bg-red-600" },
    };
    const cfg = map[status] || map.pending;
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs ${cfg.color} text-white`}
      >
        {cfg.label}
      </span>
    );
  };

  if (loading)
    return (
      <div className="flex justify-center mt-10 text-gray-400">
        <Loader2 className="animate-spin w-5 h-5 mr-2" /> Loading orders...
      </div>
    );

  if (error)
    return <p className="text-center text-red-500 mt-6">{error}</p>;

  if (!orders.length)
    return <p className="text-center text-gray-400 mt-6">No orders found.</p>;

  return (
    <div className="max-w-6xl mx-auto p-6 text-white">
      <ToastContainer />
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Banknote className="w-6 h-6 text-indigo-400" /> Merchant Orders
        </h2>
        <button
          onClick={fetchOrders}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <RefreshCcw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {orders.map((order) => {
          const buyer = order.buyer_email;
          const offer = order.sell_offer_detail;

          return (
            <div
              key={order.id}
              className="bg-gray-900 p-5 rounded-2xl shadow-lg border border-gray-700 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="font-semibold text-lg">Order #{order.id}</p>

                {renderStatusBadge(order.status)}
              </div>
                <p className="text-sm text-gray-400">
                  Buyer: <span className="text-white">{buyer}</span>
                </p>
                <p className="text-sm text-gray-400">
                  Amount: <span className="text-white">₦{order.amount_requested}</span>
                </p>
                <p className="text-sm text-gray-400">
                  Rate: <span className="text-white">₦{offer?.price_per_unit}</span>
                </p>
                <p className="text-sm text-gray-400">
                  Total: <span className="text-white">₦{order.total_price}</span>
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Created:{" "}
                  <span className="text-white">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </p>
              </div>

              {/* Action buttons */}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {order.status === "paid" && (
                  <button
                    onClick={() => handleConfirmOrder(order.id)}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm flex items-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" /> Confirm Release
                  </button>
                )}

                <button
                  onClick={() => navigate(`/p2p/order/${order.id}`)}
                  className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" /> View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}