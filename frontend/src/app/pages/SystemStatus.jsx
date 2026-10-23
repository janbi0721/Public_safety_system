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
import { cameraLabel } from "./shared";
import {
  API_BASE_URL,
  WS_BASE_URL,
  cameraWhepUrl
} from "app/services/api";

// The backend pushes only the AI-annotated stream of each camera to MediaMTX
// (camera-01 -> camera01_ai, camera-02 -> camera02_ai; see multi_cameras.py).
// The raw "camera01" path never has a publisher, so it must not be probed.
const aiStreamName = (cameraId) => `${cameraId.replace(/-/g, "")}_ai`;

function statusInfo(status) {
  if (status === "online") return { color: "success", label: "正常" };
  if (status === "connecting") return { color: "warning", label: "連線中" };
  if (status === "disabled") return { color: "default", label: "停用" };
  if (status === "camera_offline") return { color: "error", label: "攝影機離線" };
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

// One camera's live checks, run for every enabled camera (also one that has no
// frames yet, so the page shows exactly which link is down). Disabled cameras
// get the same rows marked 停用 without probing (see DisabledCameraRows).
function LiveCameraRows({ cameraId, cameraOnline }) {
  const { connected: wsConnected, error: wsError, timestamp } = useCameraDetections(cameraId);
  const whepUrl = cameraWhepUrl(aiStreamName(cameraId));
  const { status: whepStatus, error: whepError } = useWhepStatus(whepUrl);
  const wsStatus = wsConnected ? "online" : wsError ? "offline" : "connecting";
  const age = timestamp ? Math.max(0, Date.now() / 1000 - timestamp) : null;
  const aiDataStatus = !wsConnected ? "offline" : timestamp == null ? "connecting" : age <= 5 ? "online" : "offline";
  return <>
    <ConnectionRow label="AI WebSocket" status={wsStatus} endpoint={`${WS_BASE_URL}/ws/cameras/${cameraId}`} detail={wsError?.message} />
    <Divider />
    <ConnectionRow label="YOLO 即時資料" status={aiDataStatus}
      detail={timestamp ? `最近資料：${new Date(timestamp * 1000).toLocaleString("zh-TW")}` : "尚未收到 AI 辨識資料"} />
    <Divider />
    <ConnectionRow label="MediaMTX WebRTC / WHEP" status={whepStatus} endpoint={whepUrl}
      detail={!cameraOnline && whepStatus !== "online" ? "攝影機沒有畫面，所以沒有 AI 串流"
        : whepError?.message || (whepStatus === "online" ? "AI 標註影像以 WebRTC 播放" : null)} />
  </>;
}

function DisabledCameraRows({ cameraId }) {
  return <>
    <ConnectionRow label="AI WebSocket" status="disabled" endpoint={`${WS_BASE_URL}/ws/cameras/${cameraId}`} />
    <Divider />
    <ConnectionRow label="YOLO 即時資料" status="disabled" />
    <Divider />
    <ConnectionRow label="MediaMTX WebRTC / WHEP" status="disabled" endpoint={cameraWhepUrl(aiStreamName(cameraId))} />
  </>;
}

function CameraStatus({ camera }) {
  const state = !camera.is_active ? "disabled" : camera.online ? "online" : "camera_offline";
  return <Card variant="outlined" sx={{ mt: 2.5 }}>
    <CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={0.5}>
        <Typography variant="h6" fontWeight={700}>{cameraLabel(camera.camera_id)}</Typography>
        <Chip size="small" color={statusInfo(state).color} label={statusInfo(state).label} />
      </Stack>
      <Typography variant="body2" color="text.secondary">AI 串流 {aiStreamName(camera.camera_id)}</Typography>
      <Box mt={1}>
        {state === "disabled"
          ? <DisabledCameraRows cameraId={camera.camera_id} />
          : <LiveCameraRows cameraId={camera.camera_id} cameraOnline={state === "online"} />}
      </Box>
    </CardContent>
  </Card>;
}

export default function SystemStatus() {
  const [metrics,setMetrics]=useState(null);
  useEffect(()=>{let alive=true;const load=()=>api.metrics().then(x=>{if(alive)setMetrics(x)}).catch(()=>{});load();const timer=setInterval(load,5000);return()=>{alive=false;clearInterval(timer)}},[]);
  // All cameras (enabled or not) from the engineering API; it needs no login.
  const [cameras,setCameras]=useState([]);
  useEffect(()=>{let alive=true;const load=()=>api.engineeringCameras().then(x=>{if(alive)setCameras(x.cameras||[])}).catch(()=>{});load();const timer=setInterval(load,5000);return()=>{alive=false;clearInterval(timer)}},[]);
  // /api/health has no PPE list; the recognition config does.
  const [requiredPpe,setRequiredPpe]=useState([]);
  useEffect(()=>{let alive=true;api.engineering().then(x=>{if(alive)setRequiredPpe(x.required_ppe||[])}).catch(()=>{});return()=>{alive=false}},[]);
  const { health, error: healthError } = useSystemHealth();

  const apiStatus = healthError ? "offline" : health ? "online" : "connecting";
  const workerStatus =
    apiStatus === "connecting"
      ? "connecting"
      : apiStatus === "online" && health?.worker
        ? "online"
        : "offline";

  return (
    <Box sx={{ maxWidth: 1000 }}>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={0.5}>連線狀態</Typography>

          <ConnectionRow
            label="FastAPI Backend"
            status={apiStatus}
            endpoint={API_BASE_URL}
            detail={healthError?.message}
          />
          <Divider />

          <ConnectionRow
            label="YOLO Worker"
            status={workerStatus}
            detail={health?.worker ? null : "未偵測到運作中的辨識執行緒"}
          />
        </CardContent>
      </Card>

      {cameras.map(camera => <CameraStatus key={camera.camera_id} camera={camera} />)}

      <Card variant="outlined" sx={{ mt: 2.5 }}><CardContent><Typography variant="h6" fontWeight={700} mb={2}>系統效能</Typography><Row label="CPU" value={metrics?.cpu_percent!=null?`${metrics.cpu_percent}%`:'—'}/><Divider/><Row label="記憶體" value={metrics?.memory_percent!=null?`${metrics.memory_percent}%`:'—'}/><Divider/><Row label="GPU" value={metrics?.gpu?.name||'未啟用'}/><Divider/><Row label="GPU 記憶體" value={metrics?.gpu?.allocated_mb!=null?`${metrics.gpu.allocated_mb} MB`:'—'}/><Divider/><Row label="AI FPS" value={metrics?.ai_fps??'—'}/><Divider/><Row label="磁碟剩餘" value={metrics?.disk_free_gb!=null?`${metrics.disk_free_gb} GB`:'—'}/>{metrics?.worker_error&&<Typography color="error.main">{metrics.worker_error}</Typography>}</CardContent></Card>
      <Card variant="outlined" sx={{ mt: 2.5 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={0.5}>目前設定</Typography>
          <Row label="AI 串流" value={cameras.map(c => aiStreamName(c.camera_id)).join("、") || "—"} /><Divider />
          <Row label="必檢 PPE" value={requiredPpe.map(p => ({ helmet: "安全帽", respirator: "防毒面具", glove: "手套" })[p] || p).join("、") || "—"} />
        </CardContent>
      </Card>
    </Box>
  );
}
