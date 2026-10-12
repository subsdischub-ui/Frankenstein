import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { H4, M15, RISK, FEATURE_ORDER } from "../src/lab/config";
import { validateCandles, rsi, aggregateH4 } from "../src/lab/indicators";
import { advanceSetup, gate, newSetup } from "../src/lab/strategy";
import { newAccount, portfolio, openTrade, closeTrade, replayExit, recordEquity, activity } from "../src/lab/portfolio";
import { sweep } from "../src/lab/market";
import { demoCandles, runReplay, bootstrap, backtest } from "../src/lab/replay";
import { validateNativeModel, predictShadow } from "../src/lab/native-model";
import { mutateAccount, readAccount, saveExperiment, listExperiments, auditRaw } from "../src/lab/store";
import { RunReplayBody, CreateProposalBody } from "@workspace/api-zod";
import type { Candle } from "../src/lab/types";

const base = Date.UTC(2025, 0, 1);
const owner = `test:${randomUUID()}`;
const candle = (time: number, close = 100): Candle => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 100, quoteVolume: close * 100, takerBuy: 55 });
after(async () => {
  for (const table of ["lab_events", "lab_experiments", "lab_accounts"])
    await pool.query(`DELETE FROM ${table} WHERE owner=$1`, [owner]);
  await pool.end();
});
test("Données : bougie ouverte, trous, doublons, NaN et OHLC invalides refusés", () => {
  const bars = [candle(base), candle(base + M15)];
  assert.equal(validateCandles(bars).length, 2);
  assert.throws(() => validateCandles([candle(Math.floor(Date.now() / M15) * M15)]), /ouverte/);
  assert.throws(() => validateCandles([bars[0], bars[0]]), /Doublon/);
  assert.throws(() => validateCandles([bars[0], candle(base + 2 * M15)]), /trou/);
  assert.throws(() => validateCandles([{ ...bars[0], volume: NaN }]), /finie/);
  assert.throws(() => validateCandles([{ ...bars[0], high: 99 }]), /OHLCV/);
  assert.throws(() => validateCandles([{ ...bars[0], takerBuy: 101 }]), /OHLCV/);
});
test("Indicateurs : RSI haussier/baissier/plat sans aléatoire", () => {
  assert.equal(rsi(Array.from({ length: 40 }, (_, i) => i)), 100);
  assert.equal(rsi(Array.from({ length: 40 }, (_, i) => 40 - i)), 0);
  assert.equal(rsi(Array(40).fill(100)), 50);
});
test("Point-in-time : agrégation ignore le groupe H4 inachevé", () => {
  const bars = Array.from({ length: 32 }, (_, i) => candle(base + i * M15, 100 + i));
  assert.equal(aggregateH4(bars, base + 31 * M15).length, 1);
  assert.equal(aggregateH4(bars, base + 32 * M15).length, 2);
});
test("Machine : Donchian exclut cassure, attente puis repli puis reprise", () => {
  const h4 = Array.from({ length: 220 }, (_, i) => candle(base + i * H4, 100 + i * .1));
  for (let j = 0; j < 4; j++) {
    const b = h4[215 + j], width = [1, .8, .5, .2][j]; b.high = b.close + width; b.low = b.close - width;
  }
  const breakout = h4.at(-1)!; breakout.open = 122; breakout.close = 130; breakout.high = 131; breakout.low = 121.9;
  const m15 = Array.from({ length: 96 }, (_, i) => {
    const b = candle(breakout.time - 80 * M15 + i * M15, 130 - i * .025); b.high = b.close + .01; b.low = b.close - .01; return b;
  });
  const armed = advanceSetup(newSetup(), h4, m15);
  assert.equal(armed.setup.state, "ARMED"); assert.equal(armed.signal, false);
  assert.match(armed.reasons[0], /après clôture/);
  m15.push({ ...candle(breakout.time + H4, 127.6), high: 127.61, low: 127.59 });
  const pulled = advanceSetup(armed.setup, h4, m15);
  assert.equal(pulled.setup.state, "PULLBACK"); assert.equal(pulled.signal, false);
  m15.push({ ...candle(breakout.time + H4 + M15, 129), open: 127.6, low: 127.5 });
  const confirmed = advanceSetup(pulled.setup, h4, m15);
  assert.equal(confirmed.setup.state, "CONFIRMED"); assert.equal(confirmed.signal, true);
  assert.equal(advanceSetup(confirmed.setup, h4, m15).signal, false);
});
test("Machine : aucun signal forcé sur série plate ; expiry et invalidation", () => {
  const h4 = Array.from({ length: 210 }, (_, i) => candle(base + i * H4, 100 + i * .1));
  const m15 = Array.from({ length: 40 }, (_, i) => candle(base + 210 * H4 + i * M15, 121));
  const plain = advanceSetup(newSetup(), h4, m15);
  assert.equal(plain.signal, false);
  const expired = advanceSetup({ ...newSetup(), state: "ARMED", anchor: base, resistance: 100 }, h4, m15);
  assert.equal(expired.setup.state, "EXPIRED");
  const invalid = advanceSetup({ ...newSetup(), state: "ARMED", anchor: m15[0].time, resistance: 140 }, h4, m15);
  assert.equal(invalid.setup.state, "INVALIDATED");
});
test("Portier : dérivés/BTC absents refusés, seuil funding en fraction", () => {
  assert.equal(gate({ cvd: 1 }, false, false).length, 2);
  assert.equal(gate({ deltaOi: .2, fundingRate: .0006, cvd: 1, btcShock: 0 }, true, true).length, 1);
  assert.equal(gate({ deltaOi: .2, fundingRate: .0004, cvd: 1, btcShock: 0 }, true, true).length, 0);
  assert.equal(gate({ cvd: -1, btcShock: 1, deltaOi: 0, fundingRate: 0 }, true, true).length, 2);
});
test("Comptabilité : cash, frais aller-retour, equity et PnL net réconciliés", () => {
  const a = newAccount(), t = openTrade(a, "id", "SOLUSDT", 100, 98, base, "TEST");
  assert.ok(a.cash >= 0); assert.ok(t.quantity * t.entry <= 2000.00001);
  assert.ok(Math.abs(a.cash - (10000 - t.quantity * t.entry - t.fees)) < 1e-7);
  closeTrade(a, t, 105, base + M15, "TARGET");
  assert.ok(t.fees > 2 * 100 * t.quantity * RISK.feeRate);
  assert.ok(Math.abs(a.cash - (10000 + t.pnl)) < 1e-7);
  assert.equal(portfolio(a).equity, a.cash);
  const previous = a.cash; closeTrade(a, t, 105, base + 2 * M15, "DUPLICATE"); assert.equal(a.cash, previous);
});
test("Replay : double-touch stop d'abord, gap peut dépasser 0,5%", () => {
  const a = newAccount(), t = openTrade(a, "double", "SOLUSDT", 100, 98, base, "TEST");
  replayExit(a, t, { ...candle(base + M15), open: 100, high: t.target + 2, low: 95, close: 100 });
  assert.equal(t.exitReason, "STOP");
  const b = newAccount(), g = openTrade(b, "gap", "SOLUSDT", 100, 98, base, "TEST");
  replayExit(b, g, { ...candle(base + M15, 80), open: 80, high: 90, low: 79 });
  assert.ok(g.pnl < -10000 * RISK.riskPerTrade);
});
test("Risque : doublon, maximum positions, drawdown et kill switch", () => {
  const a = newAccount(); openTrade(a, "1", "SOLUSDT", 100, 90, base, "TEST");
  assert.throws(() => openTrade(a, "1", "ETHUSDT", 100, 90, base, "TEST"), /dupliqué/);
  openTrade(a, "2", "ETHUSDT", 100, 90, base, "TEST");
  openTrade(a, "3", "BNBUSDT", 100, 90, base, "TEST");
  assert.ok(portfolio(a).openRisk <= portfolio(a).equity * RISK.maxOpenRisk + 1e-5);
  assert.throws(() => openTrade(a, "4", "XRPUSDT", 100, 90, base, "TEST"), /positions/);
  const stopped = newAccount(); stopped.halted = true;
  assert.throws(() => openTrade(stopped, "x", "SOLUSDT", 100, 98, base, "TEST"), /Arrêt/);
  const dd = newAccount(); dd.cash = 9000;
  assert.throws(() => openTrade(dd, "d", "SOLUSDT", 100, 98, base, "TEST"), /circuit/);
});
test("Carnet : volume consommé, refus profondeur insuffisante", () => {
  assert.equal(sweep([[100, 1], [102, 1]], 2), 101);
  assert.throws(() => sweep([[100, 1]], 2), /Profondeur/);
});
test("Démo : cycle complet isolé, non promouvable, quatre ablations", () => {
  const report = runReplay({ source: "demo", strategy: "hybrid" });
  assert.equal(report.source, "SYNTHETIC_DEMO"); assert.equal(report.status, "DEMO_TECHNIQUE");
  assert.equal(report.trades, 1); assert.equal(report.journal[0].status, "CLOSED");
  assert.equal(report.comparisons.length, 4); assert.equal(report.confidenceLow, null);
  assert.ok(report.notes.some(n => n.includes("injecté"))); assert.ok(report.fees > 0);
});
test("Backtest réel mono-actif : benchmark absent interdit hybrid, hash reproductible", () => {
  const bars = demoCandles();
  const first = backtest(bars, "hybrid", "SOLUSDT", "USER_IMPORT_UNVERIFIED");
  const second = backtest(bars, "hybrid", "SOLUSDT", "USER_IMPORT_UNVERIFIED");
  assert.equal(first.trades, 0); assert.equal(first.dataHash, second.dataHash); assert.equal(first.pnl, second.pnl);
  assert.ok(first.notes.some(n => n.includes("Bitcoin absent")));
});
test("Incertitude : faible échantillon = null ; bootstrap bloc déterministe", () => {
  assert.deepEqual(bootstrap([1, 2]), [null, null]);
  const values = Array.from({ length: 50 }, (_, i) => i % 3 === 0 ? -3 : 1);
  assert.deepEqual(bootstrap(values), bootstrap(values)); assert.ok(bootstrap(values)[0]! <= bootstrap(values)[1]!);
});
test("Schémas : paramètres risque hors bornes et candles invalides rejetés", () => {
  assert.equal(CreateProposalBody.safeParse({ volumeRatio: 0, rsiMax: 90, expiryBars: 2 }).success, false);
  assert.equal(RunReplayBody.safeParse({ source: "live", strategy: "hybrid" }).success, false);
  assert.equal(RunReplayBody.safeParse({ source: "import", strategy: "trend", candles: [] }).success, false);
});
test("Modèle : JSON natif strict, schéma/hash, scoring shadow uniquement", () => {
  const raw = JSON.stringify({ learner: { objective: { name: "binary:logistic" },
    learner_model_param: { num_feature: "9", num_class: "0", base_score: "[5E-1]" }, feature_names: [],
    gradient_booster: { name: "gbtree", model: { tree_info: [0], trees: [{ left_children: [-1], right_children: [-1],
      split_indices: [0], split_conditions: [1], split_type: [0] }] } } } });
  const manifest = { schemaVersion: 1, featureOrder: FEATURE_ORDER, modelHash: createHash("sha256").update(raw).digest("hex"),
    status: "CANDIDATE_EXTERNAL_NOT_PROMOTED", threshold: .5, calibration: { method: "platt_logit", slope: 1, intercept: 0 } };
  const model = validateNativeModel(raw, manifest), score = predictShadow(model, Object.fromEntries(FEATURE_ORDER.map(k => [k, 1])));
  assert.ok(score! > .73 && score! < .74); assert.equal(predictShadow(model, {}), null);
  assert.throws(() => validateNativeModel(raw, { ...manifest, featureOrder: ["bad"] }), /features/);
  assert.throws(() => validateNativeModel(raw, { ...manifest, modelHash: "bad" }), /Hash/);
  assert.throws(() => validateNativeModel("pickle", manifest), /Hash/);
});
test("Persistance : mutations concurrentes atomiques, reprise et événements append-only", async () => {
  await Promise.all(Array.from({ length: 8 }, (_, i) => mutateAccount(owner, a => {
    a.cash -= 1; activity(a, "TEST", `atomic-${i}`);
  })));
  const restored = await readAccount(owner);
  assert.equal(restored.cash, 9992); assert.equal((await auditRaw(owner)).length, 8);
  const experiment = runReplay({ source: "demo", strategy: "hybrid" });
  await saveExperiment(owner, experiment);
  const persisted = await listExperiments(owner);
  assert.equal(persisted[0].id, experiment.id); assert.equal(persisted[0].journal[0].status, "CLOSED");
  await mutateAccount(owner, a => { a.running = false; a.halted = true; recordEquity(a); });
  assert.equal((await readAccount(owner)).halted, true);
  assert.equal((await auditRaw(owner)).length, 8);
});