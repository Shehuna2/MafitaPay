// src/pages/accounts/Profile.jsx
import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  User,
  Loader2,
  CheckCircle2,
  LogOut,
  MessageCircle,
  ArrowLeft,
  Shield,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "../../context/AuthContext";

export default function Profile() {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEdited, setIsEdited] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    phone_number: "",
    date_of_birth: "",
    account_no: "",
    bank_name: "",
  });

  const normalizeProfile = (data) => {
    // Build a normalized profile object that always has full_name
    const first = data.first_name || data.profile?.first_name || "";
    const last = data.last_name || data.profile?.last_name || "";
    const apiFull = (data.full_name || "").trim();
    const computedFull = `${first} ${last}`.trim();
    const full_name = apiFull || computedFull || "";

    return {
      ...data,
      full_name,
    };
  };

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: raw } = await client.get("profile-api/");
      const data = normalizeProfile(raw || {});
      setProfile(data);

      // EXACT same field names as your original — guaranteed no breakage
      setFormData({
        full_name: data.full_name || "",
        phone_number: data.phone_number || "",
        date_of_birth: data.date_of_birth ? data.date_of_birth.split("T")[0] : "",
        account_no: data.account_no || "",
        bank_name: data.bank_name || "",
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Detect unsaved changes safely
  useEffect(() => {
    if (!profile) return;
    const hasChanges = Object.keys(formData).some(key => {
      const current = formData[key];
      const original = key === "date_of_birth"
        ? (profile[key]?.split?.("T")?.[0] || "")
        : (profile[key] || "");
      return String(current) !== String(original);
    });
    setIsEdited(hasChanges);
  }, [formData, profile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEdited) return;

    setSubmitting(true);
    try {
      const data = new FormData();
      // Only send fields that have values — exactly like your original
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          data.append(key, formData[key]);
        }
      });

      const response = await client.patch("profile-api/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const normalized = normalizeProfile(response.data || {});
      setProfile(normalized);
      toast.success("Profile updated successfully!");
      setIsEdited(false);

      // Sync localstorage + global user if needed
      try {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        const merged = { ...stored, ...normalized };
        localStorage.setItem("user", JSON.stringify(merged));
        // notify other tabs
        window.dispatchEvent(new Event("userUpdated"));
      } catch (e) {
        // ignore localStorage sync errors
      }
    } catch (err) {
      const msg = err.response?.data?.detail ||
        (err.response?.data && Object.values(err.response.data)[0]) ||
        "Failed to update profile";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const whatsappMessage = authUser
    ? encodeURIComponent(`Hi, I am ${authUser.email}. I want to apply to become a merchant on MafitaPay.`)
    : encodeURIComponent("Hi, I want to apply to become a merchant on MafitaPay.");

  if (loading) return <ProfileSkeleton />;
  if (!profile) return <div className="text-center text-gray-400 py-20">Profile not found.</div>;

  const successRate = profile.success_rate?.toFixed(1) || "0.0";

  return (
    <>
      <ToastContainer position="top-center" theme="dark" autoClose={3000} />

      <div className="min-h-screen bg-gray-950 text-white">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800">
          <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <User className="w-7 h-7 text-indigo-400" />
              My Profile
            </h1>
            <Link to="/dashboard" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden xs:inline">Dashboard</span>
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
          {/* Merchant CTA */}
          {!authUser?.is_merchant && (
            <div className="bg-gradient-to-r from-emerald-900/40 to-teal-900/30 border border-emerald-700/50 rounded-2xl p-6 text-center">
              <h3 className="text-lg font-bold mb-2">Become a Merchant</h3>
              <p className="text-gray-300 mb-5 text-sm">
                Contact support to start accepting payments
              </p>
              <a
                href={`https://wa.me/+2348168623961?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-green-600 hover:bg-green-500 px-6 py-3.5 rounded-xl font-medium transition"
              >
                <MessageCircle className="w-5 h-5" />
                Contact Support
              </a>
            </div>
          )}

          {/* Security & Authentication */}
          <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/30 border border-blue-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-400" />
                  Security &amp; Authentication
                </h3>
                <p className="text-gray-300 text-sm">
                  Manage your PIN and biometric authentication settings
                </p>
              </div>
              <Link
                to="/security-settings"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-3 rounded-xl font-medium transition"
              >
                <Shield className="w-5 h-5" />
                <span className="hidden sm:inline">Manage Security</span>
                <span className="sm:hidden">Security</span>
              </Link>
            </div>
          </div>

          {/* Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Left: Summary Card */}
            <div className="lg:col-span-1">
              <div className="bg-gray-900/90 backdrop-blur border border-gray-800 rounded-2xl p-6 sticky top-24">
                <div className="text-center mb-6">
                  <div className="w-28 h-28 mx-auto mb-4 bg-gray-800 rounded-full flex items-center justify-center text-4xl font-bold text-gray-500">
                    {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <h3 className="mt-4 text-xl font-bold">{profile.full_name || "User"}</h3>
                  <p className="text-gray-400 text-sm">{profile.email}</p>
                </div>

                <div className="space-y-4 text-sm">
                  <InfoRow label="Role" value={profile.is_merchant ? "Merchant" : "Regular User"} />
                  <InfoRow label="Total Trades" value={profile.total_trades || 0} />
                  <InfoRow label="Successful" value={profile.successful_trades || 0} />
                  <InfoRow 
                    label="Success Rate" 
                    value={<span className={parseFloat(successRate) >= 80 ? "text-green-400" : "text-yellow-400"}>{successRate}%</span>} 
                  />
                </div>
              </div>
            </div>

            {/* Right: Edit Form */}
            <div className="lg:col-span-3">
              <form onSubmit={handleSubmit} className="bg-gray-900/90 backdrop-blur border border-gray-800 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <User className="w-6 h-6 text-indigo-400" />
                  Edit Profile
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {[
                    { label: "Full Name", name: "full_name", type: "text", placeholder: "Enter full name" },
                    { label: "Phone Number", name: "phone_number", type: "text", placeholder: "e.g., +2341234567890" },
                    { label: "Date of Birth", name: "date_of_birth", type: "date", placeholder: "" },
                    { label: "Bank Name", name: "bank_name", type: "text", placeholder: "Enter bank name" },
                    { label: "Account Number", name: "account_no", type: "text", placeholder: "Enter account number" },
                  ].map(({ label, name, type, placeholder }) => (
                    <div key={name} className="space-y-2">
                      <label className="text-sm text-gray-400">{label}</label>
                      <input
                        type={type}
                        name={name}
                        value={formData[name]}
                        onChange={handleInputChange}
                        placeholder={placeholder}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    type="submit"
                    disabled={submitting || !isEdited}
                    className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 rounded-xl font-medium flex items-center justify-center gap-3 transition"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-8 py-3.5 bg-red-600 hover:bg-red-500 rounded-xl font-medium flex items-center justify-center gap-3 transition"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </div>

                {isEdited && (
                  <p className="text-center text-green-400 text-sm mt-4 animate-pulse">
                    You have unsaved changes
                  </p>
                )}
              </form>
            </div>
          </div>

          {/* Mobile Bottom Bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-gray-950/95 backdrop-blur border-t border-gray-800 px-4 py-4 sm:hidden z-10">
            <Link to="/dashboard" className="flex items-center justify-center gap-2 text-indigo-400 font-medium">
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-3 border-b border-gray-800 last:border-none">
      <span className="text-gray-400">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950">
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .shimmer { background: linear-gradient(to right, #1f2937 8%, #374151 18%, #1f2937 33%); background-size: 1000px 100%; animation: shimmer 1.8s infinite linear; }
      `}</style>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="h-10 w-64 bg-gray-800 rounded-2xl shimmer mx-auto" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="bg-gray-900/80 rounded-2xl p-6 space-y-6">
            <div className="w-28 h-28 mx-auto bg-gray-800 rounded-full shimmer" />
            <div className="space-y-3"><div className="h-6 w-32 mx-auto bg-gray-800 rounded shimmer" /></div>
          </div>
          <div className="lg:col-span-3 bg-gray-900/80 rounded-2xl p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {Array(5).fill().map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-24 bg-gray-800 rounded shimmer" />
                  <div className="h-12 w-full bg-gray-800 rounded-xl shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}