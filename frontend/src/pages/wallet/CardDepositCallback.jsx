import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function CardDepositCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const reference =
    searchParams.get("reference") ||
    searchParams.get("tx_ref") ||
    searchParams.get("transactionReference") ||
    "";

  const flwStatus = (searchParams.get("status") || "").toLowerCase(); // flutterwave style
  const [status, setStatus] = useState("processing"); // processing|successful|failed
  const [detail, setDetail] = useState("");
  const [seconds, setSeconds] = useState(5);

  const pollRef = useRef(null);

  const isFinal = useMemo(() => status === "successful" || status === "failed", [status]);

  async function fetchStatus() {
    if (!reference) {
      setStatus("failed");
      setDetail("Missing transaction reference in redirect URL.");
      return;
    }

    try {
      const resp = await fetch(
        `/api/wallet/card-deposit/status/?tx_ref=${encodeURIComponent(reference)}`,
        { credentials: "include" }
      );

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus("processing");
        setDetail(data?.error || "Checking payment status...");
        return;
      }

      const s = (data?.status || "").toLowerCase();
      if (s === "successful") {
        setStatus("successful");
        setDetail("");
      } else if (s === "failed") {
        setStatus("failed");
        setDetail("");
      } else {
        setStatus("processing");
        setDetail("");
      }
    } catch {
      setStatus("processing");
      setDetail("Network issue while confirming payment. Retrying...");
    }
  }

  useEffect(() => {
    // If Flutterwave gave an explicit status, reflect it immediately (still poll for final wallet credit).
    if (flwStatus === "successful") setStatus("processing");
    if (flwStatus === "failed" || flwStatus === "cancelled") setStatus("failed");

    fetchStatus();

    let tries = 0;
    pollRef.current = window.setInterval(() => {
      tries += 1;
      fetchStatus();
      if (tries >= 15) window.clearInterval(pollRef.current); // ~30s max
    }, 2000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  useEffect(() => {
    if (status !== "successful") return;

    const tick = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    const go = window.setTimeout(() => navigate("/dashboard", { replace: true }), 5000);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(go);
    };
  }, [status, navigate]);

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
                  Your wallet is being credited. Redirecting in {seconds}s...
                </p>
              </div>
            </>
          ) : status === "failed" ? (
            <>
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-12 h-12 text-red-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Payment Failed</h2>
                <p className="text-gray-300">
                  If you were charged, contact support with your reference.
                </p>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Confirming Payment...</h2>
                <p className="text-gray-300">
                  Please wait while we confirm your payment. This may take a few seconds.
                </p>
                {detail ? <p className="text-gray-400 mt-2 text-sm">{detail}</p> : null}
              </div>
            </>
          )}

          <div className="text-gray-400 text-sm">
            <div><span className="text-gray-500">Reference:</span> {reference || "—"}</div>
          </div>

          {!isFinal ? (
            <button
              onClick={fetchStatus}
              className="w-full mt-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              Refresh Status
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
