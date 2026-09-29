import { config } from "../config.js";

const MIN_PRICE = 0.01;
const MAX_PRICE = 0.99;

export function dollarsToCents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}

export function centsToFixedPointDollars(cents: number): string {
  const clamped = Math.max(1, Math.min(99, Math.round(cents)));
  return (clamped / 100).toFixed(2);
}

export function countToFixedPoint(count: number): string {
  return count.toFixed(2);
}

/** Marketable IOC buy price: best ask + slippage buffer, clamped to a valid cent price. */
export function marketableBuyPrice(yesAskDollars: string): string {
  const askCents = dollarsToCents(yesAskDollars);
  const cents = Math.min(99, askCents + config.slippageBufferCents);
  return centsToFixedPointDollars(cents);
}

/** Marketable IOC sell price: best bid - slippage buffer, clamped to a valid cent price. */
export function marketableSellPrice(yesBidDollars: string): string {
  const bidCents = dollarsToCents(yesBidDollars);
  const cents = Math.max(1, bidCents - config.slippageBufferCents);
  return centsToFixedPointDollars(cents);
}

export function clampPriceDollars(dollars: number): number {
  return Math.max(MIN_PRICE, Math.min(MAX_PRICE, dollars));
}

/**
 * Estimated taker fee in dollars for a quadratic-fee series, rounded up to the cent.
 * This is the standard Kalshi taker fee formula: fee = ceil(multiplier * C * P * (1-P)).
 * Every order this app places is IOC (taker), so maker-fee nuances never apply to us.
 * Returns null for "flat" fee series, where we don't have the flat fee table.
 */
export function estimateTakerFeeDollars(
  feeType: "quadratic" | "quadratic_with_maker_fees" | "quadratic_with_combo_maker_fees" | "flat",
  feeMultiplier: number,
  count: number,
  priceDollars: number
): number | null {
  if (feeType === "flat") return null;
  const raw = feeMultiplier * count * priceDollars * (1 - priceDollars);
  return Math.ceil(raw * 100) / 100;
}
