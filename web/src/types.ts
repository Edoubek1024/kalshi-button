export interface ResolvedMarket {
  ticker: string;
  teamName: string;
  yesBidDollars: string;
  yesAskDollars: string;
  status: string;
}

export interface ResolveResponse {
  eventTicker: string;
  eventTitle: string;
  seriesTicker: string;
  markets: ResolvedMarket[];
}

export interface PositionView {
  ticker: string;
  contracts: number;
  avgPriceDollars: number | null;
  realizedPnlDollars: number;
  feesPaidDollars: number;
}

export interface OrderResultView {
  noop: boolean;
  message?: string;
  orderId?: string;
  ticker?: string;
  side?: "bid" | "ask";
  requestedCount?: number;
  filledCount?: number;
  remainingCount?: number;
  averageFillPriceDollars?: number | null;
  averageFeePaidDollars?: number | null;
  contractsAfter: number;
  fullyFilled?: boolean;
}

export interface ApiErrorBody {
  error: string;
  kalshiCode?: string;
}

/** One team's running state within an active game. */
export interface TeamState {
  ticker: string;
  teamName: string;
  yesBidDollars: number;
  yesAskDollars: number;
  contracts: number;
  avgPriceDollars: number | null;
  lastSalePriceDollars: number | null;
  lastSaleFeeDollars: number | null;
  lastRealizedPnlDollars: number | null;
  hasScored: boolean;
}

export interface ActiveGame {
  eventTicker: string;
  eventTitle: string;
  seriesTicker: string;
  teams: [TeamState, TeamState];
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  kind: "buy" | "sell" | "error" | "info";
  message: string;
}
