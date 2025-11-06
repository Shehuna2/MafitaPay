// src/pages/accounts/VerifyEmail.jsx
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import client from "../../api/client";
import { Loader2, ArrowLeft, Mail, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function VerifyEmail() {
  const location = useLocation();
  const email = location.state?.email || new URLSearchParams(location.search).get("email");
  const verified = new URLSearchParams(location.search).get("verified");
  const reason = new URLSearchParams(location.search).get("reason");

  const COOLDOWN_DURATION = 60;
  const COOLDOWN_KEY = `verify_cooldown_${email || "unknown"}`;

  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const savedUntil = localStorage.getItem(COOLDOWN_KEY);
    if (savedUntil) {
      const diff = Math.floor((Number(savedUntil) - Date.now()) / 1000);
      if (diff > 0) setCooldown(diff);
    }
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await client.post("resend-verification/", { email });
      const expiresAt = Date.now() + COOLDOWN_DURATION * 1000;
      localStorage.setItem(COOLDOWN_KEY, expiresAt.toString());
      setCooldown(COOLDOWN_DURATION);
    } catch (err) {
      console.error("Resend failed:", err);
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <style jsx>{`
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

      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden flex items-center justify-center p-3">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-gray-900/5 pointer-events-none" />

        {/* Full-Screen Loading */}
        {resending && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping"></div>
                </div>
                <p className="text-lg font-medium text-indigo-300">Sending verification email...</p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-md w-full relative z-10">
          {/* Back Arrow */}
          <button
            onClick={() => window.history.back()}
            className="group flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-all duration-200 mb-4"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </button>

          <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 animate-fade-in-up text-center">
            {/* SUCCESS: Verified */}
            {verified === "true" && (
              <>
                <div className="mb-5">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-400" />
                </div>
                <h1 className="text-2xl font-bold text-green-400 mb-3">
                  {reason === "already_verified" ? "Already Verified" : "Email Verified"}
                </h1>
                <p className="text-sm text-gray-300 mb-5">
                  {reason === "already_verified"
                    ? "Your email is already verified. You can log in below."
                    : "Your email has been successfully verified. You can now log in."}
                </p>
                <a
                  href="/login"
                  className="inline-block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Go to Login
                </a>
              </>
            )}

            {/* FAILURE: Invalid or Failed */}
            {verified === "false" && (
              <>
                <div className="mb-5">
                  <XCircle className="w-16 h-16 mx-auto text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-red-400 mb-3">Verification Failed</h1>
                <p className="text-sm text-gray-300 mb-5">
                  {reason === "invalid"
                    ? "Invalid or expired verification link. You can request a new one below."
                    : "Verification failed. Please request a new link."}
                </p>
                <button
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Resending...
                    </>
                  ) : cooldown > 0 ? (
                    `Resend in ${cooldown}s`
                  ) : (
                    "Resend Verification Email"
                  )}
                </button>
              </>
            )}

            {/* DEFAULT: Waiting for Verification */}
            {!verified && email && (
              <>
                <div className="mb-5">
                  <Mail className="w-16 h-16 mx-auto text-indigo-400" />
                </div>
                <h1 className="text-2xl font-bold text-indigo-400 mb-3">Verify Your Email</h1>
                <p className="text-sm text-gray-300 mb-5">
                  A verification link has been sent to{" "}
                  <span className="font-bold text-white">{email}</span>.
                  <br />
                  Please check your inbox or spam folder to complete your registration.
                </p>
                <button
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Resending...
                    </>
                  ) : cooldown > 0 ? (
                    `Resend in ${cooldown}s`
                  ) : (
                    "Resend Verification Email"
                  )}
                </button>
              </>
            )}

            {/* FALLBACK: No email */}
            {!email && (
              <>
                <div className="mb-5">
                  <AlertCircle className="w-16 h-16 mx-auto text-yellow-400" />
                </div>
                <h1 className="text-2xl font-bold text-yellow-400 mb-3">Email Missing</h1>
                <p className="text-sm text-gray-300 mb-5">
                  No email address found. Please register again.
                </p>
                <a
                  href="/register"
                  className="inline-block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Go to Register
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}