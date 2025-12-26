import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import { 
  Loader2, 
  ArrowLeft, 
  CreditCard, 
  DollarSign,
  Info,
  AlertCircle,
  CheckCircle
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
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [fullname, setFullname] = useState("");
  
  // Calculation state
  const [exchangeRate, setExchangeRate] = useState(null);
  const [calculation, setCalculation] = useState(null);
  const [calculationLoading, setCalculationLoading] = useState(false);
  
  // Transaction state
  const [loading, setLoading] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  
  // View state
  const [showHistory, setShowHistory] = useState(false);

  // Fetch exchange rate when amount or currency changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (amount && parseFloat(amount) > 0) {
        calculateRate();
      } else {
        setCalculation(null);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [amount, currency]);

  // Fetch deposit history
  useEffect(() => {
    if (showHistory) {
      fetchDeposits();
    }
  }, [showHistory]);

  const calculateRate = async () => {
    setCalculationLoading(true);
    try {
      const response = await client.post("/wallet/card-deposit/calculate-rate/", {
        currency,
        amount: parseFloat(amount)
      });

      if (response.data.success) {
        setCalculation(response.data);
        setExchangeRate(response.data.exchange_rate);
      }
    } catch (err) {
      console.error("Error calculating rate:", err);
      const errorMsg = err.response?.data?.error || "Failed to calculate exchange rate";
      toast.error(errorMsg);
    } finally {
      setCalculationLoading(false);
    }
  };

  const fetchDeposits = async () => {
    setDepositsLoading(true);
    try {
      const response = await client.get("/wallet/card-deposit/list/");
      if (response.data.results) {
        setDeposits(response.data.results);
      }
    } catch (err) {
      console.error("Error fetching deposits:", err);
      toast.error("Failed to load deposit history");
    } finally {
      setDepositsLoading(false);
    }
  };

  const formatCardNumber = (value) => {
    const cleaned = value.replace(/\s/g, "");
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(" ");
  };

  const handleCardNumberChange = (e) => {
    const value = e.target.value.replace(/\s/g, "");
    if (/^\d{0,16}$/.test(value)) {
      setCardNumber(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (!cardNumber || cardNumber.length < 15) {
      toast.error("Please enter a valid card number");
      return;
    }

    if (!expiryMonth || !expiryYear) {
      toast.error("Please enter card expiry date");
      return;
    }

    if (!cvv || cvv.length < 3) {
      toast.error("Please enter a valid CVV");
      return;
    }

    if (!fullname) {
      toast.error("Please enter cardholder name");
      return;
    }

    setLoading(true);

    try {
      const response = await client.post("/wallet/card-deposit/initiate/", {
        currency,
        amount: parseFloat(amount),
        card_number: cardNumber,
        expiry_month: expiryMonth,
        expiry_year: expiryYear,
        cvv,
        fullname,
        use_live: false // Set to true for production
      });

      if (response.data.success) {
        toast.success("Card charge initiated!");
        
        // If there's a 3D Secure URL, redirect user
        if (response.data.authorization_url) {
          window.location.href = response.data.authorization_url;
        } else {
          // Clear form
          setAmount("");
          setCardNumber("");
          setExpiryMonth("");
          setExpiryYear("");
          setCvv("");
          setFullname("");
          setCalculation(null);
          
          // Show history
          setShowHistory(true);
          fetchDeposits();
        }
      }
    } catch (err) {
      console.error("Error initiating card charge:", err);
      const errorMsg = err.response?.data?.error || "Failed to process card charge";
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
                  Processing your card payment...
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
              {/* Currency and Amount Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Currency Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                  >
                    {SUPPORTED_CURRENCIES.map(curr => (
                      <option key={curr.code} value={curr.code}>
                        {curr.symbol} {curr.code} - {curr.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount Input */}
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
                      className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 pl-8 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Exchange Rate Display */}
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
                    <span className="text-sm">Exchange Rate Breakdown</span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Exchange Rate:</span>
                      <span className="text-white font-medium">
                        1 {currency} = ₦{parseFloat(calculation.exchange_rate).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">Gross Amount:</span>
                      <span className="text-white">₦{parseFloat(calculation.gross_ngn).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">Flutterwave Fee:</span>
                      <span className="text-red-400">-₦{parseFloat(calculation.flutterwave_fee).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">Platform Fee:</span>
                      <span className="text-red-400">-₦{parseFloat(calculation.platform_margin).toFixed(2)}</span>
                    </div>

                    <div className="border-t border-gray-700/50 pt-2 flex justify-between">
                      <span className="text-gray-400 font-medium">You'll Receive:</span>
                      <span className="text-green-400 font-bold text-base">
                        ₦{parseFloat(calculation.net_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Card Details Section */}
              <div className="border-t border-gray-700/50 pt-5">
                <div className="flex items-center gap-2 text-indigo-400 font-medium mb-4">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-sm">Card Details</span>
                </div>

                <div className="space-y-4">
                  {/* Card Number */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Card Number
                    </label>
                    <input
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      value={formatCardNumber(cardNumber)}
                      onChange={handleCardNumberChange}
                      maxLength="19"
                      className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                    />
                  </div>

                  {/* Expiry and CVV */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">
                        Month
                      </label>
                      <input
                        type="text"
                        placeholder="MM"
                        value={expiryMonth}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                          if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= 12)) {
                            setExpiryMonth(val);
                          }
                        }}
                        maxLength="2"
                        className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">
                        Year
                      </label>
                      <input
                        type="text"
                        placeholder="YY"
                        value={expiryYear}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                          setExpiryYear(val);
                        }}
                        maxLength="2"
                        className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">
                        CVV
                      </label>
                      <input
                        type="text"
                        placeholder="123"
                        value={cvv}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                          setCvv(val);
                        }}
                        maxLength="4"
                        className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                      />
                    </div>
                  </div>

                  {/* Cardholder Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={fullname}
                      onChange={(e) => setFullname(e.target.value)}
                      className="w-full bg-gray-800/60 border border-gray-700/80 p-2.5 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Security Notice */}
              <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/40">
                <div className="flex items-start gap-3">
                  <div className="text-green-400 mt-0.5">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-sm text-gray-300 leading-relaxed">
                    <p className="font-medium text-green-400 mb-1">Secure Payment</p>
                    <p className="text-xs text-gray-400">
                      Your card details are encrypted and processed securely via Flutterwave. 
                      We never store your full card number.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !calculation || calculationLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-7 py-3 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center gap-2.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Deposit {calculation ? `₦${parseFloat(calculation.net_amount).toFixed(2)}` : "Funds"}
                  </>
                )}
              </button>
            </form>
          </div>

          {/* History Section */}
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
