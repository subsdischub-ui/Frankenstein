import { existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

export function bootstrapAccess(environment = process.env) {
  const file = environment.VPS_ACCESS_FILE;
  if (!file || !path.isAbsolute(file)) throw new Error("VPS_ACCESS_FILE absolu requis.");
  // Un redeploiement ne reinitialise ni mot de passe ni identite de portefeuille.
  if (existsSync(file)) return false;
  const username = environment.VPS_OPERATOR_USERNAME || "operateur";
  const password = environment.VPS_OPERATOR_PASSWORD;
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(username)) throw new Error("Identifiant operateur invalide.");
  if (typeof password !== "string" || password.length < 16 || password.length > 256)
    throw new Error("Configurer VPS_OPERATOR_PASSWORD (16 a 256 caracteres) dans Dokploy, jamais dans Git.");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }).toString("hex");
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + ".initial-" + randomBytes(6).toString("hex");
  writeFileSync(temp, JSON.stringify({ username, owner: "vps-owner", salt, hash }), { mode: 0o600, flag: "wx" });
  renameSync(temp, file);
  return true;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  bootstrapAccess();
