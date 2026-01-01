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
              credential_id: credentialId,
              public_key: credentialId, // For native, this is just an identifier
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
            // Store user email for future biometric login
            localStorage.setItem("biometric_user_email", user.email);
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
            platform: Capacitor.getPlatform(), // Returns 'web' for web browsers
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.success) {
          // Store user email for future biometric login
          localStorage.setItem("biometric_user_email", user.email);
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
        // Clear stored biometric email
        localStorage.removeItem("biometric_user_email");
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
      console.error("Biometric verify: Not supported");
      return { 
        success: false, 
        error: "Biometric authentication is not supported on this device.",
        errorType: "NOT_SUPPORTED"
      };
    }

    try {
      setChecking(true);

      if (isNativePlatform()) {
        // Native platform: Use Capacitor Biometric Auth
        try {
          // Check if BiometricAuth plugin is available
          if (!BiometricAuth || typeof BiometricAuth.authenticate !== 'function') {
            console.error("Biometric verify: Plugin not available");
            setChecking(false);
            return { 
              success: false, 
              error: "Biometric authentication plugin is not available.",
              errorType: "PLUGIN_UNAVAILABLE"
            };
          }

          console.log("Verifying native biometric");
          await BiometricAuth.authenticate({
            reason: "Verify your identity to authorize this transaction",
            cancelTitle: "Cancel",
            allowDeviceCredential: false,
            iosFallbackTitle: "Use passcode",
            androidTitle: "Transaction Authentication",
            androidSubtitle: "Verify your identity",
            androidConfirmationRequired: true,
          });

          console.log("Native biometric verification successful");
          setChecking(false);
          return { success: true };
        } catch (error) {
          console.error("Native biometric verification error:", error);
          setChecking(false);
          
          let errorMsg = "Authentication failed";
          let errorType = "UNKNOWN_ERROR";
          
          if (error.code === "biometry_lockout" || error.message?.includes("locked")) {
            errorMsg = "Biometric authentication is locked. Too many failed attempts.";
            errorType = "BIOMETRY_LOCKED";
          } else if (error.code === "user_cancel" || error.message?.includes("cancel")) {
            errorMsg = "Authentication was cancelled.";
            errorType = "USER_CANCELLED";
          } else if (error.code === "biometry_not_enrolled" || error.message?.includes("not enrolled")) {
            errorMsg = "No biometric is enrolled on this device.";
            errorType = "NOT_ENROLLED";
          } else if (error.message) {
            errorMsg = error.message;
          }
          
          return { success: false, error: errorMsg, errorType };
        }
      } else {
        // Web platform: Use WebAuthn
        try {
          console.log("Verifying WebAuthn biometric");
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
            console.log("WebAuthn verification successful");
            setChecking(false);
            return { success: true };
          } else {
            console.error("WebAuthn verification: No assertion returned");
            setChecking(false);
            return { 
              success: false, 
              error: "Biometric verification failed.",
              errorType: "NO_ASSERTION"
            };
          }
        } catch (error) {
          console.error("WebAuthn verification error:", error);
          setChecking(false);
          
          let errorMsg = "Authentication failed";
          let errorType = "UNKNOWN_ERROR";
          
          if (error.name === "NotAllowedError") {
            errorMsg = "Authentication was cancelled or not allowed.";
            errorType = "USER_CANCELLED";
          } else if (error.name === "NotSupportedError") {
            errorMsg = "Biometric authentication is not supported.";
            errorType = "NOT_SUPPORTED";
          } else if (error.name === "InvalidStateError") {
            errorMsg = "No biometric credential registered.";
            errorType = "NOT_ENROLLED";
          } else if (error.message) {
            errorMsg = error.message;
          }
          
          return { success: false, error: errorMsg, errorType };
        }
      }
    } catch (error) {
      console.error("Biometric verification error:", error);
      setChecking(false);
      return { 
        success: false, 
        error: error.message || "Authentication failed",
        errorType: "UNEXPECTED_ERROR"
      };
    }
  }, [isSupported]);

  // Login with biometric
  const loginWithBiometric = useCallback(async (email) => {
    // Validation: Check if email is provided
    if (!email || !email.trim()) {
      console.error("Biometric login: No email provided");
      return { 
        success: false, 
        error: "No biometric credentials found. Please login with your password.",
        errorType: "MISSING_EMAIL"
      };
    }

    // Validation: Check if biometric is supported
    if (!isSupported) {
      console.error("Biometric login: Not supported on this device");
      return { 
        success: false, 
        error: "Biometric authentication is not supported on this device.",
        errorType: "NOT_SUPPORTED"
      };
    }

    setChecking(true);
    try {
      if (isNativePlatform()) {
        // Native platform: Use Capacitor Biometric Auth
        try {
          // Check if BiometricAuth plugin is available
          if (!BiometricAuth || typeof BiometricAuth.authenticate !== 'function') {
            console.error("Biometric login: Plugin not available");
            setChecking(false);
            return { 
              success: false, 
              error: "Biometric authentication plugin is not available. Please use your password.",
              errorType: "PLUGIN_UNAVAILABLE"
            };
          }

          // 1️⃣ Authenticate with biometric
          console.log("Attempting native biometric authentication");
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
          console.log("Native biometric auth successful, calling backend login");
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
          console.log("Native biometric login successful");
          setChecking(false);
          return { success: true, user };
        } catch (error) {
          console.error("Native biometric login error:", error);
          setChecking(false);
          
          // Determine specific error type
          let errorMsg = "Biometric authentication failed. Please use your password.";
          let errorType = "UNKNOWN_ERROR";
          
          if (error.code === "biometry_lockout" || error.message?.includes("locked")) {
            errorMsg = "Biometric authentication is locked. Please use your password.";
            errorType = "BIOMETRY_LOCKED";
          } else if (error.code === "user_cancel" || error.message?.includes("cancel")) {
            errorMsg = "Biometric authentication was cancelled.";
            errorType = "USER_CANCELLED";
          } else if (error.code === "biometry_not_enrolled" || error.message?.includes("not enrolled")) {
            errorMsg = "No biometric is enrolled on this device. Please enroll your fingerprint/face in device settings.";
            errorType = "NOT_ENROLLED";
          } else if (error.response?.status === 401 || error.response?.status === 400) {
            errorMsg = error.response?.data?.error || "Biometric credentials not recognized. Please use your password.";
            errorType = "SERVER_ERROR";
          } else if (error.response) {
            errorMsg = error.response?.data?.error || "Server error occurred. Please use your password.";
            errorType = "SERVER_ERROR";
          } else if (error.message) {
            errorMsg = error.message;
          }
          
          return { success: false, error: errorMsg, errorType };
        }
      } else {
        // Web platform: Use WebAuthn
        try {
          console.log("Attempting WebAuthn authentication");
          
          // 1️⃣ Get challenge from server
          const challengeRes = await axios.post(`${API_BASE}/webauthn/challenge/`, { email });
          const challenge = challengeRes.data;

          // 2️⃣ Get credential from browser
          console.log("Getting WebAuthn credential from browser");
          const credential = await navigator.credentials.get({
            publicKey: challenge
          });

          if (!credential) {
            console.error("WebAuthn: No credential returned");
            setChecking(false);
            return { 
              success: false, 
              error: "No biometric credential found. Please use your password.",
              errorType: "NO_CREDENTIAL"
            };
          }

          // 3️⃣ Send assertion to server for verification
          console.log("Verifying WebAuthn credential with server");
          const authRes = await axios.post(`${API_BASE}/webauthn/verify/`, {
            user_id: email,
            assertion: btoa(String.fromCharCode(...new Uint8Array(credential.response.authenticatorData)))
          });

          // 4️⃣ Store JWT tokens
          const { access, refresh, user } = authRes.data;
          localStorage.setItem("access", access);
          localStorage.setItem("refresh", refresh);
          localStorage.setItem("user", JSON.stringify(user));
          localStorage.setItem("last_active", Date.now().toString());

          window.dispatchEvent(new Event("tokenRefreshed"));
          console.log("WebAuthn login successful");
          setChecking(false);
          return { success: true, user };
        } catch (error) {
          console.error("WebAuthn login error:", error);
          setChecking(false);
          
          // Determine specific error type
          let errorMsg = "Biometric authentication failed. Please use your password.";
          let errorType = "UNKNOWN_ERROR";
          
          if (error.name === "NotAllowedError") {
            errorMsg = "Biometric authentication was cancelled or not allowed.";
            errorType = "USER_CANCELLED";
          } else if (error.name === "NotSupportedError") {
            errorMsg = "Biometric authentication is not supported in this browser.";
            errorType = "NOT_SUPPORTED";
          } else if (error.name === "InvalidStateError") {
            errorMsg = "No biometric credential registered. Please use your password.";
            errorType = "NOT_ENROLLED";
          } else if (error.response?.status === 404) {
            errorMsg = "Account not found. Please use your password to login.";
            errorType = "USER_NOT_FOUND";
          } else if (error.response?.status === 400 || error.response?.status === 401) {
            errorMsg = error.response?.data?.error || error.response?.data?.detail || "Biometric verification failed. Please use your password.";
            errorType = "SERVER_ERROR";
          } else if (error.response) {
            errorMsg = error.response?.data?.error || "Server error occurred. Please use your password.";
            errorType = "SERVER_ERROR";
          } else if (error.message) {
            errorMsg = error.message;
          }
          
          return { success: false, error: errorMsg, errorType };
        }
      }
    } catch (err) {
      console.error("Unexpected biometric login error:", err);
      setChecking(false);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : String(err) || "An unexpected error occurred. Please use your password.",
        errorType: "UNEXPECTED_ERROR"
      };
    }
  }, [isSupported]);

  // Authenticate with biometric and refresh token
  const authenticateWithRefresh = useCallback(async () => {
    if (!isSupported) {
      console.error("Biometric refresh: Not supported");
      return { 
        success: false, 
        error: "Biometric authentication is not supported on this device.",
        errorType: "NOT_SUPPORTED"
      };
    }

    try {
      setChecking(true);

      // 1️⃣ Verify biometric
      console.log("Verifying biometric for token refresh");
      const biometricResult = await verifyBiometric();
      if (!biometricResult.success) {
        console.error("Biometric verification failed:", biometricResult.error);
        setChecking(false);
        return { 
          success: false, 
          error: biometricResult.error || "Biometric verification failed. Please use your password.",
          errorType: biometricResult.errorType || "VERIFICATION_FAILED"
        };
      }

      // 2️⃣ Use refresh token to get new access token
      const refreshToken = localStorage.getItem("refresh");
      if (!refreshToken) {
        console.error("Biometric refresh: No refresh token found");
        setChecking(false);
        return { 
          success: false, 
          error: "Session expired. Please login with your password.",
          errorType: "NO_REFRESH_TOKEN"
        };
      }

      console.log("Refreshing access token");
      const response = await axios.post(`${API_BASE}/token/refresh/`, {
        refresh: refreshToken,
      });

      const { access } = response.data;
      localStorage.setItem("access", access);
      localStorage.setItem("last_active", Date.now().toString());
      window.dispatchEvent(new Event("tokenRefreshed"));

      console.log("Token refresh successful");
      setChecking(false);
      return { success: true, access };
    } catch (error) {
      console.error("Biometric refresh authentication error:", error);
      setChecking(false);
      
      let errorMsg = "Authentication failed. Please use your password.";
      let errorType = "UNKNOWN_ERROR";
      
      if (error.response?.status === 401) {
        errorMsg = "Session expired. Please login with your password.";
        errorType = "TOKEN_EXPIRED";
      } else if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
        errorType = "SERVER_ERROR";
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      return { 
        success: false, 
        error: errorMsg,
        errorType
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
