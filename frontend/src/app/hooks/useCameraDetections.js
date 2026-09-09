import { useEffect, useRef, useState } from "react";
import { api, cameraWebSocketUrl } from "app/services/api";

export default function useCameraDetections(cameraId) {
  const [data, setData] = useState({ cameraId, timestamp: null, frame: null, detections: [] });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    let disposed = false;
    let socket;

    api.detections(cameraId)
      .then((snapshot) => {
        if (!disposed && snapshot?.data) setData(snapshot.data);
      })
      .catch(() => {});

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
          setData(JSON.parse(event.data));
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
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [cameraId]);

  return {
    ...data,
    detections: data?.detections || [],
    connected,
    error
  };
}
