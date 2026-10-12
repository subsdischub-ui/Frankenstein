import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { Express, Request } from "express";

interface Access { username: string; owner: string; salt: string; hash: string }
export function getAuth(req: Request): { userId: string | null } {
  return { userId: (req as Request & { vpsOwner?: string }).vpsOwner ?? null };
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export function installAuth(app: Express) {
  const test = process.env.NODE_ENV === "test" && process.env.VPS_TEST_MODE === "1";
  const origin = process.env.PUBLIC_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || (!test && !origin.startsWith("https://")))
    throw new Error("PUBLIC_ORIGIN doit être une origine HTTPS exacte, sans chemin ni slash final.");
  const accessPath = process.env.VPS_ACCESS_FILE;
  if (!accessPath) throw new Error("VPS_ACCESS_FILE requis.");
  if (statSync(accessPath).mode & 0o077) throw new Error("Le fichier d'accès doit être privé : chmod 600.");
  const access: Access = JSON.parse(readFileSync(accessPath, "utf8"));
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(access.username) || !/^[a-zA-Z0-9_-]{3,100}$/.test(access.owner)
    || !/^[a-f0-9]{32}$/.test(access.salt) || !/^[a-f0-9]{128}$/.test(access.hash))
    throw new Error("Fichier d'accès invalide.");
  const cookie = test ? "frankenstein_test_session" : "__Host-frankenstein_session";
  const ttl = 8 * 3600000;
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { count: number; until: number }>();
  const parseCookie = (req: Request) => {
    const value = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(cookie + "="))?.slice(cookie.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  };
  const expireCookie = { httpOnly: true, secure: !test, sameSite: "strict" as const, path: "/" };
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("origin") !== origin) {
      res.status(403).json({ error: "Origine absente ou non autorisée." }); return;
    }
    const token = parseCookie(req), key = token ? digest(token) : null;
    const expires = key ? sessions.get(key) : null;
    if (key && expires && expires > Date.now()) (req as Request & { vpsOwner?: string }).vpsOwner = access.owner;
    else if (key) sessions.delete(key);
    next();
  });
  const user = { id: access.owner, username: access.username };
  app.get("/api/vps-auth/session", (req, res) => {
    res.json({ authenticated: !!getAuth(req).userId, user: getAuth(req).userId ? user : null });
  });
  app.post("/api/vps-auth/login", (req, res) => {
    const now = Date.now(), ip = req.ip || "unknown";
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const attempt = attempts.get(ip);
    if (attempt && attempt.count >= 5) { res.status(429).json({ error: "Trop de tentatives. Réessayer dans 15 minutes." }); return; }
    if (attempts.size >= 10000) { res.status(503).json({ error: "Connexion momentanément indisponible." }); return; }
    attempts.set(ip, { count: (attempt?.count || 0) + 1, until: attempt?.until || now + 900000 });
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" || password.length > 256) {
      res.status(400).json({ error: "Identifiants invalides." }); return;
    }
    const calculated = scryptSync(password, access.salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
    if (!timingSafeEqual(calculated, Buffer.from(access.hash, "hex")) || username !== access.username) {
      res.status(401).json({ error: "Identifiants incorrects." }); return;
    }
    attempts.delete(ip);
    for (const [key, expires] of sessions) if (expires <= now) sessions.delete(key);
    const previous = parseCookie(req);
    if (previous) sessions.delete(digest(previous));
    while (sessions.size >= 5) sessions.delete(sessions.keys().next().value!);
    const token = randomBytes(32).toString("hex");
    sessions.set(digest(token), now + ttl);
    res.cookie(cookie, token, { ...expireCookie, maxAge: ttl });
    res.json({ authenticated: true, user });
  });
  app.post("/api/vps-auth/logout", (req, res) => {
    const token = parseCookie(req);
    if (token) sessions.delete(digest(token));
    res.clearCookie(cookie, expireCookie);
    res.json({ ok: true });
  });
}
