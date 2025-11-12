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

// Helper: safely save user for reauth
function saveReauthUser() {
  try {
    const user = localStorage.getItem("user") || localStorage.getItem("reauth_user") || "{}";
    localStorage.setItem("reauth_user", user);
  } catch {}
}

// Helper: safely save post-login redirect path
function saveRedirect() {
  try {
    const currentPath = window.location.pathname + window.location.search;
    localStorage.setItem("post_reauth_redirect", currentPath);
  } catch {}
}

// Request interceptor: attach token + manage idle timeout
client.interceptors.request.use(
  (config) => {
    try {
      const lastActive = Number(localStorage.getItem("last_active") || 0);
      const now = Date.now();

      // If idle timeout exceeded, expire session
      if (lastActive && now - lastActive > IDLE_TIMEOUT) {
        const justLoggedIn = now - lastActive < 5000; // 5 seconds grace period
        if (!justLoggedIn) {
          saveRedirect();
          saveReauthUser();

          // Clear only access token (keep refresh)
          localStorage.removeItem("access");

          // Trigger global event for UI listening
          window.dispatchEvent(new Event("sessionExpired"));
        } else {
          markActivity();
        }
      } else {
        markActivity();
      }
    } catch {
      // Ignore localStorage errors
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

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refresh = localStorage.getItem("refresh");
        if (!refresh) throw new Error("No refresh token found");

        const refreshURL = `${BASE_URL.replace(/\/api\/?$/, "/")}auth/token/refresh/`;

        // Use plain axios to avoid infinite loops
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
      } catch {
        // Refresh failed -> prepare reauth flow
        saveReauthUser();
        saveRedirect();

        localStorage.removeItem("access");

        window.dispatchEvent(new Event("logout"));

        // Redirect to login with safe redirect
        try {
          const redirect = localStorage.getItem("post_reauth_redirect") || "/dashboard";
          window.location.href = `/login?reauth=true&next=${encodeURIComponent(redirect)}`;
        } catch {}
      }
    }

    return Promise.reject(error);
  }
);

export default client;
