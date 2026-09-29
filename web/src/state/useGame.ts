import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { KalshiApiError, buyToTarget, fetchPositions, refreshMarkets, sellAll, type ResolveResult } from "../kalshi/client";
import type { ActiveGame, ActivityLogEntry, TeamState } from "../types";

const STORAGE_KEY = "kalshi-button-game-v1";
const TARGET_CONTRACTS = 10;

interface PersistedGame {
  eventTicker: string;
  eventTitle: string;
  seriesTicker: string;
  teams: [{ ticker: string; teamName: string }, { ticker: string; teamName: string }];
}

interface GameReducerState {
  game: ActiveGame | null;
  pending: Record<string, boolean>;
  log: ActivityLogEntry[];
}

type Action =
  | { type: "SET_GAME"; game: ActiveGame }
  | { type: "CLEAR_GAME" }
  | { type: "SET_PENDING"; ticker: string; pending: boolean }
  | { type: "UPDATE_TEAM"; ticker: string; patch: Partial<TeamState> }
  | { type: "LOG"; entry: ActivityLogEntry };

function reducer(state: GameReducerState, action: Action): GameReducerState {
  switch (action.type) {
    case "SET_GAME":
      return { ...state, game: action.game };
    case "CLEAR_GAME":
      return { game: null, pending: {}, log: [] };
    case "SET_PENDING":
      return { ...state, pending: { ...state.pending, [action.ticker]: action.pending } };
    case "UPDATE_TEAM": {
      if (!state.game) return state;
      const teams = state.game.teams.map((t) => (t.ticker === action.ticker ? { ...t, ...action.patch } : t)) as [
        TeamState,
        TeamState
      ];
      return { ...state, game: { ...state.game, teams } };
    }
    case "LOG":
      return { ...state, log: [action.entry, ...state.log].slice(0, 200) };
    default:
      return state;
  }
}

function loadPersisted(): PersistedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedGame;
  } catch {
    return null;
  }
}

function persist(game: ActiveGame | null) {
  try {
    if (!game) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const skeleton: PersistedGame = {
      eventTicker: game.eventTicker,
      eventTitle: game.eventTitle,
      seriesTicker: game.seriesTicker,
      teams: [
        { ticker: game.teams[0].ticker, teamName: game.teams[0].teamName },
        { ticker: game.teams[1].ticker, teamName: game.teams[1].teamName },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skeleton));
  } catch {
    // localStorage unavailable — the game still works, it just won't survive a refresh.
  }
}

function emptyTeam(ticker: string, teamName: string): TeamState {
  return {
    ticker,
    teamName,
    yesBidDollars: 0,
    yesAskDollars: 0,
    contracts: 0,
    avgPriceDollars: null,
    lastSalePriceDollars: null,
    lastSaleFeeDollars: null,
    lastRealizedPnlDollars: null,
    hasScored: false,
  };
}

function makeLog(kind: ActivityLogEntry["kind"], message: string): ActivityLogEntry {
  return { id: crypto.randomUUID(), timestamp: Date.now(), kind, message };
}

