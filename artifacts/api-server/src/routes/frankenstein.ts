import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  GetSnapshotResponse, ControlEngineBody, RunReplayBody, RunReplayResponse, CreateProposalBody,
  GetAuditsResponse, ListExperimentsResponse, ExportJournalResponse, ControlEngineResponse, ScanMarketResponse,
  ImportNativeModelBody,
} from "@workspace/api-zod";
import { scan, snapshot, trainingRows } from "../lab/engine";
import { activity } from "../lab/portfolio";
import { mutateAccount, readAccount, listExperiments, saveExperiment, auditRaw, newId } from "../lab/store";
import { runReplay } from "../lab/replay";
import { AUDITS } from "../lab/audits";
import { FEATURE_ORDER, VERSION, PARAMS } from "../lab/config";
import { importModel } from "../lab/native-model";

const router: IRouter = Router();
const limits = new Map<string, number>();
router.use("/frankenstein", (req, res, next) => {
  if (req.method === "GET") { next(); return; }
  const origin = req.get("origin");
  if (origin) {
    const host = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
    if (new URL(origin).host !== host) { res.status(403).json({ error: "Origine non autorisée." }); return; }
  }
  // Technical demonstration may run publicly, but never touches a portfolio.
  if (req.path === "/replay" && req.body?.source === "demo") {
    const key = `demo:${req.ip || "unknown"}`, now = Date.now();
    if (now - (limits.get(key) || 0) < 3000) { res.status(429).json({ error: "Attendre 3 secondes entre les démonstrations." }); return; }
    limits.set(key, now); next(); return;
  }
  if (!getAuth(req).userId) { res.status(401).json({ error: "Connexion requise pour modifier votre portefeuille virtuel." }); return; }
  const key = `${getAuth(req).userId}:${req.path}`, now = Date.now();
  if (now - (limits.get(key) || 0) < 2000) { res.status(429).json({ error: "Action trop fréquente." }); return; }
  limits.set(key, now);
  if (limits.size > 10000) limits.clear();
  next();
});
router.get("/frankenstein/snapshot", async (req, res): Promise<void> => {
  res.json(GetSnapshotResponse.parse(await snapshot(getAuth(req).userId)));
});
router.post("/frankenstein/control", async (req, res): Promise<void> => {
  const input = ControlEngineBody.safeParse(req.body);
  if (!input.success || Object.keys(req.body).some(k => k !== "action")) { res.status(400).json({ error: "Seule l'action start/pause/halt est autorisée." }); return; }
  await mutateAccount(getAuth(req).userId!, a => {
    if (input.data.action === "start") { a.running = true; a.halted = false; }
    else { a.running = false; if (input.data.action === "halt") a.halted = true; }
    activity(a, "CONTROL", input.data.action === "start" ? "Moteur paper démarré. Aucun ordre réel." : "Entrées bloquées ; sorties virtuelles toujours surveillées.");
  });
  res.json(ControlEngineResponse.parse({ ok: true, message: "Commande persistée ; surveillance des sorties conservée." }));
});
router.post("/frankenstein/scan", async (_req, res): Promise<void> => {
  res.json(ScanMarketResponse.parse(await scan()));
});
router.post("/frankenstein/replay", async (req, res): Promise<void> => {
  const parsed = RunReplayBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const report = runReplay(parsed.data);
    const owner = getAuth(req).userId;
    if (owner) await saveExperiment(owner, report);
    res.json(RunReplayResponse.parse(report));
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});
router.get("/frankenstein/experiments", async (req, res): Promise<void> => {
  res.json(ListExperimentsResponse.parse(await listExperiments(getAuth(req).userId)));
});
router.post("/frankenstein/proposals", async (req, res): Promise<void> => {
  const parsed = CreateProposalBody.safeParse(req.body);
  if (!parsed.success || Object.keys(req.body).some(k => !["volumeRatio", "rsiMax", "expiryBars"].includes(k))) {
    res.status(400).json({ error: "Proposition invalide. Les invariants de risque ne peuvent pas être modifiés." }); return;
  }
  await mutateAccount(getAuth(req).userId!, a => {
    a.proposals.push({ id: newId(), createdAt: new Date().toISOString(), params: parsed.data, status: "PROPOSED_NOT_VALIDATED" });
    activity(a, "PROPOSAL", `Candidat ${JSON.stringify(parsed.data)} enregistré, baseline inchangée. Validation externe requise.`);
  });
  res.json({ ok: true, message: "Candidat enregistré pour recherche. Ni testé ni promu automatiquement." });
});
router.post("/frankenstein/models", async (req, res): Promise<void> => {
  const parsed = ImportNativeModelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "JSON modèle/manifeste invalide." }); return; }
  if (JSON.stringify(parsed.data.manifest).length > 200000) { res.status(400).json({ error: "Manifeste trop volumineux (200 Ko maximum)." }); return; }
  try {
    const owner = getAuth(req).userId!;
    await mutateAccount(owner, async a => {
      if (a.models.filter(m => m.status === "SHADOW_UNVERIFIED").length >= 5) throw new Error("Cinq candidats actifs maximum ; retirer un candidat d'abord.");
      const model = await importModel(owner, parsed.data.nativeModel, parsed.data.manifest);
      a.models.push(model); activity(a, "MODEL_IMPORT", `Modèle ${model.hash.slice(0, 12)} importé en SHADOW_UNVERIFIED, aucun pouvoir de décision.`);
    });
    res.json({ ok: true, message: "Candidat natif stocké en privé, scoring shadow uniquement. Rapport externe non homologué, baseline inchangée." });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});
