// hooks/useBiometricAuth.js
import { useState, useCallback, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export default function useBiometricAuth() {
  const [isSupported, setIsSupported] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    const hasWebAuthn = typeof window.PublicKeyCredential !== "undefined";
    setIsSupported(Boolean(isMobile && hasWebAuthn));
  }, []);

  const loginWithBiometric = useCallback(async (email) => {
    if (!isSupported) throw new Error("Biometric login not supported");

    setChecking(true);
    try {
      // 1️⃣ Get challenge
      const challengeRes = await axios.post(`${API_BASE}/webauthn/challenge/`, { email });
      const challenge = challengeRes.data;

      // 2️⃣ navigator.credentials.get()
      const credential = await navigator.credentials.get({
        publicKey: challenge
      });

      // 3️⃣ Send assertion to server
      const authRes = await axios.post(`${API_BASE}/webauthn/verify/`, {
        user_id: email, // optionally store user id in challenge response
        assertion: btoa(String.fromCharCode(...new Uint8Array(credential.response.authenticatorData)))
      });

      // 4️⃣ Store JWT tokens
      const { access, refresh, user } = authRes.data;
      localStorage.setItem("access", access);
      localStorage.setItem("refresh", refresh);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("last_active", Date.now().toString());

      window.dispatchEvent(new Event("tokenRefreshed"));
      setChecking(false);
      return { success: true, user };
    } catch (err) {
      setChecking(false);
      return { success: false, error: err };
    }
  }, [isSupported]);

  return { isSupported, loginWithBiometric, checking };
}
