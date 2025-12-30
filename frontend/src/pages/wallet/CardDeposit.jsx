import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import { 
  Loader2, 
  ArrowLeft, 
  DollarSign,
  AlertCircle
} from "lucide-react";
import { toast } from "react-hot-toast";
import CardDepositCard from "../../components/CardDepositCard";

const SUPPORTED_CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" }
];

export default function CardDeposit() {
  const navigate = useNavigate();
  
  // Form state
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  
  // Calculation state
  const [calculation, setCalculation] = useState(null);
  const [calculationLoading, setCalculationLoading] = useState(false);
  
  // Transaction state
  const [loading, setLoading] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  
  // View state
  const [showHistory, setShowHistory] = useState(false);

  const calculateRate = async () => {
    setCalculationLoading(true);
    try {
      const response = await client.post("/wallet/card-deposit/calculate-rate/", {
        currency,
        amount: parseFloat(amount)
      });

      if (response.data.success) {
        setCalculation(response.data);
      }
    } catch (err) {
      console.error("Error calculating rate:", err);
      const errorMsg = err.response?.data?.error || "Failed to calculate exchange rate";
      toast.error(errorMsg);
      setCalculation(null);
    } finally {
      setCalculationLoading(false);
    }
  };

  // Debounced rate calculation
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (amount && parseFloat(amount) > 0) {
        calculateRate();
      } else {
        setCalculation(null);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, currency]);

  // Fetch deposit history when opened
  useEffect(() => {
    if (showHistory) {
      fetchDeposits();
    }
  }, [showHistory]);

  const fetchDeposits = async () => {
    setDepositsLoading(true);
    try {
      const response = await client.get("/wallet/card-deposit/list/");
      if (response.data.results) {
        setDeposits(response.data.results);
      } else if (response.data.deposits) {
        setDeposits(response.data.deposits);
      }
    } catch (err) {
      console.error("Error fetching deposits:", err);
      toast.error("Failed to load deposit history");
    } finally {
      setDepositsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (!calculation) {
      toast.error("Please wait for exchange rate calculation");
      return;
    }

    setLoading(true);

    try {
      const response = await client.post("/wallet/card-deposit/initiate/", {
        currency,
        amount: parseFloat(amount),
        use_live: import.meta.env.MODE === 'production'
      });

      if (response.data.success && response.data.authorization_url) {
        toast.success("Redirecting to secure payment page...");
        // Redirect to Flutterwave hosted payment page
        window.location.href = response.data.authorization_url;
      } else {
        throw new Error("No payment link received");
      }
    } catch (err) {
      console.error("Error initiating payment:", err);
      const errorMsg = err.response?.data?.error || "Failed to initiate payment";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const selectedCurrency = SUPPORTED_CURRENCIES.find(c => c.code === currency);

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out; }
      `}</style>

      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
        {/* LOADING OVERLAY */}
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping"></div>
                </div>
                <p className="text-lg font-medium text-indigo-300">
                  Redirecting to secure payment...
                </p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => navigate("/deposit")}
              className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to Deposit
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-indigo-400">
              Card Deposit
            </h1>
          </div>

          {/* Main Form */}
          <div className="bg-gray-800/80 rounded-2xl p-4 sm:p-5 shadow-2xl border border-gray-700/50 animate-fade-in-up mb-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Currency and Amount */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  >
                    {SUPPORTED_CURRENCIES.map(curr => (
                      <option key={curr.code} value={curr.code}>
                        {curr.symbol} {curr.code} - {curr.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {selectedCurrency?.symbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 pl-8 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Exchange Rate Breakdown */}
              {calculationLoading && (
                <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700/50 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  <span className="text-sm text-gray-400">Calculating exchange rate...</span>
                </div>
              )}

              {calculation && !calculationLoading && (
                <div className="bg-gray-800/60 p-4 rounded-xl space-y-3 border border-gray-700/50 animate-fade-in-up">
                  <div className="flex items-center gap-2 text-indigo-400 font-medium mb-2">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm">You'll Receive</span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Gross Amount:</span>
                      <span className="text-white">₦{parseFloat(calculation.gross_ngn).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Fees (Flutterwave + Platform):</span>
                      <span className="text-red-400">
                        -₦{(parseFloat(calculation.flutterwave_fee) + parseFloat(calculation.platform_margin)).toFixed(2)}
                      </span>
                    </div>
                    <div className="border-t border-gray-700/50 pt-2 flex justify-between">
                      <span className="text-gray-400 font-medium">Final Credit:</span>
                      <span className="text-green-400 font-bold text-lg">
                        ₦{parseFloat(calculation.net_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || calculationLoading || !calculation}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-7 py-4 rounded-xl font-bold text-base transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <span>Continue to Secure Payment</span>
                    <span className="text-sm font-normal opacity-90">
                      (via Flutterwave)
                    </span>
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-400 mt-4">
                You'll be redirected to Flutterwave's secure page to enter your card details.
              </p>
            </form>
          </div>

          {/* Transaction History */}
          <div className="bg-gray-800/80 rounded-2xl p-4 sm:p-5 shadow-2xl border border-gray-700/50">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between text-left mb-4"
            >
              <h2 className="text-lg font-bold text-indigo-400">Transaction History</h2>
              <span className="text-sm text-gray-400">
                {showHistory ? "Hide" : "Show"}
              </span>
            </button>

            {showHistory && (
              <div className="space-y-3 animate-fade-in-up">
                {depositsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  </div>
                ) : deposits.length > 0 ? (
                  deposits.map((deposit) => (
                    <CardDepositCard key={deposit.id} deposit={deposit} />
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No card deposits yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}