import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DetectionOverlay from "./DetectionOverlay";
import { cameraWhepUrl, API_BASE_URL, DEFAULT_STREAM_NAME } from "app/services/api";

function waitForIceGathering(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const listener = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", listener);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", listener);
  });
}

function WhepVideo({ url, cameraId, annotated }) {
  const videoRef = useRef(null);
  const [fallback,setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let pc;
    let sessionUrl;
    let timeout = window.setTimeout(()=>{if(!disposed)setFallback(true)},5000);

    async function start() {
      // OpenCV is the only producer of the original camera feed. There is
      // deliberately no publisher for camera01, so avoid its WHEP 404.
      if (!annotated) { setFallback(true); return; }
      if (!url) { setFallback(true); return; }
      try {
        pc = new RTCPeerConnection();
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.ontrack = (event) => {
          if (!disposed && videoRef.current && event.streams[0]) {
            // ontrack may fire before ICE works; only treat connected as healthy.
            videoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onconnectionstatechange = () => {
          if (disposed || !pc) return;
          if (pc.connectionState === "connected") {
            window.clearTimeout(timeout);
            setFallback(false);
          } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
            setFallback(true);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription.sdp
        });
        if (!response.ok) throw new Error(`MediaMTX WHEP ${response.status}`);

        const location = response.headers.get("Location");
        if (location) sessionUrl = new URL(location, url).toString();
        const answerSdp = await response.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch {
        if (!disposed)setFallback(true);
      }
    }

    start();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (pc) pc.close();
      if (sessionUrl) fetch(sessionUrl, { method: "DELETE" }).catch(() => {});
    };
  }, [url, cameraId, annotated]);

  return (
    <Box sx={{ position: "absolute", inset: 0, bgcolor: "#07111f" }}>
      {fallback && <Box component="img" alt="即時畫面" src={`${API_BASE_URL}/api/public/cameras/${cameraId}/${annotated ? "ai.mjpg" : "stream"}`} sx={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",zIndex:1}}/>}
      <Box component="video" ref={videoRef} autoPlay muted playsInline
        sx={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
    </Box>
  );
}

export default function CameraView({
  cameraId = "camera-01",
  streamName,
  detections = [],
  alerts = [],
  frame = null,
  showHeader = true,
  annotated = true
}) {
  streamName = streamName || cameraId.replace(/-/g, "");
  const aspectRatio = frame?.width && frame?.height ? `${frame.width} / ${frame.height}` : "16 / 9";

  return (
    <Box>
      {showHeader && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5} gap={1}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>{cameraId}</Typography>
          <Typography variant="caption" color="text.secondary" whiteSpace="nowrap">
            {detections.length} 個物件
          </Typography>
        </Stack>
      )}
      <Box sx={{ position: "relative", aspectRatio, overflow: "hidden", borderRadius: 2, bgcolor: "#07111f", border: "1px solid", borderColor: "divider" }}>
        <WhepVideo url={cameraWhepUrl(annotated ? `${streamName}_ai` : streamName)} cameraId={cameraId} annotated={annotated} />
      </Box>
    </Box>
  );
}
