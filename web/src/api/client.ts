import type { ApiErrorBody, OrderResultView, PositionView, ResolveResponse, ResolvedMarket } from "../types";

// In dev, Vite proxies "/api" to the local backend. When the frontend and
// backend are deployed separately (e.g. frontend on GitHub Pages, backend on
// its own host), set VITE_API_BASE_URL at build time to the backend's full
// origin (e.g. "https://kalshi-button-api.onrender.com").
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  kalshiCode: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.status = status;
    this.kalshiCode = body.kalshiCode;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, json as ApiErrorBody);
  }
  return json as T;
}

export function resolveMarket(url: string): Promise<ResolveResponse> {
  return request("/resolve", { method: "POST", body: JSON.stringify({ url }) });
}

export function refreshMarkets(tickers: string[]): Promise<{ markets: ResolvedMarket[] }> {
  const qs = new URLSearchParams({ tickers: tickers.join(",") });
  return request(`/markets?${qs.toString()}`);
}

export function fetchPositions(eventTicker: string): Promise<{ positions: PositionView[] }> {
  const qs = new URLSearchParams({ eventTicker });
  return request(`/positions?${qs.toString()}`);
}

export function buyToTarget(ticker: string, targetContracts: number): Promise<OrderResultView> {
  return request("/orders/buy-to-target", {
    method: "POST",
    body: JSON.stringify({ ticker, targetContracts }),
  });
}

export function sellAll(ticker: string): Promise<OrderResultView> {
  return request("/orders/sell-all", {
    method: "POST",
    body: JSON.stringify({ ticker }),
  });
}

export interface FeeParams {
  feeType: "quadratic" | "quadratic_with_maker_fees" | "quadratic_with_combo_maker_fees" | "flat";
  feeMultiplier: number;
}

export function getSeriesFeeParams(seriesTicker: string): Promise<FeeParams> {
  return request(`/series/${encodeURIComponent(seriesTicker)}/fee-params`);
}
