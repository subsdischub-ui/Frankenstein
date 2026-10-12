import type { Candle } from "./types";
import { H4, M15 } from "./config";

export function validateCandles(bars: Candle[], interval = M15, asOf = Date.now()): Candle[] {
  if (!bars.length) throw new Error("Historique vide.");
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!Object.values(b).every(Number.isFinite)) throw new Error("Valeur non finie.");
    if (b.time % interval !== 0 || b.time + interval > asOf) throw new Error("Bougie ouverte ou horodatage non aligné UTC.");
    if (i && b.time !== bars[i - 1].time + interval) throw new Error("Doublon, ordre temporel invalide ou trou dans les bougies.");
    if (Math.min(b.open, b.close, b.low) <= 0 || b.high < Math.max(b.open, b.close, b.low) ||
        b.low > Math.min(b.open, b.close) || b.volume < 0 || b.quoteVolume < 0 ||
        b.takerBuy < 0 || b.takerBuy > b.volume) throw new Error("OHLCV incohérent.");
  }
  return bars;
}
export function ema(values: number[], n: number): number {
  let result = values[0];
  for (const v of values.slice(1)) result += 2 / (n + 1) * (v - result);
  return result;
}
export function rsi(values: number[], n = 14): number {
  if (values.length < n + 1) throw new Error("Historique RSI insuffisant.");
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = values[i] - values[i - 1]; gain += Math.max(0, d) / n; loss += Math.max(0, -d) / n; }
  for (let i = n + 1; i < values.length; i++) { const d = values[i] - values[i - 1]; gain = (gain * (n - 1) + Math.max(0, d)) / n; loss = (loss * (n - 1) + Math.max(0, -d)) / n; }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}
export function atr(bars: Candle[], n = 14): number {
  const ranges = bars.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - bars[i].close), Math.abs(b.low - bars[i].close)));
  return ranges.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, ranges.length);
}
export function vwap(bars: Candle[], anchor: number): number {
  const list = bars.filter(b => b.time >= anchor);
  const volume = list.reduce((s, b) => s + b.volume, 0);
  if (volume <= 0) throw new Error("VWAP sans volume.");
  return list.reduce((s, b) => s + (b.high + b.low + b.close) / 3 * b.volume, 0) / volume;
}
export function aggregateH4(bars: Candle[], asOf: number): Candle[] {
  const groups = new Map<number, Candle[]>();
  for (const b of bars) {
    const key = Math.floor(b.time / H4) * H4;
    if (key + H4 > asOf) continue;
    groups.set(key, [...(groups.get(key) || []), b]);
  }
  return [...groups.entries()].filter(([, g]) => g.length === 16).map(([time, g]) => ({
    time, open: g[0].open, high: Math.max(...g.map(b => b.high)),
    low: Math.min(...g.map(b => b.low)), close: g[g.length - 1].close,
    volume: g.reduce((s, b) => s + b.volume, 0), quoteVolume: g.reduce((s, b) => s + b.quoteVolume, 0),
    takerBuy: g.reduce((s, b) => s + b.takerBuy, 0),
  }));
}