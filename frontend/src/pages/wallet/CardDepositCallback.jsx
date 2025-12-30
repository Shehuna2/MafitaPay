// src/pages/Wallet/CardDepositCallback.jsx
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

export default function CardDepositCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const status = searchParams.get("status"); // successful, failed, cancelled
  const tx_ref = searchParams.get("tx_ref");
  const transaction_id = searchParams.get("transaction_id");

  useEffect(() => {
    // Show feedback based on status
    if (status === "successful") {
      toast.success(`Deposit successful! ₦ credited to your wallet. (Ref: ${tx_ref})`);
    } else if (status === "failed" || status === "cancelled") {
      toast.error("Payment failed or was cancelled. Please try again.");
    } else {
      toast.error("Invalid payment status. Please contact support if amount was deducted.");
    }

    // Redirect to dashboard (or wallet) after a short delay for toast visibility
    const timer = setTimeout(() => {
      navigate("/dashboard", { replace: true });
      // Alternative: navigate("/wallet") if you have a dedicated wallet page
    }, 2000);

    return () => clearTimeout(timer);
  }, [status, tx_ref, navigate]);

  // Full-screen friendly loading/success screen
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-gray-800/80 rounded-2xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full text-center">
        <div className="flex flex-col items-center gap-6">
          {status === "successful" ? (
            <>
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
                <p className="text-gray-300">
                  Your wallet is being credited. Redirecting you to dashboard...
                </p>
              </div>
            </>
          ) : status === "failed" || status === "cancelled" ? (
            <>
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-12 h-12 text-red-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Payment Failed</h2>
                <p className="text-gray-300">
                  Something went wrong. Redirecting you back...
                </p>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
              <p className="text-white text-lg">Processing payment result...</p>
            </>
          )}

          <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-500 animate-pulse w-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}