/**
 * Kalshi's client_order_id has no documented server-side dedupe guarantee, so
 * duplicate-order prevention (e.g. a frantic double-click during a real game)
 * happens here: only one order may be in flight for a given market ticker at
 * a time, on top of the UI disabling the button immediately on click.
 */
const inFlight = new Set<string>();

export class OrderInFlightError extends Error {
  constructor(ticker: string) {
    super(`An order for ${ticker} is already being placed. Please wait for it to finish.`);
    this.name = "OrderInFlightError";
  }
}

export async function withOrderLock<T>(ticker: string, fn: () => Promise<T>): Promise<T> {
  if (inFlight.has(ticker)) {
    throw new OrderInFlightError(ticker);
  }
  inFlight.add(ticker);
  try {
    return await fn();
  } finally {
    inFlight.delete(ticker);
  }
}
