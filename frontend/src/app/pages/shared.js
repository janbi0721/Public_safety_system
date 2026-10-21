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
