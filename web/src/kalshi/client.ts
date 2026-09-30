import { signRequest } from "./signing";
import type { StoredCredentials } from "./keyStore";
import { withOrderLock, OrderInFlightError } from "./orderLock";
import { marketableBuyPrice, marketableSellPrice, countToFixedPoint } from "./pricing";
import { extractTickerCandidates } from "./parseKalshiUrl";
import type {
  CreateOrderV2Request,
  CreateOrderV2Response,
  GetEventResponse,
  GetMarketResponse,
  GetMarketsResponse,
  GetPositionsResponse,
  KalshiErrorBody,
  KalshiEventData,
  KalshiMarket,
  KalshiSeries,
} from "./types";

const RELAY_URL = import.meta.env.VITE_RELAY_URL;
const TRADE_API_PREFIX = "/trade-api/v2";

export class KalshiApiError extends Error {
  status: number;
  kalshiCode: string | undefined;

  constructor(status: number, body: KalshiErrorBody | undefined, message: string) {
    super(message);
    this.name = "KalshiApiError";
    this.status = status;
    this.kalshiCode = body?.error?.code;
  }
}

let activeCredentials: StoredCredentials | null = null;

export function setActiveCredentials(creds: StoredCredentials) {
  activeCredentials = creds;
}

export function clearActiveCredentials() {
  activeCredentials = null;
}

export function hasActiveCredentials(): boolean {
  return activeCredentials !== null;
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  if (!RELAY_URL) {
    throw new Error("VITE_RELAY_URL is not configured — set it to your deployed CORS relay's URL.");
  }
  if (!activeCredentials) {
    throw new Error("No Kalshi credentials loaded. Paste and lock your API key first.");
  }

  const pathWithoutQuery = TRADE_API_PREFIX + path.split("?")[0];
  const timestampMs = String(Date.now());
  const signature = await signRequest(
    { algorithm: activeCredentials.algorithm, cryptoKey: activeCredentials.cryptoKey },
    timestampMs,
    method,
    pathWithoutQuery
  );

  const res = await fetch(`${RELAY_URL}/${activeCredentials.kalshiEnv}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": activeCredentials.keyId,
      "KALSHI-ACCESS-SIGNATURE": signature,
      "KALSHI-ACCESS-TIMESTAMP": timestampMs,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = (json as KalshiErrorBody | undefined)?.error?.message ?? `Kalshi API request failed: ${method} ${path} -> ${res.status}`;
    throw new KalshiApiError(res.status, json, message);
  }

  return json as T;
}

function getEvent(eventTicker: string): Promise<GetEventResponse> {
  return request("GET", `/events/${encodeURIComponent(eventTicker)}?with_nested_markets=true`);
}

function getMarket(ticker: string): Promise<GetMarketResponse> {
  return request("GET", `/markets/${encodeURIComponent(ticker)}`);
}

export function getMarkets(tickers: string[]): Promise<GetMarketsResponse> {
  const qs = new URLSearchParams({ tickers: tickers.join(",") });
  return request("GET", `/markets?${qs.toString()}`);
}

export function getSeries(seriesTicker: string): Promise<{ series: KalshiSeries }> {
  return request("GET", `/series/${encodeURIComponent(seriesTicker)}`);
}

export function getPositionsByEvent(eventTicker: string): Promise<GetPositionsResponse> {
  const qs = new URLSearchParams({ event_ticker: eventTicker, count_filter: "position" });
  return request("GET", `/portfolio/positions?${qs.toString()}`);
}

function getPositionByTicker(ticker: string): Promise<GetPositionsResponse> {
  const qs = new URLSearchParams({ ticker, count_filter: "position" });
  return request("GET", `/portfolio/positions?${qs.toString()}`);
}

function createOrder(req: CreateOrderV2Request): Promise<CreateOrderV2Response> {
  return request("POST", "/portfolio/events/orders", req);
}

async function fetchContracts(ticker: string): Promise<number> {
  const posRes = await getPositionByTicker(ticker);
  const match = posRes.market_positions.find((p) => p.ticker === ticker);
  return match ? Math.max(0, Number(match.position_fp)) : 0;
}

// ---- URL / market resolution ----

export interface ResolvedMarket {
  ticker: string;
  teamName: string;
  yesBidDollars: string;
  yesAskDollars: string;
  status: string;
}

export interface ResolveResult {
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
    const res = await getEvent(candidate);
    return { event: res.event, markets: res.event.markets ?? res.markets ?? [] };
  } catch (err) {
    if (err instanceof KalshiApiError && err.status === 404) return null;
    throw err;
  }
}

async function tryResolveAsMarket(candidate: string): Promise<{ event: KalshiEventData; markets: KalshiMarket[] } | null> {
  try {
    const marketRes = await getMarket(candidate);
    const eventRes = await getEvent(marketRes.market.event_ticker);
    return { event: eventRes.event, markets: eventRes.event.markets ?? eventRes.markets ?? [] };
  } catch (err) {
    if (err instanceof KalshiApiError && err.status === 404) return null;
    throw err;
  }
}

export async function resolveMarketFromUrl(input: string): Promise<ResolveResult> {
  const candidates = extractTickerCandidates(input);
  if (candidates.length === 0) {
    throw new Error("Couldn't find anything ticker-shaped in that URL. Paste the market/event page URL, or the ticker itself.");
  }

  for (const candidate of candidates) {
    const asEvent = await tryResolveAsEvent(candidate);
    const found = asEvent ?? (await tryResolveAsMarket(candidate));
    if (!found) continue;

    const binaryMarkets = found.markets.filter((m) => m.market_type === "binary");
    if (binaryMarkets.length < 2) {
      throw new Error(`Found event "${found.event.title}" but it doesn't have two binary markets to trade against each other.`);
    }

    return {
      eventTicker: found.event.event_ticker,
      eventTitle: found.event.title,
      seriesTicker: found.event.series_ticker,
      markets: binaryMarkets.map(toResolvedMarket),
    };
  }

  throw new Error(
    "Couldn't find that market or event on Kalshi. Double-check the URL, or make sure it's a game you have access to (demo vs. production)."
  );
}

