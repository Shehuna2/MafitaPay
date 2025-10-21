// src/components/PrivateRoute.jsx
import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

export default function PrivateRoute({ children }) {
  const access = localStorage.getItem("access");
  const refresh = localStorage.getItem("refresh");

  if (!access || !refresh) {
    return <Navigate to="/login" replace />;
  }

  try {
    const { exp } = jwtDecode(access);

    // if token expired, wait for interceptor to handle refresh
    if (Date.now() >= exp * 1000) {
      // Don't redirect instantly — let interceptor handle auto-refresh
      console.warn("Access token expired — waiting for refresh...");
      return children;
    }
  } catch (e) {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    return <Navigate to="/login" replace />;
  }

  return children;
}
