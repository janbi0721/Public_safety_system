import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import VideocamOffOutlined from "@mui/icons-material/VideocamOffOutlined";

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

export default function WhepVideo({ url, onStatusChange }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [message, setMessage] = useState("正在連線 MediaMTX…");

  useEffect(() => {
    let disposed = false;
    let pc;
    let sessionUrl;

    const updateStatus = (next, text) => {
      if (disposed) return;
      setStatus(next);
      setMessage(text || "");
      onStatusChange?.(next);
    };

    async function start() {
      if (!url) {
        updateStatus("offline", "尚未設定 MediaMTX WHEP 位址");
        return;
      }

      try {
        pc = new RTCPeerConnection();
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            updateStatus("online", "");
          }
        };

        pc.onconnectionstatechange = () => {
          if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
            updateStatus("offline", `WebRTC ${pc.connectionState}`);
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
      } catch (err) {
        updateStatus("offline", err.message || "無法連線 MediaMTX");
      }
    }

    start();

    return () => {
      disposed = true;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (pc) pc.close();
      if (sessionUrl) fetch(sessionUrl, { method: "DELETE" }).catch(() => {});
    };
  }, [onStatusChange, url]);

  return (
    <Box sx={{ position: "absolute", inset: 0, bgcolor: "#07111f" }}>
      <Box
        component="video"
        ref={videoRef}
        autoPlay
        muted
        playsInline
        sx={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
      />

      {status !== "online" && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 1.5,
            color: "grey.300",
            bgcolor: "rgba(3,10,20,.82)"
          }}>
          {status === "connecting" ? <CircularProgress size={30} /> : <VideocamOffOutlined />}
          <Typography variant="body2" textAlign="center" px={2}>
            {message}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