export function useGame() {
  const [state, dispatch] = useReducer(reducer, { game: null, pending: {}, log: [] });
  const gameRef = useRef(state.game);
  gameRef.current = state.game;

  // Rehydrate a previously active game skeleton on first load, then refresh live data.
  useEffect(() => {
    const persisted = loadPersisted();
    if (!persisted) return;
    dispatch({
      type: "SET_GAME",
      game: {
        eventTicker: persisted.eventTicker,
        eventTitle: persisted.eventTitle,
        seriesTicker: persisted.seriesTicker,
        teams: [
          emptyTeam(persisted.teams[0].ticker, persisted.teams[0].teamName),
          emptyTeam(persisted.teams[1].ticker, persisted.teams[1].teamName),
        ],
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persist(state.game);
  }, [state.game]);

  const log = useCallback((kind: ActivityLogEntry["kind"], message: string) => {
    dispatch({ type: "LOG", entry: makeLog(kind, message) });
  }, []);

  const refreshPrices = useCallback(async () => {
    const game = gameRef.current;
    if (!game) return;
    try {
      const markets = await refreshMarkets(game.teams.map((t) => t.ticker));
      for (const m of markets) {
        dispatch({
          type: "UPDATE_TEAM",
          ticker: m.ticker,
          patch: { yesBidDollars: Number(m.yesBidDollars), yesAskDollars: Number(m.yesAskDollars) },
        });
      }
    } catch {
      // Silent — price polling failures shouldn't spam the activity log during a live game.
    }
  }, []);

  const refreshPositions = useCallback(async () => {
    const game = gameRef.current;
    if (!game) return;
    try {
      const positions = await fetchPositions(game.eventTicker);
      for (const team of game.teams) {
        const pos = positions.find((p) => p.ticker === team.ticker);
        dispatch({
          type: "UPDATE_TEAM",
          ticker: team.ticker,
          patch: {
            contracts: pos?.contracts ?? 0,
            avgPriceDollars: pos?.avgPriceDollars ?? null,
            lastRealizedPnlDollars: pos?.realizedPnlDollars ?? null,
          },
        });
      }
    } catch {
      // Silent for the same reason as refreshPrices.
    }
  }, []);

  // Poll prices + positions while a game is active. Pauses when the tab is hidden.
  useEffect(() => {
    if (!state.game) return;
    let cancelled = false;
    let priceTimer: ReturnType<typeof setInterval> | undefined;
    let posTimer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (cancelled) return;
      void refreshPrices();
      void refreshPositions();
      priceTimer = setInterval(() => void refreshPrices(), 4000);
      posTimer = setInterval(() => void refreshPositions(), 10000);
    };
    const stop = () => {
      clearInterval(priceTimer);
      clearInterval(posTimer);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state.game?.eventTicker, refreshPrices, refreshPositions]);

  const startGame = useCallback(
    async (resolved: ResolveResult, teamTickers: [string, string]) => {
      const selected = resolved.markets.filter((m) => teamTickers.includes(m.ticker));
      if (selected.length !== 2) throw new Error("Pick exactly two teams to start the game.");

      const teams: [TeamState, TeamState] = [
        emptyTeam(selected[0].ticker, selected[0].teamName),
        emptyTeam(selected[1].ticker, selected[1].teamName),
      ];
      const game: ActiveGame = {
        eventTicker: resolved.eventTicker,
        eventTitle: resolved.eventTitle,
        seriesTicker: resolved.seriesTicker,
        teams,
      };
      dispatch({ type: "SET_GAME", game });
      log("info", `Starting game: ${resolved.eventTitle}`);

      await Promise.all(
        teams.map(async (team) => {
          dispatch({ type: "SET_PENDING", ticker: team.ticker, pending: true });
          try {
            const result = await buyToTarget(team.ticker, TARGET_CONTRACTS);
            if (result.noop) {
              log("info", `${team.teamName}: ${result.message}`);
            } else if (result.fullyFilled) {
              log(
                "buy",
                `Bought ${result.filledCount} ${team.teamName} @ avg ${result.averageFillPriceDollars?.toFixed(2)}`
              );
            } else {
              log(
                "error",
                `${team.teamName}: only filled ${result.filledCount}/${result.requestedCount} contracts. ${result.remainingCount} unfilled.`
              );
            }
            dispatch({
              type: "UPDATE_TEAM",
              ticker: team.ticker,
              patch: {
                contracts: result.contractsAfter,
                avgPriceDollars: result.averageFillPriceDollars ?? null,
              },
            });
          } catch (err) {
            log("error", `${team.teamName}: buy-in failed — ${err instanceof KalshiApiError ? err.message : "unknown error"}`);
          } finally {
            dispatch({ type: "SET_PENDING", ticker: team.ticker, pending: false });
          }
        })
      );

      await refreshPositions();
    },
    [log, refreshPositions]
  );

  const touchdown = useCallback(
    async (scoringTicker: string) => {
      const game = gameRef.current;
      if (!game) return;
      const scoring = game.teams.find((t) => t.ticker === scoringTicker);
      const other = game.teams.find((t) => t.ticker !== scoringTicker);
      if (!scoring || !other) return;

      dispatch({ type: "UPDATE_TEAM", ticker: scoring.ticker, patch: { hasScored: true } });
      dispatch({ type: "SET_PENDING", ticker: scoring.ticker, pending: true });
      dispatch({ type: "SET_PENDING", ticker: other.ticker, pending: true });
      log("info", `Touchdown ${scoring.teamName}! Selling ${other.teamName} position...`);

      try {
        const result = await sellAll(other.ticker);
        if (result.noop) {
          log("info", `${other.teamName}: ${result.message}`);
        } else if (result.fullyFilled) {
          log(
            "sell",
            `Sold ${result.filledCount} ${other.teamName} @ avg ${result.averageFillPriceDollars?.toFixed(2)} (fee ${result.averageFeePaidDollars?.toFixed(2) ?? "0.00"})`
          );
        } else {
          log(
            "error",
            `${other.teamName}: only sold ${result.filledCount}/${result.requestedCount} contracts. ${result.remainingCount} still held — try Sell again.`
          );
        }
        dispatch({
          type: "UPDATE_TEAM",
          ticker: other.ticker,
          patch: {
            contracts: result.contractsAfter,
            lastSalePriceDollars: result.averageFillPriceDollars ?? other.lastSalePriceDollars,
            lastSaleFeeDollars: result.noop ? other.lastSaleFeeDollars : result.averageFeePaidDollars ?? 0,
          },
        });
      } catch (err) {
        log("error", `${other.teamName}: sell failed — ${err instanceof KalshiApiError ? err.message : "unknown error"}`);
      } finally {
        dispatch({ type: "SET_PENDING", ticker: scoring.ticker, pending: false });
        dispatch({ type: "SET_PENDING", ticker: other.ticker, pending: false });
      }

      await refreshPositions();
    },
    [log, refreshPositions]
  );

  const buyBack = useCallback(
    async (ticker: string, targetContracts: number = TARGET_CONTRACTS) => {
      const game = gameRef.current;
      if (!game) return;
      const team = game.teams.find((t) => t.ticker === ticker);
      if (!team) return;

      dispatch({ type: "SET_PENDING", ticker, pending: true });
      try {
        const result = await buyToTarget(ticker, targetContracts);
        if (result.noop) {
          log("info", `${team.teamName}: ${result.message}`);
        } else if (result.fullyFilled) {
          log("buy", `Bought back ${result.filledCount} ${team.teamName} @ avg ${result.averageFillPriceDollars?.toFixed(2)}`);
        } else {
          log(
            "error",
            `${team.teamName}: buy-back only filled ${result.filledCount}/${result.requestedCount}. ${result.remainingCount} unfilled — try again.`
          );
        }
        dispatch({
          type: "UPDATE_TEAM",
          ticker,
          patch: { contracts: result.contractsAfter },
        });
      } catch (err) {
        log("error", `${team.teamName}: buy-back failed — ${err instanceof KalshiApiError ? err.message : "unknown error"}`);
      } finally {
        dispatch({ type: "SET_PENDING", ticker, pending: false });
      }
      await refreshPositions();
    },
    [log, refreshPositions]
  );

  const endGame = useCallback(() => {
    dispatch({ type: "CLEAR_GAME" });
  }, []);

  return useMemo(
    () => ({
      game: state.game,
      pending: state.pending,
      log: state.log,
      startGame,
      touchdown,
      buyBack,
      endGame,
      refreshPrices,
      refreshPositions,
    }),
    [state.game, state.pending, state.log, startGame, touchdown, buyBack, endGame, refreshPrices, refreshPositions]
  );
}
