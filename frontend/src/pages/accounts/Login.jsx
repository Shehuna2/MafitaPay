// src/pages/Login.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import client from "../../api/client";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import useBiometricAuth from "../../hooks/useBiometricAuth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Form & UI states
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: localStorage.getItem("rememberedEmail") || "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem("rememberedEmail"));
  const [showPassword, setShowPassword] = useState(false);

  // Reauth detection
  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const shouldReauth = urlParams.get("reauth") === "true";
  const reauthUserRaw = localStorage.getItem("reauth_user");
  const reauthUser = useMemo(() => {
    try {
      return reauthUserRaw ? JSON.parse(reauthUserRaw) : null;
    } catch {
      return null;
    }
  }, [reauthUserRaw]);

  // Biometric hook
  const { isSupported: biometricSupported, authenticateWithRefresh, checking: biometricChecking } =
    useBiometricAuth();

  // Email verification messages
  useEffect(() => {
    const verified = urlParams.get("verified");
    if (verified === "true") setErrorMessage("Email verified! Please log in.");
    else if (verified === "false") setErrorMessage("Email verification failed. Please try again.");
  }, [urlParams]);

  // Redirect if already logged in
  useEffect(() => {
    const access = localStorage.getItem("access");
    if (!access) return;

    try {
      const [, payloadBase64] = access.split(".");
      const payload = JSON.parse(atob(payloadBase64));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp > now) navigate("/dashboard", { replace: true });
      else localStorage.removeItem("access");
    } catch {
      localStorage.removeItem("access");
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage("");
  };

  // ✅ FIXED: Login submission (ALL token/user storing handled by AuthContext)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setShowResend(false);

    const submitEmail = shouldReauth && reauthUser ? reauthUser.email : formData.email;

    try {
      // 1. Login request
      const res = await client.post("/login/", {
        email: submitEmail,
        password: formData.password,
      });

      const { access, refresh } = res.data;

      // 2. Remember email if checkbox checked
      rememberMe
        ? localStorage.setItem("rememberedEmail", submitEmail)
        : localStorage.removeItem("rememberedEmail");

      // 3. Fetch profile
      let userData = null;
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
        // Fallback if profile fails
        userData = { email: submitEmail };
      }

      // 4. Use AuthContext login (this stores tokens+user properly)
      login({ access, refresh }, userData);

      // 5. Cleanup
      localStorage.removeItem("reauth_user");

      // 6. Redirect immediately
      const redirectPath = localStorage.getItem("post_reauth_redirect");
      localStorage.removeItem("post_reauth_redirect");
      navigate(redirectPath || "/dashboard", { replace: true });
    } catch (err) {
      const errors = err.response?.data || {};
      const msg = errors.detail || "Login failed. Please check your credentials.";

      if (errors.action === "resend_verification") {
        setShowResend(true);
        setErrorMessage("Your account is not verified. Check email or resend verification.");
      } else if (errors?.non_field_errors?.[0]) {
        setErrorMessage(errors.non_field_errors[0]);
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Resend verification
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

  // Biometric login
  const handleBiometric = async () => {
    setErrorMessage("");
    if (!biometricSupported) return;

    const { success, access } = await authenticateWithRefresh();
    if (success) {
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
        };
      } catch {
        userData = JSON.parse(localStorage.getItem("user") || "null");
      }

      // Login through context
      login({ access, refresh: localStorage.getItem("refresh") }, userData);

      const redirectPath = localStorage.getItem("post_reauth_redirect");
      localStorage.removeItem("post_reauth_redirect");
      navigate(redirectPath || "/dashboard", { replace: true });
    } else {
      setErrorMessage("Biometric login failed. Please enter your password.");
    }
  };

  const renderGreeting = () => {
    const displayName = reauthUser?.full_name || reauthUser?.email || formData.email;
    return shouldReauth && reauthUser ? (
      <h2 className="text-2xl font-bold text-indigo-400">Welcome back, {displayName}</h2>
    ) : (
      <h2 className="text-2xl font-bold text-indigo-400">Welcome Back</h2>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-3 relative">
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-700/50 max-w-md w-full mx-4">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-lg font-medium text-indigo-300">Signing you in...</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-md w-full relative z-10">
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50">
          
          {/* Logo + Greeting */}
          <div className="flex flex-col md:flex-row md:items-center md:gap-4 mb-6">
            <img
              src="/mafitapay.png"
              alt="Mafita Logo"
              className="w-24 h-24 object-contain mx-auto md:mx-0"
            />
            <div className="mt-2 md:mt-0 md:block hidden">{renderGreeting()}</div>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 bg-red-900/20 border border-red-500/30 rounded-xl text-sm text-red-300 text-center">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!shouldReauth && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="you@example.com"
                    className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
              </div>
            )}

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
                  className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-10 py-2.5 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
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

          {/* Biometric */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={biometricSupported && localStorage.getItem("refresh") ? handleBiometric : undefined}
              disabled={biometricChecking || !biometricSupported}
              className={`w-full mt-2 inline-flex items-center justify-center gap-2 border border-gray-700/40 rounded-xl py-2 text-sm transition ${
                biometricSupported && localStorage.getItem("refresh")
                  ? "text-indigo-300 hover:bg-gray-800/60"
                  : "text-gray-600 cursor-not-allowed"
              }`}
            >
              {biometricChecking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.6}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 11.5c0-.833.667-1.5 1.5-1.5S15 10.667 15 11.5v1a4 4 0 01-8 0v-1a1.5 1.5 0 013 0v1a1 1 0 002 0v-1z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4C7.582 4 4 7.582 4 12a8 8 0 0016 0c0-4.418-3.582-8-8-8z"
                    />
                  </svg>
                  {biometricSupported && localStorage.getItem("refresh")
                    ? "Sign in with fingerprint"
                    : "Fingerprint login unavailable"}
                </>
              )}
            </button>
          </div>

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

          <div className="mt-5 text-center text-xs text-gray-400">
            Don’t have an account?{" "}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium underline transition">
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
