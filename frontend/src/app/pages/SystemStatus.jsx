import {useEffect,useState} from "react";
import {api} from "../services/api";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { useCameraDetections } from "app/hooks/camera";
import { useSystemHealth } from "app/hooks/admin";
import { useWhepStatus } from "app/hooks/camera";
import {
  API_BASE_URL,
  DEFAULT_CAMERA_ID,
  DEFAULT_STREAM_NAME,
  WS_BASE_URL,
  cameraWhepUrl
} from "app/services/api";

function statusInfo(status) {
  if (status === "online") return { color: "success", label: "正常" };
  if (status === "connecting") return { color: "warning", label: "連線中" };
  return { color: "error", label: "離線" };
}

function ConnectionRow({ label, status, endpoint, detail }) {
  const info = statusInfo(status);

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      justifyContent="space-between"
      alignItems={{ md: "center" }}
      gap={1.5}
      py={1.75}>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontWeight={700}>{label}</Typography>
        {endpoint && (
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-all" }}>
            {endpoint}
          </Typography>
        )}
        {detail && (
          <Typography variant="caption" color="text.secondary">
            {detail}
          </Typography>
        )}
      </Box>
      <Chip size="small" color={info.color} label={info.label} sx={{ alignSelf: { xs: "flex-start", md: "center" } }} />
    </Stack>
  );
}

function Row({ label, value }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} py={1.5}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ wordBreak: "break-all" }}>{value}</Typography>
    </Stack>
  );
}

export default function SystemStatus() {
  const [metrics,setMetrics]=useState(null);
  useEffect(()=>{let alive=true;const load=()=>api.metrics().then(x=>{if(alive)setMetrics(x)}).catch(()=>{});load();const timer=setInterval(load,5000);return()=>{alive=false;clearInterval(timer)}},[]);
  const { health, error: healthError } = useSystemHealth();
  const {
    connected: wsConnected,
    error: wsError,
    timestamp
  } = useCameraDetections(DEFAULT_CAMERA_ID);

  const whepUrl = cameraWhepUrl(DEFAULT_STREAM_NAME);
  const { status: whepStatus, error: whepError } = useWhepStatus(whepUrl);

  const apiStatus = healthError ? "offline" : health ? "online" : "connecting";
  const workerStatus =
    apiStatus === "connecting"
      ? "connecting"
      : apiStatus === "online" && health?.worker
        ? "online"
        : "offline";
  const wsStatus = wsConnected ? "online" : wsError ? "offline" : "connecting";
  const aiDataAgeSeconds = timestamp ? Math.max(0, Date.now() / 1000 - timestamp) : null;
  const aiDataStatus = !wsConnected
    ? "offline"
    : timestamp == null
      ? "connecting"
      : aiDataAgeSeconds <= 5
        ? "online"
        : "offline";

  const lastAiData = timestamp
    ? `最近資料：${new Date(timestamp * 1000).toLocaleString("zh-TW")}`
    : "尚未收到 AI 辨識資料";

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
      <Stack mb={3}>
        <Typography variant="h5" fontWeight={700}>系統狀態</Typography>
        <Typography variant="body2" color="text.secondary">
          所有服務與串流連線狀態集中顯示於此頁。
        </Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={0.5}>連線狀態</Typography>

          <ConnectionRow
            label="FastAPI Backend"
            status={apiStatus}
            endpoint={API_BASE_URL}
            detail={healthError?.message || "REST API 與系統健康檢查"}
          />
          <Divider />

          <ConnectionRow
            label="YOLO Worker"
            status={workerStatus}
            detail={health?.worker ? "背景辨識執行緒正在運作" : "未偵測到運作中的辨識執行緒"}
          />
          <Divider />

          <ConnectionRow
            label="AI WebSocket"
            status={wsStatus}
            endpoint={`${WS_BASE_URL}/ws/cameras/${DEFAULT_CAMERA_ID}`}
            detail={wsError?.message || "前端與 FastAPI 的即時資料通道"}
          />
          <Divider />

          <ConnectionRow
            label="YOLO 即時資料"
            status={aiDataStatus}
            detail={lastAiData}
          />
          <Divider />

          <ConnectionRow
            label="MediaMTX WebRTC / WHEP"
            status={whepStatus}
            endpoint={whepUrl}
            detail={whepError?.message || "前端即時影像串流"}
          />
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mt: 2.5 }}><CardContent><Typography variant="h6" fontWeight={700} mb={2}>系統效能</Typography><Row label="CPU" value={metrics?.cpu_percent!=null?`${metrics.cpu_percent}%`:'—'}/><Divider/><Row label="記憶體" value={metrics?.memory_percent!=null?`${metrics.memory_percent}%`:'—'}/><Divider/><Row label="GPU" value={metrics?.gpu?.name||'未啟用'}/><Divider/><Row label="GPU 記憶體" value={metrics?.gpu?.allocated_mb!=null?`${metrics.gpu.allocated_mb} MB`:'—'}/><Divider/><Row label="AI FPS" value={metrics?.ai_fps??'—'}/><Divider/><Row label="磁碟剩餘" value={metrics?.disk_free_gb!=null?`${metrics.disk_free_gb} GB`:'—'}/>{metrics?.worker_error&&<Typography color="error.main">{metrics.worker_error}</Typography>}</CardContent></Card>
      <Card variant="outlined" sx={{ mt: 2.5 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={0.5}>目前設定</Typography>
          <Row label="Camera ID" value={DEFAULT_CAMERA_ID} /><Divider />
          <Row label="MediaMTX Stream" value={DEFAULT_STREAM_NAME} /><Divider />
          <Row label="Required PPE" value={(health?.requiredPpe || []).join(", ") || "—"} />
        </CardContent>
      </Card>
    </Box>
  );
}
