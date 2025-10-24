// backend/src/api/client.js
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:8000/api";

const client = axios.create({
  baseURL: BASE_URL,
});

client.interceptors.request.use((config) => {
  const access = localStorage.getItem("access");
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  // Disable caching for GET requests
  if (config.method === "get") {
    config.params = { ...config.params, t: Date.now() };
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refresh = localStorage.getItem("refresh");
        if (!refresh) throw new Error("No refresh token");
        const refreshURL = `${BASE_URL}/auth/token/refresh/`; // Use correct endpoint
        const res = await axios.post(refreshURL, { refresh });
        localStorage.setItem("access", res.data.access);
        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
        return client(originalRequest);
      } catch (refreshError) {
        console.error("❌ Token refresh failed:", refreshError?.response?.data || refreshError);
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default client;