// ---- Orders ----

export interface OrderResult {
  noop: boolean;
  message?: string;
  orderId?: string;
  side?: "bid" | "ask";
  requestedCount?: number;
  filledCount?: number;
  remainingCount?: number;
  averageFillPriceDollars?: number | null;
  averageFeePaidDollars?: number | null;
  contractsAfter: number;
  fullyFilled?: boolean;
  /** True if an unfilled remainder is resting on the book (GTC) rather than cancelled (IOC). */
  resting?: boolean;
}

/**
 * Buys enough contracts to bring the position up to targetContracts. Idempotent no-op if already there.
 * Uses good-till-canceled: an unfilled remainder rests on the book instead of being cancelled, so it may
 * fill later, unattended. That's deliberate here (buy-in/buy-back aren't as time-sensitive as the
 * score sell, which stays IOC) — see sellAll.
 */
export async function buyToTarget(ticker: string, targetContracts: number): Promise<OrderResult> {
  return withOrderLock(ticker, async () => {
    const before = await fetchContracts(ticker);
    const deficit = targetContracts - before;

    if (deficit <= 0) {
      return { noop: true, message: `Already holding ${before} contracts of ${ticker}, no purchase needed.`, contractsAfter: before };
    }

    const marketRes = await getMarket(ticker);
    const price = marketableBuyPrice(marketRes.market.yes_ask_dollars);

    const order = await createOrder({
      ticker,
      client_order_id: crypto.randomUUID(),
      side: "bid",
      count: countToFixedPoint(deficit),
      price,
      time_in_force: "good_till_canceled",
      self_trade_prevention_type: "taker_at_cross",
    });

    const after = await fetchContracts(ticker);
    const fillCount = Number(order.fill_count);
    const fullyFilled = fillCount >= deficit;

    return {
      noop: false,
      orderId: order.order_id,
      side: "bid",
      requestedCount: deficit,
      filledCount: fillCount,
      remainingCount: Number(order.remaining_count),
      averageFillPriceDollars: order.average_fill_price ? Number(order.average_fill_price) : null,
      averageFeePaidDollars: order.average_fee_paid ? Number(order.average_fee_paid) : null,
      contractsAfter: after,
      fullyFilled,
      resting: !fullyFilled,
    };
  });
}

/** Sells the entire current position for a ticker. No-op if there's nothing to sell. */
export async function sellAll(ticker: string): Promise<OrderResult> {
  return withOrderLock(ticker, async () => {
    const before = await fetchContracts(ticker);

    if (before <= 0) {
      return { noop: true, message: `No open position in ${ticker} to sell.`, contractsAfter: 0 };
    }

    const marketRes = await getMarket(ticker);
    const price = marketableSellPrice(marketRes.market.yes_bid_dollars);

    const order = await createOrder({
      ticker,
      client_order_id: crypto.randomUUID(),
      side: "ask",
      count: countToFixedPoint(before),
      price,
      time_in_force: "immediate_or_cancel",
      self_trade_prevention_type: "taker_at_cross",
    });

    const after = await fetchContracts(ticker);
    const fillCount = Number(order.fill_count);

    return {
      noop: false,
      orderId: order.order_id,
      side: "ask",
      requestedCount: before,
      filledCount: fillCount,
      remainingCount: Number(order.remaining_count),
      averageFillPriceDollars: order.average_fill_price ? Number(order.average_fill_price) : null,
      averageFeePaidDollars: order.average_fee_paid ? Number(order.average_fee_paid) : null,
      contractsAfter: after,
      fullyFilled: fillCount >= before,
    };
  });
}

export { OrderInFlightError };

export interface PositionView {
  ticker: string;
  contracts: number;
  avgPriceDollars: number | null;
  realizedPnlDollars: number;
  feesPaidDollars: number;
}

export async function fetchPositions(eventTicker: string): Promise<PositionView[]> {
  const result = await getPositionsByEvent(eventTicker);
  return result.market_positions.map((p) => {
    const positionFp = Number(p.position_fp);
    const exposure = Number(p.market_exposure_dollars);
    const contracts = Math.max(0, positionFp);
    return {
      ticker: p.ticker,
      contracts,
      avgPriceDollars: contracts > 0 ? exposure / contracts : null,
      realizedPnlDollars: Number(p.realized_pnl_dollars),
      feesPaidDollars: Number(p.fees_paid_dollars),
    };
  });
}

export async function refreshMarkets(tickers: string[]): Promise<ResolvedMarket[]> {
  const result = await getMarkets(tickers);
  return result.markets.map(toResolvedMarket);
}

export interface FeeParams {
  feeType: KalshiSeries["fee_type"];
  feeMultiplier: number;
}

export async function getSeriesFeeParams(seriesTicker: string): Promise<FeeParams> {
  const res = await getSeries(seriesTicker);
  return { feeType: res.series.fee_type, feeMultiplier: res.series.fee_multiplier };
}
