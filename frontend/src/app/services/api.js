// The frontend runs on both the laptop and other devices on the same LAN.
// A 127.0.0.1 URL baked into Vite points to *the visiting device*, not the laptop.
// Keep explicit remote service hosts, but replace configured loopback hosts with
// the hostname that served this Vite page when accessed across the LAN.
function isLoopback(host) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(String(host || "").toLowerCase());
}

function serviceUrl(configured, protocol, port) {
  const fallback = `${protocol}//${window.location.hostname}:${port}`;
  const raw = (configured || fallback).trim();
  try {
    const parsed = new URL(raw);
    if (isLoopback(parsed.hostname) && !isLoopback(window.location.hostname)) {
      parsed.hostname = window.location.hostname;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

const httpProtocol = window.location.protocol === "https:" ? "https:" : "http:";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
export const API_BASE_URL = serviceUrl(import.meta.env.VITE_API_BASE_URL, httpProtocol, 8000);
export const WS_BASE_URL = serviceUrl(import.meta.env.VITE_WS_BASE_URL, wsProtocol, 8000);
export const DEFAULT_CAMERA_ID = import.meta.env.VITE_CAMERA_ID || "camera-01";
export const DEFAULT_STREAM_NAME = import.meta.env.VITE_MEDIAMTX_STREAM || "camera01";
export const WHEP_BASE_URL = serviceUrl(import.meta.env.VITE_MEDIAMTX_WHEP_BASE, httpProtocol, 8889);

const TOKEN_KEY = "aiSafetySupervisorToken";

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const { auth = false, headers, body, isForm = false, ...rest } = options;
  const token = getStoredToken();
  const finalHeaders = {
    Accept: "application/json",
    ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
    ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers || {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined && !isForm && typeof body !== "string" ? JSON.stringify(body) : body
  });

  if (!response.ok) {
    let detail = `API ${response.status}: ${response.statusText}`;
    try {
      const payload = await response.json();
      if (payload?.detail) detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
    } catch {
      // Keep the HTTP fallback message.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  health: () => request("/api/health"),
  engineeringCameras: () => request("/api/admin/engineering/cameras",{auth:true}),
  updateEngineeringCamera: (id,body) => request(`/api/admin/engineering/cameras/${encodeURIComponent(id)}`,{method:"PATCH",auth:true,body}),

  publicCameras: () => request("/api/public/cameras"),
  detections: (cameraId) =>
    request(`/api/public/cameras/${encodeURIComponent(cameraId)}/detections`),
  alerts: (cameraId) =>
    request(`/api/public/cameras/${encodeURIComponent(cameraId)}/alerts`),

  login: (username, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: { username, password }
    }),
  me: () => request("/api/auth/me", { auth: true }),
  logout: () => request("/api/auth/logout", { method: "POST", auth: true }),

  // start/end are ISO datetimes (end exclusive); the backend compares them in UTC.
  adminEvents: ({ limit = 100, offset = 0, cameraId, isImproved, start, end, eventType, reviewStatus, q } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (cameraId) params.set("camera_id", cameraId);
    if (typeof isImproved === "boolean") params.set("is_improved", String(isImproved));
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (eventType) params.set("event_type", eventType);
    if (reviewStatus) params.set("review_status", reviewStatus);
    if (q && q.trim()) params.set("q", q.trim());
    return request(`/api/admin/events?${params}`, { auth: true });
  },
  adminEvent: (eventId) => request(`/api/admin/events/${eventId}`, { auth: true }),
  adminPeople: ({ limit = 50, offset = 0, cameraId, start, end, q, violatedOnly } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (cameraId) params.set("camera_id", cameraId);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (q && q.trim()) params.set("q", q.trim());
    if (violatedOnly) params.set("violated_only", "true");
    return request(`/api/admin/people?${params}`, { auth: true });
  },
  adminPerson: (sessionId) => request(`/api/admin/people/${sessionId}`, { auth: true }),
  setEventImproved: (eventId, isImproved) =>
    request(`/api/admin/events/${eventId}/improved`, {
      method: "PATCH",
      auth: true,
      body: { is_improved: isImproved }
    }),

  supervisors: () => request("/api/admin/supervisors", { auth: true }),
  createSupervisor: (payload) =>
    request("/api/admin/supervisors", { method: "POST", auth: true, body: payload }),
  updateSupervisor: (id, payload) =>
    request(`/api/admin/supervisors/${id}`, { method: "PATCH", auth: true, body: payload }),
  deleteSupervisor: (id) =>
    request(`/api/admin/supervisors/${id}`, { method: "DELETE", auth: true }),

  adminCameras: () => request("/api/admin/cameras", { auth: true }),
  databaseSchema: () => request("/api/admin/database/schema", { auth: true }),
  analytics: (start,end) => request(`/api/admin/analytics?start=${start}&end=${end}`,{auth:true}),
  metrics: () => request('/api/admin/system/metrics',{auth:true}),
  snapshots: (id) => request(`/api/admin/events/${id}/snapshots`,{auth:true}),
  reviewEvent: (id,status,note='') => request(`/api/admin/events/${id}/review`,{method:'PATCH',auth:true,body:{status,note}}),
  removeSnapshot: (id) => request(`/api/admin/snapshots/${id}`,{method:'DELETE',auth:true}),
  aiConversations: () => request('/api/admin/ai/conversations',{auth:true}),
  aiHistory: (id) => request(`/api/admin/ai/conversations/${id}`,{auth:true}),
  aiChat: (message,conversation_id) => request('/api/admin/ai/chat',{method:'POST',auth:true,body:{message,conversation_id}}),
  aiReports: () => request('/api/admin/ai/reports',{auth:true}),
  aiReport: (start,end) => request('/api/admin/ai/reports',{method:'POST',auth:true,body:{start,end}}),
  engineering: () => request('/api/admin/engineering/config',{auth:true}),
  setEngineering: (data) => request('/api/admin/engineering/config',{method:'PATCH',auth:true,body:data}),
  engineeringEnvironment: () => request('/api/admin/engineering/environment',{auth:true}),
  updateEngineeringEnvironment: (data) => request('/api/admin/engineering/environment',{method:'PATCH',auth:true,body:{changes:data}}),
  publicVoiceSettings: () => request('/api/public/voice-settings'),
  engineeringVoice: () => request('/api/admin/engineering/voice',{auth:true}),
  setEngineeringVoice: (volume) => request('/api/admin/engineering/voice',{method:'PATCH',auth:true,body:{volume}}),
  engineeringBoxColors: () => request('/api/admin/engineering/box-colors',{auth:true}),
  setEngineeringBoxColors: (colors) => request('/api/admin/engineering/box-colors',{method:'PATCH',auth:true,body:{colors}}),
  createTestEvent: (data) => request('/api/admin/engineering/test-events',{method:'POST',auth:true,body:data}),
  listTestEvents: () => request('/api/admin/engineering/test-events',{auth:true}),
  deleteTestEvent: (id) => request(`/api/admin/engineering/test-events/${id}`,{method:'DELETE',auth:true}),
  engineeringDatabaseTables: () => request('/api/admin/engineering/database/tables', { auth: true }),
  engineeringDatabaseList: (table, { limit=30, offset=0, search='' }={}) =>
    request(`/api/admin/engineering/database/${encodeURIComponent(table)}?${new URLSearchParams({limit:String(limit),offset:String(offset),search})}`, { auth: true }),
  engineeringDatabaseCreate: (table, values) =>
    request(`/api/admin/engineering/database/${encodeURIComponent(table)}`, { method: 'POST', auth: true, body: { values } }),
  engineeringDatabaseUpdate: (table, id, values) =>
    request(`/api/admin/engineering/database/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: { values } }),
  engineeringDatabaseDelete: (table, id) =>
    request(`/api/admin/engineering/database/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true, body: { confirmed: true } }),
  backup: () => request('/api/admin/engineering/backup',{method:'POST',auth:true}),
  clearEventData: (confirmText) => request('/api/admin/engineering/clear-events',{method:'POST',auth:true,body:{confirm_text:confirmText}}),
  auditLogs: () => request('/api/admin/engineering/audit',{auth:true})
};

export function cameraWebSocketUrl(cameraId) {
  return `${WS_BASE_URL}/ws/cameras/${encodeURIComponent(cameraId)}`;
}

export function cameraWhepUrl(streamName = DEFAULT_STREAM_NAME) {
  return `${WHEP_BASE_URL}/${encodeURIComponent(streamName)}/whep`;
}


export async function authorizedImage(snapshotId) {
  const response = await fetch(`${API_BASE_URL}/api/admin/snapshots/${snapshotId}/image`,{headers:{Authorization:`Bearer ${getStoredToken()}`}});
  if (!response.ok) throw new Error('截圖無法讀取');
  return URL.createObjectURL(await response.blob());
}
