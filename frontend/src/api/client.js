import axios from "axios";

// ✅ Ensure no trailing slash issues
const BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:8000/api";

const client = axios.create({
  baseURL: BASE_URL,
});

// ✅ Attach access token to every request
client.interceptors.request.use((config) => {
  const access = localStorage.getItem("access");
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

// ✅ Token refresh logic (auto-detect backend path)
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle expired access token (401)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refresh = localStorage.getItem("refresh");
        if (!refresh) throw new Error("No refresh token");

        // ✅ Smartly detect correct refresh path
        // First try /api/auth/token/refresh/
        let refreshURL = `${BASE_URL}/auth/token/refresh/`;

        try {
          // Make a quick HEAD request to see if it exists
          await axios.head(refreshURL);
        } catch {
          // Fallback to /api/api/auth/token/refresh/ if first not found
          refreshURL = `${BASE_URL}/api/auth/token/refresh/`;
        }

        // ✅ Request a new access token
        const res = await axios.post(refreshURL, { refresh });

        // Save new access token
        localStorage.setItem("access", res.data.access);

        // Retry original request with the new token
        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
        return client(originalRequest);
      } catch (refreshError) {
        console.error("❌ Token refresh failed:", refreshError?.response?.data || refreshError);

        // Clear local storage and redirect to login
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        localStorage.removeItem("user");

        window.location.href = "/login";
      }
    }

    // All other errors pass through
    return Promise.reject(error);
  }
);

export default client;
