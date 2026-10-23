import { useEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import { alpha, useTheme } from "@mui/material/styles";
import { Box, Stack, Typography } from "@mui/material";
import EngineeringOutlined from "@mui/icons-material/EngineeringOutlined";
import MasksOutlined from "@mui/icons-material/MasksOutlined";
import BackHandOutlined from "@mui/icons-material/BackHandOutlined";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import RemoveRounded from "@mui/icons-material/RemoveRounded";
import ReportOutlined from "@mui/icons-material/ReportOutlined";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import SignalWifiConnectedNoInternet4Outlined from "@mui/icons-material/SignalWifiConnectedNoInternet4Outlined";

// Colours come from the app theme (ThemeMode.jsx TOKENS) so the worker screen
// follows the same light / dark choice and palette as the rest of the app.
export const useHmi = () => useTheme().palette.hmi;

// Internal PPE keys (see safety_analyzer.ALIASES) and their event types.
const PPE = [
  { key: "helmet", event: "no_helmet", label: "安全帽", Icon: EngineeringOutlined },
  { key: "respirator", event: "no_gas_mask", label: "防毒面具", Icon: MasksOutlined },
  { key: "glove", event: "no_gloves", label: "手套", Icon: BackHandOutlined }
];
const ITEM_NAMES = { no_helmet: "安全帽", no_gas_mask: "防毒面具", no_gloves: "手套", fall_detected: "跌倒" };
const itemName = (alert) => ITEM_NAMES[alert.eventType] || alert.className || "防護裝備";

/** Group open alerts by person: [{ trackId, items: [...alerts], inView }]. */
export function groupAlertsByPerson(alerts = []) {
  const groups = new Map();
  for (const alert of alerts) {
    const key = alert.trackId ?? alert.personId ?? `event-${alert.eventId}`;
    if (!groups.has(key)) groups.set(key, { trackId: alert.trackId ?? alert.personId, items: [], inView: false });
    const group = groups.get(key);
    group.items.push(alert);
    group.inView = group.inView || alert.inView !== false;
  }
  return [...groups.values()];
}

export function describePerson(group) {
  const who = group.trackId != null ? `人員 #${group.trackId}` : "人員";
  const fell = group.items.some(alert => alert.eventType === "fall_detected");
  const missing = group.items.filter(alert => alert.eventType !== "fall_detected").map(itemName);
  const parts = [];
  if (missing.length) parts.push(`未戴好${missing.join("、")}`);
  if (fell) parts.push("疑似跌倒");
  return `${who}：${parts.join("，") || "安全異常"}`;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

let audioContext = null;
function playAlarmTone(volume) {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext = audioContext || new Context();
    if (audioContext.state === "suspended") void audioContext.resume();
    const gain = Math.max(0, Math.min(1, volume / 100)) * 0.25;
    const start = audioContext.currentTime;
    // Two-tone chime (~0.9 s), clearly distinct from speech.
    [0, 0.3, 0.6].forEach((offset, index) => {
      const osc = audioContext.createOscillator();
      const amp = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = index % 2 ? 660 : 880;
      amp.gain.setValueAtTime(gain, start + offset);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.28);
      osc.connect(amp).connect(audioContext.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.3);
    });
  } catch {
    // Audio is a best-effort extra; speech and the visual alarm still work.
  }
}

/**
 * Announce each event exactly once: new events of the same person are merged
 * into one sentence, preceded by a chime, and queued (never cut off).
 */
export function useAlarmVoice({ alerts = [], enabled, connected, volume = 80, cameraId }) {
  const announced = useRef(new Set());
  useEffect(() => { announced.current.clear(); window.speechSynthesis?.cancel(); }, [cameraId]);
  useEffect(() => {
    if (!enabled) window.speechSynthesis?.cancel();
  }, [enabled]);
  useEffect(() => {
    const open = new Set(alerts.map(alert => alert.eventId).filter(id => id != null));
    // Closed events are forgotten, so a later new violation is announced again.
    for (const id of announced.current) if (!open.has(id)) announced.current.delete(id);
    if (!enabled || !connected) return;
    const fresh = alerts.filter(alert => alert.eventId != null && !announced.current.has(alert.eventId));
    if (!fresh.length) return;
    fresh.forEach(alert => announced.current.add(alert.eventId));
    playAlarmTone(volume);
    if (!("speechSynthesis" in window)) return;
    const sentences = groupAlertsByPerson(fresh).map(group => {
      const who = group.trackId != null ? `人員 ${group.trackId} 號` : "現場人員";
      const fell = group.items.some(alert => alert.eventType === "fall_detected");
      const missing = group.items.filter(alert => alert.eventType !== "fall_detected").map(itemName);
      return fell && !missing.length ? `注意，${who}疑似跌倒` : `注意，${who}，請戴好${missing.join("、")}`;
    });
    window.setTimeout(() => {
      for (const text of sentences) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "zh-TW";
        utter.volume = volume / 100;
        window.speechSynthesis.speak(utter);
      }
    }, 950);
  }, [alerts, enabled, connected, volume]);
}

