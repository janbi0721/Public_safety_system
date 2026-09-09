import { useRoutes } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";

import { MatxTheme } from "./components";
import SettingsProvider from "./contexts/SettingsContext";
import routes from "./routes";

export default function App() {
  const content = useRoutes(routes);

  return (
    <SettingsProvider>
      <MatxTheme>
        <CssBaseline />
        {content}
      </MatxTheme>
    </SettingsProvider>
  );
}
