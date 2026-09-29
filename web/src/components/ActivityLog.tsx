import type { ActivityLogEntry } from "../types";
import { formatTime } from "../lib/format";

const KIND_STYLES: Record<ActivityLogEntry["kind"], string> = {
  buy: "text-emerald-400",
  sell: "text-sky-400",
  error: "text-red-400",
  info: "text-slate-400",
};

export function ActivityLog({ entries }: { entries: ActivityLogEntry[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-xs uppercase tracking-wide text-slate-500">Activity</h3>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
        {entries.length === 0 && <div className="text-slate-600">No activity yet.</div>}
        {entries.map((e) => (
          <div key={e.id} className="flex gap-2">
            <span className="shrink-0 text-slate-600">{formatTime(e.timestamp)}</span>
            <span className={KIND_STYLES[e.kind]}>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
