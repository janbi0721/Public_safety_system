import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import useTheme from "@mui/material/styles/useTheme";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import LinkedCameraOutlined from "@mui/icons-material/LinkedCameraOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import ManageAccountsOutlined from "@mui/icons-material/ManageAccountsOutlined";
import MenuOutlined from "@mui/icons-material/MenuOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import { useAuth } from "app/auth/SupervisorAuth";
import ModeSelect from '../components/ModeSelect';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';

const DRAWER_WIDTH = 250;

const navGroups = [
  {
    items: [
      { label: "主管儀表板", path: "/supervisor/dashboard", icon: <DashboardOutlined /> }
    ]
  },
  {
    title: "AI 工安監控",
    items: [
      { label: "即時監控", path: "/supervisor/monitor", icon: <VideocamOutlined /> },
      { label: "事件管理", path: "/supervisor/events", icon: <WarningAmberOutlined /> },
      { label: "統計分析", path: "/supervisor/analytics", icon: <BarChartOutlined /> },
      { label: "AI 安全經理", path: "/supervisor/ai", icon: <SmartToyOutlined /> }
    ]
  },
  {
    title: "管理",
    items: [
      { label: "帳號管理", path: "/supervisor/supervisors", icon: <ManageAccountsOutlined />, roles:["admin"] },
      { label: "攝影機", path: "/supervisor/cameras", icon: <LinkedCameraOutlined /> },
      { label: "一般設定", path: "/supervisor/settings", icon: <SettingsOutlined /> }
    ]
  }
];

export default function SupervisorLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const go = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/supervisor/login", { replace: true });
  };

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "hmi.nav", color: "hmi.navText" }}>
      <Stack direction="row" alignItems="center" spacing={1.2} sx={{ px: 2.25, minHeight: 64 }}>
        <ShieldOutlined />
        <Box>
          <Typography fontWeight={800} lineHeight={1.15}>AI Safety Monitoring</Typography>
          
        </Box>
      </Stack>
      <Divider sx={{ borderColor: "rgba(255,255,255,.18)" }} />

      <Box sx={{ flex: 1, overflowY: "auto", p: 1.25 }}>
        {navGroups.map((group, groupIndex) => (
          <Box key={group.title || groupIndex} sx={{ mb: 1.5 }}>
            {group.title && (
              <Typography variant="overline" sx={{ px: 1.5, opacity: 0.65, fontWeight: 700 }}>
                {group.title}
              </Typography>
            )}
            <List disablePadding>
              {group.items.filter(item=>!item.roles||item.roles.includes(user?.role)).map((item) => {
                const selected = location.pathname === item.path;
                return (
                  <ListItemButton
                    key={item.path}
                    selected={selected}
                    onClick={() => go(item.path)}
                    sx={{
                      borderRadius: 1.5,
                      mb: 0.4,
                      color: "inherit",
                      "&.Mui-selected": { bgcolor: "rgba(255,255,255,.12)", boxShadow: theme => `inset 3px 0 0 ${theme.palette.hmi.brand}` },
                      "&.Mui-selected:hover": { bgcolor: "rgba(255,255,255,.16)" },
                      "&:hover": { bgcolor: "rgba(255,255,255,.10)" }
                    }}>
                    <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: selected ? 700 : 500 }} />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex" }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          ml: { md: `${DRAWER_WIDTH}px` },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }
        }}>
        <Toolbar sx={{ minHeight: 64 }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 1, display: { md: "none" } }}>
            <MenuOutlined />
          </IconButton>
          <AdminPanelSettingsOutlined sx={{ mr: 1, display: { xs: "none", sm: "block" } }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>AI Safety Monitoring</Typography>
            
          </Box>
          <ModeSelect />
          <Typography variant="body2" sx={{ mr: 2, ml:1, display: { xs: "none", sm: "block" } }}>
            {user?.display_name || user?.username}
          </Typography>
          <Button color="inherit" variant="outlined" size="small" startIcon={<LogoutOutlined />} onClick={handleLogout}>
            登出
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", border: 0 }
        }}>
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flex: 1, minWidth: 0, pt: "64px" }}>
        <Outlet />
      </Box>
    </Box>
  );
}
