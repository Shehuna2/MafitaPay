import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import { ArrowRight, Wallet, User } from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";

export default function WithdrawOffers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [amount, setAmount] = useState("");
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [user, setUser] = useState(null);
  const [sortBy, setSortBy] = useState("default");
  const [minSuccessRate, setMinSuccessRate] = useState("");
  const [minTrades, setMinTrades] = useState("");
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user");
      if (storedUser) setUser(JSON.parse(storedUser));
    } catch (err) {
      console.error("Error parsing user from localStorage:", err);
      setError("Failed to load user data. Please log in again.");
    }

    const fetchOffers = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (sortBy !== "default") params.append("sort_by", sortBy);
        if (minSuccessRate) params.append("min_success_rate", minSuccessRate);
        if (minTrades) params.append("min_trades", minTrades);
        params.append("page", page);

        const res = await client.get(`p2p/withdraw-offers/?${params.toString()}`);
        const data = res.data?.results || res.data || [];
        setOffers((prev) => (page === 1 ? data : [...prev, ...data]));
        setHasNextPage(!!res.data?.next);
      } catch (err) {
        console.error("Error fetching withdraw offers:", err);
        setError(
          err.response?.status === 401
            ? "Authentication failed. Please log in again."
            : err.response?.data?.error || "Failed to load offers. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, [sortBy, minSuccessRate, minTrades, page]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setSelectedOffer(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const handleCreateOrder = async () => {
    if (!selectedOffer) {
      toast.error("No offer selected!", { position: "top-right", autoClose: 3000 });
      return;
    }

    const amountNum = parseFloat(amount);
    if (
      !amount ||
      isNaN(amountNum) ||
      amountNum < (selectedOffer.min_amount ?? 0) ||
      amountNum > (selectedOffer.max_amount ?? Infinity)
    ) {
      toast.error(
        `Please enter a valid amount between ₦${Number(selectedOffer.min_amount || 0).toLocaleString()} and ₦${Number(selectedOffer.max_amount || 0).toLocaleString()}!`,
        { position: "top-right", autoClose: 3000 }
      );
      return;
    }

    setPlacingOrder(true);
    try {
      const res = await client.post(
        `p2p/withdraw-offers/${selectedOffer.id}/create-order/`,
        { amount_requested: amountNum }
      );
      toast.success("Order created successfully!", { position: "top-right", autoClose: 3000 });
      setSelectedOffer(null);
      setAmount("");
      const orderId = res.data?.order_id || res.data?.id || null;
      if (orderId) navigate(`/p2p/withdraw-orders/${orderId}`);
      else await (async () => await fetchLatestAndNavigate())();
    } catch (err) {
      const errorMessage =
        err.response?.status === 400
          ? err.response?.data?.error || "Invalid order request."
          : err.response?.status === 401
          ? "Authentication failed. Please log in again."
          : "Failed to create order.";
      toast.error(errorMessage, { position: "top-right", autoClose: 3000 });
    } finally {
      setPlacingOrder(false);
    }
  };

  const fetchLatestAndNavigate = async () => {
    try {
      const res = await client.get("p2p/withdraw-orders/?page=1");
    } catch (e) {}
  };

  const offerItems = useMemo(() => {
    return offers.map((offer, index) => {
      const isOwnOffer = user && offer.merchant_email === user.email;

      return (
        <div key={offer.id}>
          {index > 0 && <hr className="border-gray-700 my-4" />}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2">
            {/* Merchant Info and Stats */}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p
                  className="font-semibold text-lg truncate max-w-[150px] sm:max-w-none"
                  data-tooltip-id={`merchant-name-${offer.id}`}
                  data-tooltip-content={`${offer.merchant_profile?.first_name} ${offer.merchant_profile?.last_name}`}
                >
                  {offer.merchant_profile?.first_name} {offer.merchant_profile?.last_name}
                </p>

                <div className="bg-indigo-600/90 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 shadow-md">
                  <User className="w-3 h-3" /> Merchant
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <p className="text-sm text-gray-400">
                  Rate: ₦{Number(offer.price_per_unit || 0).toLocaleString()}
                </p>
                <p className="text-sm text-gray-400">
                  Available: ₦{Number(offer.amount_available || 0).toLocaleString()}
                </p>
                <p className="text-sm text-gray-400">
                  Limits: ₦{Number(offer.min_amount || 0).toLocaleString()} - ₦{Number(offer.max_amount || 0).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <p
                    className="text-sm text-gray-400 flex items-center gap-1"
                    data-tooltip-id={`trades-tooltip-${offer.id}`}
                    data-tooltip-html="<strong>Trades</strong>: Number of completed trades by this merchant"
                  >
                    Trades: {offer.merchant_profile?.total_trades ? Number(offer.merchant_profile.total_trades).toLocaleString() : "N/A"}
                  </p>
                  <p
                    className="text-sm text-gray-400 flex items-center gap-1"
                    data-tooltip-id={`success-tooltip-${offer.id}`}
                    data-tooltip-html="<strong>Success Rate</strong>: Percentage of successful trades"
                  >
                    Success: {((offer.merchant_profile?.success_rate || 0) * 1).toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Tooltips */}
            <Tooltip
              id={`merchant-name-${offer.id}`}
              place="top"
              style={{
                backgroundColor: "#1f2937",
                color: "#fff",
                fontSize: "0.75rem",
                padding: "4px 8px",
                borderRadius: "6px",
                whiteSpace: "nowrap",
              }}
            />
            <Tooltip
              id={`trades-tooltip-${offer.id}`}
              place="auto"
              effect="float"
              className="premium-tooltip"
              clickable={true}
              delayShow={300}
            />
            <Tooltip
              id={`success-tooltip-${offer.id}`}
              place="auto"
              effect="float"
              className="premium-tooltip"
              clickable={true}
              delayShow={300}
            />

            {/* Action Button */}
            <button
              disabled={isOwnOffer}
              onClick={() => !isOwnOffer && setSelectedOffer(offer)}
              aria-label={isOwnOffer ? "Your own offer" : `Withdraw with ${offer.merchant_email}`}
              className={`w-full sm:w-auto px-4 sm:px-6 py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm ${
                isOwnOffer
                  ? "bg-gray-600 cursor-not-allowed text-gray-300"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              <ArrowRight className="w-4 h-4" />
              {isOwnOffer ? "Your Offer" : "Withdraw"}
            </button>
          </div>
        </div>
      );
    });
  }, [offers, user]);

  if (loading && page === 1)
    return (
      <p className="text-center text-gray-400 mt-8">
        <Wallet className="inline w-5 h-5 mr-2 animate-spin text-indigo-400" />
        Loading offers...
      </p>
    );

  if (error)
    return (
      <div className="text-center text-red-500 mt-8">
        <p>Warning: {error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            setPage(1);
            setOffers([]);
          }}
          className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg"
        >
          Retry
        </button>
      </div>
    );

  if (offers.length === 0)
    return (
      <p className="text-center text-gray-400 mt-8">
        {minSuccessRate || minTrades
          ? "No offers match the applied filters."
          : "No active P2P withdraw offers available."}
      </p>
    );

  return (
    <>
      <style>{`
        .premium-tooltip {
          background: #1f2937 !important;
          color: white !important;
          font-size: 0.75rem !important;
          padding: 6px 10px !important;
          border-radius: 8px !important;
        }
      `}</style>

      <div className="w-full px-1 sm:px-4 py-4 text-white">
        {/* Sorting and Filtering Controls */}
        <div className="mb-5 bg-gray-900 border border-gray-700 rounded-lg p-3 sm:p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="sortBy" className="text-gray-400 whitespace-nowrap">Sort by:</label>
              <select
                id="sortBy"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                  setOffers([]);
                }}
                className="bg-gray-800 border border-gray-700 p-1.5 rounded text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="default">Default</option>
                <option value="success_rate">Success Rate</option>
                <option value="total_trades">Total Trades</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="minTrades" className="text-gray-400 whitespace-nowrap">Min Trades:</label>
              <input
                id="minTrades"
                type="number"
                min="0"
                step="1"
                value={minTrades}
                onChange={(e) => {
                  setMinTrades(e.target.value);
                  setPage(1);
                  setOffers([]);
                }}
                className="w-16 bg-gray-800 border border-gray-700 p-1.5 rounded text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="100"
              />
            </div>
            {(minSuccessRate || minTrades) && (
              <button
                onClick={() => {
                  setMinSuccessRate("");
                  setMinTrades("");
                  setSortBy("default");
                  setPage(1);
                  setOffers([]);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white py-1.5 px-3 rounded-lg text-sm transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <ToastContainer />
        <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-indigo-400" /> P2P Withdraw Offers
        </h2>

        {/* Offer List */}
        <div className="flex flex-col gap-0">
          {offerItems}
          {hasNextPage && (
            <div className="text-center mt-5">
              <button
                onClick={() => setPage((prev) => prev + 1)}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-6 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>

        {/* Withdraw Modal */}
        {selectedOffer && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedOffer(null)}
          >
            <div
              className="bg-gray-900 p-6 rounded-2xl w-full max-w-sm relative border border-gray-700 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedOffer(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-white text-lg"
              >
                X
              </button>
              <h3 className="text-xl font-semibold mb-3 text-indigo-400">
                {selectedOffer.merchant_profile?.full_name}
              </h3>
              <p className="text-sm text-gray-400 mb-2">
                Rate: ₦{Number(selectedOffer.price_per_unit || 0).toLocaleString()} | Min: ₦
                {Number(selectedOffer.min_amount || 0).toLocaleString()} | Max: ₦
                {Number(selectedOffer.max_amount || 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-400 mb-2">
                Trades: <span
                  data-tooltip-id="modal-trades-tooltip"
                  data-tooltip-html="<strong>Trades</strong>: Number of completed trades"
                >
                  {selectedOffer.merchant_profile?.total_trades ? Number(selectedOffer.merchant_profile.total_trades).toLocaleString() : "N/A"}
                </span> | Success: <span
                  data-tooltip-id="modal-success-tooltip"
                  data-tooltip-html="<strong>Success Rate</strong>: Percentage of successful trades"
                >
                  {((selectedOffer.merchant_profile?.success_rate || 0) * 1).toFixed(2)}%
                </span>
              </p>
              <input
                type="number"
                placeholder="Enter amount (₦)"
                min={selectedOffer.min_amount}
                max={selectedOffer.max_amount}
                step="1"
                className="w-full bg-gray-800 border border-gray-700 p-2 rounded mb-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button
                onClick={handleCreateOrder}
                className="w-full bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg transition font-medium"
                disabled={placingOrder}
              >
                {placingOrder ? "Processing..." : "Confirm Withdraw"}
              </button>
              <Tooltip id="modal-trades-tooltip" place="auto" effect="float" className="premium-tooltip" clickable delayShow={300} />
              <Tooltip id="modal-success-tooltip" place="auto" effect="float" className="premium-tooltip" clickable delayShow={300} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}