import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";

import useSystemHealth from "app/hooks/useSystemHealth";
import { DEFAULT_CAMERA_ID, DEFAULT_STREAM_NAME } from "app/services/api";

export default function Cameras() {
  const { health, error } = useSystemHealth();

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" fontWeight={700}>攝影機管理</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>目前先以環境變數管理 Camera / MediaMTX；後續可再接 SQLite CRUD。</Typography>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText" }}><VideocamOutlined /></Box>
                <Chip size="small" color={!error && health?.worker ? "success" : "default"} label={!error && health?.worker ? "ONLINE" : "OFFLINE"} />
              </Stack>
              <Typography variant="h6" fontWeight={700} mt={2}>{DEFAULT_CAMERA_ID}</Typography>
              <Typography variant="body2" color="text.secondary">MediaMTX stream: {DEFAULT_STREAM_NAME}</Typography>
              <Typography variant="caption" color="text.secondary">AI source 由後端 Camera / MediaMTX RTSP 提供</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
