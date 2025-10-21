// src/pages/BuyCrypto.jsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import client from "../../api/client";
import { ArrowLeft } from "lucide-react";
import Receipt from "../../components/Receipt";

export default function BuyCrypto() {
  const { id } = useParams();
  const [crypto, setCrypto] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null); // NGN/USD
  const [form, setForm] = useState({
    amount: "",
    currency: "NGN",
    wallet_address: "",
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await client.get("/assets/");
        const cryptos = Array.isArray(res.data?.cryptos)
          ? res.data.cryptos
          : Array.isArray(res.data)
          ? res.data
          : [];
        const found = cryptos.find((c) => String(c.id) === String(id));
        if (found) {
          setCrypto(found);
          setExchangeRate(res.data.exchange_rate || null);
        } else {
          setMessage({ type: "error", text: "Crypto not found" });
        }
      } catch (err) {
        console.error("❌ Failed to load crypto:", err);
        setMessage({ type: "error", text: "Failed to load crypto" });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleQuickPick = (val) => {
    setForm((prev) => ({ ...prev, amount: val.toString() }));
  };

  const quickPickOptions = () => {
    if (!crypto) return [];
    if (form.currency === "NGN") return [500, 1000, 2000, 5000];
    if (form.currency === "USDT") return [0.5, 1.0, 2.0, 5.0];
    return [0.1, 0.5, 1.0, 2.0]; // for crypto itself
  };

  let cryptoReceived = 0;
  let totalNgn = 0;
  if (crypto && exchangeRate && form.amount) {
    const amt = Number(form.amount);
    if (!isNaN(amt) && amt > 0) {
      if (form.currency === "NGN") {
        totalNgn = amt;
        cryptoReceived = amt / exchangeRate / crypto.price;
      } else if (form.currency === "USDT") {
        totalNgn = amt * exchangeRate;
        cryptoReceived = amt / crypto.price;
      } else if (form.currency === crypto.symbol) {
        cryptoReceived = amt;
        totalNgn = amt * crypto.price * exchangeRate;
      }
    }
  }

  const confirmAndSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    setShowConfirm(false);

    try {
      const res = await client.post(`/buy-crypto/${id}/`, form);
      setReceiptData({
        status: "success",
        type: "crypto",
        crypto: crypto.symbol,
        amount: totalNgn,
        wallet_address: form.wallet_address,
        tx_hash: res.data.tx_hash,
        reference: res.data.reference || null,
      });
    } catch (err) {
      setReceiptData({
        status: "failed",
        type: "crypto",
        crypto: crypto.symbol,
        amount: totalNgn,
        wallet_address: form.wallet_address,
        tx_hash: null,
        reference: null,
      });
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Purchase failed",
      });
    } finally {
      setSubmitting(false);
      setForm({ amount: "", currency: "NGN", wallet_address: "" });
    }
  };

  if (loading) return <p className="text-center p-4 text-gray-400">Loading crypto...</p>;
if (!crypto) return <p className="text-center text-red-400">Crypto not found</p>;

