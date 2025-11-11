// A small hook that detects biometric support and attempts a "biometric" login
// by trying a token refresh. This is pragmatic: true device biometric needs
// native support or WebAuthn registration (backend) — this hook provides a
// simple UX-friendly bridge that attempts a refresh when user taps biometric.

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

    // Also allow a native Android bridge (median wrapper) if present
    const hasAndroidBridge = typeof window.Android !== "undefined" && typeof window.Android.authenticate === "function";

    setIsSupported(Boolean(isMobile && (hasWebAuthn || hasAndroidBridge)));
  }, []);

  // Try to authenticate using the refresh token (used as a gating mechanism).
  // Returns { success: boolean, data?: { access, refresh, user } }
  const authenticateWithRefresh = useCallback(async () => {
    setChecking(true);
    try {
      // Optional: If your Android wrapper provides a secure retrieval of the refresh token
      // you could call it here: e.g. const refresh = await window.Android.getRefreshToken();
      const refresh = localStorage.getItem("refresh");
      if (!refresh) throw new Error("No refresh token");

      const refreshURL = `${API_BASE.replace(/\/api\/?$/, "/") }auth/token/refresh/`;
      const res = await axios.post(refreshURL, { refresh });
      const { access } = res.data;
      // Save the new access
      localStorage.setItem("access", access);
      // mark activity
      localStorage.setItem("last_active", Date.now().toString());

      // optionally fetch profile if missing
      if (!localStorage.getItem("user")) {
        try {
          const profileRes = await axios.get(`${API_BASE}/profile-api/?t=${Date.now()}`, {
            headers: { Authorization: `Bearer ${access}` }
          });
          const profile = {
            email: profileRes.data.email,
            id: profileRes.data.id,
            full_name: profileRes.data.full_name,
            is_merchant: profileRes.data.is_merchant,
            is_staff: profileRes.data.is_staff,
            phone_number: profileRes.data.phone_number,
          };
          localStorage.setItem("user", JSON.stringify(profile));
        } catch (e) {
          // continue even if profile fetch fails
        }
      }

      window.dispatchEvent(new Event("tokenRefreshed"));
      setChecking(false);
      return { success: true, access };
    } catch (err) {
      setChecking(false);
      return { success: false, error: err };
    }
  }, []);

  return { isSupported, authenticateWithRefresh, checking };
}
