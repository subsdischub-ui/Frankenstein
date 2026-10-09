import { VERSION, RISK, FEATURE_ORDER, M15 } from "./config";
import { activity, newAccount, portfolio, recordEquity, openTrade, closeTrade } from "./portfolio";
import { advanceSetup, newSetup, gate } from "./strategy";
import { candles, marketUniverse, depth, sweep, derivatives, bitcoinContext, type Instrument } from "./market";
import { readAccount, readMarket, saveMarket, mutateAccount, ownersToMonitor, workerLease } from "./store";
import { logger } from "../lib/logger";
import { scoreCandidate } from "./native-model";
import type { Candle, MarketAsset, Account } from "./types";

export let heartbeat = new Date().toISOString();
let lastScanTime = 0;
let activeScan: Promise<{ ok: boolean; message: string }> | null = null;

async function monitor(a: Account): Promise<void> {
  const symbols = [...new Set([...a.trades.filter(t => t.status === "OPEN").map(t => t.symbol), ...a.shadow.map(s => s.symbol)])];
  for (const symbol of symbols) {
    try {
      const [m15, book] = await Promise.all([candles(symbol, "15m", 1000), depth(symbol)]);
      const bid = book.bids[0][0];
      for (const t of a.trades.filter(t => t.symbol === symbol && t.status === "OPEN")) {
        t.mark = bid;
        const start = a.checked[t.id] ?? Date.parse(t.openedAt);
        const unchecked = m15.filter(b => b.time >= start && b.time > Date.parse(t.openedAt));
        const stopTouched = bid <= t.stop || unchecked.some(b => b.low <= t.stop);
        const targetTouched = bid >= t.target;
        const timed = Date.now() - Date.parse(t.openedAt) >= RISK.maxHoldingHours * 3600000;
        if (stopTouched || targetTouched || timed) {
          // Observational polling paper: exit at available book, adverse stop cap; never claim tick fill.
          const fill = sweep(book.bids, t.quantity);
          closeTrade(a, t, stopTouched ? Math.min(fill, t.stop) : fill, Date.now(), stopTouched ? "STOP" : targetTouched ? "TARGET" : "TIME");
          activity(a, "EXIT", `${symbol} clôturé (${t.exitReason}), PnL net ${t.pnl.toFixed(2)} USDT.`);
        }
        a.checked[t.id] = m15.at(-1)!.time + M15;
      }
      for (const s of a.shadow.filter(s => s.symbol === symbol)) {
        const future = m15.filter(b => b.time >= s.checked && b.time > s.time);
        let outcome: string | null = null, exitTime: number | null = null, exitPrice: number | null = null;
        for (const b of future) {
          if (b.low <= s.stop) { outcome = "LOSS"; exitTime = b.time + M15; exitPrice = Math.min(b.open, s.stop); break; }
          if (b.high >= s.target) { outcome = "WIN"; exitTime = b.time + M15; exitPrice = s.target; break; }
          if (b.time - s.time >= RISK.maxHoldingHours * 3600000) { outcome = "TIMEOUT"; exitTime = b.time + M15; exitPrice = b.open; break; }
        }
        const d = a.decisions.find(d => d.id === s.decisionId);
        if (outcome && d) {
          d.outcome = outcome; d.features.labelEnd = exitTime!;
          const modeledRisk = s.entry * (1 + RISK.feeRate) - s.stop * (1 - RISK.slippageRate) * (1 - RISK.feeRate);
          d.features.netR = (exitPrice! * (1 - RISK.slippageRate) * (1 - RISK.feeRate) - s.entry * (1 + RISK.feeRate)) / modeledRisk;
          a.shadow = a.shadow.filter(x => x !== s);
        } else s.checked = m15.at(-1)!.time + M15;
      }
    } catch (e) { activity(a, "WARNING", `${symbol} surveillance interrompue : ${(e as Error).message}`); }
  }
  recordEquity(a);
  const p = portfolio(a);
  if (p.drawdown >= RISK.drawdownLimit || p.equity <= a.dailyStart * (1 - RISK.dailyLossLimit)) {
    if (!a.halted) activity(a, "HALT", "Coupe-circuit : nouvelles entrées bloquées, sorties toujours surveillées.");
    a.halted = true; a.running = false;
  }
}

