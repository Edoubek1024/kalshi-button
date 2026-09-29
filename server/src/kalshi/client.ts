import { config } from "../config.js";
import { loadSigningKey, signRequest, type SigningKey } from "./signing.js";
import type {
  CreateOrderV2Request,
  CreateOrderV2Response,
  GetEventResponse,
  GetMarketResponse,
  GetMarketsResponse,
  GetPositionsResponse,
  KalshiErrorBody,
  KalshiSeries,
} from "./types.js";

export class KalshiApiError extends Error {
  status: number;
  body: KalshiErrorBody | undefined;

  constructor(status: number, body: KalshiErrorBody | undefined, message: string) {
    super(message);
    this.name = "KalshiApiError";
    this.status = status;
    this.body = body;
  }
}

const TRADE_API_PREFIX = "/trade-api/v2";

export class KalshiClient {
  private key: SigningKey;

  constructor() {
    this.key = loadSigningKey(config.kalshiPrivateKeyPem);
  }

  private async request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    const pathWithoutQuery = TRADE_API_PREFIX + path.split("?")[0];
    const timestampMs = String(Date.now());
    const signature = signRequest(this.key, timestampMs, method, pathWithoutQuery);

    const res = await fetch(config.kalshiBaseUrl + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "KALSHI-ACCESS-KEY": config.kalshiApiKeyId,
        "KALSHI-ACCESS-SIGNATURE": signature,
        "KALSHI-ACCESS-TIMESTAMP": timestampMs,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;

    if (!res.ok) {
      const message =
        (json as KalshiErrorBody | undefined)?.message ??
        `Kalshi API request failed: ${method} ${path} -> ${res.status}`;
      throw new KalshiApiError(res.status, json, message);
    }

    return json as T;
  }

  getEvent(eventTicker: string): Promise<GetEventResponse> {
    return this.request("GET", `/events/${encodeURIComponent(eventTicker)}?with_nested_markets=true`);
  }

  getMarket(ticker: string): Promise<GetMarketResponse> {
    return this.request("GET", `/markets/${encodeURIComponent(ticker)}`);
  }

  getMarkets(tickers: string[]): Promise<GetMarketsResponse> {
    const qs = new URLSearchParams({ tickers: tickers.join(",") });
    return this.request("GET", `/markets?${qs.toString()}`);
  }

  getSeries(seriesTicker: string): Promise<{ series: KalshiSeries }> {
    return this.request("GET", `/series/${encodeURIComponent(seriesTicker)}`);
  }

  /** The positions endpoint only supports filtering by a single event_ticker (not a tickers list). */
  getPositionsByEvent(eventTicker: string): Promise<GetPositionsResponse> {
    const qs = new URLSearchParams({ event_ticker: eventTicker, count_filter: "position" });
    return this.request("GET", `/portfolio/positions?${qs.toString()}`);
  }

  getPositionByTicker(ticker: string): Promise<GetPositionsResponse> {
    const qs = new URLSearchParams({ ticker, count_filter: "position" });
    return this.request("GET", `/portfolio/positions?${qs.toString()}`);
  }

  createOrder(req: CreateOrderV2Request): Promise<CreateOrderV2Response> {
    return this.request("POST", "/portfolio/events/orders", req);
  }
}

export const kalshi = new KalshiClient();
