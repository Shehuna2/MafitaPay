// src/pages/accounts/ResetPassword.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../../api/client";
import { Loader2, ArrowLeft, Lock, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const { token } = useParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const validateToken = async () => {
      try {
        await client.get(`/password-reset/validate/${token}/`);
        setIsValidToken(true);
      } catch (err) {
        setIsValidToken(false);
        setError("Invalid or expired reset link. Redirecting to login...");
        setTimeout(() => navigate("/login"), 3000);
      }
    };
    validateToken();
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidToken) return;
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      setError("Password must contain at least one special character.");
      return;
    }

    setLoading(true);
    try {
      await client.post(`/password-reset/${token}/`, { new_password: newPassword });
      setError(""); // Clear any previous error
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reset password.");
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

        {/* Full-Screen Loading Overlay */}
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
                <p className="text-lg font-medium text-indigo-300">Resetting your password...</p>
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

          {/* Token Validation Loading */}
          {isValidToken === null && (
            <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 text-center animate-fade-in-up">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-indigo-600/20 animate-ping"></div>
                <Loader2 className="w-16 h-16 text-indigo-400 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-indigo-300 mt-5">Validating Reset Link...</h2>
            </div>
          )}

          {/* Invalid Token */}
          {isValidToken === false && (
            <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 text-center animate-fade-in-up">
              <div className="mx-auto w-16 h-16 mb-4">
                <div className="w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-red-400" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-red-400 mb-3">Invalid Link</h2>
              <p className="text-sm text-gray-300 mb-2">{error}</p>
              <button
                onClick={() => navigate("/login")}
                className="text-indigo-400 hover:text-indigo-300 text-sm underline"
              >
                Go to Login
              </button>
            </div>
          )}

          {/* Valid Token - Reset Form */}
          {isValidToken === true && (
            <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 animate-fade-in-up">
              <h2 className="text-2xl font-bold text-center text-indigo-400 mb-6">Set New Password</h2>

              {error && (
                <div className="mb-5 p-3.5 bg-red-900/20 backdrop-blur-sm border border-red-500/30 rounded-xl text-sm text-red-300 text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-10 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-indigo-400 transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-10 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-indigo-400 transition"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Setting Password...
                    </>
                  ) : (
                    "Set New Password"
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}