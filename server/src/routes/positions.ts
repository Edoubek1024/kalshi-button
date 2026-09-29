import { Router } from "express";
import { kalshi } from "../kalshi/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const positionsRouter = Router();

export interface PositionView {
  ticker: string;
  contracts: number; // always >= 0; this app only ever holds YES contracts
  avgPriceDollars: number | null; // cost basis per contract for the currently open position
  realizedPnlDollars: number;
  feesPaidDollars: number;
}

positionsRouter.get("/positions", asyncHandler(async (req, res) => {
  const eventTicker = req.query.eventTicker;
  if (typeof eventTicker !== "string" || !eventTicker.trim()) {
    res.status(400).json({ error: "Provide an 'eventTicker' query param." });
    return;
  }

  const result = await kalshi.getPositionsByEvent(eventTicker);
  const positions: PositionView[] = result.market_positions.map((p) => {
    const positionFp = Number(p.position_fp);
    const exposure = Number(p.market_exposure_dollars);
    const contracts = Math.max(0, positionFp); // negative position_fp means NO contracts, which this app never holds
    return {
      ticker: p.ticker,
      contracts,
      avgPriceDollars: contracts > 0 ? exposure / contracts : null,
      realizedPnlDollars: Number(p.realized_pnl_dollars),
      feesPaidDollars: Number(p.fees_paid_dollars),
    };
  });

  res.json({ positions });
}));
