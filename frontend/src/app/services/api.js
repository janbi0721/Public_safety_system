export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
export const WS_BASE_URL = (
  import.meta.env.VITE_WS_BASE_URL || API_BASE_URL.replace(/^http/, "ws")
).replace(/\/$/, "");

export const DEFAULT_CAMERA_ID = import.meta.env.VITE_CAMERA_ID || "camera-01";
export const DEFAULT_STREAM_NAME = import.meta.env.VITE_MEDIAMTX_STREAM || "camera01";
export const WHEP_BASE_URL = (
  import.meta.env.VITE_MEDIAMTX_WHEP_BASE || "http://127.0.0.1:8889"
).replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  health: () => request("/api/health"),
  events: (limit = 100) => request(`/api/events?limit=${limit}`),
  cameraEvents: (cameraId, limit = 100) =>
    request(`/api/cameras/${encodeURIComponent(cameraId)}/events?limit=${limit}`),
  detections: (cameraId) =>
    request(`/api/cameras/${encodeURIComponent(cameraId)}/detections`)
};

export function cameraWebSocketUrl(cameraId) {
  return `${WS_BASE_URL}/ws/cameras/${encodeURIComponent(cameraId)}`;
}

export function cameraWhepUrl(streamName = DEFAULT_STREAM_NAME) {
  return `${WHEP_BASE_URL}/${encodeURIComponent(streamName)}/whep`;
}
