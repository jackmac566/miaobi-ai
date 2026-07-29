export function usageDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function chinaDayStart(date = new Date()) {
  const [year, month, day] = usageDateKey(date).split("-").map(Number);
  return Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
}
