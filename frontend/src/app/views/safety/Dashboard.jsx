import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";
import EngineeringOutlined from "@mui/icons-material/EngineeringOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import DnsOutlined from "@mui/icons-material/DnsOutlined";

import CameraPanel from "app/components/safety/CameraPanel";
import useCameraDetections from "app/hooks/useCameraDetections";
import useEvents from "app/hooks/useEvents";
import useSystemHealth from "app/hooks/useSystemHealth";
import { DEFAULT_CAMERA_ID, DEFAULT_STREAM_NAME } from "app/services/api";
import { eventLabel, formatUtcDate } from "./shared";

function StatCard({ title, value, subtitle, icon, color = "primary.main" }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" color="text.secondary">{title}</Typography>
            <Typography variant="h4" fontWeight={700} mt={0.5}>{value}</Typography>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
          <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: "action.hover", color }}>{icon}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { health, error: healthError } = useSystemHealth();
  const { events } = useEvents({ limit: 8 });
  const { detections, connected } = useCameraDetections(DEFAULT_CAMERA_ID);
  const activeEvents = events.filter((event) => event.status === "active");
  const people = detections.filter((item) => ["person", "head"].includes((item.className || "").toLowerCase())).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack mb={3}>
        <Typography variant="h5" fontWeight={700}>工安智慧監控</Typography>
        <Typography variant="body2" color="text.secondary">即時掌握攝影機、AI 辨識與安全事件狀態</Typography>
      </Stack>

      <Grid container spacing={2.5} mb={2.5}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="在線攝影機" value={healthError ? "0" : "1"} subtitle={DEFAULT_CAMERA_ID} icon={<VideocamOutlined />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="目前辨識人員" value={people} subtitle={connected ? "AI WebSocket 已連線" : "等待 AI 資料"} icon={<EngineeringOutlined />} color="success.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="進行中事件" value={activeEvents.length} subtitle="Safety events" icon={<WarningAmberOutlined />} color="warning.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="後端服務" value={health?.worker ? "正常" : "離線"} subtitle="FastAPI / YOLO Worker" icon={<DnsOutlined />} color={health?.worker ? "success.main" : "error.main"} />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <CameraPanel cameraId={DEFAULT_CAMERA_ID} streamName={DEFAULT_STREAM_NAME} minHeight={390} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6" fontWeight={700}>最近事件</Typography>
                <Chip size="small" label={`${events.length} 筆`} />
              </Stack>
              <Divider sx={{ my: 1.5 }} />

              {events.length === 0 ? (
                <Box py={6} textAlign="center">
                  <Typography color="text.secondary">目前沒有安全事件</Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {events.slice(0, 7).map((event, index) => (
                    <Box key={event.id || index}>
                      <ListItem disableGutters>
                        <ListItemText
                          primary={eventLabel(event.event_type)}
                          secondary={`${event.camera_id} · ${formatUtcDate(event.start_time)}`}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                          secondaryTypographyProps={{ fontSize: 12 }}
                        />
                        <Chip size="small" color={event.status === "active" ? "warning" : "default"} label={event.status || "—"} />
                      </ListItem>
                      {index < events.length - 1 && <Divider />}
                    </Box>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
