import { useEffect, useRef, useState } from "react";
import { api, cameraWebSocketUrl } from "app/services/api";


export function useCameraDetections(cameraId) {
  const [data, setData] = useState({ cameraId, timestamp: null, frame: null, detections: [] });
  const [connected, setConnected] = useState(false);
  const [stale,setStale] = useState(true);
  const [error, setError] = useState(null);
  const reconnectTimer = useRef(null);
  const lastMessageAt=useRef(0);

  useEffect(() => {
    let disposed = false;
    let socket;

    setConnected(false);setData({cameraId,timestamp:null,detections:[],alerts:[]});lastMessageAt.current=0;
    if (!cameraId) { setConnected(false); setData({cameraId:"",timestamp:null,detections:[],alerts:[]}); return; }
    api.detections(cameraId)
      .then((snapshot) => {
        if (!disposed && snapshot?.data) setData(snapshot.data);
      })
      .catch(() => {});

    const watch=setInterval(()=>setStale(lastMessageAt.current===0||Date.now()-lastMessageAt.current>10000),1000);
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(cameraWebSocketUrl(cameraId));

      socket.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setError(null);
      };

      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          setData(JSON.parse(event.data));lastMessageAt.current=Date.now();setStale(false);
        } catch (err) {
          setError(err);
        }
      };

      socket.onerror = () => {
        if (!disposed) setError(new Error("WebSocket 連線失敗"));
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        reconnectTimer.current = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearInterval(watch);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [cameraId]);

  return {
    ...data,
    detections: data?.detections || [],
    connected:connected&&!stale,
    error
  };
}



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

export function useWhepStatus(url, retryMs = 5000) {
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);

  useEffect(() => {
    let disposed = false;
    let pc = null;
    let sessionUrl = null;
    let retryTimer = null;
    let connectTimeout = null;

    const clearConnection = () => {
      if (connectTimeout) {
        window.clearTimeout(connectTimeout);
        connectTimeout = null;
      }

      if (pc) {
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
        pc = null;
      }

      if (sessionUrl) {
        fetch(sessionUrl, { method: "DELETE" }).catch(() => {});
        sessionUrl = null;
      }
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;

      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        clearConnection();
        start();
      }, retryMs);
    };

    const setOffline = (message) => {
      if (disposed) return;
      setStatus("offline");
      setError(new Error(message || "MediaMTX WebRTC 連線失敗"));
      scheduleRetry();
    };

    async function start() {
      if (disposed) return;

      if (!url) {
        setOffline("尚未設定 MediaMTX WHEP 位址");
        return;
      }

      setStatus("connecting");
      setError(null);

      try {
        pc = new RTCPeerConnection();
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = () => {
          if (disposed) return;
          if (connectTimeout) {
            window.clearTimeout(connectTimeout);
            connectTimeout = null;
          }
          setStatus("online");
          setError(null);
        };

        pc.onconnectionstatechange = () => {
          if (disposed || !pc) return;

          if (pc.connectionState === "connected") {
            if (connectTimeout) {
              window.clearTimeout(connectTimeout);
              connectTimeout = null;
            }
            setStatus("online");
            setError(null);
            return;
          }

          if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
            setOffline(`WebRTC ${pc.connectionState}`);
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

        if (!response.ok) {
          throw new Error(`MediaMTX WHEP ${response.status}`);
        }

        const location = response.headers.get("Location");
        if (location) sessionUrl = new URL(location, url).toString();

        const answerSdp = await response.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        connectTimeout = window.setTimeout(() => {
          if (!disposed && pc?.connectionState !== "connected") {
            setOffline("MediaMTX WebRTC 連線逾時");
          }
        }, 8000);
      } catch (err) {
        setOffline(err.message || "無法連線 MediaMTX");
      }
    }

    start();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      clearConnection();
    };
  }, [retryMs, url]);

  return { status, error };
}
