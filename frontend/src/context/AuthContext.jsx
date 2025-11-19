import { createContext, useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [access, setAccess] = useState(localStorage.getItem("access"));
  const [refresh, setRefresh] = useState(localStorage.getItem("refresh"));
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  });

  const login = (tokens, userData) => {
    if (tokens.access) localStorage.setItem("access", tokens.access);
    if (tokens.refresh) localStorage.setItem("refresh", tokens.refresh);
    if (userData) localStorage.setItem("user", JSON.stringify(userData));

    setAccess(tokens.access);
    setRefresh(tokens.refresh);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    localStorage.removeItem("reauth_user");
    localStorage.removeItem("post_reauth_redirect");

    setAccess(null);
    setRefresh(null);
    setUser(null);
    navigate("/login", { replace: true });
  };

  // Handle "tokenRefreshed"
  useEffect(() => {
    const handler = () => {
      const newAccess = localStorage.getItem("access");
      if (newAccess) setAccess(newAccess);
    };

    window.addEventListener("tokenRefreshed", handler);
    return () => window.removeEventListener("tokenRefreshed", handler);
  }, []);

  // 🔥 FIXED: handle session expiration
  useEffect(() => {
    const handler = () => logout();

    window.addEventListener("sessionExpired", handler);
    return () => window.removeEventListener("sessionExpired", handler);
  }, []);

  return (
    <AuthContext.Provider value={{ access, refresh, user, login, logout, isAuthenticated: !!access }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
