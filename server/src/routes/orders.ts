import { Router } from "express";
import crypto from "node:crypto";
import { kalshi } from "../kalshi/client.js";
import { withOrderLock, OrderInFlightError } from "../lib/orderLock.js";
import { marketableBuyPrice, marketableSellPrice, countToFixedPoint } from "../lib/pricing.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import type { MarketPosition } from "../kalshi/types.js";

export const ordersRouter = Router();

function currentContracts(positions: MarketPosition[], ticker: string): number {
  const match = positions.find((p) => p.ticker === ticker);
  if (!match) return 0;
  return Math.max(0, Number(match.position_fp));
}

export interface OrderResultView {
  orderId: string;
  ticker: string;
  side: "bid" | "ask";
  requestedCount: number;
  filledCount: number;
  remainingCount: number;
  averageFillPriceDollars: number | null;
  averageFeePaidDollars: number | null;
  contractsAfter: number;
  fullyFilled: boolean;
}

async function fetchContracts(ticker: string): Promise<number> {
  const posRes = await kalshi.getPositionByTicker(ticker);
  return currentContracts(posRes.market_positions, ticker);
}

/** Buys enough contracts to bring the position up to targetContracts. Idempotent no-op if already there. */
ordersRouter.post("/orders/buy-to-target", asyncHandler(async (req, res) => {
  const { ticker, targetContracts } = req.body ?? {};
  if (typeof ticker !== "string" || !ticker || typeof targetContracts !== "number" || targetContracts <= 0) {
    res.status(400).json({ error: "Provide 'ticker' (string) and 'targetContracts' (positive number)." });
    return;
  }

  try {
    await withOrderLock(ticker, async () => {
      const before = await fetchContracts(ticker);
      const deficit = targetContracts - before;

      if (deficit <= 0) {
        res.json({
          noop: true,
          message: `Already holding ${before} contracts of ${ticker}, no purchase needed.`,
          contractsAfter: before,
        });
        return;
      }

      const marketRes = await kalshi.getMarket(ticker);
      const price = marketableBuyPrice(marketRes.market.yes_ask_dollars);
      const clientOrderId = crypto.randomUUID();

      const order = await kalshi.createOrder({
        ticker,
        client_order_id: clientOrderId,
        side: "bid",
        count: countToFixedPoint(deficit),
        price,
        time_in_force: "immediate_or_cancel",
        self_trade_prevention_type: "taker_at_cross",
      });

      const after = await fetchContracts(ticker);
      const fillCount = Number(order.fill_count);

      const view: OrderResultView = {
        orderId: order.order_id,
        ticker,
        side: "bid",
        requestedCount: deficit,
        filledCount: fillCount,
        remainingCount: Number(order.remaining_count),
        averageFillPriceDollars: order.average_fill_price ? Number(order.average_fill_price) : null,
        averageFeePaidDollars: order.average_fee_paid ? Number(order.average_fee_paid) : null,
        contractsAfter: after,
        fullyFilled: fillCount >= deficit,
      };
      res.json({ noop: false, ...view });
    });
  } catch (err) {
    if (err instanceof OrderInFlightError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

/** Sells the entire current position for a ticker. No-op if there's nothing to sell. */
ordersRouter.post("/orders/sell-all", asyncHandler(async (req, res) => {
  const { ticker } = req.body ?? {};
  if (typeof ticker !== "string" || !ticker) {
    res.status(400).json({ error: "Provide 'ticker' (string)." });
    return;
  }

  try {
    await withOrderLock(ticker, async () => {
      const before = await fetchContracts(ticker);

      if (before <= 0) {
        res.json({
          noop: true,
          message: `No open position in ${ticker} to sell.`,
          contractsAfter: 0,
        });
        return;
      }

      const marketRes = await kalshi.getMarket(ticker);
      const price = marketableSellPrice(marketRes.market.yes_bid_dollars);
      const clientOrderId = crypto.randomUUID();

      const order = await kalshi.createOrder({
        ticker,
        client_order_id: clientOrderId,
        side: "ask",
        count: countToFixedPoint(before),
        price,
        time_in_force: "immediate_or_cancel",
        self_trade_prevention_type: "taker_at_cross",
      });

      const after = await fetchContracts(ticker);
      const fillCount = Number(order.fill_count);

      const view: OrderResultView = {
        orderId: order.order_id,
        ticker,
        side: "ask",
        requestedCount: before,
        filledCount: fillCount,
        remainingCount: Number(order.remaining_count),
        averageFillPriceDollars: order.average_fill_price ? Number(order.average_fill_price) : null,
        averageFeePaidDollars: order.average_fee_paid ? Number(order.average_fee_paid) : null,
        contractsAfter: after,
        fullyFilled: fillCount >= before,
      };
      res.json({ noop: false, ...view });
    });
  } catch (err) {
    if (err instanceof OrderInFlightError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

/** Fee parameters for a series, so the frontend can estimate taker fees locally without polling this endpoint. */
ordersRouter.get("/series/:seriesTicker/fee-params", asyncHandler(async (req, res) => {
  const { seriesTicker } = req.params;
  if (!seriesTicker) {
    res.status(400).json({ error: "Missing seriesTicker." });
    return;
  }
  const seriesRes = await kalshi.getSeries(seriesTicker);
  res.json({ feeType: seriesRes.series.fee_type, feeMultiplier: seriesRes.series.fee_multiplier });
}));