async function processSignal(a: Account, asset: MarketAsset, h4: Candle[], m15: Candle[], instrument: Instrument, btcShock: number | null): Promise<void> {
  const result = advanceSetup(a.setups[asset.symbol] || newSetup(), h4, m15);
  a.setups[asset.symbol] = result.setup;
  if (!result.signal) return;
  const id = `${asset.symbol}:${result.setup.signalBar}:${VERSION}`;
  if (a.decisions.some(d => d.id === id)) return;
  const features = { ...result.features, volumeRatio: asset.volumeRatio!, relativeStrength: asset.relativeStrength!, ...(btcShock !== null ? { btcShock } : {}) };
  let available = true;
  try { Object.assign(features, await derivatives(asset.symbol)); } catch { available = false; }
  const reasons = gate(features, available, btcShock !== null);
  const now = Date.now(), lastClosed = m15.at(-1)!;
  if (now - (lastClosed.time + M15) > 180000) reasons.push("Signal trop ancien (plus de 3 minutes).");
  const d = { id, symbol: asset.symbol, time: new Date(now).toISOString(), accepted: false, score: null,
    reasons, features, outcome: null, shadowScore: null as number | null, shadowModelId: null as string | null };
  try { Object.assign(d, await scoreCandidate(a, features)); }
  catch (e) { activity(a, "MODEL_WARNING", `Scoring shadow indisponible : ${(e as Error).message}. Baseline inchangée.`); }
  try {
    const book = await depth(asset.symbol), ask = book.asks[0][0];
    const prototype = newAccount();
    const virtual = openTrade(prototype, id, asset.symbol, ask, result.stop, now, "SHADOW", instrument.step, instrument.minNotional);
    a.shadow.push({ decisionId: id, symbol: asset.symbol, time: now, checked: Math.ceil(now / M15) * M15,
      entry: virtual.entry, stop: virtual.stop, target: virtual.target });
    if (!reasons.length) {
      const temp = structuredClone(a);
      const preview = openTrade(temp, id, asset.symbol, ask, result.stop, now, "BINANCE_SPOT_PAPER", instrument.step, instrument.minNotional);
      const fill = sweep(book.asks, preview.quantity);
      // Use whole observed depth's conservative maximum ask to size safely even if rounding changes quantity.
      const cappedAsk = Math.max(fill, ask);
      const finalTemp = structuredClone(a);
      const finalPreview = openTrade(finalTemp, id, asset.symbol, cappedAsk, result.stop, now, "BINANCE_SPOT_PAPER", instrument.step, instrument.minNotional, preview.quantity);
      const actualFill = sweep(book.asks, finalPreview.quantity);
      const trade = openTrade(a, id, asset.symbol, Math.max(actualFill, cappedAsk), result.stop, now, "BINANCE_SPOT_PAPER", instrument.step, instrument.minNotional, finalPreview.quantity);
      d.accepted = true; reasons.push("Baseline déterministe validée. Aucun score IA disponible.");
      activity(a, "ENTRY", `${asset.symbol} : entrée virtuelle ${trade.quantity} à ${trade.entry.toFixed(6)}.`);
    }
  } catch (e) { reasons.push((e as Error).message); }
  a.decisions.push(d);
  activity(a, d.accepted ? "ACCEPT" : "REJECT", `${asset.symbol} : ${reasons.join(" ")}`);
}

