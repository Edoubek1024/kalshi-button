const DEFAULT_SLIPPAGE_BUFFER_CENTS = 2;

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
export function marketableBuyPrice(yesAskDollars: string, slippageBufferCents = DEFAULT_SLIPPAGE_BUFFER_CENTS): string {
  const askCents = dollarsToCents(yesAskDollars);
  const cents = Math.min(99, askCents + slippageBufferCents);
  return centsToFixedPointDollars(cents);
}

/** Marketable IOC sell price: best bid - slippage buffer, clamped to a valid cent price. */
export function marketableSellPrice(yesBidDollars: string, slippageBufferCents = DEFAULT_SLIPPAGE_BUFFER_CENTS): string {
  const bidCents = dollarsToCents(yesBidDollars);
  const cents = Math.max(1, bidCents - slippageBufferCents);
  return centsToFixedPointDollars(cents);
}
