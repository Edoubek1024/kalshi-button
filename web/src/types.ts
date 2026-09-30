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
  /** Two for a straightforward win/lose matchup, three (or more) when a tie/draw is a separate tradable outcome. */
  teams: TeamState[];
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  kind: "buy" | "sell" | "error" | "info";
  message: string;
}
