import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../api/client";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function MyDepositOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await client.get("p2p/my-orders/");
        const data = Array.isArray(res.data.results)
          ? res.data.results
          : Array.isArray(res.data)
          ? res.data
          : [];
        setOrders(data);
      } catch (err) {
        console.error("Failed to load orders:", err);
        setError(err.response?.data?.error || "Could not load your orders.");
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending":
        return (
          <span className="bg-yellow-600 text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3" /> Awaiting Payment
          </span>
        );
      case "paid":
        return (
          <span className="bg-blue-600 text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3" /> Awaiting Release
          </span>
        );
      case "completed":
        return (
          <span className="bg-green-600 text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Completed
          </span>
        );
      case "cancelled":
        return (
          <span className="bg-red-600 text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-64 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading orders...
      </div>
    );

  if (error)
    return <p className="text-center text-red-500 mt-4">{error}</p>;

  if (orders.length === 0)
    return <p className="text-center text-gray-400 mt-8">You have no P2P deposit orders yet.</p>;

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <ToastContainer />
      <h2 className="text-2xl font-bold mb-6 mt-4">My Deposit Orders</h2>

      <div className="space-y-4">
        {orders.map((order) => (
          <Link
            to={`/p2p/order/${order.id}`}
            key={order.id}
            className="block bg-gray-800 hover:bg-gray-700 p-5 rounded-xl shadow border border-gray-700 transition"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold text-lg">
                  Order #{order.id}
                </p>
                <p className="text-sm text-gray-400">
                  Merchant: {order.sell_offer_detail?.merchant_email}
                </p>
                <p className="text-sm text-gray-400">
                  Amount: ₦{order.amount_requested}
                </p>
                <p className="text-sm text-gray-400">
                  Date: {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
              <div>{getStatusBadge(order.status)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}