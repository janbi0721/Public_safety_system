import { lazy } from "react";
import { Navigate } from "react-router-dom";

import Loadable from "./components/Loadable";
import MatxLayout from "./components/MatxLayout/MatxLayout";

const Dashboard = Loadable(lazy(() => import("app/views/safety/Dashboard")));
const LiveMonitor = Loadable(lazy(() => import("app/views/safety/LiveMonitor")));
const Events = Loadable(lazy(() => import("app/views/safety/Events")));
const Cameras = Loadable(lazy(() => import("app/views/safety/Cameras")));
const SystemStatus = Loadable(lazy(() => import("app/views/safety/SystemStatus")));

const routes = [
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  {
    element: <MatxLayout />,
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/monitor", element: <LiveMonitor /> },
      { path: "/events", element: <Events /> },
      { path: "/cameras", element: <Cameras /> },
      { path: "/system", element: <SystemStatus /> }
    ]
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> }
];

export default routes;
