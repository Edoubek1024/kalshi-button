// Minimal subset of Kalshi Trade API v2 shapes, limited to what this app uses.
// Field names/types mirror docs.kalshi.com/openapi.yaml as of Sep 2026.

export type MarketStatus =
  | "initialized"
  | "inactive"
  | "active"
  | "closed"
  | "determined"
  | "disputed"
  | "amended"
  | "finalized";

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: "binary" | "scalar";
  yes_sub_title: string;
  no_sub_title: string;
  status: MarketStatus;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  yes_bid_size_fp?: string;
  yes_ask_size_fp?: string;
  no_bid_dollars: string;
  no_ask_dollars: string;
  last_price_dollars: string;
}

export interface KalshiEventData {
  event_ticker: string;
  series_ticker: string;
  sub_title: string;
  title: string;
  markets?: KalshiMarket[];
}

export interface GetEventResponse {
  event: KalshiEventData;
  markets: KalshiMarket[];
}

export interface GetMarketResponse {
  market: KalshiMarket;
}

export interface GetMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

export interface MarketPosition {
  ticker: string;
  exchange_index: number;
  total_traded_dollars: string;
  position_fp: string; // negative = NO contracts, positive = YES contracts
  market_exposure_dollars: string;
  realized_pnl_dollars: string;
  fees_paid_dollars: string;
  last_updated_ts: string;
}

export interface GetPositionsResponse {
  cursor?: string;
  market_positions: MarketPosition[];
  event_positions: unknown[];
}

export type BookSide = "bid" | "ask";
export type TimeInForce = "fill_or_kill" | "good_till_canceled" | "immediate_or_cancel";
export type SelfTradePreventionType = "taker_at_cross" | "maker";

export interface CreateOrderV2Request {
  ticker: string;
  client_order_id: string;
  side: BookSide;
  count: string; // FixedPointCount
  price: string; // FixedPointDollars
  time_in_force: TimeInForce;
  self_trade_prevention_type: SelfTradePreventionType;
}

export interface CreateOrderV2Response {
  order_id: string;
  client_order_id?: string;
  fill_count: string;
  remaining_count: string;
  average_fill_price?: string;
  average_fee_paid?: string;
  ts_ms: number;
}

export interface KalshiSeries {
  ticker: string;
  fee_type: "quadratic" | "quadratic_with_maker_fees" | "quadratic_with_combo_maker_fees" | "flat";
  fee_multiplier: number;
}

export interface KalshiErrorBody {
  code?: string;
  message?: string;
  details?: string;
}
