// src/pages/Register.jsx
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Loader2, ArrowLeft, Mail, Lock, User, Phone, Hash, Eye, EyeOff, ChevronRight, ChevronDown } from "lucide-react";
import client from "../../api/client";
import { COUNTRY_DATA } from "../../hooks/countries";
import { parsePhoneNumberFromString } from "libphonenumber-js";

// === CustomPhoneInput remains unchanged (already excellent) ===
function CustomPhoneInput({ value, onChange, country: initialCountry = "us" }) {
  const [country, setCountry] = useState(initialCountry);
  const [phone, setPhone] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [detecting, setDetecting] = useState(true);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const selectedCountry = COUNTRY_DATA.find((c) => c.code === country) || COUNTRY_DATA[0];

  useEffect(() => {
    async function detectCountry() {
      try {
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
                  (c) => c.code.toUpperCase() === data2.countryCode.toUpperCase()
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
            setDetecting(false);
          }
        );
      } catch (err) {
        setDetecting(false);
      }
    }
    detectCountry();
  }, []);

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
    onChange(`${selectedCountry.dialCode}${raw}`);
  };

  const handleCountrySelect = (c) => {
    setCountry(c.code);
    setIsOpen(false);
    setSearch("");
    onChange(`${c.dialCode}${phone}`);
    inputRef.current?.focus();
  };

  let formattedPhone = phone;
  try {
    const parsed = parsePhoneNumberFromString(`${selectedCountry.dialCode}${phone}`);
    if (parsed) formattedPhone = parsed.formatNational();
  } catch {}

  return (
    <div className="relative">
      <div className="flex items-stretch">
        <button
          type="button"
          disabled={detecting}
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center gap-2 px-4 bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 border-r-0 rounded-l-2xl text-white text-sm transition-all ${
            detecting
              ? "opacity-60 cursor-not-allowed"
              : "hover:bg-gray-700/70 hover:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          }`}
        >
          <span className="text-2xl">{detecting ? "🌐" : selectedCountry.flag}</span>
          <ChevronDown className={`w-4 h-4 transition ${isOpen ? "rotate-180" : ""}`} />
        </button>

        <div className="relative flex-1">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
          <span className="absolute left-12 top-1/2 -translate-y-1/2 text-gray-300 z-10 pointer-events-none font-medium">
            {selectedCountry.dialCode}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="Enter number"
            className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-24 pr-4 py-4 rounded-r-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-300"
          />
        </div>
      </div>

      {isOpen && !detecting && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-gray-800/90 backdrop-blur-2xl border border-gray-600/80 rounded-2xl shadow-2xl z-50 max-h-72 overflow-y-auto"
        >
          <div className="p-3 border-b border-gray-700">
            <input
              type="text"
              placeholder="Search countries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700/60 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredCountries.length > 0 ? (
              filteredCountries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => handleCountrySelect(c)}
                  className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-all hover:bg-indigo-600/20 ${
                    country === c.code ? "bg-indigo-600/30" : ""
                  }`}
                >
                  <span className="text-2xl">{c.flag}</span>
                  <span className="flex-1 text-gray-200 font-medium">{c.name}</span>
                  <span className="text-gray-400">{c.dialCode}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-gray-400">No results found</div>
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
    if (ref) setForm((prev) => ({ ...prev, referral_code: ref }));
  }, [location.search]);

  useEffect(() => {
    const token = localStorage.getItem("access");
    if (token) navigate("/dashboard");
  }, [navigate]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validateStep1 = () => {
    if (!form.email.includes("@")) return "Please enter a valid email address";
    if (form.password.length < 8) return "Password must be at least 8 characters";
    if (form.password !== form.password2) return "Passwords do not match";
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
        setTimeout(() => navigate("/dashboard"), 400);
      } else {
        setTimeout(() => navigate("/verify-email", { state: { email: form.email } }), 400);
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
        "Registration failed. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
          background: linear-gradient(90deg, transparent, rgba(54, 39, 39, 0.95), transparent);
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
            <div className="bg-gray-800/80 backdrop-blur-2xl p-10 rounded-3xl shadow-2xl border border-gray-600/50 max-w-md w-full mx-4 fade-in">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center shadow-2xl">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-indigo-500 animate-ping opacity-40"></div>
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-transparent bg-clip-text bg-indigo-300">
                    Creating your account...
                  </p>
                  <p className="text-sm text-gray-400 mt-2">This won't take long</p>
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
            {/* Premium Step Indicator */}
            <div className="flex justify-center mb-8">
              <div className="flex items-center gap-4 bg-gray-800/50 px-6 py-3 rounded-full border border-gray-700/50">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step >= 1 ? "bg-indigo-500 text-white shadow-lg" : "bg-gray-700 text-gray-500"}`}>
                  1
                </div>
                <div className={`w-16 h-1 rounded-full transition-all ${step >= 2 ? "bg-indigo-500" : "bg-gray-700"}`}></div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step >= 2 ? "bg-indigo-500 text-white shadow-lg" : "bg-gray-700 text-gray-500"}`}>
                  2
                </div>
              </div>
            </div>

            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h1 className="text-3xl font-bold bg-indigo-400 bg-clip-text text-transparent">
                    Welcome to the Future
                  </h1>
                  <p className="text-gray-400 mt-2">Let's set up your account</p>
                </div>

                {error && (
                  <div className="p-4 bg-red-900/30 backdrop-blur-md border border-red-600/40 rounded-2xl text-red-300 text-sm text-center shadow-lg">
                    {error}
                  </div>
                )}

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        name="email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={handleChange}
                        required
                        className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-12 pr-4 py-4 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all duration-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={form.password}
                        onChange={handleChange}
                        required
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

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        name="password2"
                        type={showConfirm ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={form.password2}
                        onChange={handleChange}
                        required
                        className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-12 pr-12 py-4 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all duration-300"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-300 transition"
                      >
                        {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={nextStep}
                    className="w-full bg-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white font-bold py-4 rounded-2xl text-base transition-all duration-400 shadow-xl hover:shadow-2xl transform hover:-translate-y-1 flex items-center justify-center gap-3 group"
                  >
                    Continue
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-4">
                  <h1 className="text-3xl font-bold bg-indigo-400 bg-clip-text text-transparent">
                    Almost There
                  </h1>
                  <p className="text-gray-400 mt-2">Complete your profile</p>
                </div>

                {error && (
                  <div className="p-4 bg-red-900/30 backdrop-blur-md border border-red-600/40 rounded-2xl text-red-300 text-sm text-center shadow-lg">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">First Name</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          name="first_name"
                          type="text"
                          placeholder="John"
                          value={form.first_name}
                          onChange={handleChange}
                          required
                          className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-12 pr-4 py-4 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all duration-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Last Name</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          name="last_name"
                          type="text"
                          placeholder="Doe"
                          value={form.last_name}
                          onChange={handleChange}
                          required
                          className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-12 pr-4 py-4 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all duration-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">WhatsApp Number</label>
                    <CustomPhoneInput
                      value={form.phone_number}
                      onChange={(phone) => setForm({ ...form, phone_number: phone })}
                      country={country}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Referral Code <span className="text-gray-500 font-normal">(Optional)</span></label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        name="referral_code"
                        type="text"
                        placeholder="ABC123"
                        value={form.referral_code}
                        onChange={handleChange}
                        className="w-full bg-gray-800/70 backdrop-blur-xl border border-gray-600/80 pl-12 pr-4 py-4 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition-all duration-300"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      type="button"
                      onClick={prevStep}
                      className="flex-1 bg-gray-700/70 hover:bg-gray-600/70 text-white font-semibold py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 backdrop-blur-xl"
                    >
                      <ArrowLeft className="w-5 h-5" />
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white font-bold py-4 rounded-2xl text-base transition-all duration-400 shadow-xl hover:shadow-2xl transform hover:-translate-y-1 flex items-center justify-center gap-3 group"
                    >
                      Create
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="mt-8 text-center text-sm text-gray-400">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-transparent bg-clip-text bg-indigo-400 hover:from-indigo-300 hover:to-indigo-300 transition">
                Sign in here
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


