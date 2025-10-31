// File: src/pages/Register.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import client from "../../api/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import { Loader2 } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    email: "",
    password: "",
    password2: "",
    first_name: "",
    last_name: "",
    phone_number: "",
    referral_code: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    if (ref) {
      setForm((prev) => ({ ...prev, referral_code: ref }));
    }
  }, [location.search]);

  useEffect(() => {
    const token = localStorage.getItem("access");
    if (token) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await client.post("register/", form);
      // If backend returns tokens, store them
      if (res.data.access && res.data.refresh) {
        localStorage.setItem("access", res.data.access);
        localStorage.setItem("refresh", res.data.refresh);
        toast.success("Registration successful! Redirecting to dashboard...", {
          position: "top-right",
          autoClose: 3000,
        });
        setTimeout(() => navigate("/dashboard"), 3000);
      } else {
        toast.success("Registration successful! Please check your email to verify your account.", {
          position: "top-right",
          autoClose: 3000,
        });
        setTimeout(() => navigate("/verify-email", { state: { email: form.email } }), 3000);
      }
    } catch (err) {
      console.error("❌ Registration error:", err.response?.data || err.message);
      const errors = err.response?.data?.errors || {};
      const errorMessage =
        errors.email?.[0] ||
        errors.password?.[0] ||
        errors.password2?.[0] ||
        errors.phone_number?.[0] ||
        errors.referral_code?.[0] ||
        err.response?.data?.detail ||
        "Registration failed";
      toast.error(errorMessage, { position: "top-right", autoClose: 3000 });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut", staggerChildren: 0.2 } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } },
  };

  const inputVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } },
  };

  const buttonVariants = {
    hover: { scale: 1.05, boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)", transition: { duration: 0.3 } },
    tap: { scale: 0.95 },
  };

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 p-4">
      <ToastContainer />
      <motion.div
        className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/90 p-8 shadow-xl backdrop-blur-md"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <motion.h1 className="mb-6 text-3xl font-bold text-gray-900 text-center" variants={inputVariants}>
          Register
        </motion.h1>
        <AnimatePresence>
          {error && (
            <motion.p
              className="mb-4 text-sm text-red-600 text-center"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <motion.form onSubmit={handleSubmit} className="space-y-6" variants={containerVariants}>
          <motion.div variants={inputVariants}>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
              required
            />
          </motion.div>
          <motion.div variants={inputVariants}>
            <input
              name="first_name"
              type="text"
              required={true}
              placeholder="First Name"
              value={form.first_name}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
            />
          </motion.div>
          <motion.div variants={inputVariants}>
            <input
              name="last_name"
              type="text"
              required={true}
              placeholder="Last Name"
              value={form.last_name}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
            />
          </motion.div>
          <motion.div variants={inputVariants}>
            <input
              name="phone_number"
              type="text"
              required={true}
              placeholder="Whatsapp Number (e.g., +2341234567890)"
              value={form.phone_number}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
            />
          </motion.div>
          <motion.div variants={inputVariants}>
            <input
              name="referral_code"
              type="text"
              placeholder="Referral Code (optional)"
              value={form.referral_code}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
            />
          </motion.div>
          <motion.div variants={inputVariants}>
            <input
              name="password"
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
              required
            />
          </motion.div>
          <motion.div variants={inputVariants}>
            <input
              name="password2"
              type="password"
              placeholder="Confirm Password"
              value={form.password2}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
              required
            />
          </motion.div>
          <motion.button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-white font-semibold shadow-md hover:from-indigo-700 hover:to-purple-700 disabled:opacity-75 disabled:cursor-not-allowed"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            {loading ? <Loader2 className="w-6 h-6 mx-auto animate-spin" /> : "Register"}
          </motion.button>
        </motion.form>
        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-indigo-600 hover:text-indigo-500 underline transition-colors duration-300">
            Login
          </Link>
        </p>
      </motion.div>
    </section>
  );
}