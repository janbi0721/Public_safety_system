import Box from "@mui/material/Box";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import styled from "@mui/material/styles/styled";

import { Span } from "./Typography";
import useSettings from "app/hooks/useSettings";

const BrandRoot = styled("div")(() => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px 18px 20px 24px"
}));

const StyledSpan = styled(Span)(({ mode }) => ({
  fontSize: 16,
  fontWeight: 700,
  marginLeft: ".65rem",
  letterSpacing: ".02em",
  display: mode === "compact" ? "none" : "block",
  whiteSpace: "nowrap"
}));

export default function Brand({ children }) {
  const { settings } = useSettings();
  const { mode } = settings.layout1Settings.leftSidebar;

  return (
    <BrandRoot>
      <Box display="flex" alignItems="center">
        <SecurityOutlined fontSize="small" />
        <StyledSpan mode={mode} className="sidenavHoverShow">AI 工安監控</StyledSpan>
      </Box>
      <Box className="sidenavHoverShow" sx={{ display: mode === "compact" ? "none" : "block" }}>
        {children || null}
      </Box>
    </BrandRoot>
  );
}
