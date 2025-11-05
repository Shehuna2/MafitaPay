// src/components/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useAuth } from "../context/AuthContext";

export default function PrivateRoute({ children }) {
  const { access, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !access) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  try {
    const { exp } = jwtDecode(access);

    // Check expiration and auto-logout if token truly invalid (not refreshable)
    if (Date.now() >= exp * 1000) {
      console.warn("Access token expired — logging out...");
      logout(); // clear tokens safely
      return <Navigate to="/login" replace />;
    }
  } catch (e) {
    console.warn("Invalid access token — logging out...");
    logout();
    return <Navigate to="/login" replace />;
  }

  return children;
}
