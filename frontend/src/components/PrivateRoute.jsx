// src/components/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useAuth } from "../context/AuthContext";

export default function PrivateRoute({ children }) {
  const { access, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  // 1. Main authentication gate
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Validate token safely
  try {
    const { exp } = jwtDecode(access);

    // If token is expired, logout and redirect
    if (Date.now() >= exp * 1000) {
      console.warn("Access token expired — logging out...");
      logout();
      return <Navigate to="/login" replace />;
    }
  } catch (e) {
    console.warn("Invalid access token — logging out...");
    logout();
    return <Navigate to="/login" replace />;
  }

  return children;
}
