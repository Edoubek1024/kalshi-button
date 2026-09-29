export function formatUsd(value: number | null | undefined, opts?: { signed?: boolean }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = opts?.signed && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCents(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined || Number.isNaN(dollars)) return "—¢";
  return `${Math.round(dollars * 100)}¢`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "2-digit", second: "2-digit" });
}
