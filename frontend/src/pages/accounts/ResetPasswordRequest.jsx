// File: src/pages/accounts/ResetPasswordRequest.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom"; // Added Link for back to login
import { toast, ToastContainer } from "react-toastify";
import client from "../../api/client";
import { Loader2 } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

export default function ResetPasswordRequest() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await client.post("/password-reset/", { email });
            toast.success(response.data.message);
            setTimeout(() => navigate("/login"), 3000);
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to request reset.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 p-4">
            <ToastContainer />
            <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/80 p-8 shadow-xl backdrop-blur-md">
                <h2 className="text-2xl font-semibold text-center text-gray-900 mb-6">
                    Forgot Password?
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 border text-gray-800 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder="Enter your email"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition flex justify-center items-center"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Request Reset Link"}
                    </button>
                </form>

                <div className="mt-4 text-center text-sm text-gray-700">
                    Remember your password?{" "}
                    <Link
                        to="/login"
                        className="text-indigo-600 hover:underline font-medium"
                    >
                        Back to Login
                    </Link>
                </div>
            </div>
        </section>
    );
}