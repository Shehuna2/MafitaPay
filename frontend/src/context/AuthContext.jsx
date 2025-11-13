import { createContext, useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  // Initialize auth state from localStorage
  const [access, setAccess] = useState(() => localStorage.getItem("access"));
  const [refresh, setRefresh] = useState(() => localStorage.getItem("refresh"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  // ✅ Login: save tokens and user info
  const login = (tokens, userData) => {
    localStorage.setItem("access", tokens.access);
    localStorage.setItem("refresh", tokens.refresh);
    localStorage.setItem("user", JSON.stringify(userData));
    setAccess(tokens.access);
    setRefresh(tokens.refresh);
    setUser(userData);
  };

  // ✅ Logout: clear everything and navigate to login
  const logout = () => {
    // Clear all local storage items that may hold user data
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    localStorage.removeItem("profile_image");
    localStorage.removeItem("notifications");

    // Reset in-memory auth state
    setAccess(null);
    setRefresh(null);
    setUser(null);

    // Small timeout prevents React state tear errors on immediate route change
    setTimeout(() => navigate("/login", { replace: true }), 0);
  };

  // ✅ Listen for token refresh events triggered by Axios (in client.js)
  useEffect(() => {
    const handleTokenRefreshed = () => {
      const newAccess = localStorage.getItem("access");
      if (newAccess) setAccess(newAccess);
    };
    window.addEventListener("tokenRefreshed", handleTokenRefreshed);
    return () => window.removeEventListener("tokenRefreshed", handleTokenRefreshed);
  }, []);

  // ✅ Keep auth state synchronized with localStorage changes across tabs
  useEffect(() => {
    const handleStorageChange = () => {
      setAccess(localStorage.getItem("access"));
      setRefresh(localStorage.getItem("refresh"));
      const rawUser = localStorage.getItem("user");
      setUser(rawUser ? JSON.parse(rawUser) : null);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

    // ✅ Handle logout events triggered externally (client.js)
  useEffect(() => {
    const handleExternalLogout = () => {
      setAccess(null);
      setRefresh(null);
      setUser(null);
    };

    window.addEventListener("logout", handleExternalLogout);
    return () => window.removeEventListener("logout", handleExternalLogout);
  }, []);


  const isAuthenticated = Boolean(access);

  return (
    <AuthContext.Provider value={{ access, refresh, user, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// ✅ Custom hook for easy use
export const useAuth = () => useContext(AuthContext);
