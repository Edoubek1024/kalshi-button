import { useState } from "react";
import { ApiError, resolveMarket } from "../api/client";
import type { ResolveResponse } from "../types";

interface Props {
  onConfirm: (resolved: ResolveResponse, teamTickers: [string, string]) => Promise<void>;
}

export function SetupScreen({ onConfirm }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResolved(null);
    setLoading(true);
    try {
      const res = await resolveMarket(url);
      setResolved(res);
      setSelected(res.markets.slice(0, 2).map((m) => m.ticker));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong resolving that URL.");
    } finally {
      setLoading(false);
    }
  }

  function toggleTeam(ticker: string) {
    setSelected((prev) => {
      if (prev.includes(ticker)) return prev.filter((t) => t !== ticker);
      if (prev.length >= 2) return [prev[1], ticker];
      return [...prev, ticker];
    });
  }

  async function handleStart() {
    if (!resolved || selected.length !== 2) return;
    const names = resolved.markets.filter((m) => selected.includes(m.ticker)).map((m) => m.teamName);
    if (!window.confirm(`Buy 10 real-money shares of each: ${names.join(" and ")}?\n\nThis places live orders on your Kalshi account.`)) {
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await onConfirm(resolved, [selected[0], selected[1]]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the game.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Kalshi Touchdown Button</h1>
        <p className="mt-1 text-sm text-slate-400">
          Paste a Kalshi football game market URL to start. This places <span className="font-semibold text-amber-400">real orders</span> with real money.
        </p>
      </div>

      <form onSubmit={handleResolve} className="flex flex-col gap-3">
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          placeholder="https://kalshi.com/markets/kxnflgame/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Looking up market..." : "Find market"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {resolved && (
        <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Event</div>
            <div className="text-lg font-semibold text-white">{resolved.eventTitle}</div>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
              {resolved.markets.length > 2 ? "Pick the two teams" : "Teams"}
            </div>
            <div className="flex flex-col gap-2">
              {resolved.markets.map((m) => (
                <label
                  key={m.ticker}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition ${
                    selected.includes(m.ticker)
                      ? "border-emerald-500 bg-emerald-950/40"
                      : "border-slate-700 bg-slate-950/40"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(m.ticker)}
                      onChange={() => toggleTeam(m.ticker)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    <span className="font-medium text-white">{m.teamName}</span>
                  </span>
                  <span className="text-sm text-slate-400">
                    bid {m.yesBidDollars} / ask {m.yesAskDollars}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={selected.length !== 2 || starting}
            className="rounded-lg bg-amber-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? "Placing opening orders..." : "Start game — buy 10 shares each team (real money)"}
          </button>
        </div>
      )}
    </div>
  );
}
