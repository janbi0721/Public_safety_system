import { Navigate } from "react-router-dom";
import AuthGuard from "./auth/AuthGuard";
import SupervisorLayout from "./layout/SupervisorLayout";
import Landing from "./pages/Landing";
import PublicMonitor from "./pages/PublicMonitor";
import SupervisorLogin from "./pages/SupervisorLogin";
import Dashboard from "./pages/Dashboard";
import LiveMonitor from "./pages/LiveMonitor";
import Events from "./pages/Events";
import Supervisors from "./pages/Supervisors";
import Cameras from "./pages/Cameras";
import Analytics from "./pages/Analytics";
import AiSafetyManager from "./pages/AiSafetyManager";
import EngineerMaintenance from "./pages/EngineerMaintenance";
import EngineeringLayout from "./layout/EngineeringLayout";
import Settings from "./pages/Settings";
import RoleGuard from "./auth/RoleGuard";

const routes = [
  { path: "/", element: <Landing /> },
  { path: "/client", element: <Navigate to="/client/monitor" replace /> },
  { path: "/client/monitor", element: <PublicMonitor /> },
  { path: "/supervisor/login", element: <SupervisorLogin /> },
  {
    path: "/supervisor",
    element: (
      <AuthGuard>
        <SupervisorLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/supervisor/dashboard" replace /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "monitor", element: <LiveMonitor /> },
      { path: "events", element: <Events /> },
      { path: "supervisors", element: <RoleGuard roles={["admin"]}><Supervisors /></RoleGuard> },
      { path: "analytics", element: <Analytics /> },
      { path: "ai", element: <AiSafetyManager /> },
      { path: "settings", element: <Settings /> },
      { path: "cameras", element: <Cameras /> }
    ]
  },
  { path: "/engineering", element: <AuthGuard><RoleGuard roles={["engineer", "admin"]}><EngineeringLayout /></RoleGuard></AuthGuard>, children: [{ index: true, element: <EngineerMaintenance /> }] },
  { path: "/dashboard", element: <Navigate to="/supervisor/dashboard" replace /> },
  { path: "/monitor", element: <Navigate to="/supervisor/monitor" replace /> },
  { path: "/events", element: <Navigate to="/supervisor/events" replace /> },
  { path: "*", element: <Navigate to="/" replace /> }
];

export default routes;
