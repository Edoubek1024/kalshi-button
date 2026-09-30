import type { FeeParams } from "../kalshi/client";
import { TARGET_CONTRACTS } from "../kalshi/constants";
import type { TeamState } from "../types";
import { estimateTakerFeeDollars, roundTripNetDollars, unrealizedPnlDollars } from "../lib/pnl";
import { formatUsd } from "../lib/format";

interface Props {
  team: TeamState;
  pending: boolean;
  feeParams: FeeParams | null;
  kalshiEnv: "demo" | "prod";
  onScore: () => void;
  onBuyBack: () => void;
}

export function TeamPanel({ team, pending, feeParams, kalshiEnv, onScore, onBuyBack }: Props) {
  const deficit = Math.max(0, TARGET_CONTRACTS - team.contracts);
  const needsBuyBack = deficit > 0;
  const unrealized = unrealizedPnlDollars(team.contracts, team.avgPriceDollars, team.yesBidDollars);

  const buybackFee = feeParams ? estimateTakerFeeDollars(feeParams.feeType, feeParams.feeMultiplier, deficit, team.yesAskDollars) : null;
  const buybackCost = deficit * team.yesAskDollars + (buybackFee ?? 0);

  // Compares like-for-like: the price you sold at vs. today's ask, for the number of
  // contracts you're about to buy back (which may be fewer than the original sale if
  // you've already partially rebuilt the position).
  const roundTrip =
    needsBuyBack && team.lastSalePriceDollars !== null
      ? roundTripNetDollars({
          soldCount: deficit,
          saleAvgPriceDollars: team.lastSalePriceDollars,
          saleFeeDollars: (team.lastSaleFeeDollars ?? 0) * deficit,
          buybackCount: deficit,
          buybackPriceDollars: team.yesAskDollars,
          buybackFeeDollars: buybackFee ?? 0,
        })
      : null;

  return (
    <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold text-white">{team.teamName}</h2>
        <span className="text-sm text-slate-400">
          bid {team.yesBidDollars.toFixed(2)} / ask {team.yesAskDollars.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Shares owned" value={team.contracts.toString()} highlight={needsBuyBack} />
        <Stat label="Avg purchase price" value={team.avgPriceDollars !== null ? formatUsd(team.avgPriceDollars) : "—"} />
        <Stat label="Last sale price" value={team.lastSalePriceDollars !== null ? formatUsd(team.lastSalePriceDollars) : "—"} />
        <Stat
          label="Unrealized P&L"
          value={unrealized !== null ? formatUsd(unrealized, { signed: true }) : "—"}
          tone={unrealized !== null ? (unrealized >= 0 ? "positive" : "negative") : "neutral"}
        />
      </div>

      <button
        onClick={onScore}
        disabled={pending}
        className="rounded-xl bg-emerald-600 py-6 text-2xl font-extrabold uppercase tracking-wide text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Working..." : `Score ${team.teamName}`}
      </button>

      {needsBuyBack && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
          <div className="text-xs uppercase tracking-wide text-amber-400">
            Down {deficit} share{deficit === 1 ? "" : "s"} from target
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
            <div>Buy back cost: {formatUsd(buybackCost)}</div>
            <div>Est. fee: {buybackFee !== null ? formatUsd(buybackFee) : "shown after fill"}</div>
          </div>
          {roundTrip !== null && (
            <div className={`text-sm font-semibold ${roundTrip >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Net vs. sale proceeds: {formatUsd(roundTrip, { signed: true })}
            </div>
          )}
          <button
            onClick={onBuyBack}
            disabled={pending}
            className="rounded-lg bg-amber-500 py-3 font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Working..." : `Buy back to ${TARGET_CONTRACTS} (${kalshiEnv === "prod" ? "real money" : "demo"})`}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
  highlight = false,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  highlight?: boolean;
}) {
  const toneClass = tone === "positive" ? "text-emerald-400" : tone === "negative" ? "text-red-400" : "text-white";
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "border-amber-700 bg-amber-950/20" : "border-slate-800 bg-slate-950/40"}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
