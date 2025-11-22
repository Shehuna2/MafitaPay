import axios from "axios";

const BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
const client = axios.create({
  baseURL: BASE_URL,
});

// ---------- Idle Timeout ----------
const IDLE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours

function markActivity() {
  localStorage.setItem("last_active", Date.now().toString());
}

function checkIdle() {
  const lastActive = Number(localStorage.getItem("last_active") || 0);
  if (!lastActive) return false;

  const now = Date.now();
  return now - lastActive > IDLE_TIMEOUT;
}

// ---------- Reauth Helpers ----------
function saveReauthState() {
  localStorage.setItem("reauth_user", localStorage.getItem("user"));
  localStorage.setItem("post_reauth_redirect", window.location.pathname);
}

function forceLogout() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  saveReauthState();
  window.dispatchEvent(new Event("sessionExpired"));
}

// ---------- REFRESH LOCK (prevents multiple refresh calls) ----------
let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  const refresh = localStorage.getItem("refresh");
  if (!refresh) {
    forceLogout();
    return null;
  }

  refreshPromise = axios
    .post(`${BASE_URL}/auth/token/refresh/`, { refresh })
    .then((res) => {
      const { access } = res.data;
      localStorage.setItem("access", access);
      window.dispatchEvent(new Event("tokenRefreshed"));
      return access;
    })
    .catch(() => {
      forceLogout();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// ---------- REQUEST INTERCEPTOR ----------
client.interceptors.request.use(
  (config) => {
    if (checkIdle()) {
      forceLogout();
      return Promise.reject(new axios.Cancel("Session expired by inactivity"));
    }

    markActivity();

    const access = localStorage.getItem("access");
    if (access) {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${access}`,
      };
    }

    return config;
  },
  (err) => Promise.reject(err)
);

// ---------- RESPONSE INTERCEPTOR ----------
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;

    const newAccess = await refreshAccessToken();
    if (!newAccess) return Promise.reject(error);

    original.headers = {
      ...(original.headers || {}),
      Authorization: `Bearer ${newAccess}`,
    };

    return client(original);
  }
);

export default client;
