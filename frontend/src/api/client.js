import axios from "axios";

// Normalize base URL: use environment variable or fallback to localhost
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// Create Axios instance
const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Idle timeout in milliseconds (2 hours)
const IDLE_TIMEOUT = 2 * 60 * 60 * 1000;

// Helper: mark last activity
function markActivity() {
  try {
    localStorage.setItem("last_active", Date.now().toString());
  } catch {}
}

// Request interceptor: attach token + manage idle timeout
client.interceptors.request.use(
  (config) => {
    try {
      const lastActive = Number(localStorage.getItem("last_active") || 0);
      const now = Date.now();

      // If last activity exists and exceeded timeout, expire session (keep reauth_user)
      if (lastActive && now - lastActive > IDLE_TIMEOUT) {
        // 🛡️ Prevent false re-expiry right after a successful login (grace period)
        const justLoggedIn = now - lastActive < 5000; // 5 seconds
        if (!justLoggedIn) {
          // Save the current page so we can restore after reauth
          try {
            const currentPath = window.location.pathname + window.location.search;
            localStorage.setItem("post_reauth_redirect", currentPath);
          } catch {}

          // Preserve a copy of user for reauth (if present)
          const user = localStorage.getItem("user");
          if (user) localStorage.setItem("reauth_user", user);

          // Clear only access token (keep refresh for biometric/refresh re-login)
          localStorage.removeItem("access");

          // Trigger global event for optional UI listening
          window.dispatchEvent(new Event("sessionExpired"));
        } else {
          markActivity();
        }
      } else {
        // Update last activity timestamp
        markActivity();
      }
    } catch (e) {
      // Ignore localStorage access errors
    }

    // Attach access token if present
    const access = localStorage.getItem("access");
    if (access) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${access}`;
    }

    // Prevent caching GET requests
    if (config.method?.toLowerCase() === "get") {
      config.params = { ...config.params, t: Date.now() };
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle refresh and logout flows
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    // If 401 and not already retried: try refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refresh = localStorage.getItem("refresh");
        if (!refresh) throw new Error("No refresh token found");

        const refreshURL = `${BASE_URL.replace(/\/api\/?$/, "/")}auth/token/refresh/`;

        // Use plain axios (not client) to avoid infinite loops
        const res = await axios.post(refreshURL, { refresh });

        // Update stored access token
        localStorage.setItem("access", res.data.access);
        markActivity();

        // Notify other parts of the app
        window.dispatchEvent(new Event("tokenRefreshed"));

        // Retry original request with new token
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
        return client(originalRequest);
      } catch (refreshError) {
        // Refresh failed -> prepare reauth flow but keep user for greeting
        try {
          const user = localStorage.getItem("user");
          if (user) localStorage.setItem("reauth_user", user);
        } catch {}

        // Save current path so we can restore after reauth login
        try {
          const currentPath = window.location.pathname + window.location.search;
          localStorage.setItem("post_reauth_redirect", currentPath);
        } catch {}

        // Remove only access (keep refresh for biometric retry)
        localStorage.removeItem("access");

        // Dispatch logout/reauth events
        window.dispatchEvent(new Event("logout"));

        // Redirect to login with reauth flag
        try {
          window.location.href = "/login?reauth=true";
        } catch {}
      }
    }

    return Promise.reject(error);
  }
);

export default client;
