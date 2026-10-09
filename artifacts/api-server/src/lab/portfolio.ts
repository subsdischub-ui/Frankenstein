import { randomUUID } from "node:crypto";
import { INITIAL_CAPITAL, RISK, VERSION } from "./config";
import type { Account, Candle, Trade } from "./types";

export function newAccount(): Account {
  return { cash: INITIAL_CAPITAL, running: false, halted: false, peak: INITIAL_CAPITAL,
    dailyStart: INITIAL_CAPITAL, day: new Date().toISOString().slice(0, 10),
    trades: [], decisions: [], activity: [], equityCurve: [], setups: {}, checked: {}, shadow: [], proposals: [], models: [] };
}
export function portfolio(a: Account) {
  const open = a.trades.filter(t => t.status === "OPEN"), closed = a.trades.filter(t => t.status === "CLOSED");
  const value = open.reduce((s, t) => s + t.quantity * t.mark * (1 - RISK.feeRate), 0);
  const equity = a.cash + value;
  const fees = a.trades.reduce((s, t) => s + t.fees, 0);
  return { initialCapital: INITIAL_CAPITAL, cash: a.cash, equity,
    realizedPnl: closed.reduce((s, t) => s + t.pnl, 0),
    unrealizedPnl: open.reduce((s, t) => s + t.quantity * (t.mark * (1 - RISK.feeRate) - t.entry) - t.fees, 0),
    fees, exposure: equity > 0 ? value / equity : 0,
    drawdown: Math.max(0, 1 - equity / Math.max(a.peak, equity)),
    openRisk: open.reduce((s, t) => s + t.quantity * (t.entry * (1 + RISK.feeRate) - t.stop * (1 - RISK.slippageRate) * (1 - RISK.feeRate)), 0),
    closedTrades: closed.length, winRate: closed.length ? closed.filter(t => t.pnl > 0).length / closed.length : null };
}
export function openTrade(a: Account, id: string, symbol: string, ask: number, stop: number, time: number, source: string, step = 0.000001, minNotional = 5, capacity = Infinity): Trade {
  if (a.trades.some(t => t.id === id || (t.status === "OPEN" && t.symbol === symbol))) throw new Error("Signal dupliqué ou position existante.");
  const p = portfolio(a), open = a.trades.filter(t => t.status === "OPEN");
  if (a.halted || open.length >= RISK.maxPositions) throw new Error("Arrêt de sécurité / nombre de positions maximum.");
  if (p.drawdown >= RISK.drawdownLimit || p.equity <= a.dailyStart * (1 - RISK.dailyLossLimit)) throw new Error("Coupe-circuit drawdown ou perte quotidienne.");
  const entry = ask * (1 + RISK.slippageRate);
  if (![entry, stop, step, minNotional].every(Number.isFinite) || stop <= 0 || stop >= entry || step <= 0) throw new Error("Stop/prix/précision invalide.");
  const riskPerUnit = entry * (1 + RISK.feeRate) - stop * (1 - RISK.slippageRate) * (1 - RISK.feeRate);
  const equityLossPerUnit = entry * (1 + RISK.feeRate) - ask * (1 - RISK.feeRate);
  const singleRiskSize = p.equity * RISK.riskPerTrade / riskPerUnit;
  const aggregateRiskSize = (p.equity * RISK.maxOpenRisk - p.openRisk) / (riskPerUnit + RISK.maxOpenRisk * equityLossPerUnit);
  const remainingExposure = p.equity * RISK.maxExposure - open.reduce((s, t) => s + t.quantity * t.mark, 0);
  const raw = Math.min(singleRiskSize, aggregateRiskSize, a.cash / (entry * (1 + RISK.feeRate)),
    p.equity * RISK.maxAssetExposure / (entry + RISK.maxAssetExposure * equityLossPerUnit),
    remainingExposure / (entry + RISK.maxExposure * equityLossPerUnit), capacity);
  const quantity = Math.floor((raw + Number.EPSILON) / step) * step;
  if (quantity <= 0 || quantity * entry < minNotional) throw new Error("Cash, risque ou liquidité insuffisants.");
  const fees = quantity * entry * RISK.feeRate;
  a.cash -= quantity * entry + fees;
  if (a.cash < -1e-7) throw new Error("Solvabilité violée.");
  // Target is 3R NET of two-sided fees and modeled exit slippage.
  const target = (entry * (1 + RISK.feeRate) + RISK.rewardRisk * riskPerUnit) / ((1 - RISK.slippageRate) * (1 - RISK.feeRate));
  const trade: Trade = { id, symbol, status: "OPEN", entry, stop, target, quantity, mark: ask,
    fees, pnl: 0, openedAt: new Date(time).toISOString(), closedAt: null, exitReason: null, version: VERSION, source };
  a.trades.push(trade); return trade;
}
export function closeTrade(a: Account, t: Trade, bid: number, time: number, reason: string): void {
  if (t.status !== "OPEN") return;
  if (!Number.isFinite(bid) || bid <= 0) throw new Error("Prix sortie invalide.");
  const fill = bid * (1 - RISK.slippageRate), exitFee = t.quantity * fill * RISK.feeRate;
  a.cash += t.quantity * fill - exitFee;
  t.fees += exitFee; t.mark = fill; t.pnl = t.quantity * (fill - t.entry) - t.fees;
  t.status = "CLOSED"; t.closedAt = new Date(time).toISOString(); t.exitReason = reason;
}
export function replayExit(a: Account, t: Trade, b: Candle): void {
  if (t.status !== "OPEN") return;
  t.mark = b.close;
  if (b.low <= t.stop) closeTrade(a, t, Math.min(b.open, t.stop), b.time, "STOP");
  else if (b.high >= t.target) closeTrade(a, t, t.target, b.time, "TARGET");
  else if (b.time - Date.parse(t.openedAt) >= RISK.maxHoldingHours * 3600000) closeTrade(a, t, b.open, b.time, "TIME");
}
export function recordEquity(a: Account, time = Date.now()): void {
  const equity = portfolio(a).equity;
  a.peak = Math.max(a.peak, equity);
  const day = new Date(time).toISOString().slice(0, 10);
  if (day !== a.day) { a.day = day; a.dailyStart = equity; }
  a.equityCurve.push({ time: new Date(time).toISOString(), equity });
  a.equityCurve = a.equityCurve.slice(-2000);
}
export function activity(a: Account, type: string, message: string): void {
  a.activity.push({ id: randomUUID(), time: new Date().toISOString(), type, message });
  a.activity = a.activity.slice(-150);
}