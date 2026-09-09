import { memo } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import styled from "@mui/material/styles/styled";
import useTheme from "@mui/material/styles/useTheme";
import useMediaQuery from "@mui/material/useMediaQuery";
import Menu from "@mui/icons-material/Menu";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";

import useSettings from "app/hooks/useSettings";
import useSystemHealth from "app/hooks/useSystemHealth";
import { themeShadows } from "app/components/MatxTheme/themeColors";
import { topBarHeight } from "app/utils/constant";

const StyledIconButton = styled(IconButton)(({ theme }) => ({ color: theme.palette.text.primary }));
const TopbarRoot = styled("div")({ top: 0, zIndex: 96, height: topBarHeight, boxShadow: themeShadows[4], transition: "all 0.3s ease" });
const TopbarContainer = styled("div")(({ theme }) => ({
  padding: "8px 20px 8px 18px",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: theme.palette.primary.main
}));

const Layout1Topbar = () => {
  const theme = useTheme();
  const { settings, updateSettings } = useSettings();
  const isMdScreen = useMediaQuery(theme.breakpoints.down("md"));
  const { health, error } = useSystemHealth(5000);

  const handleSidebarToggle = () => {
    const mode = isMdScreen
      ? settings.layout1Settings.leftSidebar.mode === "close" ? "mobile" : "close"
      : settings.layout1Settings.leftSidebar.mode === "full" ? "close" : "full";
    updateSettings({ layout1Settings: { leftSidebar: { mode } } });
  };

  const online = !error && health?.worker;

  return (
    <TopbarRoot>
      <TopbarContainer>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <StyledIconButton onClick={handleSidebarToggle}><Menu /></StyledIconButton>
          <ShieldOutlined sx={{ color: "text.secondary", display: { xs: "none", sm: "block" } }} />
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <Typography variant="subtitle2" fontWeight={700}>AI Safety Monitoring</Typography>
            <Typography variant="caption" color="text.secondary">智慧工安辨識系統</Typography>
          </Box>
        </Stack>

        <Chip size="small" color={online ? "success" : "default"} label={online ? "YOLO Worker Online" : "Backend Offline"} />
      </TopbarContainer>
    </TopbarRoot>
  );
};

export default memo(Layout1Topbar);
