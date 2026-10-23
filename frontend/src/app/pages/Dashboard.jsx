import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import TodayOutlined from "@mui/icons-material/TodayOutlined";

import CameraView from "app/components/CameraView";
import { useCameraDetections } from "app/hooks/camera";
import { useEvents } from "app/hooks/admin";
import {useAvailableCameras} from "app/hooks/availableCameras";
import {FormControl,InputLabel,Select,MenuItem} from "@mui/material";
import { api } from "app/services/api";
import PageHeader, { Page } from "app/components/PageHeader";
import { cameraLabel, eventCode, eventLabel, formatUtcDate } from "./shared";

// Neutral icon; colour only when the number itself is a warning (ISA-101 style).
function StatCard({ title, value, icon, alert = false }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>{title}</Typography>
            <Typography variant="h4" fontWeight={700} mt={0.5} sx={{ fontVariantNumeric: "tabular-nums", color: alert ? "warning.dark" : "text.primary" }}>{value}</Typography>
          </Box>
          <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover", color: alert ? "warning.main" : "text.secondary", display: "grid" }}>{icon}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

// Real totals from the server; the "recent events" list only holds the latest few.
function useEventTotals(intervalMs = 10000) {
  const [totals, setTotals] = useState({ pending: null, today: null });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      try {
        const [pending, today] = await Promise.all([
          api.adminEvents({ limit: 1, reviewStatus: "pending" }),
          api.adminEvents({ limit: 1, start: midnight.toISOString() })
        ]);
        if (alive) setTotals({ pending: pending.total ?? 0, today: today.total ?? 0 });
      } catch { /* keep last values */ }
    };
    void load();
    const timer = window.setInterval(load, intervalMs);
    return () => { alive = false; window.clearInterval(timer); };
  }, [intervalMs]);
  return totals;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const {cameras,selected,setSelected}=useAvailableCameras();
  const { events } = useEvents({ limit: 8 });
  const { detections, people = [], alerts = [], frame } = useCameraDetections(selected);
  const totals = useEventTotals();
  const personCount = people.length || detections.filter((item) => (item.className || "").toLowerCase() === "person").length;

  return (
    <Page>
      <PageHeader title="主管儀表板" />

      <Grid container spacing={2.5} mb={2.5}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard title="畫面中人員" value={personCount} icon={<EngineeringOutlined />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard title="今日事件" value={totals.today ?? "—"} icon={<TodayOutlined />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard title="待改善事件" value={totals.pending ?? "—"} icon={<WarningAmberOutlined />} alert={totals.pending > 0} />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent><FormControl size="small" sx={{minWidth:230,mb:2}}><InputLabel>選擇攝影機</InputLabel><Select label="選擇攝影機" value={selected} onChange={e=>setSelected(e.target.value)}>{cameras.map(c=><MenuItem key={c.camera_id} value={c.camera_id}>{cameraLabel(c.camera_id)}</MenuItem>)}</Select></FormControl>{selected?<CameraView cameraId={selected} detections={detections} alerts={alerts} frame={frame} showHeader={false}/>:<Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>沒有連線中的攝影機</Typography>}</CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">最近事件</Typography>
                <Button size="small" onClick={() => navigate("/supervisor/events")}>全部</Button>
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
                          secondary={`${cameraLabel(event.camera_id)} · ${formatUtcDate(event.start_time)}`}
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
    </Page>
  );
}
