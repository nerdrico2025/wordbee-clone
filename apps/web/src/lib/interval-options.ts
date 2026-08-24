export const INTERVAL_OPTIONS = [
  { value: 10, label: "A cada 10 min" },
  { value: 15, label: "A cada 15 min" },
  { value: 20, label: "A cada 20 min" },
  { value: 30, label: "A cada 30 min" },
  { value: 45, label: "A cada 45 min" },
  { value: 60, label: "A cada 1h" },
  { value: 120, label: "A cada 2h" },
  { value: 180, label: "A cada 3h" },
  { value: 360, label: "A cada 6h" },
  { value: 720, label: "A cada 12h" },
  { value: 1440, label: "1x por dia (24h)" },
] as const;

export function formatInterval(minutes: number): string {
  const found = INTERVAL_OPTIONS.find((o) => o.value === minutes);
  if (found) return found.label.replace("A cada ", "");
  return `${minutes} min`;
}
