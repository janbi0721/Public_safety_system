import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import useSystemHealth from "app/hooks/useSystemHealth";
import { API_BASE_URL, DEFAULT_CAMERA_ID, WHEP_BASE_URL, WS_BASE_URL } from "app/services/api";

function Row({ label, value }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} py={1.5}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ wordBreak: "break-all" }}>{value}</Typography>
    </Stack>
  );
}

export default function SystemStatus() {
  const { health, error, refresh } = useSystemHealth();

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>系統狀態</Typography>
          <Typography variant="body2" color="text.secondary">前端目前使用的後端與串流端點</Typography>
        </Box>
        <Chip onClick={refresh} clickable color={!error && health?.worker ? "success" : "error"} label={!error && health?.worker ? "後端正常" : "後端離線"} />
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Row label="FastAPI" value={API_BASE_URL} /><Divider />
          <Row label="WebSocket" value={WS_BASE_URL} /><Divider />
          <Row label="MediaMTX WHEP" value={WHEP_BASE_URL} /><Divider />
          <Row label="Camera ID" value={DEFAULT_CAMERA_ID} /><Divider />
          <Row label="YOLO Worker" value={health?.worker ? "running" : "unknown / stopped"} />
        </CardContent>
      </Card>
    </Box>
  );
}
