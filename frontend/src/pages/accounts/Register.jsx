// src/pages/Register.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import client from "../../api/client";
import { Loader2, ArrowLeft, Mail, Lock, User, Phone, Hash, Eye, EyeOff, ChevronRight } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(1);
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const validateStep1 = () => {
    if (!form.email.includes("@")) return "Enter a valid email";
    if (form.password.length < 8) return "Password must be 8+ characters";
    if (form.password !== form.password2) return "Passwords don't match";
    return null;
  };

  const nextStep = () => {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep(2);
  };

  const prevStep = () => {
    setError("");
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
        // Make a copy of form
        const submitData = { ...form };

        // Remove referral_code if empty
        if (!submitData.referral_code) delete submitData.referral_code;

        const res = await client.post("register/", submitData); // use submitData
        if (res.data.access && res.data.refresh) {
            localStorage.setItem("access", res.data.access);
            localStorage.setItem("refresh", res.data.refresh);
            setTimeout(() => navigate("/dashboard"), 300);
        } else {
            setTimeout(() => navigate("/verify-email", { state: { email: form.email } }), 300);
        }
    } catch (err) {
        const errors = err.response?.data?.errors || {};
        const errorMessage =
            errors.email?.[0] ||
            errors.password?.[0] ||
            errors.password2?.[0] ||
            errors.phone_number?.[0] ||
            errors.referral_code?.[0] ||
            err.response?.data?.detail ||
            "Registration failed";
        setError(errorMessage);
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
        @keyframes slide-left {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes slide-right {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        .slide-left { animation: slide-left 0.5s ease-out; }
        .slide-right { animation: slide-right 0.5s ease-out; }
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
                <p className="text-lg font-medium text-indigo-300">Creating your account...</p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shimmer"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-md w-full relative z-10">
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-gray-700/50">
            {/* Step Indicator */}
            <div className="flex justify-center mb-5">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 1 ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-400"}`}>
                  1
                </div>
                <div className="w-10 h-0.5 bg-gray-700"></div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 2 ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-400"}`}>
                  2
                </div>
              </div>
            </div>

            {/* Step 1: Email & Password */}
            {step === 1 && (
              <div className="slide-right">
                <h1 className="text-2xl font-bold text-center text-indigo-400 mb-6">Set Up Your Account</h1>

                {error && (
                  <div className="mb-5 p-3.5 bg-red-900/20 backdrop-blur-sm border border-red-500/30 rounded-xl text-sm text-red-300 text-center">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        name="email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={handleChange}
                        required
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
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={form.password}
                        onChange={handleChange}
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
                        name="password2"
                        type={showConfirm ? "text" : "password"}
                        placeholder="••••••••"
                        value={form.password2}
                        onChange={handleChange}
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

                  <button
                    onClick={nextStep}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Personal Info */}
            {step === 2 && (
              <div className="slide-left">
                <h1 className="text-2xl font-bold text-center text-indigo-400 mb-6">Complete Your Profile</h1>

                {error && (
                  <div className="mb-5 p-3.5 bg-red-900/20 backdrop-blur-sm border border-red-500/30 rounded-xl text-sm text-red-300 text-center">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* First Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">First Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        name="first_name"
                        type="text"
                        placeholder="John"
                        value={form.first_name}
                        onChange={handleChange}
                        required
                        className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                      />
                    </div>
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Last Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        name="last_name"
                        type="text"
                        placeholder="Doe"
                        value={form.last_name}
                        onChange={handleChange}
                        required
                        className="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">WhatsApp Number</label>
                    <div className="relative">
                      {/* Phone Icon */}
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                      <PhoneInput
                        country={'us'} // default country
                        value={form.phone_number}
                        onChange={(phone) => setForm({ ...form, phone_number: phone })}
                        inputClass="w-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                        containerClass="relative"
                        inputProps={{
                          name: 'phone_number',
                          required: true,
                        }}
                        buttonClass="bg-gray-800/60 border-r border-gray-700/80" // makes country selector match style
                      />
                    </div>
                  </div>

                  {/* Referral */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Referral Code (Optional)</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        name="referral_code"
                        type="text"
                        placeholder="ABC123"
                        value={form.referral_code}
                        onChange={handleChange}
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
                        Creating Account...
                      </>
                    ) : (
                      "Complete Registration"
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Login Link */}
            <div className="mt-5 text-center text-xs text-gray-400">
              Already have an account?{" "}
              <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium underline transition">
                Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}