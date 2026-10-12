import type { DiagnosticCycle } from "./diagnostics";

// A count is one observed asset per scan, not one distinct symbol or trade.
export function summarize(cycles: DiagnosticCycle[]) {
  const stages = new Map<string, number>(), reasons = new Map<string, number>();
  let observations = 0, candidates = 0, signals = 0, accepted = 0, rejected = 0, errors = 0;
  for (const cycle of cycles) {
    if (cycle.status === "unavailable") errors++;
    for (const check of cycle.checks) {
      observations++;
      if (check.stage !== "VOLUME" && check.stage !== "RELATIVE_STRENGTH" &&
          check.stage !== "MARKET" && check.stage !== "PAUSED") candidates++;
      if (check.status === "SIGNAL" || check.status === "ACCEPTED" || check.status === "REJECTED") signals++;
      if (check.status === "ACCEPTED") accepted++;
      if (check.status === "REJECTED") rejected++;
      if (check.status === "ERROR") errors++;
      stages.set(check.stage, (stages.get(check.stage) ?? 0) + 1);
      for (const reason of check.reasons) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }
  const ordered = (m: Map<string, number>) => [...m].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { cycles: cycles.length, observations, candidates, signals, accepted, rejected, errors,
    stages: ordered(stages), reasons: ordered(reasons) };
}
