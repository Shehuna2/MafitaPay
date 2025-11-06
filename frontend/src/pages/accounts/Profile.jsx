// src/pages/accounts/Profile.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  User,
  AlertCircle,
  Loader2,
  CheckCircle2,
  LogOut,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "../../context/AuthContext";

const BASE_URL = window.location.hostname.includes("localhost")
  ? "http://127.0.0.1:8000"
  : "https://mafitapay.com";

export default function Profile() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    phone_number: "",
    date_of_birth: "",
    account_no: "",
    bank_name: "",
  });

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) setUser(JSON.parse(raw));
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const response = await client.get("profile-api/");
      const data = response.data;

      setProfile(data);
      setFormData({
        full_name: data.full_name || "",
        phone_number: data.phone_number || "",
        date_of_birth: data.date_of_birth ? data.date_of_birth.split("T")[0] : "",
        account_no: data.account_no || "",
        bank_name: data.bank_name || "",
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const data = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key]) data.append(key, formData[key]);
      });

      const response = await client.patch("profile-api/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setProfile(response.data);
      toast.success("Profile updated successfully.");
    } catch (err) {
      console.error("Profile update failed:", err.response?.data || err.message);
      toast.error(err.response?.data?.detail || "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully.");
    navigate("/login");
  };

  const whatsappMessage = user
    ? encodeURIComponent(`Hi, I am ${user.email}. I want to apply to become a merchant on MafitaPay.`)
    : encodeURIComponent("Hi, I want to apply to become a merchant on MafitaPay.");

  if (loading)
    return (
      <div className="flex justify-center mt-16 text-gray-400">
        <Loader2 className="animate-spin w-6 h-6" /> Loading profile...
      </div>
    );

  if (!profile)
    return <div className="text-center text-gray-400 mt-16">Profile not found.</div>;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-6 pb-12 text-white min-h-screen">
      <ToastContainer />
      <div className="bg-gray-900 rounded-2xl shadow-xl p-4 sm:p-5 relative z-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 mb-5">
            <User className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" /> My Profile
          </h2>

          {!user?.is_merchant && (
            <div className="bg-gray-800 p-3 sm:p-4 rounded-xl mb-5 text-center text-sm">
              <p className="text-gray-300 mb-3">
                Want to become a merchant? Contact our support team via WhatsApp.
              </p>
              <a
                href={`https://wa.me/+2348168623961?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 py-2 px-4 rounded-lg text-sm transition"
              >
                Contact Support
              </a>
            </div>
          )}

          {/* Profile Info */}
          <div className="bg-gray-800 p-3 sm:p-4 rounded-xl space-y-2 text-sm sm:text-base">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Email:</span>
              <span className="font-medium">{profile.email || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Role:</span>
              <span className="font-medium">
                {profile.is_merchant ? "Merchant" : "Regular User"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Total Trades:</span>
              <span className="font-medium">{profile.total_trades || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Successful Trades:</span>
              <span className="font-medium">{profile.successful_trades || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Success Rate:</span>
              <span className="font-medium">{profile.success_rate?.toFixed(2)}%</span>
            </div>
          </div>

          {/* Edit Form */}
          <form onSubmit={handleSubmit} className="mt-5 bg-gray-800 p-3 sm:p-4 rounded-xl">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-400" /> Edit Profile
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ["Full Name", "full_name", "text", "Enter full name"],
                ["Phone Number", "phone_number", "text", "e.g., +2341234567890"],
                ["Date of Birth", "date_of_birth", "date", ""],
                ["Bank Name", "bank_name", "text", "Enter bank name"],
                ["Account Number", "account_no", "text", "Enter account number"],
              ].map(([label, name, type, placeholder]) => (
                <div key={name}>
                  <label className="text-gray-400 text-xs sm:text-sm">{label}</label>
                  <input
                    type={type}
                    name={name}
                    value={formData[name]}
                    onChange={handleInputChange}
                    placeholder={placeholder}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-1.5 mt-1 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-center gap-3 flex-wrap">
              <button
                type="submit"
                disabled={submitting}
                className="bg-green-600 hover:bg-green-500 px-5 py-2 rounded-lg flex items-center gap-2 text-sm disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {submitting ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-500 px-5 py-2 rounded-lg flex items-center gap-2 text-sm"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </form>
        </div>
      </div>

      <Link
        to="/p2p/marketplace"
        className="mt-5 inline-block text-indigo-400 hover:underline text-sm"
      >
        Back to Marketplace
      </Link>
    </div>
  );
}