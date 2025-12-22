// hooks/useBiometricAuth.js
import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Capacitor } from "@capacitor/core";
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// Platform detection
const isNativePlatform = () => {
  return Capacitor.isNativePlatform();
};

export default function useBiometricAuth() {
  const [isSupported, setIsSupported] = useState(false);
  const [checking, setChecking] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState({
    enabled: false,
    registered_at: null,
    has_credential: false,
    loading: true,
  });

  // Check if biometric is supported
  useEffect(() => {
    const checkSupport = async () => {
      try {
        if (isNativePlatform()) {
          // Use Capacitor Biometric Auth for native platforms
          const result = await BiometricAuth.checkBiometry();
          setIsSupported(result.isAvailable);
        } else {
          // Use WebAuthn for web browsers
          const hasWebAuthn = typeof window.PublicKeyCredential !== "undefined";
          if (hasWebAuthn) {
            const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            setIsSupported(available);
          } else {
            setIsSupported(false);
          }
        }
      } catch (error) {
        console.error("Error checking biometric support:", error);
        setIsSupported(false);
      }
    };
    
    checkSupport();
  }, []);

  // Fetch biometric status from backend
  const fetchBiometricStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("access");
      if (!token) {
        setBiometricStatus({ enabled: false, registered_at: null, has_credential: false, loading: false });
        return;
      }

      const response = await axios.get(`${API_BASE}/biometric/status/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setBiometricStatus({
        enabled: response.data.enabled,
        registered_at: response.data.registered_at,
        has_credential: response.data.has_credential,
        loading: false,
      });
    } catch (error) {
      console.error("Error fetching biometric status:", error);
      setBiometricStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  // Fetch status on mount
  useEffect(() => {
    fetchBiometricStatus();
  }, [fetchBiometricStatus]);

  // Enroll biometric (register WebAuthn credential or Capacitor biometric)
  const enrollBiometric = useCallback(async () => {
    if (!isSupported) {
      toast.error("Biometric authentication is not supported on this device");
      return { success: false, error: "Not supported" };
    }

    try {
      setChecking(true);
      const token = localStorage.getItem("access");
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      if (isNativePlatform()) {
        // Native platform: Use Capacitor Biometric Auth
        try {
          // Authenticate to enroll
          await BiometricAuth.authenticate({
            reason: "Enroll biometric authentication for MafitaPay",
            cancelTitle: "Cancel",
            allowDeviceCredential: false,
            iosFallbackTitle: "Use passcode",
            androidTitle: "Biometric Enrollment",
            androidSubtitle: "Authenticate to enroll biometric",
            androidConfirmationRequired: true,
          });

          // On successful authentication, register with backend
          // For native, we just store a flag that biometric is enabled
          // The actual biometric verification is handled by the OS
          // Generate a cryptographically secure unique identifier
          const credentialId = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          
          const response = await axios.post(
            `${API_BASE}/biometric/enroll/`,
            {
              credential_id: `native_${credentialId}`,
              public_key: `native_biometric_${Capacitor.getPlatform()}_${credentialId}`, // Unique identifier for native
              platform: Capacitor.getPlatform(),
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (response.data.success) {
            toast.success("Biometric authentication enrolled successfully!");
            await fetchBiometricStatus();
            setChecking(false);
            return { success: true };
          }
        } catch (error) {
          console.error("Native biometric enrollment error:", error);
          const errorMsg = error.message || "Failed to enroll biometric authentication";
          toast.error(errorMsg);
          setChecking(false);
          return { success: false, error: errorMsg };
        }
      } else {
        // Web platform: Use WebAuthn
        // NOTE: In production, the challenge should be fetched from the server
        // to prevent replay attacks. This is a simplified implementation for MVP.
        // TODO: Implement server-side challenge generation endpoint
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        
        // Generate a unique user ID from email (deterministic)
        const userIdString = user.email || "user@mafitapay.com";
        const encoder = new TextEncoder();
        const userIdBuffer = encoder.encode(userIdString).slice(0, 16);
        const userId = new Uint8Array(16);
        userId.set(userIdBuffer);

        // Create credential
        const publicKeyCredentialCreationOptions = {
          challenge: challenge,
          rp: {
            name: "MafitaPay",
            id: window.location.hostname,
          },
          user: {
            id: userId,
            name: userIdString,
            displayName: userIdString,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" }, // ES256
            { alg: -257, type: "public-key" }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        };

        const credential = await navigator.credentials.create({
          publicKey: publicKeyCredentialCreationOptions,
        });

        // Send credential to backend
        const response = await axios.post(
          `${API_BASE}/biometric/enroll/`,
          {
            credential_id: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
            public_key: btoa(String.fromCharCode(...new Uint8Array(credential.response.getPublicKey()))),
            platform: "web",
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.success) {
          toast.success("Biometric authentication enrolled successfully!");
          await fetchBiometricStatus();
          setChecking(false);
          return { success: true };
        }
      }
    } catch (error) {
      console.error("Biometric enrollment error:", error);
      const errorMsg = error.response?.data?.error || "Failed to enroll biometric authentication";
      toast.error(errorMsg);
      setChecking(false);
      return { success: false, error: errorMsg };
    }
  }, [isSupported, fetchBiometricStatus]);

  // Disable biometric
  const disableBiometric = useCallback(async () => {
    try {
      const token = localStorage.getItem("access");
      const response = await axios.post(
        `${API_BASE}/biometric/disable/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.data.success) {
        toast.success("Biometric authentication disabled");
        await fetchBiometricStatus();
        return { success: true };
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || "Failed to disable biometric";
      toast.error(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [fetchBiometricStatus]);

  // Verify biometric for transaction
  const verifyBiometric = useCallback(async () => {
    if (!isSupported) {
      return { success: false, error: "Not supported" };
    }

    try {
      setChecking(true);

      if (isNativePlatform()) {
        // Native platform: Use Capacitor Biometric Auth
        try {
          await BiometricAuth.authenticate({
            reason: "Verify your identity to authorize this transaction",
            cancelTitle: "Cancel",
            allowDeviceCredential: false,
            iosFallbackTitle: "Use passcode",
            androidTitle: "Transaction Authentication",
            androidSubtitle: "Verify your identity",
            androidConfirmationRequired: true,
          });

          setChecking(false);
          return { success: true };
        } catch (error) {
          console.error("Native biometric verification error:", error);
          setChecking(false);
          return { success: false, error: error.message || "Authentication failed" };
        }
      } else {
        // Web platform: Use WebAuthn
        // NOTE: In production, the challenge should be fetched from the server
        // to prevent replay attacks. This is a simplified implementation for MVP.
        // TODO: Implement server-side challenge generation and verification
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        
        const publicKeyCredentialRequestOptions = {
          challenge: challenge,
          timeout: 60000,
          userVerification: "required",
        };

        const assertion = await navigator.credentials.get({
          publicKey: publicKeyCredentialRequestOptions,
        });

        if (assertion) {
          setChecking(false);
          return { success: true };
        }
      }
    } catch (error) {
      console.error("Biometric verification error:", error);
      setChecking(false);
      return { success: false, error: error.message };
    }
  }, [isSupported]);

  // Login with biometric
  const loginWithBiometric = useCallback(async (email) => {
    if (!isSupported) throw new Error("Biometric login not supported");

    setChecking(true);
    try {
      if (isNativePlatform()) {
        // Native platform: Use Capacitor Biometric Auth
        try {
          // 1️⃣ Authenticate with biometric
          await BiometricAuth.authenticate({
            reason: "Login to MafitaPay",
            cancelTitle: "Cancel",
            allowDeviceCredential: false,
            iosFallbackTitle: "Use passcode",
            androidTitle: "Login",
            androidSubtitle: "Authenticate to login",
            androidConfirmationRequired: true,
          });

          // 2️⃣ Get stored credentials and login
          const response = await axios.post(`${API_BASE}/biometric/login/`, {
            email,
            platform: Capacitor.getPlatform(),
          });

          // 3️⃣ Store JWT tokens
          const { access, refresh, user } = response.data;
          localStorage.setItem("access", access);
          localStorage.setItem("refresh", refresh);
          localStorage.setItem("user", JSON.stringify(user));
          localStorage.setItem("last_active", Date.now().toString());

          window.dispatchEvent(new Event("tokenRefreshed"));
          setChecking(false);
          return { success: true, user };
        } catch (error) {
          console.error("Native biometric login error:", error);
          setChecking(false);
          return { success: false, error: error.message || "Login failed" };
        }
      } else {
        // Web platform: Use WebAuthn
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
      }
    } catch (err) {
      setChecking(false);
      return { success: false, error: err };
    }
  }, [isSupported]);

  // Authenticate with biometric and refresh token
  const authenticateWithRefresh = useCallback(async () => {
    if (!isSupported) {
      return { success: false, error: "Biometric not supported" };
    }

    try {
      setChecking(true);

      // 1️⃣ Verify biometric
      const biometricResult = await verifyBiometric();
      if (!biometricResult.success) {
        setChecking(false);
        return { success: false, error: biometricResult.error };
      }

      // 2️⃣ Use refresh token to get new access token
      const refreshToken = localStorage.getItem("refresh");
      if (!refreshToken) {
        setChecking(false);
        return { success: false, error: "No refresh token found" };
      }

      const response = await axios.post(`${API_BASE}/token/refresh/`, {
        refresh: refreshToken,
      });

      const { access } = response.data;
      localStorage.setItem("access", access);
      localStorage.setItem("last_active", Date.now().toString());
      window.dispatchEvent(new Event("tokenRefreshed"));

      setChecking(false);
      return { success: true, access };
    } catch (error) {
      console.error("Biometric refresh authentication error:", error);
      setChecking(false);
      return { 
        success: false, 
        error: error.response?.data?.error || error.message || "Authentication failed" 
      };
    }
  }, [isSupported, verifyBiometric]);

  return { 
    isSupported, 
    loginWithBiometric,
    authenticateWithRefresh,
    checking,
    biometricStatus,
    enrollBiometric,
    disableBiometric,
    verifyBiometric,
    refreshBiometricStatus: fetchBiometricStatus,
  };
}
