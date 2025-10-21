// File: src/pages/p2p/CreateWithdrawOffer.jsx
import React, { useState } from "react";
import client from "../../api/client";
import { PlusCircle } from "lucide-react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

/* Use relative p2p path because VITE_API_URL already includes /api/ */
const P2P = (p) => `p2p/${p}`;

export default function CreateWithdrawOffer() {
  const [form, setForm] = useState({
    amount_available: "",
    min_amount: "",
    max_amount: "",
    price_per_unit: "",
  });
  const [loading, setLoading] = useState(false);

  // update single field safely
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // create withdraw offer
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // client handles Authorization + refresh
      await client.post(P2P("withdraw-offers/"), {
        amount_available: Number(form.amount_available),
        min_amount: Number(form.min_amount),
        max_amount: Number(form.max_amount),
        price_per_unit: Number(form.price_per_unit),
      });
      toast.success("Withdraw offer created successfully.", { position: "top-right", autoClose: 2500 });
      setForm({ amount_available: "", min_amount: "", max_amount: "", price_per_unit: "" });
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.response?.data ||
        err.message ||
        "Failed to create withdraw offer";
      toast.error(String(msg), { position: "top-right", autoClose: 4000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 text-white max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <PlusCircle className="w-6 h-6 text-indigo-400" /> Create Withdraw Offer
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-gray-800 p-6 rounded-2xl">
        <label className="block">
          <span className="text-sm text-gray-300">Available Amount (₦)</span>
          <input
            name="amount_available"
            type="number"
            placeholder="Available Amount (₦)"
            value={form.amount_available}
            onChange={handleChange}
            className="w-full bg-gray-700 p-2 rounded text-white"
            required
            min="0"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-300">Minimum Amount (₦)</span>
            <input
              name="min_amount"
              type="number"
              placeholder="Minimum Amount (₦)"
              value={form.min_amount}
              onChange={handleChange}
              className="w-full bg-gray-700 p-2 rounded text-white"
              required
              min="0"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Maximum Amount (₦)</span>
            <input
              name="max_amount"
              type="number"
              placeholder="Maximum Amount (₦)"
              value={form.max_amount}
              onChange={handleChange}
              className="w-full bg-gray-700 p-2 rounded text-white"
              required
              min="0"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-gray-300">Rate per ₦1</span>
          <input
            name="price_per_unit"
            type="number"
            placeholder="Rate per ₦1 (Fiat Expected)"
            value={form.price_per_unit}
            onChange={handleChange}
            className="w-full bg-gray-700 p-2 rounded text-white"
            required
            min="0"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 disabled:opacity-60 py-2 rounded-lg transition"
        >
          {loading ? "Creating..." : "Create Withdraw Offer"}
        </button>
      </form>
    </div>
  );
}
