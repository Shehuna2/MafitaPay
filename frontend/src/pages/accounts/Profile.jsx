// File: src/pages/accounts/Profile.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../api/client";
import {
  User,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// ✅ Automatically choose base URL depending on environment
const BASE_URL = window.location.hostname.includes("localhost")
  ? "http://127.0.0.1:8000"
  : "https://mafitapay.com";

export default function Profile() {
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
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Load user and profile
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

      // ✅ Safely build image URL
      const imageUrl = data.profile_image
        ? data.profile_image.startsWith("http")
          ? data.profile_image
          : `${BASE_URL}${data.profile_image}`
        : "/static/images/avt13.jpg";

      setProfile(data);
      setFormData({
        full_name: data.full_name || "",
        phone_number: data.phone_number || "",
        date_of_birth: data.date_of_birth
          ? data.date_of_birth.split("T")[0]
          : "",
        account_no: data.account_no || "",
        bank_name: data.bank_name || "",
      });
      setImagePreview(imageUrl);
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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image must be less than 2MB.");
        return;
      }
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const data = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key]) data.append(key, formData[key]);
      });
      if (image) data.append("profile_image", image);

      // ✅ Send as multipart/form-data to avoid 415 error
      const response = await client.patch("profile-api/", data, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const updated = response.data;
      setProfile(updated);
      setImage(null);

      // ✅ Build full image URL
      const updatedImageUrl = updated.profile_image
        ? updated.profile_image.startsWith("http")
          ? updated.profile_image
          : `${BASE_URL}${updated.profile_image}`
        : "/static/images/avt13.jpg";

      setImagePreview(updatedImageUrl);
      localStorage.setItem("profile_image", updatedImageUrl);

      // ✅ Emit event so Navbar updates immediately
      window.dispatchEvent(
        new CustomEvent("profileImageUpdated", {
          detail: { profile_image: updated.profile_image },
        })
      );

      toast.success("Profile updated successfully.");
    } catch (err) {
      console.error("Profile update failed:", err.response?.data || err.message);
      toast.error(err.response?.data?.detail || "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappMessage = user
    ? encodeURIComponent(
        `Hi, I am ${user.email}. I want to apply to become a merchant on MafitaPay.`
      )
    : encodeURIComponent("Hi, I want to apply to become a merchant on MafitaPay.");

  if (loading)
    return (
      <div className="flex justify-center mt-16 text-gray-400">
        <Loader2 className="animate-spin w-6 h-6" /> Loading profile...
      </div>
    );

  if (!profile)
    return (
      <div className="text-center text-gray-400 mt-16">
        Profile not found.
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-6 pt-8 pb-12 text-white min-h-screen">
      <ToastContainer />
      <div className="bg-gray-900 rounded-2xl shadow-xl p-6 relative z-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-gray-900/10 pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
            <User className="w-6 h-6 text-indigo-400" /> My Profile
          </h2>

          {!user?.is_merchant && (
            <div className="bg-gray-800 p-4 rounded-xl mb-6 text-center">
              <p className="text-gray-300 mb-4">
                Want to become a merchant? Contact our support team via WhatsApp.
              </p>
              <a
                href={`https://wa.me/+2348168623961?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 py-2 px-4 rounded-lg transition"
              >
                Contact Support
              </a>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-6">
            {/* Profile Image */}
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 justify-center">
                <ImageIcon className="w-5 h-5 text-indigo-400" /> Profile Image
              </h3>
              <div className="bg-gray-800 p-4 rounded-xl">
                <img
                  src={imagePreview}
                  alt="Profile"
                  className="w-32 h-32 rounded-full mx-auto object-cover border border-gray-700"
                />
                <label className="mt-4 inline-block bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  Upload Image
                </label>
              </div>
            </div>

            {/* Profile Info */}
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-indigo-400" /> Profile Info
              </h3>
              <div className="bg-gray-800 p-4 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Email:</span>
                  <span className="text-lg">{profile.email || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Role:</span>
                  <span className="text-lg">
                    {profile.is_merchant ? "Merchant" : "Regular User"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total Trades:</span>
                  <span className="text-lg">{profile.total_trades || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Successful Trades:</span>
                  <span className="text-lg">
                    {profile.successful_trades || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Success Rate:</span>
                  <span className="text-lg">
                    {profile.success_rate?.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <form
            onSubmit={handleSubmit}
            className="mt-6 bg-gray-800 p-4 rounded-xl"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-400" /> Edit Profile
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ["Full Name", "full_name", "text", "Enter full name"],
                ["Phone Number", "phone_number", "text", "e.g., +2341234567890"],
                ["Date of Birth", "date_of_birth", "date", ""],
                ["Bank Name", "bank_name", "text", "Enter bank name"],
                ["Account Number", "account_no", "text", "Enter account number"],
              ].map(([label, name, type, placeholder]) => (
                <div key={name}>
                  <label className="text-gray-400 text-sm">{label}</label>
                  <input
                    type={type}
                    name={name}
                    value={formData[name]}
                    onChange={handleInputChange}
                    placeholder={placeholder}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 mt-1 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              ))}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-6 bg-green-600 hover:bg-green-500 px-6 py-2 rounded-lg flex items-center gap-2 mx-auto disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>

      <Link
        to="/p2p/marketplace"
        className="mt-6 inline-block text-indigo-400 hover:underline text-sm"
      >
        Back to Marketplace
      </Link>
    </div>
  );
}
