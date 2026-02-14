import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import client from "../../api/client";

export default function CardDepositCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const reference =
    searchParams.get("reference") ||
    searchParams.get("tx_ref") ||
    searchParams.get("transactionReference") ||
    "";

  const flwStatus = (searchParams.get("status") || "").toLowerCase();
  const [status, setStatus] = useState("processing");
  const [detail, setDetail] = useState("Preparing verification...");
  const [seconds, setSeconds] = useState(5);

  // NEW: display info
  const [depositInfo, setDepositInfo] = useState(null); // {amount,currency,ngn_amount,provider,status}
  const [walletInfo, setWalletInfo] = useState(null);   // {balance, locked_balance, ...}
  const [showAmounts, setShowAmounts] = useState(false);

  const pollRef = useRef(null);
  const isFinal = useMemo(() => status === "successful" || status === "failed", [status]);

  async function verifyDeposit() {
    if (!reference) {
      setStatus("failed");
      setDetail("Missing transaction reference in redirect URL.");
      return;
    }

    try {
      const resp = await client.post("/wallet/card-deposit/verify/", {
        tx_ref: reference,
      });

      const verifiedStatus = (resp?.data?.status || "").toLowerCase();
      if (verifiedStatus === "successful") {
        setStatus("successful");
        setDetail("Wallet credited successfully.");
      } else if (verifiedStatus === "failed") {
        setStatus("failed");
        setDetail("Payment verification failed.");
      } else {
        setStatus("processing");
        setDetail("Verification in progress...");
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || "Verification request failed.";
      setStatus("processing");
      setDetail(msg);
    }
  }

  async function fetchStatus() {
    if (!reference) return "failed";

    try {
      const resp = await client.get(
        `/wallet/card-deposit/status/?tx_ref=${encodeURIComponent(reference)}`
      );

      const s = (resp?.data?.status || "").toLowerCase();
      if (s === "successful") {
        setStatus("successful");
        setDetail("Wallet credited successfully.");
      } else if (s === "failed") {
        setStatus("failed");
        setDetail("Payment could not be completed.");
      } else {
        setStatus("processing");
      }
      return s;
    } catch {
      setStatus("processing");
      setDetail("Network issue while confirming payment. Retrying...");
      return "processing";
    }
  }

  useEffect(() => {
    if (!reference) {
      setStatus("failed");
      setDetail("Missing transaction reference in redirect URL.");
      return;
    }

    if (flwStatus === "failed" || flwStatus === "cancelled") {
      setStatus("failed");
      setDetail("Provider returned a failed status.");
    }

    let tries = 0;
    let stopped = false;

    const runInitialVerification = async () => {
      await verifyDeposit();
      const currentStatus = await fetchStatus();
      if (["successful", "failed"].includes(currentStatus)) {
        stopped = true;
        return;
      }

      pollRef.current = window.setInterval(async () => {
        if (stopped) return;

        tries += 1;
        const polledStatus = await fetchStatus();

        if (tries >= 15 || ["successful", "failed"].includes(polledStatus)) {
          stopped = true;
          window.clearInterval(pollRef.current);
        }
      }, 2000);
    };

    runInitialVerification();

    return () => {
      stopped = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  useEffect(() => {
    if (status !== "successful") return;

    // show amounts/balance as soon as we hit success
    setShowAmounts(true);
    fetchWallet();

    const tick = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    const go = window.setTimeout(() => navigate("/dashboard", { replace: true }), 5000);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(go);
    };
  }, [status, navigate]);

  const foreignLine =
    depositInfo?.amount && depositInfo?.currency
      ? `${depositInfo.amount} ${depositInfo.currency}`
      : null;

  const ngnLine = depositInfo?.ngn_amount ? `₦${depositInfo.ngn_amount}` : null;
  const balanceLine = walletInfo?.balance ? `₦${walletInfo.balance}` : null;

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
                <p className="text-gray-300">Redirecting to dashboard in {seconds}s...</p>
              </div>
            </>
          ) : status === "failed" ? (
            <>
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-12 h-12 text-red-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Payment Failed</h2>
                <p className="text-gray-300">If you were charged, contact support with your reference.</p>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Confirming Payment...</h2>
                <p className="text-gray-300">Please wait while we verify and credit your wallet.</p>
                {detail ? <p className="text-gray-400 mt-2 text-sm">{detail}</p> : null}
              </div>
            </>
          )}

          <div className="text-gray-400 text-sm">
            <div><span className="text-gray-500">Reference:</span> {reference || "—"}</div>
            {flwStatus ? <div><span className="text-gray-500">Provider status:</span> {flwStatus}</div> : null}
          </div>

          {!isFinal ? (
            <button
              onClick={async () => {
                await verifyDeposit();
                await fetchStatus();
              }}
              className="w-full mt-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              Verify Again
            </button>
          ) : null}

          {status === "failed" ? (
            <button
              onClick={() => navigate("/card-deposit", { replace: true })}
              className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold"
            >
              Back to Card Deposit
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
