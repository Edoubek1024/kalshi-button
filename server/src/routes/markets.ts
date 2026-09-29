import { Router } from "express";
import { kalshi } from "../kalshi/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import type { ResolvedMarket } from "./resolve.js";

export const marketsRouter = Router();

marketsRouter.get("/markets", asyncHandler(async (req, res) => {
  const tickersParam = req.query.tickers;
  if (typeof tickersParam !== "string" || !tickersParam.trim()) {
    res.status(400).json({ error: "Provide a comma-separated 'tickers' query param." });
    return;
  }
  const tickers = tickersParam.split(",").map((t) => t.trim()).filter(Boolean);

  const result = await kalshi.getMarkets(tickers);
  const markets: ResolvedMarket[] = result.markets.map((m) => ({
    ticker: m.ticker,
    teamName: m.yes_sub_title || m.ticker,
    yesBidDollars: m.yes_bid_dollars,
    yesAskDollars: m.yes_ask_dollars,
    status: m.status,
  }));
  res.json({ markets });
}));
