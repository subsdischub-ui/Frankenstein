import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { VERSION } from "./config";
import { summarize } from "./diagnostic-summary";

export type DiagnosticCheck = {
  symbol: string;
  stage: string;
  status: "FILTERED" | "WAITING" | "ERROR" | "SIGNAL" | "ACCEPTED" | "REJECTED";
  reasons: string[];
};

export type DiagnosticCycle = {
  time: string;
  baselineVersion: string;
  status: "healthy" | "unavailable";
  ownerRunning: boolean;
  checks: DiagnosticCheck[];
};

// One immutable event per monitored owner/cycle. Never store model bytes or credentials.
export async function recordDiagnostic(owner: string, cycle: DiagnosticCycle): Promise<void> {
  await pool.query(
    "INSERT INTO lab_events(id,owner,time,payload) VALUES($1,$2,$3,$4)",
    [randomUUID(), owner, cycle.time, JSON.stringify({ type: "SCAN_DIAGNOSTIC", cycle })],
  );
}

export async function diagnosticReport(owner: string, full = false) {
  const now = new Date(), cutoff = new Date(now.getTime() - 72 * 3600_000);
  const { rows } = await pool.query<{ cycle: DiagnosticCycle }>(
    `SELECT payload->'cycle' AS cycle FROM lab_events
     WHERE owner=$1 AND time >= $2 AND payload->>'type'='SCAN_DIAGNOSTIC'
     ORDER BY time DESC, id DESC`,
    [owner, cutoff],
  );
  const cycles = rows.map(r => r.cycle);
  const recent24 = cycles.filter(c => Date.parse(c.time) >= now.getTime() - 24 * 3600_000);
  const first = await pool.query<{ time: Date }>(
    `SELECT time FROM lab_events WHERE owner=$1 AND payload->>'type'='SCAN_DIAGNOSTIC'
     ORDER BY time ASC LIMIT 1`, [owner],
  );
  return {
    schemaVersion: 1, generatedAt: now.toISOString(), baselineVersion: VERSION, mode: "paper" as const,
    firstRecordedAt: first.rows[0]?.time.toISOString() ?? null,
    lastRecordedAt: cycles[0]?.time ?? null,
    last24h: summarize(recent24), last72h: summarize(cycles),
    cycles: full ? cycles : cycles.slice(0, 20),
  };
}
