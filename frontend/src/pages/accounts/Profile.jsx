// src/pages/accounts/Profile.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  User,
  Loader2,
  CheckCircle2,
  LogOut,
  MessageCircle,
  Shield,
  ChevronRight,
  FileText,
  Lock,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "../../context/AuthContext";

const DELETE_ENDPOINT = "account/delete/"; // <- change if your endpoint differs

export default function Profile() {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEdited, setIsEdited] = useState(false);

  // Delete flow
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    phone_number: "",
    date_of_birth: "",
    account_no: "",
    bank_name: "",
  });

  const normalizeProfile = (data) => {
    const first = data.first_name || data.profile?.first_name || "";
    const last = data.last_name || data.profile?.last_name || "";
    const apiFull = (data.full_name || "").trim();
    const computedFull = `${first} ${last}`.trim();
    const full_name = apiFull || computedFull || "";

    return { ...data, full_name };
  };

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: raw } = await client.get("profile-api/");
      const data = normalizeProfile(raw || {});
      setProfile(data);

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
    const hasChanges = Object.keys(formData).some((key) => {
      const current = formData[key];
      const original =
        key === "date_of_birth"
          ? profile[key]?.split?.("T")?.[0] || ""
          : profile[key] || "";
      return String(current) !== String(original);
    });
    setIsEdited(hasChanges);
  }, [formData, profile]);

  const initials = useMemo(() => {
    const name = (profile?.full_name || "").trim();
    if (!name) return "U";
    const parts = name.split(" ").filter(Boolean);
    const first = parts[0]?.[0] || "U";
    const second = parts[1]?.[0] || "";
    return (first + second).toUpperCase();
  }, [profile?.full_name]);

  // Profile completion (simple, honest)
  const completion = useMemo(() => {
    const fields = [
      { key: "full_name", value: profile?.full_name },
      { key: "email", value: profile?.email },
      { key: "phone_number", value: profile?.phone_number },
      { key: "date_of_birth", value: profile?.date_of_birth },
      { key: "bank_name", value: profile?.bank_name },
      { key: "account_no", value: profile?.account_no },
    ];
    const filled = fields.filter((f) => (f.value || "").toString().trim().length > 0).length;
    const pct = Math.round((filled / fields.length) * 100);
    return { pct, filled, total: fields.length };
  }, [profile]);

  const completionHint = useMemo(() => {
    if (!profile) return null;
    if (!profile.phone_number) return "Add your phone number to secure your account.";
    if (!profile.date_of_birth) return "Add your date of birth for verification readiness.";
    if (!profile.bank_name || !profile.account_no) return "Add bank details to speed up payouts.";
    return "Profile looks good.";
  }, [profile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEdited) return;

    setSubmitting(true);
    try {
      const data = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key]) data.append(key, formData[key]);
      });

      const response = await client.patch("profile-api/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const normalized = normalizeProfile(response.data || {});
      setProfile(normalized);
      toast.success("Profile updated successfully!");
      setIsEdited(false);

      // Sync local storage user cache
      try {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        const merged = { ...stored, ...normalized };
        localStorage.setItem("user", JSON.stringify(merged));
        window.dispatchEvent(new Event("userUpdated"));
      } catch {
        // ignore
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
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

  const clearLocalAuth = () => {
    try {
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      localStorage.removeItem("user");
      localStorage.removeItem("notifications");
      localStorage.removeItem("last_user_fetch");
    } catch {
      // ignore
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }

    setDeleting(true);
    try {
      // Server-side deletion
      await client.delete(DELETE_ENDPOINT);

      // Local cleanup
      clearLocalAuth();
      logout();

      toast.success("Account deleted.");
      setShowDelete(false);
      navigate("/register");
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        "Failed to delete account";
      toast.error(msg);
    } finally {
      setDeleting(false);
      setDeleteConfirm("");
    }
  };

  const whatsappMessage = authUser
    ? encodeURIComponent(`Hi, I am ${authUser.email}. I want to apply to become a merchant on MafitaPay.`)
    : encodeURIComponent("Hi, I want to apply to become a merchant on MafitaPay.");

  if (loading) return <ProfileSkeleton />;

  if (!profile)
    return (
      <div className="min-h-full flex items-center justify-center px-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center max-w-sm">
          <p className="text-gray-300">Profile not found.</p>
          <button
            onClick={fetchProfile}
            className="mt-4 px-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );

  return (
    <>
      <ToastContainer position="top-center" theme="dark" autoClose={3000} />

      <div className="min-h-full px-4 py-5 pb-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <User className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold">Account</h1>
              <p className="text-xs text-gray-400">Profile, security & legal</p>
            </div>
          </div>

          <Link
            to="/dashboard"
            className="text-xs text-gray-300 hover:text-white bg-white/5 border border-white/10 px-3 py-2 rounded-xl transition"
          >
            Dashboard
          </Link>
        </div>

        {/* Profile Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-green-600/30 to-emerald-400/10 border border-white/10 flex items-center justify-center">
              <span className="text-xl font-extrabold text-green-200">{initials}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold truncate">{profile.full_name || "User"}</div>
              <div className="text-sm text-gray-400 truncate">{profile.email}</div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 text-xs rounded-full px-3 py-1 bg-black/30 border border-white/10`}
                >
                  <span className={`h-2 w-2 rounded-full ${profile.is_merchant ? "bg-green-400" : "bg-yellow-400"}`} />
                  <span className="text-gray-200">{profile.is_merchant ? "Merchant" : "Regular user"}</span>
                </span>

                <span className="inline-flex items-center gap-2 text-xs rounded-full px-3 py-1 bg-black/30 border border-white/10">
                  <span className="text-gray-400">Profile</span>
                  <span className="text-green-300 font-bold">{completion.pct}%</span>
                </span>
              </div>
            </div>
          </div>

          {/* Completion bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
              <span>Completion</span>
              <span>
                {completion.filled}/{completion.total} fields
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-green-500/60"
                style={{ width: `${completion.pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-300">{completionHint}</p>
          </div>

          {/* Merchant CTA */}
          {!authUser?.is_merchant && (
            <div className="mt-5 bg-gradient-to-r from-emerald-900/40 to-teal-900/30 border border-emerald-700/40 rounded-2xl p-4">
              <div className="text-sm font-bold">Become a Merchant</div>
              <div className="text-xs text-gray-300 mt-1">
                Contact support to start accepting payments.
              </div>

              <a
                href={`https://wa.me/+2348168623961?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 bg-green-600 hover:bg-green-500 px-4 py-3 rounded-xl font-semibold transition"
              >
                <MessageCircle className="w-5 h-5" />
                Contact Support
              </a>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-5 grid grid-cols-1 gap-3">
          <Link
            to="/security-settings"
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-blue-600/15 border border-white/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <div className="font-bold">Security</div>
                <div className="text-xs text-gray-400">PIN & biometric settings</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>

          <Link
            to="/privacy"
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-green-600/15 border border-white/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-green-300" />
              </div>
              <div>
                <div className="font-bold">Privacy Policy</div>
                <div className="text-xs text-gray-400">How we handle your data</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>

          <Link
            to="/terms"
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-purple-600/15 border border-white/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <div className="font-bold">Terms of Service</div>
                <div className="text-xs text-gray-400">Rules for using MafitaPay</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
        </div>

        {/* Edit Form */}
        <div className="mt-5 bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-extrabold">Edit Profile</div>
              <div className="text-xs text-gray-400">Update your details</div>
            </div>

            {isEdited && (
              <span className="text-[11px] px-3 py-1 rounded-full bg-green-600/15 border border-green-500/20 text-green-300">
                Unsaved changes
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label="Full Name"
              name="full_name"
              value={formData.full_name}
              onChange={handleInputChange}
              placeholder="Enter full name"
            />

            <Field
              label="Phone Number"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleInputChange}
              placeholder="e.g., +234..."
            />

            <Field
              label="Date of Birth"
              name="date_of_birth"
              value={formData.date_of_birth}
              onChange={handleInputChange}
              type="date"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Bank Name"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleInputChange}
                placeholder="Enter bank name"
              />
              <Field
                label="Account Number"
                name="account_no"
                value={formData.account_no}
                onChange={handleInputChange}
                placeholder="Enter account number"
              />
            </div>

            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="submit"
                disabled={submitting || !isEdited}
                className="w-full px-5 py-3.5 rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {submitting ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-5 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 font-bold transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="mt-5 bg-red-950/30 border border-red-700/30 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-red-600/15 border border-red-700/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-300" />
            </div>
            <div className="flex-1">
              <div className="font-extrabold text-red-200">Danger Zone</div>
              <div className="text-xs text-gray-300 mt-1">
                Deleting your account is permanent. This may remove access to your history. Some records may be retained if required by law.
              </div>

              <button
                onClick={() => setShowDelete(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold transition"
              >
                <Trash2 className="w-5 h-5" />
                Delete Account
              </button>
            </div>
          </div>
        </div>

        {/* Delete confirm modal */}
        {showDelete && (
          <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-red-600/15 border border-red-700/30 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-300" />
                </div>
                <div>
                  <div className="font-extrabold">Confirm deletion</div>
                  <div className="text-xs text-gray-400">Type DELETE to continue.</div>
                </div>
              </div>

              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="mt-4 w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500/50 transition"
              />

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setShowDelete(false);
                    setDeleteConfirm("");
                  }}
                  className="px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 font-semibold transition"
                >
                  Cancel
                </button>

                <button
                  disabled={deleting || deleteConfirm.trim().toUpperCase() !== "DELETE"}
                  onClick={handleDeleteAccount}
                  className="px-4 py-3 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, name, value, onChange, placeholder, type = "text" }) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        name={name}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500/50 transition"
      />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-full px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-16 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        <div className="h-44 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        <div className="h-40 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        <div className="h-72 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
      </div>
    </div>
  );
}
