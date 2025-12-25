// src/pages/Login.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Loader2, Mail, Lock, Eye, EyeOff, Fingerprint, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import useBiometricAuth from "../../hooks/useBiometricAuth";
import client from "../../api/client";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: localStorage.getItem("rememberedEmail") || "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem("rememberedEmail"));
  const [showPassword, setShowPassword] = useState(false);
  const biometricEmail = localStorage.getItem("biometric_user_email") || "";

  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const shouldReauth = urlParams.get("reauth") === "true";
  const reauthUser = useMemo(() => {
    const raw = localStorage.getItem("reauth_user");
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const { isSupported: biometricSupported, loginWithBiometric, authenticateWithRefresh, checking: biometricChecking } =
    useBiometricAuth();

  useEffect(() => {
    const verified = urlParams.get("verified");
    if (verified === "true") setErrorMessage("Email verified successfully! Please sign in.");
    else if (verified === "false") setErrorMessage("Email verification failed. Please try again.");
  }, [urlParams]);

  useEffect(() => {
    const access = localStorage.getItem("access");
    if (!access) return;

    try {
      const [, payloadBase64] = access.split(".");
      const payload = JSON.parse(atob(payloadBase64));
      if (payload.exp > Math.floor(Date.now() / 1000)) {
        navigate("/dashboard", { replace: true });
      } else {
        localStorage.removeItem("access");
      }
    } catch {
      localStorage.removeItem("access");
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrorMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setShowResend(false);

    const email = shouldReauth && reauthUser ? reauthUser.email : formData.email;

    try {
      const { data } = await client.post("/login/", {
        email,
        password: formData.password,
      });

      const { access, refresh } = data;

      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      let userData;
      try {
        const profileRes = await client.get(`/profile-api/?t=${Date.now()}`);
        userData = {
          email: profileRes.data.email,
          id: profileRes.data.id,
          is_merchant: profileRes.data.is_merchant,
          is_staff: profileRes.data.is_staff,
          full_name: profileRes.data.full_name || null,
          phone_number: profileRes.data.phone_number || null,
          date_of_birth: profileRes.data.date_of_birth || null,
        };
      } catch {
        userData = { email };
      }

      login({ access, refresh }, userData);

      localStorage.removeItem("reauth_user");
      const redirect = localStorage.getItem("post_reauth_redirect") || "/dashboard";
      localStorage.removeItem("post_reauth_redirect");
      navigate(redirect, { replace: true });
    } catch (err) {
      const errors = err.response?.data || {};
      let msg = errors.detail || "Invalid credentials. Please try again.";

      if (errors.action === "resend_verification") {
        setShowResend(true);
        msg = "Account not verified. Please check your email.";
      } else if (errors.non_field_errors?.[0]) {
        msg = errors.non_field_errors[0];
      }

      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setLoading(true);
    try {
      await client.post("/resend-verification/", { email: formData.email });
      setErrorMessage("Verification email resent. Please check your inbox.");
      setShowResend(false);
    } catch (err) {
      setErrorMessage(err.response?.data?.error || "Failed to resend verification email.");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    if (!biometricSupported || biometricChecking) return;

    setLoading(true);
    setErrorMessage("");

    const refreshToken = localStorage.getItem("refresh");
    
    if (refreshToken) {
      const { success, access } = await authenticateWithRefresh();
      if (success) {
        let userData;
        try {
          const res = await client.get(`/profile-api/?t=${Date.now()}`);
          userData = {
            email: res.data.email,
            id: res.data.id,
            is_merchant: res.data.is_merchant,
            is_staff: res.data.is_staff,
            full_name: res.data.full_name || null,
            phone_number: res.data.phone_number || null,
          };
        } catch {
          userData = JSON.parse(localStorage.getItem("user") || "{}");
        }

        login({ access, refresh: refreshToken }, userData);

        const redirect = localStorage.getItem("post_reauth_redirect") || "/dashboard";
        localStorage.removeItem("post_reauth_redirect");
        navigate(redirect, { replace: true });
      } else {
        setErrorMessage("Biometric authentication failed. Please use your password.");
      }
    } else if (biometricEmail) {
      const result = await loginWithBiometric(biometricEmail);
      
      if (result.success) {
        const userData = result.user;
        const access = localStorage.getItem("access");
        const refresh = localStorage.getItem("refresh");
        
        login({ access, refresh }, userData);
        
        const redirect = localStorage.getItem("post_reauth_redirect") || "/dashboard";
        localStorage.removeItem("post_reauth_redirect");
        navigate(redirect, { replace: true });
      } else {
        setErrorMessage("Biometric authentication failed. Please use your password.");
      }
    } else {
      setErrorMessage("No biometric credentials found. Please login with your password.");
    }
    
    setLoading(false);
  };

  const displayName = reauthUser?.first_name || reauthUser?.email || formData.email.split("@")[0];

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.85), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fadeIn 0.6s ease-out forwards; }
      `}</style>

      <div className="min-h-screen text-white relative overflow-hidden flex items-center justify-center p-4">
        {/* Premium Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-50">
            <div className="bg-gray-800/80 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl border border-gray-600/50 max-w-md w-full mx-4 fade-in">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 animate-ping opacity-40"></div>
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">
                    Signing you in...
                  </p>
                  <p className="text-sm text-gray-400 mt-2">Welcome back</p>
                </div>
                <div className="w-full h-1 bg-gray-700/60 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-lg w-full relative z-10">
          <div className="bg-gray-800/60 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl border border-gray-700/60 fade-in">
            {/* Logo & Greeting */}
            <div className="text-center mb-8">
              <img
                src="/mafitapay.png"
                alt="Mafita Logo"
                className="w-20 h-20 object-contain mx-auto mb-4"
              />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                {shouldReauth && reauthUser ? `Welcome back, ${displayName}` : "Sign In"}
              </h1>
              <p className="text-gray-400 mt-2">Access your Mafita account</p>
            </div>

            {/* Error / Success Message */}
            {errorMessage && (
              <div className={`p-4 rounded-2xl text-sm text-center shadow-lg mb-6 ${
                errorMessage.includes("successfully")
                  ? "bg-green-900/30 border border-green-600/40 text-green-300"
                  : "bg-red-900/30 border border-red-600/40 text-red-300"
              }`}>
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field - Hidden during reauth */}
              {!shouldReauth && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-12 pr-4 py-4 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all duration-300"
                    />
                  </div>
                </div>
              )}

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300">Password</label>
                  <Link
                    to="/reset-password-request"
                    className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••••••"
                    className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-12 pr-12 py-4 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all duration-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-300 transition"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              {!shouldReauth && (
                <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500 bg-gray-800/70"
                  />
                  <span>Remember me</span>
                </label>
              )}

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-2xl text-base transition-all duration-400 shadow-xl hover:shadow-2xl transform hover:-translate-y-1 flex items-center justify-center gap-3 group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
                  </>
                )}
              </button>
            </form>

            {/* Biometric Login */}
            {biometricSupported && (biometricEmail || localStorage.getItem("refresh")) && (
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-gray-800/60 text-gray-500">or</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBiometric}
                  disabled={biometricChecking || loading}
                  className="mt-6 w-full flex items-center justify-center gap-4 bg-gray-800/70 hover:bg-gray-700/70 border border-gray-600/80 py-4 rounded-2xl transition-all duration-300 group"
                >
                  {biometricChecking ? (
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  ) : (
                    <Fingerprint className="w-7 h-7 text-indigo-400 group-hover:scale-110 transition" />
                  )}
                  <span className="font-semibold text-gray-200">
                    {biometricChecking ? "Authenticating..." : "Sign in with Biometrics"}
                  </span>
                </button>
              </div>
            )}

            {/* Resend Verification */}
            {showResend && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleResendVerification}
                  disabled={loading}
                  className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-4 transition"
                >
                  Resend verification email
                </button>
              </div>
            )}

            {/* Register Link */}
            <div className="mt-8 text-center text-sm text-gray-400">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 hover:from-indigo-300 hover:to-purple-300 transition"
              >
                Create one here
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