/** Show the alert count in the browser tab title while alerts are open. */
export function useAlarmTitle(count) {
  useEffect(() => {
    const original = document.title.replace(/^⚠ \(\d+\) 安全警告 · /, "");
    document.title = count ? `⚠ (${count}) 安全警告 · ${original}` : original;
    return () => { document.title = original; };
  }, [count]);
}

/**
 * True for `ms` after a not-yet-seen event appears. HMI convention: only a new
 * (unacknowledged) alarm flashes; a standing alarm stays steady red.
 */
export function useNewAlarm(alerts = [], ms = 6000) {
  const seen = useRef(new Set());
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    const ids = alerts.map(alert => alert.eventId).filter(id => id != null);
    const fresh = ids.some(id => !seen.current.has(id));
    seen.current = new Set(ids);
    if (fresh) setUntil(Date.now() + ms);
  }, [alerts, ms]);
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = window.setTimeout(() => tick(value => value + 1), until - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [until]);
  return until > Date.now();
}

// Theme-independent animations: colours are passed in through CSS variables.
const blink = keyframes`
  0%, 49% { background-color: var(--alarm); }
  50%, 100% { background-color: var(--alarm-deep); }
`;
const frameBlink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: .2; }
`;
const motion = (rule) => ({ "@media (prefers-reduced-motion: no-preference)": rule });
const blinkSx = (H) => ({ "--alarm": H.alarm, "--alarm-deep": H.alarmDeep, ...motion({ animation: `${blink} .8s linear infinite` }) });

/** Red outline around the whole viewport while alarmed; blinks only while the alarm is new. */
export function AlarmScreenFrame({ active, flashing }) {
  const H = useHmi();
  if (!active) return null;
  return <Box aria-hidden sx={{
    position: "fixed", inset: 0, zIndex: 1300, pointerEvents: "none",
    boxShadow: `inset 0 0 0 4px ${H.alarm}`,
    ...(flashing ? motion({ animation: `${frameBlink} .8s linear infinite` }) : {})
  }} />;
}

/** Small overlays on the live video: AI FPS and an alarm badge. Always dark (they sit on video). */
export function VideoOverlay({ fps, alarmCount }) {
  const H = useHmi();
  const chip = { display: "inline-flex", alignItems: "center", gap: .75, px: 1.25, py: .5, borderRadius: 1, bgcolor: "rgba(11,15,20,.72)", color: "#E6EAF0", fontSize: 13, fontWeight: 600, backdropFilter: "blur(4px)" };
  return <>
    {fps != null && <Box sx={{ ...chip, position: "absolute", top: 12, right: 12, zIndex: 2, fontVariantNumeric: "tabular-nums", color: "#B6C0CE" }}>AI {Number(fps).toFixed(0)} FPS</Box>}
    {alarmCount > 0 && <Box sx={{ ...chip, position: "absolute", left: 12, bottom: 12, zIndex: 2, bgcolor: H.alarm, color: "#fff", fontSize: 15, px: 1.5, py: .75 }}>
      <ReportOutlined sx={{ fontSize: 20 }} />{alarmCount} 名人員防護不足
    </Box>}
  </>;
}

const tileStyles = (H) => ({
  violation: { bg: H.alarm, fg: "#fff", border: H.alarm, badge: H.alarmDeep, Glyph: CloseRounded, text: "未戴好" },
  normal: { bg: "transparent", fg: H.okText, border: alpha(H.ok, .55), badge: H.surface, Glyph: CheckRounded, text: "已戴好" },
  unknown: { bg: "transparent", fg: H.muted, border: H.border, badge: H.surface, Glyph: RemoveRounded, text: "無法判定" }
});

function PpeTile({ item, status, compact }) {
  const H = useHmi();
  const styles = tileStyles(H);
  const style = styles[status] || styles.unknown;
  const Icon = item.Icon;
  const Glyph = style.Glyph;
  return <Box sx={{ border: "1px solid", borderColor: style.border, bgcolor: style.bg, color: style.fg, borderRadius: 1.5,
    px: 1, py: compact ? .75 : 1.25, display: "flex", flexDirection: "column", alignItems: "center", gap: .25, minWidth: 0 }}>
    <Box sx={{ position: "relative", lineHeight: 0 }}>
      <Icon sx={{ fontSize: compact ? 26 : "clamp(28px, 2.6vw, 40px)" }} />
      <Glyph sx={{ position: "absolute", right: -10, bottom: -4, fontSize: 18, bgcolor: style.badge, borderRadius: "50%", p: "1px" }} />
    </Box>
    <Typography noWrap sx={{ fontSize: compact ? 13 : "clamp(13px, 1vw, 16px)", fontWeight: 700, mt: .5 }}>{item.label}</Typography>
    {!compact && <Typography noWrap sx={{ fontSize: 12, opacity: .9 }}>{style.text}</Typography>}
  </Box>;
}

/**
 * Merge people currently in view (with per-item status) and people who still
 * have open events but are out of view. Violators first.
 */
export function panelPeople(people = [], alerts = []) {
  const groups = groupAlertsByPerson(alerts);
  const byTrack = new Map(groups.map(group => [group.trackId, group]));
  const rows = people.filter(person => person.trackId != null).map(person => {
    const group = byTrack.get(person.trackId);
    const status = Object.fromEntries(PPE.map(item => {
      const open = group?.items.some(alert => alert.eventType === item.event);
      return [item.key, open ? "violation" : (person.ppe?.[item.key]?.status === "normal" ? "normal" : "unknown")];
    }));
    return { trackId: person.trackId, inView: true, status, group };
  });
  for (const group of groups) {
    if (rows.some(row => row.trackId === group.trackId)) continue;
    const status = Object.fromEntries(PPE.map(item => [item.key, group.items.some(a => a.eventType === item.event) ? "violation" : "unknown"]));
    rows.push({ trackId: group.trackId, inView: false, status, group });
  }
  return rows.sort((a, b) => Number(Boolean(b.group)) - Number(Boolean(a.group)) || (a.trackId ?? 0) - (b.trackId ?? 0));
}

function PersonRow({ row }) {
  const H = useHmi();
  const alarmed = Boolean(row.group);
  const seconds = alarmed ? Math.max(...row.group.items.map(item => item.durationSeconds || 0)) : 0;
  return <Box sx={{ border: "1px solid", borderColor: alarmed ? H.alarmBorder : H.border, bgcolor: alarmed ? H.alarmBg : H.raised, borderRadius: 2, p: 1.5,
    borderLeft: `4px solid ${alarmed ? H.alarm : H.ok}` }}>
    <Stack direction="row" alignItems="center" spacing={1.25} mb={1.25}>
      <Box sx={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14,
        bgcolor: alarmed ? H.alarm : alpha(H.ok, .16), color: alarmed ? "#fff" : H.okText }}>#{row.trackId ?? "?"}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontWeight={800} sx={{ fontSize: "clamp(16px, 1.3vw, 20px)", color: H.text }}>人員 {row.trackId ?? ""}</Typography>
        <Typography sx={{ fontSize: 13, color: alarmed ? H.alarmText : H.muted, fontWeight: 600 }}>
          {alarmed ? "防護不足" : "防護已確認"}{row.inView ? "" : "　·　暫時不在畫面"}
        </Typography>
      </Box>
      {alarmed && <Box sx={{ textAlign: "right" }}>
        <Typography sx={{ fontSize: 11, color: H.muted, letterSpacing: ".08em" }}>持續</Typography>
        <Typography sx={{ fontFamily: "Consolas, 'Roboto Mono', monospace", fontWeight: 700, fontSize: "clamp(18px, 1.5vw, 24px)", color: H.text }}>{formatClock(seconds)}</Typography>
      </Box>}
    </Stack>
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
      {PPE.map(item => <PpeTile key={item.key} item={item} status={row.status[item.key]} />)}
    </Box>
  </Box>;
}

/**
 * Right-hand status panel of the worker screen: state header, one PPE
 * checklist per person, and an instruction footer. Fills its parent; only the
 * person list scrolls.
 */
export function WorkerStatusPanel({ alerts = [], people = [], connected, flashing }) {
  const H = useHmi();
  const rows = connected ? panelPeople(people, alerts) : [];
  const alarmed = rows.filter(row => row.group);
  const state = !connected ? "offline" : alarmed.length ? "alarm" : "normal";
  const missing = [...new Set(alarmed.flatMap(row => PPE.filter(item => row.status[item.key] === "violation").map(item => item.label)))];
  const header = {
    offline: { Icon: SignalWifiConnectedNoInternet4Outlined, color: H.warnText, sub: H.warnText, bg: H.warnBg, title: "監控訊號中斷", text: "請通知管理人員" },
    normal: { Icon: VerifiedUserOutlined, color: H.okText, sub: H.muted, bg: H.okBg, title: "現場正常", text: people.length ? `畫面中 ${people.length} 人，未發現防護缺失` : "畫面中目前沒有人員" },
    alarm: { Icon: ReportOutlined, color: "#fff", sub: "rgba(255,255,255,.92)", bg: H.alarm, title: "安全警報", text: `${alarmed.length} 名人員防護不足` }
  }[state];
  return <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", bgcolor: H.surface, border: "1px solid", borderColor: state === "alarm" ? H.alarm : H.border, borderRadius: 2.5, overflow: "hidden" }}>
    <Box role={state === "alarm" ? "alert" : "status"} sx={{ px: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 }, bgcolor: header.bg, color: header.color, display: "flex", alignItems: "center", gap: 1.5,
      borderBottom: "1px solid", borderColor: state === "alarm" ? H.alarm : H.border,
      ...(state === "alarm" && flashing ? blinkSx(H) : {}) }}>
      <header.Icon sx={{ fontSize: "clamp(36px, 3.2vw, 52px)" }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography fontWeight={800} lineHeight={1.15} sx={{ fontSize: "clamp(24px, 2.4vw, 38px)", letterSpacing: ".02em" }}>{header.title}</Typography>
        <Typography sx={{ fontSize: "clamp(14px, 1.1vw, 18px)", color: header.sub, fontWeight: 600 }}>{header.text}</Typography>
      </Box>
    </Box>

    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: { xs: 1.5, md: 2 }, display: "flex", flexDirection: "column", gap: 1.25 }}>
      {rows.map(row => <PersonRow key={String(row.trackId)} row={row} />)}
    </Box>

    {state === "alarm" && <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: "1px solid", borderColor: H.alarmBorder, bgcolor: H.alarmBg }}>
      <Typography sx={{ fontSize: "clamp(14px, 1.15vw, 19px)", fontWeight: 700, color: H.alarmText }}>
        請立即停止作業，戴好{missing.join("、")}後再繼續
      </Typography>
    </Box>}
  </Box>;
}

/** Compact alarm card for the supervisor live view. */
export function AlarmBanner({ alerts = [] }) {
  const H = useHmi();
  const groups = groupAlertsByPerson(alerts);
  const flashing = useNewAlarm(alerts);
  if (!groups.length) return null;
  return <Box role="alert" sx={{ mb: 2, borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: H.alarmBorder, bgcolor: H.alarmBg }}>
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.25, bgcolor: H.alarm, color: "#fff", ...(flashing ? blinkSx(H) : {}) }}>
      <ReportOutlined />
      <Typography fontWeight={800}>安全警報 · {groups.length} 名人員防護不足</Typography>
    </Stack>
    <Stack direction={{ xs: "column", md: "row" }} gap={{ xs: .5, md: 3 }} flexWrap="wrap" sx={{ px: 2, py: 1.25 }}>
      {groups.map(group => <Typography key={String(group.trackId)} fontWeight={600} sx={{ color: H.alarmText }}>
        {describePerson(group)}{group.inView ? "" : "（暫時不在畫面）"}
      </Typography>)}
    </Stack>
  </Box>;
}

/** sx for a video card: steady red outline while alerts are open. */
export function alarmFrameSx(active) {
  return active ? { borderColor: "error.main", borderWidth: 2 } : {};
}
