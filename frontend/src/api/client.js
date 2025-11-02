import axios from "axios";

// ✅ Normalize base URL: use environment variable or fallback to localhost
const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://localhost:8000"
) + "/api"; // ensure /api is always appended

// ✅ Create Axios instance
const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ Attach tokens to each request
client.interceptors.request.use((config) => {
  const access = localStorage.getItem("access");
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }

  // Prevent browser caching GET requests
  if (config.method?.toLowerCase() === "get") {
    config.params = { ...config.params, t: Date.now() };
  }

  return config;
});

// ✅ Handle 401 and refresh tokens
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refresh = localStorage.getItem("refresh");
        if (!refresh) throw new Error("No refresh token found");

        const refreshURL = `${BASE_URL}/auth/token/refresh/`;
        const res = await axios.post(refreshURL, { refresh });

        localStorage.setItem("access", res.data.access);
        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;

        return client(originalRequest); // retry failed request
      } catch (refreshError) {
        console.error("❌ Token refresh failed:", refreshError?.response?.data || refreshError);
        localStorage.clear();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default client;
