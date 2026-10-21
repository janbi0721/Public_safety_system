import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./SupervisorAuth";

export default function AuthGuard({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) return children;

  return (
    <Navigate
      replace
      to="/supervisor/login"
      state={{ from: `${location.pathname}${location.search}` }}
    />
  );
}
