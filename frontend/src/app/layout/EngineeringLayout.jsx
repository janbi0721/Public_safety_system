import { Outlet, useNavigate } from "react-router-dom";
import { AppBar, Box, Button, Stack, Toolbar, Typography } from "@mui/material";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ModeSelect from "../components/ModeSelect";
import { useAuth } from "../auth/SupervisorAuth";

export default function EngineeringLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const signOut = async () => { await logout(); navigate("/supervisor/login", { replace: true }); };
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <BuildOutlined />
          <Typography fontWeight={800} sx={{ flexGrow: 1 }}>工程師維護</Typography>
          <ModeSelect />
          <Typography variant="body2" sx={{ display: { xs: "none", sm: "block" } }}>
            {user?.display_name || user?.username}
          </Typography>
          <Button color="inherit" size="small" startIcon={<ArrowBackOutlined />} onClick={() => navigate("/supervisor/dashboard")}>主管端</Button>
          <Button color="inherit" size="small" startIcon={<LogoutOutlined />} onClick={signOut}>登出</Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ maxWidth: 1350, mx: "auto", width:"100%" }}><Outlet /></Box>
    </Box>
  );
}