export async function scan(): Promise<{ ok: boolean; message: string }> {
  if (activeScan) return activeScan;
  if (Date.now() - lastScanTime < 60000) return { ok: false, message: "Un scan maximum par minute ; données déjà collectées." };
  activeScan = (async () => {
    const lease = await workerLease();
    if (!lease) return { ok: false, message: "Un autre cycle est en cours." };
    try {
      lastScanTime = Date.now();
      const owners = await ownersToMonitor();
      // Exits are independent of scanner success: a ticker/ranking failure must not stop monitoring.
      for (const owner of owners) await mutateAccount(owner, monitor);
      const market = await marketUniverse();
      const qualified = market.assets.filter(a => a.state === "WATCH").slice(0, 5);
      const contexts = new Map<string, { h4: Candle[]; m15: Candle[] }>();
      for (const a of qualified) {
        try {
          const [h4, m15] = await Promise.all([candles(a.symbol, "4h", 250), candles(a.symbol, "15m", 1000)]);
          contexts.set(a.symbol, { h4, m15 });
          const diagnostic = advanceSetup(newSetup(), h4, m15);
          a.state = diagnostic.setup.state; a.reasons = diagnostic.reasons;
        } catch (e) { a.state = "UNAVAILABLE"; a.reasons = [(e as Error).message]; }
      }
      let btcShock: number | null = null;
      try { btcShock = await bitcoinContext(); } catch { /* Explicit null is handled by gate. */ }
      for (const owner of owners) await mutateAccount(owner, async a => {
        if (!a.running || a.halted) return;
        for (const asset of qualified) {
          const ctx = contexts.get(asset.symbol), instrument = market.instruments.find(i => i.symbol === asset.symbol);
          if (ctx && instrument) await processSignal(a, asset, ctx.h4, ctx.m15, instrument, btcShock);
        }
      });
      let derivativeMessage = "Dérivés OI/funding disponibles.";
      try { await derivatives("BTCUSDT"); } catch (e) { derivativeMessage = `${(e as Error).message} Filtre requis absent → NO_TRADE.`; }
      const status = { assets: market.assets, status: "healthy" as const, lastScan: new Date().toISOString(),
        message: `Binance Spot REST connecté · univers liquide limité à 30 paires · bougies clôturées. ${derivativeMessage}` };
      await saveMarket(status);
      heartbeat = new Date().toISOString();
      return { ok: true, message: `${market.assets.length} actifs analysés, ${qualified.length} candidats. Aucun ordre réel.` };
    } catch (e) {
      const prev = await readMarket();
      await saveMarket({ ...prev, status: "unavailable", message: (e as Error).message });
      logger.warn({ err: e }, "Market scan unavailable");
      return { ok: false, message: (e as Error).message };
    } finally { await lease.release(); activeScan = null; }
  })();
  const result = await activeScan;
  activeScan = null;
  return result;
}

export async function snapshot(owner: string | null) {
  const [a, market] = await Promise.all([readAccount(owner), readMarket()]);
  return {
    engine: { mode: "paper" as const, running: a.running, halted: a.halted, authenticated: !!owner,
      feedStatus: market.status, feedMessage: market.message, lastScan: market.lastScan, heartbeat,
      baselineVersion: VERSION, modelStatus: a.models.some(m => m.status === "SHADOW_UNVERIFIED") ? "CANDIDAT SHADOW NON HOMOLOGUÉ — baseline seule décide" : "ABSENT — baseline déterministe, aucun score inventé",
      nextCycleSeconds: Math.max(0, Math.ceil((lastScanTime + 60000 - Date.now()) / 1000)) },
    portfolio: portfolio(a), risk: RISK,
    assets: market.assets.map(asset => ({ ...asset, ...(a.setups[asset.symbol] ? { state: a.setups[asset.symbol].state } : {}) })),
    trades: [...a.trades].reverse(), decisions: [...a.decisions].reverse(),
    activity: [...a.activity].reverse(), equityCurve: a.equityCurve,
    nativeModels: a.models.map(({ objectPath: _path, ...meta }) => meta), proposals: [...a.proposals].reverse(),
  };
}

export function startWorker(): void {
  const tick = () => { heartbeat = new Date().toISOString(); void scan().catch(e => logger.error({ err: e }, "Worker failure")); };
  setTimeout(tick, 2000).unref();
  setInterval(tick, 60000).unref();
}
export function trainingRows(a: Account) {
  return a.decisions.filter(d => d.outcome !== null && FEATURE_ORDER.every(k => Number.isFinite(d.features[k]))).map(d => ({
    id: d.id, symbol: d.symbol, time: Date.parse(d.time), label_end: d.features.labelEnd,
    source: "binance_shadow", accepted: d.accepted, target: d.outcome === "WIN" ? 1 : 0, net_r: d.features.netR,
    ...Object.fromEntries(FEATURE_ORDER.map(k => [k, d.features[k]])),
  }));
}