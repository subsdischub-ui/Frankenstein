import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes, scryptSync } from "node:crypto";
import { installAuth, getAuth } from "../auth.ts";
import { objectStorageClient } from "../storage.ts";
const express = createRequire(new URL("../../../artifacts/api-server/package.json", import.meta.url))("express");
const directory = mkdtempSync(tmpdir() + "/vps-auth-");
const password = randomBytes(24).toString("hex"), salt = randomBytes(16).toString("hex");
const access = directory + "/access.json";
writeFileSync(access, JSON.stringify({
  username: "operateur", owner: "test-vps-auth", salt,
  hash: scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }).toString("hex"),
}), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.VPS_TEST_MODE = "1";
process.env.VPS_ACCESS_FILE = access; process.env.VPS_DATA_DIR = directory;
async function server() {
  const app = express(); app.use(express.json());
  const http = app.listen(0, "127.0.0.1"); await new Promise(resolve => http.once("listening", resolve));
  const origin = "http://127.0.0.1:" + http.address().port;
  process.env.PUBLIC_ORIGIN = origin; installAuth(app);
  app.get("/private", (req, res) => res.status(getAuth(req).userId ? 200 : 401).json(getAuth(req)));
  const call = (path, options = {}) => fetch(origin + path, options);
  const login = (value = password, cookie) => call("/api/vps-auth/login", {
    method: "POST", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ username: "operateur", password: value }),
  });
  return { origin, call, login, close: () => new Promise(resolve => http.close(resolve)) };
}
test("authentification locale, cookie prive et deconnexion effective", async () => {
  const s = await server();
  try {
    assert.equal((await s.call("/private")).status, 401);
    assert.equal((await s.call("/private", { headers: { "x-user-id": "test-vps-auth" } })).status, 401);
    const result = await s.login(); assert.equal(result.status, 200);
    const header = result.headers.get("set-cookie");
    assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
    const cookie = header.split(";")[0];
    assert.equal((await s.call("/private", { headers: { cookie } })).status, 200);
    assert.equal((await s.call("/api/vps-auth/logout", { method: "POST", headers: { origin: s.origin, cookie } })).status, 200);
    assert.equal((await s.call("/private", { headers: { cookie } })).status, 401);
  } finally { await s.close(); }
});
test("refus des origines absentes et etrangeres", async () => {
  const s = await server();
  try {
    assert.equal((await s.call("/api/vps-auth/login", { method: "POST" })).status, 403);
    assert.equal((await s.call("/api/vps-auth/login", { method: "POST", headers: { origin: "https://autre.example" } })).status, 403);
  } finally { await s.close(); }
});
test("cinq echecs puis limitation des connexions", async () => {
  const s = await server();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await s.login("incorrect")).status, 401);
    assert.equal((await s.login()).status, 429);
  } finally { await s.close(); }
});
test("rotation du jeton a la reconnexion et expiration apres huit heures", async () => {
  const s = await server(), now = Date.now;
  try {
    const a = (await s.login()).headers.get("set-cookie").split(";")[0];
    const b = (await s.login(password, a)).headers.get("set-cookie").split(";")[0];
    assert.notEqual(a, b);
    assert.equal((await s.call("/private", { headers: { cookie: a } })).status, 401);
    Date.now = () => now() + 8 * 3600000 + 1;
    assert.equal((await s.call("/private", { headers: { cookie: b } })).status, 401);
  } finally { Date.now = now; await s.close(); }
});
test("pas de HTTP en production", () => {
  process.env.NODE_ENV = "production"; process.env.PUBLIC_ORIGIN = "http://127.0.0.1:3000";
  assert.throws(() => installAuth(express()), /HTTPS/);
  process.env.NODE_ENV = "test";
});
test("modeles prives persistants et chemins limites", async () => {
  const name = "models/00000000-0000-0000-0000-000000000000.json";
  const file = objectStorageClient.bucket("local").file(name);
  await file.save('{"raw":"fixture"}');
  assert.equal((await file.download())[0].toString(), '{"raw":"fixture"}');
  assert.equal((await file.getMetadata())[0].size, 17);
  assert.throws(() => objectStorageClient.bucket("local").file("../access.json"), /refus/);
  assert.throws(() => objectStorageClient.bucket("externe").file(name), /refus/);
  await assert.rejects(() => file.save("overwrite"), /EEXIST/);
});
test.after(() => rmSync(directory, { recursive: true, force: true }));
