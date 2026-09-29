/**
 * Net cash flow of a sell -> buy-back round trip on the same team.
 * Positive means buying back now would leave you ahead of where you were
 * right after the sale; negative means the price hasn't fallen enough yet
 * to justify rebuilding the position (fees included).
 */
export function roundTripNetDollars(params: {
  soldCount: number;
  saleAvgPriceDollars: number;
  saleFeeDollars: number;
  buybackCount: number;
  buybackPriceDollars: number;
  buybackFeeDollars: number;
}): number {
  const proceeds = params.soldCount * params.saleAvgPriceDollars - params.saleFeeDollars;
  const cost = params.buybackCount * params.buybackPriceDollars + params.buybackFeeDollars;
  return proceeds - cost;
}

/** Unrealized P&L on a currently-held position, marked to the current bid (what you'd get selling now), before exit fees. */
export function unrealizedPnlDollars(contracts: number, avgPriceDollars: number | null, currentBidDollars: number): number | null {
  if (avgPriceDollars === null || contracts <= 0) return null;
  return (currentBidDollars - avgPriceDollars) * contracts;
}

/**
 * Standard Kalshi taker fee formula: fee = ceil(multiplier * C * P * (1-P)), rounded up to the cent.
 * All orders this app places are IOC (taker), so this applies regardless of maker-fee series variants.
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