return (
  <>
    <div className="max-w-3xl mx-auto bg-gray-900 p-6 rounded-2xl shadow-xl text-white relative overflow-hidden min-h-screen">
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />

      {/* Back + Title */}
      <div className="flex items-center mb-6 relative z-10">
        <button
          onClick={() => window.history.back()}
          className="mr-4 p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-all"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>
        <h2 className="text-2xl font-bold">Buy {crypto.name}</h2>
      </div>

      {/* Exchange Info */}
      <div className="bg-gray-800 p-4 rounded-xl mb-6 relative z-10 flex justify-between items-center border border-gray-700">
        <div>
          <p className="text-sm">
            <span className="text-gray-400">1 USD =</span>{" "}
            <span className="font-semibold text-green-400">
              ₦{exchangeRate?.toLocaleString()}
            </span>
          </p>
          <p className="text-sm">
            <span className="text-gray-400">1 {crypto.symbol} =</span>{" "}
            <span className="font-semibold text-indigo-400">
              ${crypto.price.toLocaleString()} ≈ ₦{(crypto.price * exchangeRate).toLocaleString()}
            </span>
          </p>
        </div>
        {crypto.logo_url && (
          <img
            src={crypto.logo_url}
            alt={crypto.name}
            className="w-12 h-12 rounded-full border-2 border-indigo-400/50"
          />
        )}
      </div>

      {/* Alerts */}
      {message && (
        <div
          className={`p-3 rounded-lg mb-6 text-sm ${
            message.type === "success"
              ? "bg-green-600/20 text-green-400"
              : "bg-red-600/20 text-red-400"
          } relative z-10`}
        >
          {message.text}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setShowConfirm(true);
        }}
        className="space-y-6 relative z-10"
      >
        {/* Amount + Currency */}
        <div className="flex gap-3">
          <input
            name="amount"
            type="number"
            placeholder={`Enter amount in ${form.currency}`}
            value={form.amount}
            onChange={handleChange}
            required
            className="flex-1 bg-gray-800 border border-gray-700 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
          />
          <select
            name="currency"
            value={form.currency}
            onChange={handleChange}
            className="w-32 bg-gray-800 border border-gray-700 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
          >
            <option value="NGN">NGN</option>
            <option value="USDT">USDT</option>
            <option value={crypto.symbol}>{crypto.symbol}</option>
          </select>
        </div>

        {/* Quick Pick Amounts */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Quick Pick</label>
          <div className="grid grid-cols-4 gap-2">
            {quickPickOptions().map((val) => (
              <button
                type="button"
                key={val}
                onClick={() => handleQuickPick(val)}
                className={`p-3 rounded-lg text-center text-sm font-semibold ${
                  Number(form.amount) === val
                    ? "bg-indigo-600 text-white border border-green-500"
                    : "bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-all"
                }`}
              >
                {form.currency === "NGN" ? `₦${val}` : `${val}`}
              </button>
            ))}
          </div>
        </div>

        {/* Live Calculation */}
        {form.amount && (
          <div className="bg-gray-800 p-4 rounded-xl text-sm text-gray-300 border border-gray-700 relative z-10">
            <p className="font-medium">
              You will receive:{" "}
              <span className="font-semibold text-indigo-400">
                {cryptoReceived.toFixed(6)} {crypto.symbol}
              </span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Equivalent to ≈{" "}
              <span className="font-semibold text-red-400">
                ₦{totalNgn.toLocaleString()}
              </span>
            </p>
            <p className="text-xs text-gray-400">
              Current rate ≈{" "}
              <span className="font-semibold text-yellow-400">
                ${crypto.price.toLocaleString()} / ₦{(crypto.price * exchangeRate).toLocaleString()}
              </span>
            </p>
          </div>
        )}

        {/* Wallet Address */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            {crypto.symbol} Wallet Address
          </label>
          <input
            name="wallet_address"
            type="text"
            placeholder={`Your ${crypto.symbol} wallet address`}
            value={form.wallet_address}
            onChange={handleChange}
            required
            className="w-full bg-gray-800 border border-gray-700 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Processing..." : `Buy ${crypto.symbol}`}
        </button>
      </form>

      {/* Spinner Overlay */}
      {submitting && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl relative z-20">
          <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>

    {/* Confirmation Modal */}
    {showConfirm && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-gray-700 shadow-xl relative z-50">
          <h3 className="text-xl font-bold mb-4">Confirm Purchase</h3>
          <p className="text-sm mb-2">
            You are buying <span className="font-semibold">{crypto.symbol}</span> worth{" "}
            <span className="font-semibold text-indigo-400">
              {form.amount} {form.currency}
            </span>
          </p>
          <p className="text-sm mb-4">
            You will receive{" "}
            <span className="font-semibold text-indigo-400">
              {cryptoReceived.toFixed(6)} {crypto.symbol}
            </span>
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={confirmAndSubmit}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-all shadow-md"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Receipt Modal */}
    <Receipt
      type="crypto"
      data={receiptData}
      onClose={() => setReceiptData(null)}
    />
  </>
  );
}