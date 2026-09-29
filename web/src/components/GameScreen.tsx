import { useEffect, useState } from "react";
import { getSeriesFeeParams, type FeeParams } from "../kalshi/client";
import type { ActiveGame, ActivityLogEntry } from "../types";
import { TeamPanel } from "./TeamPanel";
import { ActivityLog } from "./ActivityLog";

interface Props {
  game: ActiveGame;
  pending: Record<string, boolean>;
  log: ActivityLogEntry[];
  kalshiEnv: "demo" | "prod";
  onTouchdown: (ticker: string) => void;
  onBuyBack: (ticker: string) => void;
  onEndGame: () => void;
}

export function GameScreen({ game, pending, log, kalshiEnv, onTouchdown, onBuyBack, onEndGame }: Props) {
  const [feeParams, setFeeParams] = useState<FeeParams | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSeriesFeeParams(game.seriesTicker)
      .then((params) => {
        if (!cancelled) setFeeParams(params);
      })
      .catch(() => {
        // Buy-back fee estimate is a nice-to-have; the real fee still shows up after a fill.
      });
    return () => {
      cancelled = true;
    };
  }, [game.seriesTicker]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-white">{game.eventTitle}</h1>
          <p className="text-xs text-slate-500">
            Live trading on <span className={kalshiEnv === "prod" ? "font-semibold text-amber-400" : "font-semibold text-emerald-400"}>{kalshiEnv}</span> — every button press places an order.
          </p>
        </div>
        <button
          onClick={() => {
            if (window.confirm("End this session? This only stops tracking here — it does not sell any open positions.")) {
              onEndGame();
            }
          }}
          className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
        >
          End session
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        {game.teams.map((team) => (
          <TeamPanel
            key={team.ticker}
            team={team}
            pending={!!pending[team.ticker]}
            feeParams={feeParams}
            kalshiEnv={kalshiEnv}
            onTouchdown={() => onTouchdown(team.ticker)}
            onBuyBack={() => onBuyBack(team.ticker)}
          />
        ))}
      </div>

      <ActivityLog entries={log} />
    </div>
  );
}
