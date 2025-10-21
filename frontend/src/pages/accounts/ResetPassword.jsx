// In src/pages/accounts/ResetPassword.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import client from "../../api/client";
import { Loader2 } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

export default function ResetPassword() {
    const { token } = useParams();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [isValidToken, setIsValidToken] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const validateToken = async () => {
            try {
                const response = await client.get(`/password-reset/validate/${token}/`);
                console.log("Token validation response:", response.data); // Debug log
                setIsValidToken(true);
            } catch (err) {
                console.error("Token validation error:", err.response?.data || err.message); // Debug log
                setIsValidToken(false);
                toast.error(err.response?.data?.error || "Invalid or expired reset token.");
                setTimeout(() => navigate("/login"), 3000);
            }
        };
        validateToken();
    }, [token, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isValidToken) return;
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }
        // Client-side password validation
        if (newPassword.length < 8) {
            toast.error("Password must be at least 8 characters long.");
            return;
        }
        if (!/[A-Z]/.test(newPassword)) {
            toast.error("Password must contain at least one uppercase letter.");
            return;
        }
        if (!/[0-9]/.test(newPassword)) {
            toast.error("Password must contain at least one number.");
            return;
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            toast.error("Password must contain at least one special character.");
            return;
        }
        setLoading(true);
        try {
            const response = await client.post(`/password-reset/${token}/`, { new_password: newPassword });
            toast.success(response.data.message);
            setTimeout(() => navigate("/login"), 3000);
        } catch (err) {
            console.error("Password reset error:", err.response?.data || err.message); // Debug log
            toast.error(err.response?.data?.error || "Failed to reset password.");
        } finally {
            setLoading(false);
        }
    };

    if (isValidToken === null) {
        return (
            <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 p-4">
                <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/80 p-6 sm:p-8 shadow-xl backdrop-blur-md text-center">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
                    <h2 className="text-2xl font-bold text-gray-900 mt-4">Validating Token...</h2>
                </div>
            </section>
        );
    }

    if (!isValidToken) {
        return (
            <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 p-4">
                <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/80 p-6 sm:p-8 shadow-xl backdrop-blur-md text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Something Went Wrong</h2>
                    <p className="text-lg text-red-600 mb-4">We encountered an error. Please try again or contact support.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-indigo-600 hover:underline"
                    >
                        Reload Page
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 p-4">
            <ToastContainer />
            <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/80 p-6 sm:p-8 shadow-xl backdrop-blur-md text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Reset Password</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New Password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                    />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm New Password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Set New Password"}
                    </button>
                </form>
            </div>
        </section>
    );
}