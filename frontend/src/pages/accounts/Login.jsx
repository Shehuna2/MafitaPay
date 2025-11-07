// src/components/Login.jsx
import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import client from "../../api/client";
import { Loader2, ArrowLeft, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext"; // ← Correct

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth(); // ← Fixed: Use `login` directly
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: localStorage.getItem("rememberedEmail") || "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem("rememberedEmail"));
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const verified = params.get("verified");
    if (verified === "true") {
      setErrorMessage("Email verified! Please log in.");
    } else if (verified === "false") {
      setErrorMessage("Email verification failed. Please try again.");
    }
  }, [location]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setShowResend(false);

    try {
      const res = await client.post("/login/", formData);
      const { access, refresh } = res.data;

      // Save tokens
      localStorage.setItem("access", access);
      localStorage.setItem("refresh", refresh);

      if (rememberMe) {
        localStorage.setItem("rememberedEmail", formData.email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      // Fetch profile
      const profileRes = await client.get(`/profile-api/?t=${Date.now()}`);
      const userData = {
        email: profileRes.data.email,
        id: profileRes.data.id,
        is_merchant: profileRes.data.is_merchant,
        is_staff: profileRes.data.is_staff,
        full_name: profileRes.data.full_name || null,
        phone_number: profileRes.data.phone_number || null,
        date_of_birth: profileRes.data.date_of_birth || null,
      };
      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("last_user_fetch", Date.now().toString());

      // ← Fixed: Call `login` from context
      login({ access, refresh }, userData);

      window.dispatchEvent(new Event("login"));

      navigate("/dashboard", { replace: true });
    } catch (err) {
      const errors = err.response?.data?.errors || {};
      const msg = errors.detail || "Login failed. Please check your credentials.";
      if (errors.action === "resend_verification") {
        setShowResend(true);
        setErrorMessage("Your account is not verified. Check your email or resend verification.");
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setLoading(true);
    try {
      await client.post("/api/resend-verification/", { email: formData.email });
    } catch (err) {
      setErrorMessage(err.response?.data?.error || "Failed to resend verification email.");
    } finally {
      setLoading(false);
    }
  };

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

      <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden flex items-center justify-center p-3">
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
                <p className="text-lg font-medium text-indigo-300">Signing you in...</p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-md w-full relative z-10">
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50 animate-fade-in-up">
            <h2 className="text-2xl font-bold text-center text-indigo-400 mb-6">
              Welcome Back
            </h2>

            {errorMessage && (
              <div className="mb-5 p-3.5 bg-red-900/20 backdrop-blur-sm border border-red-500/30 rounded-xl text-sm text-red-300 text-center">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="you@example.com"
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="••••••••"
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

              {/* Forgot + Remember */}
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500"
                  />
                  Remember me
                </label>
                <Link
                  to="/reset-password-request"
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition"
                >
                  Forgot password?
                </Link>
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
                    Signing in...
                  </>
                ) : (
                  "Login"
                )}
              </button>
            </form>

            {/* Resend Verification */}
            {showResend && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleResendVerification}
                  disabled={loading}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline transition"
                >
                  Resend Verification Email
                </button>
              </div>
            )}

            {/* Register Link */}
            <div className="mt-5 text-center text-xs text-gray-400">
              Don’t have an account?{" "}
              <Link
                to="/register"
                className="text-indigo-400 hover:text-indigo-300 font-medium underline transition"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}