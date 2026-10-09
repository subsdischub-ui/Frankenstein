import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../lib/db/src";
import router from "../../artifacts/api-server/src/routes";
import { startWorker } from "../../artifacts/api-server/src/lab/engine";
import { logger } from "../../artifacts/api-server/src/lib/logger";
import { installAuth } from "./auth";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.VPS_TRUST_PROXY === "1" ? 1 : "loopback");
app.use(express.json({ limit: "8mb" }));
installAuth(app);
app.get("/api/vps-health", async (_req, res): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", mode: "paper", database: "connected" });
  } catch {
    res.status(503).json({ status: "unavailable", mode: "paper", database: "unavailable" });
  }
});
app.use("/api", router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Endpoint inconnu." }); });
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
app.use(express.static(web, { index: false, dotfiles: "deny" }));
app.get("/{*path}", (_req, res) => { res.set("Cache-Control", "no-store").sendFile(path.join(web, "index.html")); });
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "VPS request failed");
  const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 500;
  res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({ error: "Requête impossible. Aucun ordre réel." });
});
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT invalide.");
await pool.query("SELECT 1 FROM lab_accounts LIMIT 1");
const bindHost = process.env.VPS_BIND_HOST || "127.0.0.1";
if (!["127.0.0.1", "0.0.0.0"].includes(bindHost)) throw new Error("VPS_BIND_HOST invalide.");
const server = app.listen(port, bindHost, () => {
  logger.info({ port, mode: "PAPER_ONLY", auth: "VPS_SINGLE_OPERATOR" }, "Frankenstein VPS prêt");
  if (process.env.NODE_ENV !== "test") startWorker();
});
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  server.close(() => { void pool.end().then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 15000).unref();
});
