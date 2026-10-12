import { M15, H4 } from "./config";
import { validateCandles, atr } from "./indicators";
import type { Candle, MarketAsset } from "./types";

const SPOT = "https://data-api.binance.vision";
const FUTURES = "https://fapi.binance.com";
let blockedUntil = 0;
let derivativesDeniedUntil = 0;
const cache = new Map<string, { until: number; value: unknown }>();

export async function publicGet<T>(base: string, path: string, params: Record<string, string | number> = {}, ttl = 0): Promise<T> {
  const url = base + path + "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const cached = cache.get(url);
  if (cached && cached.until > Date.now()) return cached.value as T;
  if (Date.now() < blockedUntil) throw new Error("Binance rate-limit : collecte temporairement suspendue.");
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    if ([429, 418].includes(response.status)) blockedUntil = Date.now() + Math.max(60, Number(response.headers.get("retry-after") || 60)) * 1000;
    throw new Error(`Binance ${base === FUTURES ? "Futures" : "Spot"} HTTP ${response.status}${response.status === 451 ? " : accès refusé depuis cette région d'hébergement." : ""}`);
  }
  const value = await response.json() as T;
  if (ttl) cache.set(url, { until: Date.now() + ttl, value });
  return value;
}
export async function candles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const duration = interval === "4h" ? H4 : interval === "1d" ? 86400000 : interval === "1m" ? 60000 : M15;
  const rows = await publicGet<(string | number)[][]>(SPOT, "/api/v3/klines", { symbol, interval, limit }, interval === "4h" || interval === "1d" ? 5 * 60000 : 30000);
  const bars = rows.filter(r => Number(r[6]) < Date.now()).map(r => ({
    time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]),
    volume: Number(r[5]), quoteVolume: Number(r[7]), takerBuy: Number(r[9]),
  }));
  return validateCandles(bars, duration);
}
export interface Instrument { symbol: string; step: number; minNotional: number }
export async function instruments(): Promise<Instrument[]> {
  const data = await publicGet<{ symbols: { symbol: string; status: string; quoteAsset: string; baseAsset: string; isSpotTradingAllowed: boolean; filters: { filterType: string; stepSize?: string; minNotional?: string }[] }[] }>(SPOT, "/api/v3/exchangeInfo", {}, 4 * 3600000);
  const excluded = /^(USDC|USDP|TUSD|FDUSD|DAI|PAXG|USDE|USD1|EUR|TRY|BRL|AEUR)$|(?:UP|DOWN|BULL|BEAR)$/;
  return data.symbols.filter(s => s.status === "TRADING" && s.isSpotTradingAllowed && s.quoteAsset === "USDT" && s.baseAsset !== "BTC" && !excluded.test(s.baseAsset)).map(s => ({
    symbol: s.symbol,
    step: Number(s.filters.find(f => f.filterType === "LOT_SIZE")?.stepSize || "0.000001"),
    minNotional: Number(s.filters.find(f => ["NOTIONAL", "MIN_NOTIONAL"].includes(f.filterType))?.minNotional || 5),
  }));
}
export async function marketUniverse(): Promise<{ assets: MarketAsset[]; instruments: Instrument[]; btcDaily: Candle[] }> {
  const [info, tickers, btcDaily] = await Promise.all([
    instruments(),
    publicGet<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }[]>(SPOT, "/api/v3/ticker/24hr", {}, 60000),
    candles("BTCUSDT", "1d", 29),
  ]);
  const eligible = new Set(info.map(s => s.symbol));
  const active = tickers.filter(t => eligible.has(t.symbol) && Number(t.quoteVolume) >= 20000000)
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume));
  // Bounded request budget. This is a liquid 30-pair universe, not an exhaustive claim.
  const assets: MarketAsset[] = [];
  const btcReturn = btcDaily.at(-1)!.close / btcDaily.at(-8)!.close - 1;
  for (const ticker of active.slice(0, 30)) {
    try {
      const d = await candles(ticker.symbol, "1d", 29);
      if (d.length < 28) throw new Error("Historique daily insuffisant.");
      const volumeRatio = d.at(-1)!.quoteVolume / (d.slice(-21, -1).reduce((s, b) => s + b.quoteVolume, 0) / 20);
      const relativeStrength = d.at(-1)!.close / d.at(-8)!.close - 1 - btcReturn;
      const reasons = [];
      if (volumeRatio < 3) reasons.push("Volume clôturé <3× moyenne 20 jours.");
      if (relativeStrength <= 0) reasons.push("Force relative 7 jours ≤ Bitcoin.");
      assets.push({ symbol: ticker.symbol, price: Number(ticker.lastPrice), change24h: Number(ticker.priceChangePercent) / 100,
        quoteVolume: Number(ticker.quoteVolume), volumeRatio, relativeStrength, state: reasons.length ? "FILTERED" : "WATCH", reasons, updatedAt: new Date().toISOString() });
    } catch (e) {
      assets.push({ symbol: ticker.symbol, price: Number(ticker.lastPrice), change24h: Number(ticker.priceChangePercent) / 100,
        quoteVolume: Number(ticker.quoteVolume), volumeRatio: null, relativeStrength: null,
        state: "UNAVAILABLE", reasons: [String((e as Error).message)], updatedAt: new Date().toISOString() });
    }
  }
  return { assets: assets.sort((a, b) => (b.relativeStrength ?? -999) - (a.relativeStrength ?? -999)), instruments: info, btcDaily };
}
export async function depth(symbol: string) {
  const book = await publicGet<{ bids: [string, string][]; asks: [string, string][] }>(SPOT, "/api/v3/depth", { symbol, limit: 100 });
  const bids = book.bids.map(([p, q]) => [Number(p), Number(q)]), asks = book.asks.map(([p, q]) => [Number(p), Number(q)]);
  if (!bids.length || !asks.length || ![...bids.flat(), ...asks.flat()].every(v => Number.isFinite(v) && v > 0) || bids[0][0] >= asks[0][0]) throw new Error("Carnet invalide.");
  return { bids, asks, time: Date.now() };
}
export function sweep(levels: number[][], quantity: number): number {
  let remaining = quantity, cost = 0;
  for (const [price, available] of levels) {
    const fill = Math.min(available, remaining); cost += fill * price; remaining -= fill;
    if (remaining < 1e-10) return cost / quantity;
  }
  throw new Error("Profondeur observée insuffisante : aucun fill complet.");
}
export async function derivatives(symbol: string) {
  if (Date.now() < derivativesDeniedUntil) throw new Error("Futures inaccessible (restriction régionale, nouvelle tentative dans une heure).");
  try {
    const [funding, oi] = await Promise.all([
      publicGet<{ lastFundingRate: string }>(FUTURES, "/fapi/v1/premiumIndex", { symbol }, 60000),
      publicGet<{ sumOpenInterest: string; timestamp: number }[]>(FUTURES, "/futures/data/openInterestHist", { symbol, period: "1h", limit: 3 }, 60000),
    ]);
    if (oi.length !== 3 || Date.now() - oi.at(-1)!.timestamp > 2 * 3600000 || Number(oi[0].sumOpenInterest) <= 0) throw new Error("OI insuffisant ou périmé.");
    const result = { fundingRate: Number(funding.lastFundingRate), deltaOi: Number(oi[2].sumOpenInterest) / Number(oi[0].sumOpenInterest) - 1 };
    if (!Object.values(result).every(Number.isFinite)) throw new Error("Dérivés non finis.");
    return result;
  } catch (e) { if (String(e).includes("451")) derivativesDeniedUntil = Date.now() + 3600000; throw e; }
}
export async function bitcoinContext(): Promise<number> {
  const bars = await candles("BTCUSDT", "1m", 61);
  if (Date.now() - bars.at(-1)!.time > 180000) throw new Error("Flux BTC périmé.");
  let until = 0;
  for (let i = 15; i < bars.length; i++) {
    const b = bars[i], previousAtr = atr(bars.slice(0, i));
    if (b.close < b.open && b.high - b.low > previousAtr * 3) until = b.time + 60000 + 30 * 60000;
  }
  return until > Date.now() ? 1 : 0;
}