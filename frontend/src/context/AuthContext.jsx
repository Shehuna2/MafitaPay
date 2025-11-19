import { createContext, useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  // Initial state from localStorage (loaded once)
  const [access, setAccess] = useState(() => localStorage.getItem("access"));
  const [refresh, setRefresh] = useState(() => localStorage.getItem("refresh"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  // -------------------------------------------------------
  // 🔐 LOGIN — single source of truth for token + user state
  // -------------------------------------------------------
  const login = (tokens, userData) => {
    if (tokens.access) localStorage.setItem("access", tokens.access);
    if (tokens.refresh) localStorage.setItem("refresh", tokens.refresh);
    if (userData) localStorage.setItem("user", JSON.stringify(userData));

    setAccess(tokens.access);
    setRefresh(tokens.refresh);
    setUser(userData);
  };

  // -------------------------------------------------------
  // 🚪 LOGOUT — fully resets state + storage
  // -------------------------------------------------------
  const logout = () => {
    // Clear all localStorage items related to auth
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    localStorage.removeItem("profile_image");
    localStorage.removeItem("notifications");

    setAccess(null);
    setRefresh(null);
    setUser(null);

    // Slight delay to avoid React state tear warnings
    setTimeout(() => {
      navigate("/login", { replace: true });
    }, 0);
  };

  // -------------------------------------------------------
  // 🔄 Update access token when refreshed by Axios (client.js)
  // -------------------------------------------------------
  useEffect(() => {
    const handleTokenRefreshed = () => {
      const newAccess = localStorage.getItem("access");
      if (newAccess) setAccess(newAccess);
    };

    window.addEventListener("tokenRefreshed", handleTokenRefreshed);
    return () => window.removeEventListener("tokenRefreshed", handleTokenRefreshed);
  }, []);

  // -------------------------------------------------------
  // 🌐 Sync auth state across multiple browser tabs
  // -------------------------------------------------------
  useEffect(() => {
    const handleStorageChange = () => {
      const newAccess = localStorage.getItem("access");
      const newRefresh = localStorage.getItem("refresh");
      const rawUser = localStorage.getItem("user");

      setAccess(newAccess);
      setRefresh(newRefresh);
      setUser(rawUser ? JSON.parse(rawUser) : null);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // -------------------------------------------------------
  // 🔐 External logout event support (optional)
  // -------------------------------------------------------
  useEffect(() => {
    const handleExternalLogout = () => {
      setAccess(null);
      setRefresh(null);
      setUser(null);
    };

    window.addEventListener("logout", handleExternalLogout);
    return () => window.removeEventListener("logout", handleExternalLogout);
  }, []);

  // -------------------------------------------------------
  // Boolean authenticated flag
  // -------------------------------------------------------
  const isAuthenticated = Boolean(access);

  return (
    <AuthContext.Provider
      value={{
        access,
        refresh,
        user,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// 🔥 Hook for easy access
export const useAuth = () => useContext(AuthContext);
