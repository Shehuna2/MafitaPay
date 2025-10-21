// File: src/pages/p2p/CreateOffer.jsx
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../../api/client";
import { PlusCircle, Banknote, DollarSign, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { debounce } from "lodash";

export default function CreateOffer() {
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem("createOfferForm");
    return saved
      ? JSON.parse(saved)
      : { amount_available: "", min_amount: "", max_amount: "", price_per_unit: "" };
  });
  const [offerType, setOfferType] = useState("deposit");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const isWithdraw = offerType === "withdraw";
  const endpoint = isWithdraw ? "p2p/withdraw-offers/" : "p2p/offers/";
  const title = isWithdraw ? "Create Withdraw Offer" : "Create Deposit Offer";

  // Retrieve user from localStorage
  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  // Load user on mount
  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
    setIsLoadingUser(false);
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") setShowModal(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Debounced localStorage save
  const saveToLocalStorage = debounce((formData) => {
    localStorage.setItem("createOfferForm", JSON.stringify(formData));
  }, 300);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const newForm = { ...form, [name]: value };
    setForm(newForm);
    saveToLocalStorage(newForm);

    // Real-time validation
    const newErrors = {};
    const amount = Number(form.amount_available) || 0;
    const min = Number(form.min_amount) || 0;
    const max = Number(form.max_amount) || 0;
    const price = Number(form.price_per_unit) || 0;

    if (name === "amount_available" && amount <= 0 && value !== "") {
      newErrors.amount_available = "Available amount must be greater than 0";
    }
    if (name === "min_amount" && min <= 0 && value !== "") {
      newErrors.min_amount = "Minimum amount must be greater than 0";
    }
    if (name === "max_amount" && max <= 0 && value !== "") {
      newErrors.max_amount = "Maximum amount must be greater than 0";
    }
    if (name === "price_per_unit" && price <= 0 && value !== "") {
      newErrors.price_per_unit = "Rate must be greater than 0";
    }
    if (min > max && max > 0) {
      newErrors.min_amount = "Minimum amount cannot exceed maximum amount";
    }
    if (max > amount && amount > 0) {
      newErrors.max_amount = "Maximum amount cannot exceed available amount";
    }
    setErrors(newErrors);
  };

  const handleOfferTypeChange = () => {
    setOfferType(isWithdraw ? "deposit" : "withdraw");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0 || !form.amount_available || !form.min_amount || !form.max_amount || !form.price_per_unit) {
      toast.error("Please fix form errors and fill all fields", {
        position: "top-right",
        autoClose: 4000,
      });
      return;
    }
    setShowModal(true);
  };

  const confirmSubmit = async () => {
    setShowModal(false);
    setLoading(true);
    try {
      await client.post(endpoint, {
        amount_available: Number(form.amount_available),
        min_amount: Number(form.min_amount),
        max_amount: Number(form.max_amount),
        price_per_unit: Number(form.price_per_unit),
      });
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          {isWithdraw ? "Withdraw" : "Deposit"} offer created successfully.
        </div>,
        {
          position: "top-right",
          autoClose: 2500,
          onClose: () => navigate("/p2p/merchant-orders"),
        }
      );
      const clearedForm = { amount_available: "", min_amount: "", max_amount: "", price_per_unit: "" };
      setForm(clearedForm);
      localStorage.setItem("createOfferForm", JSON.stringify(clearedForm));
      setErrors({});
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.response?.data ||
        err.message ||
        `Failed to create ${isWithdraw ? "withdraw" : "deposit"} offer`;
      toast.error(String(msg), { position: "top-right", autoClose: 4000 });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    const clearedForm = { amount_available: "", min_amount: "", max_amount: "", price_per_unit: "" };
    setForm(clearedForm);
    localStorage.setItem("createOfferForm", JSON.stringify(clearedForm));
    setErrors({});
  };

  // Calculate preview values
  const preview = {
    totalFiatMin: form.min_amount && form.price_per_unit && Number(form.min_amount) > 0 && Number(form.price_per_unit) > 0
      ? Number(form.min_amount) * Number(form.price_per_unit)
      : null,
    totalFiatMax: form.max_amount && form.price_per_unit && Number(form.max_amount) > 0 && Number(form.price_per_unit) > 0
      ? Number(form.max_amount) * Number(form.price_per_unit)
      : null,
  };

  // WhatsApp link with pretext
  const whatsappMessage = user
    ? encodeURIComponent(
        `Hi, I am (Insert your full name here) with account (${user.email}). I want to apply to become a merchant on MafitaPay.`
      )
    : encodeURIComponent("Hi, I want to apply to become a merchant on MafitaPay.");

  // Render loading state while checking user
  if (isLoadingUser) {
    return (
      <div className="p-6 text-white max-w-lg mx-auto flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="ml-2 text-gray-300">Loading...</span>
      </div>
    );
  }

  // Render access denied if not a merchant
  if (!user?.is_merchant) {
    return (
      <div className="p-6 text-white max-w-lg mx-auto">
        <div className="bg-gray-800 p-6 rounded-2xl shadow-xl text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-200 mb-4">Access Denied</h2>
          <p className="text-gray-300 mb-6">
            Only merchants can create offers. To become a merchant, contact our support team via WhatsApp.
          </p>
          <div className="flex justify-center gap-4">
            <a
              href={`https://wa.me/2348168623961?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 py-2 px-4 rounded-lg transition hover:scale-105"
              aria-label="Contact support on WhatsApp"
            >
              Contact Support
            </a>
            <Link
              to="/p2p/marketplace"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 py-2 px-4 rounded-lg transition hover:scale-105"
              aria-label="Go to P2P Marketplace"
            >
              Go to Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Render form for merchants
  return (
    <div className="p-6 text-white max-w-lg mx-auto">
      <ToastContainer />
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <PlusCircle className="w-6 h-6 text-indigo-400" /> {title}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl">
        <div className="block">
          <span className="text-sm text-gray-300 font-semibold">Offer Type</span>
          <div className="relative mt-1">
            <input
              type="checkbox"
              id="offerType"
              checked={isWithdraw}
              onChange={handleOfferTypeChange}
              className="sr-only"
              aria-label="Toggle between Deposit and Withdraw offer"
            />
            <label
              htmlFor="offerType"
              className="flex items-center justify-between w-full bg-gray-700 p-2 rounded text-white cursor-pointer border border-gray-600"
            >
              <span>{isWithdraw ? "Withdraw" : "Deposit"}</span>
              <div
                className={`w-10 h-5 bg-gray-600 rounded-full relative transition-all ${
                  isWithdraw ? "bg-indigo-600" : ""
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                    isWithdraw ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </label>
          </div>
        </div>

        <label className="block">
          <span className="text-sm text-gray-300 font-semibold flex items-center gap-1">
            <Banknote className="w-4 h-4" /> Available Amount (₦)
          </span>
          <input
            name="amount_available"
            type="number"
            placeholder="Available Amount (₦)"
            value={form.amount_available}
            onChange={handleChange}
            className="w-full bg-gray-700 p-2 rounded text-white border border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none placeholder-gray-400"
            required
            min="0"
            step="0.01"
            aria-label="Available Amount in Naira"
          />
          {errors.amount_available && (
            <p className="text-red-400 text-xs mt-1">{errors.amount_available}</p>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-300 font-semibold flex items-center gap-1">
              <Banknote className="w-4 h-4" /> Minimum Amount (₦)
            </span>
            <input
              name="min_amount"
              type="number"
              placeholder="Minimum Amount (₦)"
              value={form.min_amount}
              onChange={handleChange}
              className="w-full bg-gray-700 p-2 rounded text-white border border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none placeholder-gray-400"
              required
              min="0"
              step="0.01"
              aria-label="Minimum Amount in Naira"
            />
            {errors.min_amount && (
              <p className="text-red-400 text-xs mt-1">{errors.min_amount}</p>
            )}
          </label>

          <label className="block">
            <span className="text-sm text-gray-300 font-semibold flex items-center gap-1">
              <Banknote className="w-4 h-4" /> Maximum Amount (₦)
            </span>
            <input
              name="max_amount"
              type="number"
              placeholder="Maximum Amount (₦)"
              value={form.max_amount}
              onChange={handleChange}
              className="w-full bg-gray-700 p-2 rounded text-white border border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none placeholder-gray-400"
              required
              min="0"
              step="0.01"
              aria-label="Maximum Amount in Naira"
            />
            {errors.max_amount && (
              <p className="text-red-400 text-xs mt-1">{errors.max_amount}</p>
            )}
          </label>
        </div>

        <label className="block relative group">
          <span className="text-sm text-gray-300 font-semibold flex items-center gap-1">
            <DollarSign className="w-4 h-4" /> Rate per ₦1
            <span className="ml-1 text-xs text-gray-400 cursor-help group-hover:underline">
              (Fiat Expected)
            </span>
            <div className="absolute hidden group-hover:block group-focus-within:block bg-gray-700 text-white text-xs p-2 rounded shadow-lg -top-10 left-0 z-10">
              The amount of fiat currency expected per ₦1 of the offer.
            </div>
          </span>
          <input
            name="price_per_unit"
            type="number"
            placeholder="Rate per ₦1"
            value={form.price_per_unit}
            onChange={handleChange}
            className="w-full bg-gray-700 p-2 rounded text-white border border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none placeholder-gray-400"
            required
            min="0"
            step="0.01"
            aria-label="Rate per Naira (Fiat Expected)"
          />
          {errors.price_per_unit && (
            <p className="text-red-400 text-xs mt-1">{errors.price_per_unit}</p>
          )}
        </label>

        {(form.amount_available || form.min_amount || form.max_amount || form.price_per_unit) && (
          <div className="bg-gray-800 p-4 rounded-xl text-sm text-gray-300">
            <h3 className="font-semibold text-white mb-2">Offer Preview</h3>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Type:</span>
                <span className="text-white">{isWithdraw ? "Withdraw" : "Deposit"}</span>
              </div>
              <div className="flex justify-between">
                <span>Available Amount:</span>
                <span className="text-white">
                  {form.amount_available && Number(form.amount_available) > 0
                    ? `₦${Number(form.amount_available).toLocaleString()}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Min Transaction:</span>
                <span className="text-white">
                  {form.min_amount && Number(form.min_amount) > 0
                    ? `₦${Number(form.min_amount).toLocaleString()}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Max Transaction:</span>
                <span className="text-white">
                  {form.max_amount && Number(form.max_amount) > 0
                    ? `₦${Number(form.max_amount).toLocaleString()}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Rate per ₦1:</span>
                <span className="text-white">
                  {form.price_per_unit && Number(form.price_per_unit) > 0
                    ? `₦${Number(form.price_per_unit).toLocaleString()}`
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Est. Fiat (Min):</span>
                <span className="text-white">
                  {preview.totalFiatMin ? `₦${preview.totalFiatMin.toLocaleString()}` : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Est. Fiat (Max):</span>
                <span className="text-white">
                  {preview.totalFiatMax ? `₦${preview.totalFiatMax.toLocaleString()}` : "N/A"}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || Object.keys(errors).length > 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg transition hover:scale-105 disabled:opacity-60 flex items-center justify-center gap-2"
            aria-label={`Create ${isWithdraw ? "Withdraw" : "Deposit"} Offer`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating...
              </>
            ) : (
              `Create ${isWithdraw ? "Withdraw" : "Deposit"} Offer`
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
            aria-label="Reset Form"
          >
            Reset
          </button>
        </div>
      </form>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-labelledby="modal-title">
          <div className="bg-gray-800 p-6 rounded-2xl shadow-xl max-w-md w-full">
            <h3 id="modal-title" className="text-xl font-bold text-white mb-4">Confirm Offer Details</h3>
            <div className="text-gray-300 mb-6">
              <p className="text-sm">Please review the details of your {isWithdraw ? "withdraw" : "deposit"} offer:</p>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Type:</span>
                  <span className="text-white">{isWithdraw ? "Withdraw" : "Deposit"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Available Amount:</span>
                  <span className="text-white">₦{Number(form.amount_available).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Min Transaction:</span>
                  <span className="text-white">₦{Number(form.min_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Transaction:</span>
                  <span className="text-white">₦{Number(form.max_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rate per ₦1:</span>
                  <span className="text-white">₦{Number(form.price_per_unit).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Est. Fiat (Min):</span>
                  <span className="text-white">₦{preview.totalFiatMin.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Est. Fiat (Max):</span>
                  <span className="text-white">₦{preview.totalFiatMax.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={confirmSubmit}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg transition hover:scale-105 flex items-center justify-center gap-2"
                aria-label="Confirm offer creation"
              >
                <CheckCircle className="w-5 h-5" />
                Confirm
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
                aria-label="Cancel offer creation"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}