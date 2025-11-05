// src/components/Login.jsx
import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import { Loader2 } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: localStorage.getItem("rememberedEmail") || "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem("rememberedEmail"));

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const verified = params.get("verified");
    if (verified === "true") {
      toast.success("Email verified successfully! Please log in.", { autoClose: 3000 });
    } else if (verified === "false") {
      toast.error("Email verification failed. Please try again.", { autoClose: 3000 });
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
      localStorage.setItem("access", res.data.access);
      localStorage.setItem("refresh", res.data.refresh);
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", formData.email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      // Fetch user profile
      const profileRes = await client.get(`/profile-api/?t=${Date.now()}`);
      const userData = {
        email: profileRes.data.email,
        id: profileRes.data.id, // Critical for role detection
        is_merchant: profileRes.data.is_merchant,
        is_staff: profileRes.data.is_staff,
        full_name: profileRes.data.full_name || null,
        phone_number: profileRes.data.phone_number || null,
        date_of_birth: profileRes.data.date_of_birth || null,
      };
      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("last_user_fetch", Date.now().toString());
      console.debug("Stored user data:", userData);

      toast.success("Login successful!", { autoClose: 3000 });
      window.dispatchEvent(new Event("login"));
      navigate("/dashboard");
    } catch (err) {
      console.error("Login error:", err.response?.data || err.message);
      const errors = err.response?.data?.errors || {};
      const msg = errors.detail || "Login failed. Please check your credentials.";
      if (errors.action === "resend_verification") {
        setShowResend(true);
        toast.warning("Your email is not verified. Please verify it first.", { autoClose: 3000 });
        setErrorMessage("Your account is not verified. Check your email inbox or resend verification.");
      } else {
        toast.error(msg, { autoClose: 3000 });
        setErrorMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setLoading(true);
    try {
      const res = await client.post("/api/resend-verification/", { email: formData.email });
      toast.success(res.data.message, { autoClose: 3000 });
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to resend verification email.";
      toast.error(msg, { autoClose: 3000 });
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center p-4">
      <ToastContainer />
      <div className="w-full max-w-md rounded-2xl border border-indigo-900 bg-gray-800 p-8 shadow-xl backdrop-blur-md">
        <h2 className="text-2xl font-semibold text-center text-green-500 mb-6">
          Welcome Back
        </h2>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-lg text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="Enter your password"
            />
          </div>

          <div className="text-right text-sm">
            <Link
              to="/reset-password-request"
              className="text-green-600 hover:underline font-medium"
            >
              Forgot Password?
            </Link>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center text-white-700">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="mr-2 accent-green-600"
              />
              Remember Me
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition flex justify-center items-center"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Login"}
          </button>
        </form>

        {showResend && (
          <div className="mt-4 text-center text-sm text-gray-700">
            <button
              onClick={handleResendVerification}
              disabled={loading}
              className="text-green-600 hover:underline font-medium"
            >
              Resend Verification Email
            </button>
          </div>
        )}

        <div className="mt-4 text-center text-sm text-white-700">
          Don’t have an account?{" "}
          <Link
            to="/register"
            className="text-green-600 hover:underline font-medium"
          >
            Register
          </Link>
        </div>
      </div>
    </section>
  );
}