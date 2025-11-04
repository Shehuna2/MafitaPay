// File: src/pages/accounts/VerifyEmail.jsx
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import client from "../../api/client";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function VerifyEmail() {
  const location = useLocation();

  const email =
    location.state?.email || new URLSearchParams(location.search).get("email");
  const verified = new URLSearchParams(location.search).get("verified");
  const reason = new URLSearchParams(location.search).get("reason"); // ✅ added reason param

  const COOLDOWN_DURATION = 60; // seconds
  const COOLDOWN_KEY = `verify_cooldown_${email || "unknown"}`;

  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Load cooldown timer from localStorage
  useEffect(() => {
    const savedUntil = localStorage.getItem(COOLDOWN_KEY);
    if (savedUntil) {
      const diff = Math.floor((Number(savedUntil) - Date.now()) / 1000);
      if (diff > 0) setCooldown(diff);
    }
  }, [email]);

  // Handle countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email) {
      toast.error("No email found to resend verification.");
      return;
    }
    try {
      setResending(true);
      await client.post("resend-verification/", { email });
      toast.success("Verification email resent successfully!");
      const expiresAt = Date.now() + COOLDOWN_DURATION * 1000;
      localStorage.setItem(COOLDOWN_KEY, expiresAt.toString());
      setCooldown(COOLDOWN_DURATION);
    } catch (err) {
      console.error("Resend failed:", err);
      toast.error(
        err.response?.data?.error || "Failed to resend verification email."
      );
    } finally {
      setResending(false);
    }
  };

  const MotionButton = motion.button;

  const buttonVariants = {
    idle: { scale: 1, boxShadow: "0px 0px 0px rgba(0,0,0,0)" },
    hover: { scale: 1.05, boxShadow: "0px 0px 15px rgba(99,102,241,0.5)" },
    cooldown: {
      scale: [1, 1.02, 1],
      transition: { duration: 1, repeat: Infinity, ease: "easeInOut" },
    },
  };

  const Section = ({ children, bg = "bg-gray-900" }) => (
    <section
      className={`flex items-center justify-center min-h-screen ${bg} text-white`}
    >
      <ToastContainer />
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/10 p-8 shadow-xl backdrop-blur-md text-center">
        {children}
      </div>
    </section>
  );

  // ✅ Verified or Already Verified
  if (verified === "true") {
    let message = "Your email has been successfully verified. You can now log in.";
    let title = "✅ Email Verified";
    let bg = "bg-gradient-to-br from-green-900 via-gray-900 to-green-800";

    if (reason === "already_verified") {
      message = "Your email is already verified. You can log in below.";
      title = "ℹ️ Already Verified";
      bg = "bg-gradient-to-br from-yellow-800 via-gray-900 to-yellow-700";
    }

    return (
      <Section bg={bg}>
        <h1 className="text-3xl font-bold mb-3 text-green-400">{title}</h1>
        <p className="text-gray-200 mb-6">{message}</p>
        <a
          href="/login"
          className="inline-block rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-3 font-semibold text-white shadow-md hover:from-green-600 hover:to-emerald-700 transition-all"
        >
          Go to Login
        </a>
      </Section>
    );
  }

  // ❌ Invalid / Failed verification
  if (verified === "false") {
    const reasonText =
      reason === "invalid"
        ? "Invalid or expired verification link. You can request a new one below."
        : "Verification failed. Please request a new link.";

    return (
      <Section bg="bg-gradient-to-br from-red-900 via-gray-900 to-red-800">
        <h1 className="text-3xl font-bold mb-3 text-red-400">❌ Verification Failed</h1>
        <p className="text-gray-200 mb-6">{reasonText}</p>
        <MotionButton
          onClick={handleResend}
          disabled={resending || cooldown > 0}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-white font-semibold shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
          variants={buttonVariants}
          animate={resending || cooldown > 0 ? "cooldown" : "idle"}
          whileHover={!resending && cooldown <= 0 ? "hover" : ""}
        >
          {resending
            ? "Resending..."
            : cooldown > 0
            ? `Resend available in ${cooldown}s`
            : "Resend Verification Email"}
        </MotionButton>
      </Section>
    );
  }

  // 📩 Default: waiting for verification
  return (
    <Section bg="bg-gradient-to-br from-gray-900 via-indigo-900 to-purple-900">
      <h1 className="text-3xl font-bold mb-3 text-indigo-400">Verify Your Email</h1>
      <p className="text-gray-200 mb-6">
        A verification link has been sent to{" "}
        <span className="font-semibold text-white">{email}</span>. <br />
        Please check your inbox or spam folder to complete your registration.
      </p>
      <MotionButton
        onClick={handleResend}
        disabled={resending || cooldown > 0}
        className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-white font-semibold shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
        variants={buttonVariants}
        animate={resending || cooldown > 0 ? "cooldown" : "idle"}
        whileHover={!resending && cooldown <= 0 ? "hover" : ""}
      >
        {resending
          ? "Resending..."
          : cooldown > 0
          ? `Resend available in ${cooldown}s`
          : "Resend Verification Email"}
      </MotionButton>
    </Section>
  );
}
