// src/pages/accounts/VerifyEmail.jsx
import { useLocation, Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import client from "../../api/client";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);

  // Parse verified param explicitly
  const searchVerifiedRaw = search.get("verified"); // null | "true" | "false"
  const hasVerifiedParam = searchVerifiedRaw !== null;
  const verified = searchVerifiedRaw === "true";
  const reason = search.get("reason") || "";
  const urlEmail = search.get("email");

  // Email passed via location state (after registering) or via URL param
  const stateEmail = location.state?.email;
  const fromLogin = location.state?.fromLogin || false;
  const email = stateEmail || urlEmail || "";

  // Cooldown key depends on email (useMemo to avoid recreating on every render)
  const COOLDOWN_KEY = useMemo(() => `verify_cooldown_${email || "unknown"}`, [email]);

  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Load cooldown (when email or key changes)
  useEffect(() => {
    if (!email) {
      setCooldown(0);
      return;
    }
    const saved = localStorage.getItem(COOLDOWN_KEY);
    if (!saved) {
      setCooldown(0);
      return;
    }
    const remaining = Math.floor((Number(saved) - Date.now()) / 1000);
    if (remaining > 0) setCooldown(remaining);
    else {
      setCooldown(0);
      localStorage.removeItem(COOLDOWN_KEY);
    }
  }, [COOLDOWN_KEY, email]);

  // Countdown timer decrement
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => {
      if (c <= 1) {
        clearInterval(t);
        localStorage.removeItem(COOLDOWN_KEY);
        return 0;
      }
      return c - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [cooldown, COOLDOWN_KEY]);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await client.post("resend-verification/", { email });
      const expiry = Date.now() + 60_000; // 60s
      localStorage.setItem(COOLDOWN_KEY, expiry.toString());
      setCooldown(60);
    } catch (err) {
      console.error("Resend failed:", err);
    } finally {
      setResending(false);
    }
  };

  // Auto redirect after successful verification
  useEffect(() => {
    if (verified && email) {
      const t = setTimeout(() => navigate("/login"), 3000);
      return () => clearTimeout(t);
    }
  }, [verified, email, navigate]);

  /**
   * Rendering logic (mutually exclusive):
   * 1. If verified === true -> success
   * 2. Else if hasVerifiedParam && verified === false -> Link Expired (explicit "false" param)
   * 3. Else if !hasVerifiedParam && email -> Fresh Register (just-signed-up check email)
   * 4. Else -> No email / invalid access
   */

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800/90 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-gray-700/50 text-center">

          {/* 1) SUCCESS: Email Verified */}
          {verified && email ? (
            <div className="space-y-6 animate-fade-in-up">
              <CheckCircle className="w-20 h-20 mx-auto text-green-400" />
              <h1 className="text-3xl font-bold text-green-400">
                {reason === "already_verified" ? "Already Verified" : "Email Verified!"}
              </h1>
              <p className="text-gray-300">Welcome to MafitaPay! You can now log in.</p>
              <div className="text-sm text-indigo-300">Redirecting in 3s...</div>
              <Link to="/login" className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all">
                Go to Login
              </Link>
            </div>

          // 2) Explicit failed verification param -> Link Expired
          ) : hasVerifiedParam && !verified && email ? (
            <div className="space-y-6 animate-fade-in-up">
              <XCircle className="w-20 h-20 mx-auto text-red-400" />
              <h1 className="text-3xl font-bold text-red-400">Link Expired</h1>
              <p className="text-gray-300">This verification link is invalid or has expired.</p>
              <button
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {resending ? "Sending..." : (cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Email")}
              </button>
            </div>

          // 3) Fresh register (no verified query param present)
          ) : !hasVerifiedParam && email ? (
            <>
              <div className="space-y-6 animate-fade-in-up">
                <Mail className="w-20 h-20 mx-auto text-indigo-400" />
                <h1 className="text-3xl font-bold text-indigo-400">
                  {fromLogin ? "Email Verification Required" : "Check Your Email"}
                </h1>
                <p className="text-gray-300">
                  {fromLogin 
                    ? <>
                        Your account exists but your email has not been verified yet.
                        <br />
                        <br />
                        Verification email sent to:
                        <br />
                        <strong className="text-white">{email}</strong>
                        <br />
                        <br />
                        Please check your inbox for the verification link or request a new one below.
                      </>
                    : <>
                        We sent a verification link to:
                        <br />
                        <strong className="text-white">{email}</strong>
                      </>
                  }
                </p>
                {!fromLogin && (
                  <p className="text-sm text-gray-400">Click the link in your email to activate your account.</p>
                )}
              </div>

              <div className="space-y-6 animate-fade-in-up">
                <button
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {resending ? "Sending..." : (cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Email")}
                </button>
              </div>
            </>

          // 4) No email / invalid access
          ) : (
            <div className="space-y-6 animate-fade-in-up">
              <XCircle className="w-20 h-20 mx-auto text-yellow-400" />
              <h1 className="text-3xl font-bold text-yellow-400">Invalid Link</h1>
              <p className="text-gray-300">Please use the link from your email or register again.</p>
              <Link to="/register" className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all">
                Back to Register
              </Link>
            </div>
          )}

          {/* LOADING OVERLAY */}
          {resending && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur flex items-center justify-center z-50">
              <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl">
                <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto" />
                <p className="text-center mt-4 text-indigo-300 font-medium">Sending email...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
