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
        // Preserve a copy of user for reauth (if present)
        const user = localStorage.getItem("user");
        if (user) {
          localStorage.setItem("reauth_user", user);
        }

        // Clear only access token (we keep refresh to allow re-login with biometric/refresh)
        localStorage.removeItem("access");
        // Note: don't remove refresh here — helps biometric/refresh re-auth flows
        window.dispatchEvent(new Event("sessionExpired"));
      } else {
        // update last activity
        markActivity();
      }
    } catch (e) {
      // ignore storage errors
    }

    const access = localStorage.getItem("access");
    if (access) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${access}`;
    }

    // prevent caching GET requests
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

        const refreshURL = `${BASE_URL.replace(/\/api\/?$/, "/") }auth/token/refresh/`;
        // Use axios (not client) to avoid interceptor loops
        const res = await axios.post(refreshURL, { refresh });

        // update stored access token
        localStorage.setItem("access", res.data.access);
        markActivity();

        // notify other parts of the app
        window.dispatchEvent(new Event("tokenRefreshed"));

        // retry original request with new token
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
        return client(originalRequest);
      } catch (refreshError) {
        // Refresh failed -> prepare reauth flow but keep profile to greet user
        try {
          const user = localStorage.getItem("user");
          if (user) {
            localStorage.setItem("reauth_user", user);
          }
        } catch (e) {
          // ignore
        }

        // Remove access (user must re-enter password / biometric will attempt refresh)
        localStorage.removeItem("access");
        // Do NOT remove refresh here — keep it so biometric/refresh may attempt server refresh.
        // If you prefer to force full logout, clear refresh as well.

        // Dispatch logout/reauth events so UI can respond
        window.dispatchEvent(new Event("logout"));
        // Redirect to login with reauth flag
        try {
          window.location.href = "/login?reauth=true";
        } catch (e) {
          // ignore
        }
      }
    }

    return Promise.reject(error);
  }
);

export default client;
