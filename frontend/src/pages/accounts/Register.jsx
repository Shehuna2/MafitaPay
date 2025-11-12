// src/pages/Register.jsx
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Loader2, ArrowLeft, Mail, Lock, User, Phone, Hash, Eye, EyeOff, ChevronRight, ChevronDown, } from "lucide-react";
import client from "../../api/client";
import { parsePhoneNumberFromString, AsYouType } from "libphonenumber-js";

// Country data (add more as needed)
const COUNTRY_DATA = [
  { code: "us", name: "United States", flag: "🇺🇸", dialCode: "1" },
  { code: "gb", name: "United Kingdom", flag: "🇬🇧", dialCode: "44" },
  { code: "ng", name: "Nigeria", flag: "🇳🇬", dialCode: "234" },
  { code: "in", name: "India", flag: "🇮🇳", dialCode: "91" },
  { code: "ca", name: "Canada", flag: "🇨🇦", dialCode: "1" },
  { code: "au", name: "Australia", flag: "🇦🇺", dialCode: "61" },
  { code: "de", name: "Germany", flag: "🇩🇪", dialCode: "49" },
  { code: "fr", name: "France", flag: "🇫🇷", dialCode: "33" },
  { code: "za", name: "South Africa", flag: "🇿🇦", dialCode: "27" },
  { code: "ke", name: "Kenya", flag: "🇰🇪", dialCode: "254" },
  { code: "br", name: "Brazil", flag: "🇧🇷", dialCode: "55" },
  { code: "mx", name: "Mexico", flag: "🇲🇽", dialCode: "52" },
  { code: "jp", name: "Japan", flag: "🇯🇵", dialCode: "81" },
  { code: "cn", name: "China", flag: "🇨🇳", dialCode: "86" },
  { code: "ru", name: "Russia", flag: "🇷🇺", dialCode: "7" },
];

// Custom Phone Input Component (Embedded)
function CustomPhoneInput({ value, onChange, country: initialCountry = "us" }) {
  const [country, setCountry] = useState(initialCountry);
  const [phone, setPhone] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [detecting, setDetecting] = useState(true);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const selectedCountry =
    COUNTRY_DATA.find((c) => c.code === country) || COUNTRY_DATA[0];

  // --- Auto Detect Country on Mount ---
  useEffect(() => {
    async function detectCountry() {
      try {
        // 1️⃣ Try IP-based lookup
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        if (data?.country_code) {
          const found = COUNTRY_DATA.find(
            (c) => c.code.toUpperCase() === data.country_code.toUpperCase()
          );
          if (found) {
            setCountry(found.code);
            setDetecting(false);
            return;
          }
        }

        // 2️⃣ Fallback: Browser geolocation
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
              const res2 = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
              );
              const data2 = await res2.json();
              if (data2?.countryCode) {
                const found2 = COUNTRY_DATA.find(
                  (c) =>
                    c.code.toUpperCase() === data2.countryCode.toUpperCase()
                );
                if (found2) setCountry(found2.code);
              }
            } catch (err) {
              console.error("Geolocation fallback failed:", err);
            } finally {
              setDetecting(false);
            }
          },
          () => {
            console.warn("User denied geolocation access");
            setDetecting(false);
          }
        );
      } catch (err) {
        console.error("Country detection failed:", err);
        setDetecting(false);
      }
    }

    detectCountry();
  }, []);

  // --- Parse value on mount/update ---
  useEffect(() => {
    if (value && value !== `${selectedCountry.dialCode}${phone}`) {
      try {
        const parsed = parsePhoneNumberFromString(value);
        if (parsed) {
          const found = COUNTRY_DATA.find(
            (c) => `+${parsed.countryCallingCode}` === c.dialCode
          );
          if (found) setCountry(found.code);
          setPhone(parsed.nationalNumber);
        }
      } catch {
        setPhone(value.replace(/^\+\d+\s*/, ""));
      }
    }
  }, [value]);

  // --- Close dropdown on outside click ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCountries = COUNTRY_DATA.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search) ||
      c.code.toLowerCase().includes(search)
  );

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    setPhone(raw);
    const formatted = new AsYouType(selectedCountry.code.toUpperCase()).input(
      raw
    );
    setPhone(raw);
    onChange(`${selectedCountry.dialCode}${raw}`);
  };

  const handleCountrySelect = (c) => {
    setCountry(c.code);
    setIsOpen(false);
    setSearch("");
    const full = `${c.dialCode}${phone}`;
    onChange(full);
    inputRef.current?.focus();
  };

  let formattedPhone = phone;
  try {
    const parsed = parsePhoneNumberFromString(
      `${selectedCountry.dialCode}${phone}`
    );
    if (parsed) formattedPhone = parsed.formatNational();
  } catch {
    formattedPhone = phone;
  }

  return (
    <div className="relative">
      <div className="flex items-stretch">
        {/* Country Selector */}
        <button
          type="button"
          disabled={detecting}
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center gap-1.5 w-16 bg-gray-800/60 backdrop-blur-md border border-gray-700/80 border-r-0 rounded-l-xl text-white text-sm transition ${
            detecting
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-gray-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          }`}
        >
          <span className="text-lg">
            {detecting ? "🌐" : selectedCountry.flag}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Phone Input */}
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 z-10" />
          <input
            ref={inputRef}
            type="text"
            value={formattedPhone || phone}
            onChange={handlePhoneChange}
            placeholder=" "
            className="w-full h-full bg-gray-800/60 backdrop-blur-md border border-gray-700/80 pl-10 pr-3 py-2.5 rounded-r-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
          />
          <span className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">
            {selectedCountry.dialCode}
          </span>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && !detecting && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-gray-800/80 backdrop-blur-md border border-gray-700/80 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto"
        >
          <div className="p-2 border-b border-gray-700">
            <input
              type="text"
              placeholder="Search country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filteredCountries.length > 0 ? (
              filteredCountries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => handleCountrySelect(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-gray-700/60 ${
                    country === c.code ? "bg-indigo-600/20" : ""
                  }`}
                >
                  <span className="text-lg">{c.flag}</span>
                  <span className="flex-1 text-gray-300">{c.name}</span>
                  <span className="text-gray-500">{c.dialCode}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-400">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("us");
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
    const userLocale = navigator.language || 'en-US';
    const countryCode = userLocale.split('-')[1]?.toLowerCase() || 'us';
    setCountry(countryCode);
  }, []);

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
      const submitData = { ...form };
      if (!submitData.referral_code) delete submitData.referral_code;

      const res = await client.post("register/", submitData);
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
                <h1 className="text-2xl font-bold text-center text-indigo-400 mb-6">
                  Complete Your Profile
                </h1>

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
                    <CustomPhoneInput
                      value={form.phone_number}
                      onChange={(phone) => setForm({ ...form, phone_number: phone })}
                      country={country}
                    />
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

                  {/* Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={prevStep}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                    >
                      Create Account
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
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