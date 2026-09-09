import { useCallback, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Sensors from "@mui/icons-material/Sensors";

import DetectionOverlay from "./DetectionOverlay";
import StatusDot from "./StatusDot";
import WhepVideo from "./WhepVideo";
import useCameraDetections from "app/hooks/useCameraDetections";
import { cameraWhepUrl } from "app/services/api";

export default function CameraPanel({ cameraId = "camera-01", streamName = "camera01" }) {
  const { detections, connected, frame } = useCameraDetections(cameraId);
  const aspectRatio = frame?.width && frame?.height ? `${frame.width} / ${frame.height}` : "16 / 9";
  const [videoStatus, setVideoStatus] = useState("connecting");
  const handleVideoStatus = useCallback((status) => setVideoStatus(status), []);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <StatusDot online={videoStatus === "online"} />
          <Typography variant="subtitle1" fontWeight={600}>
            {cameraId}
          </Typography>
          <Chip size="small" icon={<Sensors />} label={connected ? "AI 即時" : "AI 離線"} color={connected ? "success" : "default"} />
        </Stack>

        <Typography variant="caption" color="text.secondary">
          {detections.length} 個偵測物件
        </Typography>
      </Stack>

      <Box
        sx={{
          position: "relative",
          aspectRatio,
          overflow: "hidden",
          borderRadius: 2,
          bgcolor: "#07111f",
          border: "1px solid",
          borderColor: "divider"
        }}>
        <WhepVideo url={cameraWhepUrl(streamName)} onStatusChange={handleVideoStatus} />
        <DetectionOverlay detections={detections} />
      </Box>
    </Box>
  );
}
