// src/pages/Login.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Loader2, Mail, Lock, Eye, EyeOff, Fingerprint } from "lucide-react";
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
  const [biometricEmail, setBiometricEmail] = useState(localStorage.getItem("biometric_user_email") || "");

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

  // Email verification feedback
  useEffect(() => {
    const verified = urlParams.get("verified");
    if (verified === "true") setErrorMessage("Email verified successfully! Please sign in.");
    else if (verified === "false") setErrorMessage("Email verification failed. Please try again.");
  }, [urlParams]);

  // Auto-redirect if already authenticated
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

      // Remember email
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      // Fetch profile
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

    // Check if we have a refresh token (re-authentication scenario)
    const refreshToken = localStorage.getItem("refresh");
    
    if (refreshToken) {
      // Re-authentication flow: use existing refresh token
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
      // New login flow: use biometric authentication for returning users
      const result = await loginWithBiometric(biometricEmail);
      
      if (result.success) {
        // User data is already stored in localStorage by loginWithBiometric
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
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-gray-900/80 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl border border-gray-800">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-indigo-300 font-medium">Signing you in...</p>
          </div>
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="bg-gray-900/60 backdrop-blur-xl border border-gray-800 rounded-3xl p-8 shadow-2xl">
          {/* Logo & Greeting */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/mafitapay.png"
              alt="Mafita Logo"
              className="w-20 h-20 object-contain mb-4"
            />
            {shouldReauth && reauthUser ? (
              <h1 className="text-2xl font-bold text-white">
                Welcome back, <span className="text-indigo-400">{displayName}</span>
              </h1>
            ) : (
              <h1 className="text-2xl font-bold text-white">Sign In</h1>
            )}
            <p className="mt-2 text-gray-400 text-sm">
              Access your Mafita account
            </p>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-red-300 text-sm text-center">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            {!shouldReauth && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    className="w-full bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 pl-11 pr-4 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 pl-11 pr-12 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-indigo-400 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500 bg-gray-800"
                />
                <span>Remember me</span>
              </label>
              <Link
                to="/reset-password-request"
                className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-3.5 rounded-2xl shadow-lg hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Biometric option */}
          {biometricSupported && (biometricEmail || localStorage.getItem("refresh")) && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleBiometric}
                disabled={biometricChecking || loading}
                className="w-full flex items-center justify-center gap-3 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 text-gray-200 py-3 rounded-2xl transition-all duration-200 disabled:opacity-50"
              >
                {biometricChecking ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Fingerprint className="h-6 w-6 text-indigo-400" />
                )}
                <span className="font-medium">
                  {biometricChecking ? "Authenticating..." : "Sign in with Biometrics"}
                </span>
              </button>
            </div>
          )}

          {/* Resend verification */}
          {showResend && (
            <div className="mt-5 text-center">
              <button
                onClick={handleResendVerification}
                disabled={loading}
                className="text-indigo-400 hover:text-indigo-300 text-sm font-medium underline underline-offset-4 transition"
              >
                Resend verification email
              </button>
            </div>
          )}

          {/* Register link */}
          <div className="mt-8 text-center text-sm text-gray-400">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}