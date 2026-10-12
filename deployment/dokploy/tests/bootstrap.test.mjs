import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes, scryptSync } from "node:crypto";
import { bootstrapAccess } from "../bootstrap.mjs";

test("premier demarrage : acces prive sans mot de passe en clair", () => {
  const root = mkdtempSync(tmpdir() + "/dokploy-bootstrap-"), password = randomBytes(20).toString("hex");
  try {
    const file = root + "/private/access.json";
    assert.equal(bootstrapAccess({ VPS_ACCESS_FILE: file, VPS_OPERATOR_PASSWORD: password }), true);
    const text = readFileSync(file, "utf8"), value = JSON.parse(text);
    assert.equal(value.owner, "vps-owner");
    assert.equal(value.username, "operateur");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.ok(!text.includes(password));
    assert.equal(scryptSync(password, value.salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }).toString("hex"), value.hash);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("redeploiement : identite et acces inchanges", () => {
  const root = mkdtempSync(tmpdir() + "/dokploy-idempotent-");
  try {
    const file = root + "/access.json", environment = { VPS_ACCESS_FILE: file, VPS_OPERATOR_PASSWORD: randomBytes(20).toString("hex") };
    bootstrapAccess(environment);
    const before = readFileSync(file, "utf8");
    assert.equal(bootstrapAccess({ VPS_ACCESS_FILE: file, VPS_OPERATOR_USERNAME: "autre" }), false);
    assert.equal(readFileSync(file, "utf8"), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("refus des configurations initiales incompletes ou faibles", () => {
  const root = mkdtempSync(tmpdir() + "/dokploy-invalid-");
  try {
    assert.throws(() => bootstrapAccess({ VPS_ACCESS_FILE: "relative" }), /absolu/);
    assert.throws(() => bootstrapAccess({ VPS_ACCESS_FILE: root + "/access.json" }), /PASSWORD/);
    assert.throws(() => bootstrapAccess({ VPS_ACCESS_FILE: root + "/access.json", VPS_OPERATOR_PASSWORD: "short" }), /PASSWORD/);
    assert.throws(() => bootstrapAccess({ VPS_ACCESS_FILE: root + "/access.json", VPS_OPERATOR_USERNAME: "../invalid", VPS_OPERATOR_PASSWORD: randomBytes(20).toString("hex") }), /Identifiant/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
