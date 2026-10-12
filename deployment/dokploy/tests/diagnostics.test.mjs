import test from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../../../artifacts/api-server/src/lab/diagnostic-summary.ts";

const check = (symbol, stage, status, reasons = []) => ({ symbol, stage, status, reasons });
const cycle = (time, checks, status = "healthy") => ({
  time, baselineVersion: "frankenstein-baseline-1", ownerRunning: true, status, checks,
});

test("un candidat bloqué par compression reste visible sans décision ni trade", () => {
  const report = summarize([
    cycle("2026-10-12T13:00:00.000Z", [
      check("MAGICUSDT", "COMPRESSION_H4", "WAITING", ["Compression H4 absente."]),
      check("ETHUSDT", "VOLUME", "FILTERED", ["Volume clôturé <3× moyenne 20 jours."]),
    ]),
  ]);
  assert.equal(report.cycles, 1);
  assert.equal(report.observations, 2);
  assert.equal(report.candidates, 1);
  assert.equal(report.signals, 0);
  assert.deepEqual(report.stages, [
    { label: "COMPRESSION_H4", count: 1 }, { label: "VOLUME", count: 1 },
  ]);
});

test("les compteurs sont par observation, avec rejets, entrées et erreurs distincts", () => {
  const cycles = [
    cycle("2026-10-12T13:00:00.000Z", [check("MAGICUSDT", "DATA", "ERROR", ["Bougies absentes"])]),
    cycle("2026-10-12T13:01:00.000Z", [check("MAGICUSDT", "DECISION", "REJECTED", ["OI absent"])]),
    cycle("2026-10-12T13:02:00.000Z", [check("MAGICUSDT", "DECISION", "ACCEPTED", ["Baseline validée"])]),
    cycle("2026-10-12T13:03:00.000Z", [check("MARKET", "MARKET", "ERROR", ["Flux indisponible"])], "unavailable"),
  ];
  const report = summarize(cycles);
  assert.equal(report.cycles, 4);
  assert.equal(report.observations, 4);
  assert.equal(report.candidates, 3);
  assert.equal(report.signals, 2);
  assert.equal(report.accepted, 1);
  assert.equal(report.rejected, 1);
  assert.equal(report.errors, 3); // two error observations + one unavailable cycle
  assert.deepEqual(summarize([]).stages, []);
});
