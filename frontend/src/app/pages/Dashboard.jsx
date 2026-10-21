import Box from "@mui/material/Box";
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
import EngineeringOutlined from "@mui/icons-material/EngineeringOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import CameraView from "app/components/CameraView";
import { useCameraDetections } from "app/hooks/camera";
import { useEvents } from "app/hooks/admin";
import {useAvailableCameras} from "app/hooks/availableCameras";
import {FormControl,InputLabel,Select,MenuItem,Alert} from "@mui/material";
import { eventCode, eventLabel, formatUtcDate } from "./shared";

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
  const {cameras,selected,setSelected}=useAvailableCameras();
  const { events } = useEvents({ limit: 8 });
  const { detections, people = [], alerts = [], frame } = useCameraDetections(selected);
  const pendingEvents = events.filter((event) => !event.is_improved);
  const personCount = people.length || detections.filter((item) => (item.className || "").toLowerCase() === "person").length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack mb={3}>
        <Typography variant="h5" fontWeight={700}>主管儀表板</Typography>
      </Stack>

      <Grid container spacing={2.5} mb={2.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatCard title="目前辨識人員" value={personCount} subtitle={`原始辨識物件 ${detections.length} 個`} icon={<EngineeringOutlined />} color="success.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <StatCard title="待改善事件" value={pendingEvents.length} subtitle="尚未由主管確認改善" icon={<WarningAmberOutlined />} color="warning.main" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card variant="outlined">
            <CardContent><FormControl size="small" sx={{minWidth:230,mb:2}}><InputLabel>選擇攝影機</InputLabel><Select label="選擇攝影機" value={selected} onChange={e=>setSelected(e.target.value)}>{cameras.map(c=><MenuItem key={c.camera_id} value={c.camera_id}>{c.name}</MenuItem>)}</Select></FormControl>{selected?<CameraView cameraId={selected} detections={detections} alerts={alerts} frame={frame}/>:<Alert severity="info">沒有已啟用且連線成功的攝影機</Alert>}</CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6" fontWeight={700}>最近異常事件</Typography>
                <Chip size="small" label={`${events.length} 筆`} />
              </Stack>
              <Divider sx={{ my: 1.5 }} />

              {events.length === 0 ? (
                <Box py={6} textAlign="center"><Typography color="text.secondary">目前沒有安全事件</Typography></Box>
              ) : (
                <List disablePadding>
                  {events.slice(0, 7).map((event, index) => (
                    <Box key={event.id || index}>
                      <ListItem disableGutters>
                        <ListItemText
                          primary={`${eventCode(event)} ${eventLabel(event.event_type)}`}
                          secondary={`${event.camera_id} · ${formatUtcDate(event.start_time)}`}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                          secondaryTypographyProps={{ fontSize: 12 }}
                        />
                        <Chip size="small" color={event.is_improved ? "success" : "warning"} label={event.is_improved ? "已改善" : "未改善"} />
                      </ListItem>
                      {index < events.slice(0, 7).length - 1 && <Divider />}
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
