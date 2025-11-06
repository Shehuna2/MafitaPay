// src/pages/accounts/ResetPasswordRequest.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import { Loader2, ArrowLeft, Mail } from "lucide-react";

export default function ResetPasswordRequest() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await client.post("/password-reset/", { email });
      setMessage(response.data.message || "Reset link sent! Check your email.");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send reset link. Try again.");
    } finally {
      setLoading(false);
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
        {loading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping"></div>
                </div>
                <p className="text-lg font-medium text-indigo-300">Sending reset link...</p>
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

          <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 animate-fade-in-up">
            <h2 className="text-2xl font-bold text-center text-indigo-400 mb-6">Forgot Password?</h2>

            {/* Success Message */}
            {message && (
              <div className="mb-5 p-3.5 bg-green-900/20 backdrop-blur-sm border border-green-500/30 rounded-xl text-sm text-green-300 text-center">
                {message}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-5 p-3.5 bg-red-900/20 backdrop-blur-sm border border-red-500/30 rounded-xl text-sm text-red-300 text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Request Reset Link"
                )}
              </button>
            </form>

            <div className="mt-5 text-center text-xs text-gray-400">
              Remember your password?{" "}
              <a
                href="/login"
                className="text-indigo-400 hover:text-indigo-300 font-medium underline transition"
              >
                Back to Login
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}