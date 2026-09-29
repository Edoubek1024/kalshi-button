import { Router } from "express";
import { kalshi, KalshiApiError } from "../kalshi/client.js";
import { extractTickerCandidates } from "../lib/parseKalshiUrl.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import type { KalshiEventData, KalshiMarket } from "../kalshi/types.js";

export const resolveRouter = Router();

export interface ResolvedMarket {
  ticker: string;
  teamName: string;
  yesBidDollars: string;
  yesAskDollars: string;
  status: string;
}

export interface ResolveResponse {
  eventTicker: string;
  eventTitle: string;
  seriesTicker: string;
  markets: ResolvedMarket[];
}

function toResolvedMarket(m: KalshiMarket): ResolvedMarket {
  return {
    ticker: m.ticker,
    teamName: m.yes_sub_title || m.ticker,
    yesBidDollars: m.yes_bid_dollars,
    yesAskDollars: m.yes_ask_dollars,
    status: m.status,
  };
}

async function tryResolveAsEvent(candidate: string): Promise<{ event: KalshiEventData; markets: KalshiMarket[] } | null> {
  try {
    const res = await kalshi.getEvent(candidate);
    const markets = res.event.markets ?? res.markets ?? [];
    return { event: res.event, markets };
  } catch (err) {
    if (err instanceof KalshiApiError && err.status === 404) return null;
    throw err;
  }
}

async function tryResolveAsMarket(candidate: string): Promise<{ event: KalshiEventData; markets: KalshiMarket[] } | null> {
  try {
    const marketRes = await kalshi.getMarket(candidate);
    const eventRes = await kalshi.getEvent(marketRes.market.event_ticker);
    const markets = eventRes.event.markets ?? eventRes.markets ?? [];
    return { event: eventRes.event, markets };
  } catch (err) {
    if (err instanceof KalshiApiError && err.status === 404) return null;
    throw err;
  }
}

resolveRouter.post("/resolve", asyncHandler(async (req, res) => {
  const input = req.body?.url;
  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ error: "Provide a Kalshi market/event URL or ticker in the 'url' field." });
    return;
  }

  const candidates = extractTickerCandidates(input);
  if (candidates.length === 0) {
    res.status(400).json({
      error: "Couldn't find anything ticker-shaped in that URL. Paste the market/event page URL, or the ticker itself.",
    });
    return;
  }

  for (const candidate of candidates) {
    const asEvent = await tryResolveAsEvent(candidate);
    const found = asEvent ?? (await tryResolveAsMarket(candidate));
    if (!found) continue;

    const binaryOpenMarkets = found.markets.filter((m) => m.market_type === "binary");
    if (binaryOpenMarkets.length < 2) {
      res.status(422).json({
        error: `Found event "${found.event.title}" but it doesn't have two binary markets to trade against each other.`,
      });
      return;
    }

    const payload: ResolveResponse = {
      eventTicker: found.event.event_ticker,
      eventTitle: found.event.title,
      seriesTicker: found.event.series_ticker,
      markets: binaryOpenMarkets.map(toResolvedMarket),
    };
    res.json(payload);
    return;
  }

  res.status(404).json({
    error:
      "Couldn't find that market or event on Kalshi. Double-check the URL, or make sure it's a game you have access to (demo vs. production).",
  });
}));
