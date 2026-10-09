import { createHash, randomUUID } from "node:crypto";
import { M15, H4, PARAMS, RISK } from "./config";
import { validateCandles, aggregateH4, atr } from "./indicators";
import { newAccount, openTrade, closeTrade, replayExit, portfolio, recordEquity } from "./portfolio";
import { advanceSetup, newSetup, gate } from "./strategy";
import type { Candle, Experiment, Strategy, StrategyParams, Account } from "./types";

export interface ReplayArgs {
  source: "demo" | "import"; strategy: Strategy; symbol?: string; candles?: Candle[];
  btcCandles?: Candle[]; derivativeObservations?: { time: number; deltaOi: number; fundingRate: number }[];
  parameters?: StrategyParams;
}
export function demoCandles(): Candle[] {
  const start = Date.UTC(2025, 0, 1), bars: Candle[] = [];
  let previous = 100;
  for (let i = 0; i < 4200; i++) {
    const phase = i % 320;
    const close = 100 + i * 0.003 + Math.sin(i / 65) * 2 + (phase > 250 ? (phase - 250) * 0.045 : 0);
    const volume = 1000 + (phase > 250 ? 3500 : 100);
    bars.push({ time: start + i * M15, open: previous, high: Math.max(previous, close) + 0.3,
      low: Math.min(previous, close) - 0.3, close, volume, quoteVolume: volume * close, takerBuy: volume * 0.53 });
    previous = close;
  }
  return bars;
}
export function bootstrap(values: number[]): [number | null, number | null] {
  if (values.length < 20) return [null, null];
  let seed = 117;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const size = Math.max(2, Math.floor(Math.sqrt(values.length))), means: number[] = [];
  for (let s = 0; s < 500; s++) {
    const sampled: number[] = [];
    while (sampled.length < values.length) {
      const start = Math.floor(rng() * values.length);
      for (let j = 0; j < size && sampled.length < values.length; j++) sampled.push(values[(start + j) % values.length]);
    }
    means.push(sampled.reduce((s, v) => s + v, 0) / sampled.length);
  }
  means.sort((a, b) => a - b);
  return [means[12], means[487]];
}
function summarize(a: Account, source: string, strategy: string, hash: string, drawdown: number, notes: string[]): Experiment {
  const closed = a.trades.filter(t => t.status === "CLOSED"), p = portfolio(a);
  const expectancy = closed.length ? closed.reduce((s, t) => s + t.pnl, 0) / closed.length : null;
  const [confidenceLow, confidenceHigh] = source === "SYNTHETIC_DEMO" ? [null, null] : bootstrap(closed.map(t => t.pnl));
  return { id: randomUUID(), createdAt: new Date().toISOString(), source, strategy,
    status: source === "SYNTHETIC_DEMO" ? "DEMO_TECHNIQUE" : closed.length < 100 ? "ECHANTILLON_INSUFFISANT" : "RECHERCHE_NON_VALIDEE",
    trades: closed.length, pnl: p.equity - 10000, fees: p.fees, drawdown,
    expectancy, confidenceLow, confidenceHigh,
    equityCurve: a.equityCurve.filter((_, i) => i % Math.max(1, Math.floor(a.equityCurve.length / 300)) === 0),
    journal: a.trades, notes, dataHash: hash, comparisons: [] };
}
export function backtest(bars: Candle[], strategy: Strategy, symbol: string, source: string, btc: Candle[] = [],
  observations: { time: number; deltaOi: number; fundingRate: number }[] = [], params: StrategyParams = PARAMS): Experiment {
  validateCandles(bars);
  if (btc.length) {
    validateCandles(btc);
    if (btc.length !== bars.length || btc.some((b, i) => b.time !== bars[i].time)) throw new Error("Le benchmark BTC doit être exactement aligné.");
  }
  if (observations.some((o, i) => !Object.values(o).every(Number.isFinite) || (i > 0 && o.time <= observations[i - 1].time))) throw new Error("Observations dérivés non finies ou non chronologiques.");
  const hash = createHash("sha256").update(JSON.stringify({ bars, btc, observations, params, risk: RISK })).digest("hex");
  const a = newAccount(); a.running = true; a.day = new Date(bars[0].time).toISOString().slice(0, 10);
  let setup = newSetup(), pending: { id: string; stop: number } | null = null, maxDrawdown = 0, observationIndex = -1, btcLock = 0, riskRejects = 0;
  const allH4 = aggregateH4(bars, bars.at(-1)!.time + M15);
  let h4Count = 0;
  for (let i = 96; i < bars.length; i++) {
    const b = bars[i];
    if (new Date(b.time).toISOString().slice(0, 10) !== a.day) {
      a.day = new Date(b.time).toISOString().slice(0, 10); a.dailyStart = portfolio(a).equity;
    }
    if (btc.length) {
      const previousAtr = atr(btc.slice(Math.max(0, i - 15), i));
      if (btc[i].close < btc[i].open && btc[i].high - btc[i].low > previousAtr * 3) btcLock = b.time + M15 + 30 * 60000;
    }
    if (pending && !a.trades.some(t => t.status === "OPEN")) {
      try { openTrade(a, pending.id, symbol, b.open, pending.stop, b.time, source); } catch { riskRejects++; }
      pending = null;
    }
    for (const trade of a.trades.filter(t => t.status === "OPEN")) replayExit(a, trade, b);
    recordEquity(a, b.time + M15);
    maxDrawdown = Math.max(maxDrawdown, portfolio(a).drawdown);
    if (i >= bars.length - 1 || a.trades.some(t => t.status === "OPEN")) continue;
    while (h4Count < allH4.length && allH4[h4Count].time + H4 <= b.time + M15) h4Count++;
    const h4 = allH4.slice(0, h4Count), known = bars.slice(Math.max(0, i - 3999), i + 1);
    const result = advanceSetup(setup, h4, known, params); setup = result.setup;
    let signal = false;
    const history = bars.slice(i - 96, i), high = Math.max(...history.map(x => x.high));
    if (strategy === "momentum") signal = b.close > high && b.close > bars[i - 96].close;
    if (strategy === "trend" && h4.length >= 201) {
      const lastH4 = h4.at(-1)!;
      signal = b.time + M15 === lastH4.time + H4 && lastH4.close > Math.max(...h4.slice(-21, -1).map(x => x.high));
    }
    if (["hybrid", "filtered"].includes(strategy)) {
      if (i >= 2016 && btc.length) {
        const currentVolume = bars.slice(i - 95, i + 1).reduce((s, x) => s + x.quoteVolume, 0);
        const baseline = bars.slice(i - 2015, i - 95).reduce((s, x) => s + x.quoteVolume, 0) / 20;
        const relativeStrength = b.close / bars[i - 672].close - btc[i].close / btc[i - 672].close;
        result.features.volumeRatio = currentVolume / baseline; result.features.relativeStrength = relativeStrength;
        signal = result.signal && result.features.volumeRatio >= params.volumeRatio && relativeStrength > 0;
      }
      if (strategy === "filtered" && signal) {
        while (observationIndex + 1 < observations.length && observations[observationIndex + 1].time <= b.time + M15) observationIndex++;
        const observation = observations[observationIndex];
        const fresh = !!observation && b.time + M15 - observation.time <= 2 * 3600000;
        if (fresh) { result.features.deltaOi = observation.deltaOi; result.features.fundingRate = observation.fundingRate; }
        result.features.btcShock = btcLock > b.time + M15 ? 1 : 0;
        signal = gate(result.features, fresh, true).length === 0;
      }
    }
    if (signal) {
      const stop = ["hybrid", "filtered"].includes(strategy) ? result.stop : Math.min(...bars.slice(i - 7, i + 1).map(x => x.low)) - atr(known) * 0.1;
      pending = { id: `${strategy}:${b.time}`, stop };
    }
  }
  for (const t of a.trades.filter(t => t.status === "OPEN")) closeTrade(a, t, bars.at(-1)!.close, bars.at(-1)!.time + M15, "END_OF_DATA");
  recordEquity(a, bars.at(-1)!.time + M15); maxDrawdown = Math.max(maxDrawdown, portfolio(a).drawdown);
  const notes = ["Replay OHLC M15, entrée ouverture suivante, stop prioritaire si double touche, gaps et frais inclus.",
    "Benchmark mono-actif : ne reconstitue ni univers historique délisté ni liquidité du carnet. Aucun edge démontré.",
    "Comparaisons ablation descriptives, pas sélection automatique. TP net 3R, détention max 24 h."];
  notes.push(`Ordres refusés par le dimensionnement / limites de risque : ${riskRejects}.`);
  if (!btc.length) notes.push("Benchmark Bitcoin absent : variantes hybride/filtrée refusent les entrées. Momentum = breakout mono-actif, pas scanner relatif.");
  if (!observations.length) notes.push("Dérivés historiques absents : variante filtrée refuse les entrées.");
  if (h4Count < 201) notes.push("Historique inférieur à 201 H4 : tendance/hybride non initialisées.");
  return summarize(a, source, strategy, hash, maxDrawdown, notes);
}
export function runReplay(args: ReplayArgs): Experiment {
  const bars = args.source === "demo" ? demoCandles() : args.candles;
  if (!bars || bars.length < 250) throw new Error("250 bougies clôturées minimum ; 3216 recommandées pour la tendance H4.");
  const source = args.source === "demo" ? "SYNTHETIC_DEMO" : "USER_IMPORT_UNVERIFIED";
  const reports = (["momentum", "trend", "hybrid", "filtered"] as Strategy[]).map(s => backtest(bars, s, args.symbol || "DEMOUSDT", source, args.btcCandles, args.derivativeObservations, args.parameters));
  const report = reports.find(r => r.strategy === args.strategy)!;
  if (args.source === "demo") {
    // Separate explicit integration smoke test, never strategy performance.
    const a = newAccount();
    const t = openTrade(a, "demo-lifecycle", "DEMOUSDT", 100, 98, bars[0].time, "SYNTHETIC_DEMO");
    recordEquity(a, bars[0].time);
    replayExit(a, t, { ...bars[1], open: 100, high: t.target + 0.1, low: 99, close: t.target, time: bars[1].time });
    recordEquity(a, bars[1].time);
    const tech = summarize(a, "SYNTHETIC_DEMO", args.strategy, report.dataHash, portfolio(a).drawdown,
      ["TEST TECHNIQUE : ordre explicitement injecté pour vérifier ouverture/clôture et comptabilité, non généré par la stratégie.",
        "Les comparaisons ci-dessous exécutent réellement les quatre règles sur une série synthétique. Elles ne prouvent aucune rentabilité.",
        "Le portefeuille du cockpit reste inchangé."]);
    tech.comparisons = reports.map(r => ({ strategy: r.strategy, trades: r.trades, pnl: r.pnl, drawdown: r.drawdown }));
    return tech;
  }
  report.comparisons = reports.map(r => ({ strategy: r.strategy, trades: r.trades, pnl: r.pnl, drawdown: r.drawdown }));
  return report;
}