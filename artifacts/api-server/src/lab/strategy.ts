import { ema, rsi, atr, vwap } from "./indicators";
import { H4, M15, PARAMS } from "./config";
import type { Candle, Setup, StrategyParams } from "./types";

export const newSetup = (): Setup => ({ state: "WATCH", anchor: null, resistance: null, lastBar: 0, signalBar: null });
export function advanceSetup(old: Setup, h4: Candle[], m15: Candle[], params: StrategyParams = PARAMS) {
  const s = { ...old }, reasons: string[] = [];
  const last = m15.at(-1)!;
  const features: Record<string, number> = {};
  if (h4.length < 201 || m15.length < 30) return { setup: s, signal: false, reasons: ["Historique insuffisant (201 H4 minimum)."], features, stop: 0 };
  if (last.time <= s.lastBar) return { setup: s, signal: false, reasons: ["Bougie déjà traitée."], features, stop: 0 };
  s.lastBar = last.time;
  const h = h4.at(-1)!;
  const closes = h4.map(b => b.close);
  const trend = h.close > ema(closes, 50) && ema(closes, 50) > ema(closes, 200);
  const history = h4.slice(-21, -1);
  const resistance = Math.max(...history.map(b => b.high));
  const ranges = history.slice(-4).map(b => (b.high - b.low) / b.close);
  const compression = ranges.at(-1)! / Math.max(0.00001, ranges[0]);
  features.compression = compression;
  const contracted = ranges.at(-1)! < 0.03 && ranges.at(-1)! < ranges[0] && ranges.slice(1).every((v, i) => v <= ranges[i] * 1.15);
  if (s.anchor === null && trend && contracted && h.close > resistance) {
    s.state = "ARMED"; s.anchor = h.time; s.resistance = resistance;
  }
  if (s.anchor === null) {
    s.state = "WATCH";
    reasons.push(!trend ? "Alignement EMA50/EMA200 H4 absent." : !contracted ? "Compression H4 absente." : "Cassure Donchian20 clôturée absente.");
    return { setup: s, signal: false, reasons, features, stop: 0 };
  }
  if (last.time + M15 - (s.anchor + H4) > params.expiryBars * M15) {
    s.state = "EXPIRED"; s.anchor = null; return { setup: s, signal: false, reasons: ["Setup expiré."], features, stop: 0 };
  }
  const avwap = vwap(m15, s.anchor);
  features.rsi = rsi(m15.map(b => b.close)); features.vwapGap = last.close / avwap - 1;
  features.cvd = m15.slice(-2).reduce((sum, b) => sum + 2 * b.takerBuy - b.volume, 0);
  if (!trend || last.close < s.resistance! * 0.98) {
    s.state = "INVALIDATED"; s.anchor = null;
    return { setup: s, signal: false, reasons: ["Structure invalidée sous résistance / tendance."], features, stop: 0 };
  }
  // Never pull back on the same completed H4 bar that established the breakout.
  if (last.time < s.anchor + H4) return { setup: s, signal: false, reasons: ["Attente du repli après clôture H4."], features, stop: 0 };
  if (s.state === "ARMED" && last.low <= avwap * 1.01 && last.close >= avwap * 0.985 && features.rsi <= params.rsiMax) {
    s.state = "PULLBACK";
    return { setup: s, signal: false, reasons: ["Repli détecté ; attente reprise M15."], features, stop: 0 };
  }
  if (s.state === "PULLBACK") {
    if (last.close > m15.at(-2)!.high && last.close >= avwap && last.close <= avwap * 1.02) {
      s.state = "CONFIRMED"; s.signalBar = last.time;
      const stop = Math.min(...m15.slice(-8).map(b => b.low)) - atr(m15) * 0.1;
      return { setup: s, signal: true, reasons: ["Cassure H4 + repli VWAP + reprise M15 confirmés."], features, stop };
    }
    reasons.push("Reprise M15 non confirmée.");
  } else reasons.push(s.state === "CONFIRMED" ? "Signal consommé ; attente expiration." : "Attente repli VWAP/RSI.");
  return { setup: s, signal: false, reasons, features, stop: 0 };
}

export function gate(features: Record<string, number>, derivativesAvailable: boolean, btcAvailable: boolean): string[] {
  const reasons: string[] = [];
  if (!derivativesAvailable) reasons.push("Dérivés OI/funding indisponibles : entrée refusée.");
  if (!btcAvailable) reasons.push("Contexte Bitcoin indisponible : entrée refusée.");
  if (derivativesAvailable && features.deltaOi > 0.15 && features.fundingRate > 0.0005) reasons.push("Surchauffe dérivés : OI >15% et funding >0,05%.");
  if (features.cvd < 0) reasons.push("Delta taker négatif : pression vendeuse.");
  if (features.btcShock > 0) reasons.push("Choc baissier Bitcoin : verrou 30 minutes.");
  return reasons;
}