import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1976d2" },
    secondary: { main: "#ffaf38" },
    error: { main: "#ff3d57" },
    background: { paper: "#ffffff", default: "#fafafa" }
  },
  typography: {
    fontSize: 14,
    body1: { fontSize: 14 }
  },
  shape: { borderRadius: 8 }
});

export default theme;
