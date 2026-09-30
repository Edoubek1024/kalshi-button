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
