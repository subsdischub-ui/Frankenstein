export interface Candle {
  time: number; open: number; high: number; low: number; close: number;
  volume: number; quoteVolume: number; takerBuy: number;
}
export interface Trade {
  id: string; symbol: string; status: "OPEN" | "CLOSED"; entry: number;
  stop: number; target: number; quantity: number; mark: number; fees: number;
  pnl: number; openedAt: string; closedAt: string | null; exitReason: string | null;
  version: string; source: string;
}
export interface Decision {
  id: string; symbol: string; time: string; accepted: boolean; reasons: string[];
  score: number | null; features: Record<string, number>; outcome: string | null;
  shadowScore?: number | null; shadowModelId?: string | null;
}
export interface Activity { id: string; time: string; type: string; message: string }
export interface Setup {
  state: "WATCH" | "ARMED" | "PULLBACK" | "CONFIRMED" | "EXPIRED" | "INVALIDATED";
  anchor: number | null; resistance: number | null; lastBar: number; signalBar: number | null;
}
export interface Account {
  cash: number; running: boolean; halted: boolean; peak: number;
  dailyStart: number; day: string; trades: Trade[]; decisions: Decision[];
  activity: Activity[]; equityCurve: { time: string; equity: number }[];
  setups: Record<string, Setup>; checked: Record<string, number>; shadow: Shadow[];
  proposals: { id: string; createdAt: string; params: StrategyParams; status: string }[];
  models: NativeModelRecord[];
}
export interface NativeModelRecord {
  id: string; hash: string; createdAt: string; status: "SHADOW_UNVERIFIED" | "RETIRED";
  features: string[]; threshold: number; objectPath: string;
}
export interface Shadow {
  decisionId: string; entry: number; stop: number; target: number;
  symbol: string; time: number; checked: number;
}
export interface StrategyParams { volumeRatio: number; rsiMax: number; expiryBars: number }
export interface MarketAsset {
  symbol: string; price: number; change24h: number; quoteVolume: number;
  volumeRatio: number | null; relativeStrength: number | null;
  state: string; reasons: string[]; updatedAt: string;
}
export interface MarketStatus {
  assets: MarketAsset[]; status: "waiting" | "healthy" | "stale" | "unavailable";
  message: string; lastScan: string | null;
}
export type Strategy = "momentum" | "trend" | "hybrid" | "filtered";
export interface Experiment {
  id: string; createdAt: string; source: string; strategy: string; status: string;
  trades: number; pnl: number; fees: number; drawdown: number;
  expectancy: number | null; confidenceLow: number | null; confidenceHigh: number | null;
  equityCurve: { time: string; equity: number }[]; journal: Trade[]; notes: string[];
  dataHash: string; comparisons: { strategy: string; trades: number; pnl: number; drawdown: number }[];
}