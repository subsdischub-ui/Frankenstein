import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { newAccount } from "./portfolio";
import type { Account, Experiment, MarketStatus } from "./types";

export async function readAccount(owner: string | null): Promise<Account> {
  if (!owner) return newAccount();
  const { rows } = await pool.query("SELECT state FROM lab_accounts WHERE owner=$1", [owner]);
  const state = rows[0]?.state || newAccount();
  state.models ??= [];
  return state;
}
export async function mutateAccount<T>(owner: string, fn: (account: Account) => T | Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["account:" + owner]);
    const { rows } = await client.query("SELECT state FROM lab_accounts WHERE owner=$1 FOR UPDATE", [owner]);
    const state: Account = rows[0]?.state || newAccount();
    state.models ??= [];
    const previousIds = new Set(state.activity.map(e => e.id));
    const result = await fn(state);
    await client.query("INSERT INTO lab_accounts(owner,state) VALUES($1,$2) ON CONFLICT(owner) DO UPDATE SET state=$2,updated_at=now()", [owner, JSON.stringify(state)]);
    for (const event of state.activity.filter(e => !previousIds.has(e.id)))
      await client.query("INSERT INTO lab_events(id,owner,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [event.id, owner, JSON.stringify(event)]);
    await client.query("COMMIT");
    return result;
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
export async function saveMarket(status: MarketStatus): Promise<void> {
  await pool.query("INSERT INTO lab_market(id,payload) VALUES('current',$1) ON CONFLICT(id) DO UPDATE SET payload=$1", [JSON.stringify(status)]);
}
export async function readMarket(): Promise<MarketStatus> {
  const { rows } = await pool.query("SELECT payload FROM lab_market WHERE id='current'");
  const status: MarketStatus = rows[0]?.payload || { assets: [], status: "waiting", message: "Collecte initiale en attente.", lastScan: null };
  if (status.status === "healthy" && status.lastScan && Date.now() - Date.parse(status.lastScan) > 10 * 60000) {
    status.status = "stale"; status.message = "Données périmées : aucune nouvelle entrée.";
  }
  return status;
}
export async function listExperiments(owner: string | null): Promise<Experiment[]> {
  if (!owner) return [];
  const { rows } = await pool.query("SELECT report FROM lab_experiments WHERE owner=$1 ORDER BY created_at DESC LIMIT 50", [owner]);
  return rows.map(r => r.report);
}
export async function saveExperiment(owner: string, report: Experiment): Promise<void> {
  await pool.query("INSERT INTO lab_experiments(id,owner,report) VALUES($1,$2,$3)", [report.id, owner, JSON.stringify(report)]);
}
export async function auditRaw(owner: string): Promise<unknown[]> {
  const { rows } = await pool.query("SELECT payload FROM lab_events WHERE owner=$1 ORDER BY time DESC LIMIT 10000", [owner]);
  return rows.map(r => r.payload);
}
// A session-level advisory lock ensures one market worker across concurrent API processes.
export async function workerLease() {
  const client = await pool.connect();
  const { rows } = await client.query("SELECT pg_try_advisory_lock(73180421) AS acquired");
  if (!rows[0].acquired) { client.release(); return null; }
  return { client, release: async () => { await client.query("SELECT pg_advisory_unlock(73180421)"); client.release(); } };
}
export async function ownersToMonitor(): Promise<string[]> {
  const { rows } = await pool.query("SELECT owner FROM lab_accounts WHERE state->>'running'='true' OR EXISTS(SELECT 1 FROM jsonb_array_elements(state->'trades') t WHERE t->>'status'='OPEN') OR jsonb_array_length(state->'shadow')>0");
  return rows.map(r => r.owner);
}
export const newId = randomUUID;