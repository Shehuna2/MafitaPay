import { useState } from "react";
import { WarningOctagon } from "@phosphor-icons/react";
import toast from "react-hot-toast";
import client from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const AccountDelete = () => {
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!password) {
      setError("Please enter your password to continue.");
      return;
    }

    if (confirmation !== "DELETE") {
      setError("Type DELETE in all caps to confirm account deletion.");
      return;
    }

    setIsSubmitting(true);

    try {
      await client.delete("/account/delete/", {
        data: { password, confirm: confirmation },
      });
      toast.success("Your account has been deleted.");
      logout();
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Unable to delete account. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
        <div className="flex items-start gap-3">
          <WarningOctagon size={24} className="text-red-300" />
          <div>
            <h1 className="text-xl font-semibold">Delete account</h1>
            <p className="text-sm text-red-100/80 mt-1">
              This permanently removes your account. Make sure your wallet
              balance is zero before continuing.
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-gray-700/60 bg-gray-900/70 p-6 space-y-4"
      >
        <div>
          <label className="block text-sm text-gray-300 mb-2" htmlFor="password">
            Confirm your password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="Enter your password"
          />
        </div>

        <div>
          <label
            className="block text-sm text-gray-300 mb-2"
            htmlFor="confirmation"
          >
            Type DELETE to confirm
          </label>
          <input
            id="confirmation"
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="DELETE"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {isSubmitting ? "Deleting..." : "Delete account"}
        </button>
      </form>
    </div>
  );
};

export default AccountDelete;
