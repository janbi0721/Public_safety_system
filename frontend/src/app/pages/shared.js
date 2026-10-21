export function formatUtcDate(value) {
  if (!value) return "—";
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${String(value).replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

// Date-time-serial number (e.g. 20261021-143025-001); falls back to the internal ID.
export function eventCode(event) {
  return event?.event_code || (event?.id != null ? `#${event.id}` : "—");
}

export const PPE_LABELS = { helmet: "安全帽", respirator: "防毒面具", glove: "手套" };

export function personEndLabel(reason) {
  const labels = { left_camera: "離開鏡頭", system_stopped: "系統關閉", system_restart: "系統重新啟動" };
  return labels[reason] || reason || "—";
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h} 小時 ${m} 分`;
  if (m) return `${m} 分 ${r} 秒`;
  return `${r} 秒`;
}

export function closeReasonLabel(reason) {
  const labels = {
    recovered: "已改正配戴",
    left_camera: "人員離開鏡頭",
    tracking_lost: "追蹤中斷（舊版規則）",
    unknown: "無法判定（舊版規則）",
    test_finished: "手動結束"
  };
  return labels[reason] || reason || "—";
}

export function eventLabel(type) {
  const labels = {
    no_helmet: "未配戴安全帽",
    no_mask: "未配戴防毒面具",
    no_gas_mask: "未配戴防毒面具",
    no_glove: "未配戴防護手套",
    no_gloves: "未配戴防護手套",
    no_safety_vest: "未配戴安全背心",
    fall_detected: "人員跌倒"
  };
  return labels[type] || type || "未知事件";
}
