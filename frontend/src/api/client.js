import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Idle timeout (2 hours)
const IDLE_TIMEOUT = 2 * 60 * 60 * 1000;

// Helper: update activity timestamp
function markActivity() {
  try {
    localStorage.setItem("last_active", Date.now().toString());
  } catch {}
}

// Helper: save redirect path
function saveRedirect() {
  try {
    const path = window.location.pathname + window.location.search;
    localStorage.setItem("post_reauth_redirect", path);
  } catch {}
}

// Helper: keep user for biometric relogin
function saveReauthUser() {
  try {
    const user = localStorage.getItem("user") || "{}";
    localStorage.setItem("reauth_user", user);
  } catch {}
}

// REQUEST INTERCEPTOR
client.interceptors.request.use(
  (config) => {
    try {
      const lastActive = Number(localStorage.getItem("last_active") || 0);
      const now = Date.now();

      // Idle timeout enforcement
      if (lastActive && now - lastActive > IDLE_TIMEOUT) {
        console.warn("Idle timeout exceeded — expiring session");

        saveRedirect();
        saveReauthUser();

        // Don't remove access token here — let server validate on next call
        window.dispatchEvent(new Event("sessionExpired"));
      } else {
        markActivity();
      }
    } catch {}

    // Attach token
    const access = localStorage.getItem("access");
    if (access) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${access}`;
    }

    // Prevent GET caching
    if (config.method?.toLowerCase() === "get") {
      config.params = { ...config.params, t: Date.now() };
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// RESPONSE INTERCEPTOR
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    // Token expired: try refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refresh = localStorage.getItem("refresh");
        if (!refresh) throw new Error("Refresh missing");

        const refreshURL = `${BASE_URL.replace(/\/api\/?$/, "/")}auth/token/refresh/`;

        // Use raw axios to avoid infinite loops
        const res = await axios.post(refreshURL, { refresh });

        const newAccess = res.data.access;

        localStorage.setItem("access", newAccess);
        markActivity();

        // Notify AuthContext
        window.dispatchEvent(new Event("tokenRefreshed"));

        // Retry original request
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return client(originalRequest);
      } catch (refreshError) {
        console.warn("Refresh token invalid — forcing reauth");

        // Prepare reauth flow
        saveReauthUser();
        saveRedirect();

        // Remove access so PrivateRoute pushes to login
        localStorage.removeItem("access");

        // Fire sessionExpired (NOT "logout")
        window.dispatchEvent(new Event("sessionExpired"));

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default client;