router.delete("/frankenstein/models/:id", async (req, res): Promise<void> => {
  try {
    await mutateAccount(getAuth(req).userId!, a => {
      const model = a.models.find(m => m.id === req.params.id);
      if (!model) throw new Error("Modèle introuvable dans votre compte.");
      model.status = "RETIRED"; activity(a, "MODEL_RETIRE", `Candidat ${model.id} retiré ; historique et baseline conservés.`);
    });
    res.json({ ok: true, message: "Scoring candidat désactivé. Baseline conservée et audit intact." });
  } catch (e) { res.status(404).json({ error: (e as Error).message }); }
});
router.get("/frankenstein/audits", (_req, res) => { res.json(GetAuditsResponse.parse(AUDITS)); });
router.get("/frankenstein/export", async (req, res): Promise<void> => {
  const owner = getAuth(req).userId;
  if (!owner) { res.status(401).json({ error: "Connectez-vous pour exporter votre journal." }); return; }
  const a = await readAccount(owner), experiments = await listExperiments(owner), events = await auditRaw(owner);
  const header = ["id", "symbol", "status", "entry", "stop", "target", "quantity", "mark", "fees", "pnl", "openedAt", "closedAt", "exitReason", "version", "source"];
  const csv = [header.join(","), ...a.trades.map(t => header.map(k => JSON.stringify(t[k as keyof typeof t] ?? "")).join(","))].join("\n");
  const rows = trainingRows(a);
  const metaReport = JSON.stringify({ baselineVersion: VERSION, parameters: PARAMS, sampleSize: rows.length,
    validation: "NON_VALIDATED", action: rows.length < 500 ? "Collecter davantage de labels réels avec features complètes, sans mutation automatique." : "Exécuter train_model.py et tester en forward, sans promotion automatique.",
    proposals: a.proposals, eventCount: events.length, immutableRisk: true, openClawConnected: false }, null, 2);
  res.json(ExportJournalResponse.parse({ schemaVersion: 1, generatedAt: new Date().toISOString(), mode: "paper",
    baselineVersion: VERSION, featureOrder: FEATURE_ORDER, decisions: a.decisions, trades: a.trades,
    experiments, metaReport, csv, trainingRows: rows }));
});
export default router;