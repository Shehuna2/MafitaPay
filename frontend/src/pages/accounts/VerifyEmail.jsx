// File: src/pages/accounts/VerifyEmail.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom"; // Added Link import
import client from "../../api/client";
import { toast, ToastContainer } from "react-toastify";
import { Loader2, CheckCircle } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

export default function VerifyEmail() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const verified = searchParams.get("verified");
        const token = searchParams.get("token");

        if (verified) {
            setIsSuccess(verified === "true");
            setMessage(verified === "true" ? "Email verified successfully." : "Failed to verify email.");
            setLoading(false);
            toast[verified === "true" ? "success" : "error"](message, { autoClose: 3000 });
            setTimeout(() => navigate("/login"), 3000);
            return;
        }

        // Fallback for direct access with token (if backend changes back to path param)
        if (token) {
            const verifyEmail = async () => {
                try {
                    const res = await client.get(`/verify-email/${token}/`);
                    setMessage(res.data.message || "Email verified successfully.");
                    setIsSuccess(res.data.verified);
                    toast.success(res.data.message, { autoClose: 3000 });
                    setTimeout(() => navigate("/login"), 3000);
                } catch (err) {
                    const errorMsg = err.response?.data?.error || "Failed to verify email.";
                    setMessage(errorMsg);
                    setIsSuccess(false);
                    toast.error(errorMsg, { autoClose: 3000 });
                    setTimeout(() => navigate("/login"), 3000);
                } finally {
                    setLoading(false);
                }
            };
            verifyEmail();
        } else {
            setMessage("No verification token provided.");
            setIsSuccess(false);
            setLoading(false);
            toast.error("No verification token provided.", { autoClose: 3000 });
            setTimeout(() => navigate("/login"), 3000);
        }
    }, [navigate, searchParams]);

    return (
        <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 p-4">
            <ToastContainer />
            <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/80 p-6 sm:p-8 shadow-xl backdrop-blur-md text-center transform transition-all duration-300 ease-in-out">
                {loading ? (
                    <div className="flex flex-col items-center">
                        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                        <h2 className="text-2xl font-semibold text-gray-700">Verifying Your Email...</h2>
                    </div>
                ) : isSuccess ? (
                    <div className="flex flex-col items-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mb-4 animate-bounce" />
                        <h2 className="text-3xl font-bold text-gray-900 mb-2">Email Verified!</h2>
                        <p className="text-lg text-green-600 mb-4">{message}</p>
                        <p className="text-sm text-gray-600 mb-6">
                            You’re all set! You’ll be redirected to the login page in <span className="font-medium text-indigo-500">3 seconds</span>.
                        </p>
                        <Link
                            to="/login"
                            className="inline-block px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-200 shadow-md"
                        >
                            Go to Login Now
                        </Link>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-10 h-10 text-red-500 opacity-50" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Failed</h2>
                        <p className="text-lg text-red-600 mb-4">{message}</p>
                        <p className="text-sm text-gray-600 mb-6">
                            It seems there was an issue. You’ll be redirected to the login page in <span className="font-medium text-indigo-500">3 seconds</span>.
                        </p>
                        <Link
                            to="/login"
                            className="inline-block px-6 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors duration-200 shadow-md"
                        >
                            Back to Login
                        </Link>
                    </div>
                )}
            </div>
        </section>
    );
}