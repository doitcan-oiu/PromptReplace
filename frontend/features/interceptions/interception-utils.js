export function formatTime(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "—";
}

export function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("zh-CN") : "—";
}

export function pageItems(current, total) {
  const pages = [...new Set([1, total, current - 1, current, current + 1])].filter(value => value >= 1 && value <= total).sort((a, b) => a - b);
  return pages.flatMap((value, index) => index && value - pages[index - 1] > 1 ? [`gap-${value}`, value] : [value]);
}
