import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Idle timeout = 2 hours
const IDLE_TIMEOUT = 2 * 60 * 60 * 1000;

function markActivity() {
  localStorage.setItem("last_active", Date.now().toString());
}

function saveReauthState() {
  localStorage.setItem("reauth_user", localStorage.getItem("user"));
  localStorage.setItem("post_reauth_redirect", window.location.pathname);
}

// REQUEST
client.interceptors.request.use(
  (config) => {
    const lastActive = Number(localStorage.getItem("last_active") || 0);
    const now = Date.now();

    if (lastActive && now - lastActive > IDLE_TIMEOUT) {
      window.dispatchEvent(new Event("sessionExpired"));
    } else {
      markActivity();
    }

    const access = localStorage.getItem("access");
    if (access) {
      config.headers.Authorization = `Bearer ${access}`;
    }

    return config;
  },
  (err) => Promise.reject(err)
);

// RESPONSE
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      const refresh = localStorage.getItem("refresh");
      if (!refresh) {
        window.dispatchEvent(new Event("sessionExpired"));
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}auth/token/refresh/`, { refresh });

        localStorage.setItem("access", data.access);
        window.dispatchEvent(new Event("tokenRefreshed"));

        original.headers.Authorization = `Bearer ${data.access}`;
        return client(original);

      } catch (err) {
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");

        saveReauthState();

        window.dispatchEvent(new Event("sessionExpired"));
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default client;
