import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const runner = new URL("../backup-runner.sh", import.meta.url).pathname;

test("creates a private, checksummed database and models backup atomically", () => {
  const root = mkdtempSync(join(tmpdir(), "frankenstein-backup-"));
  try {
    const source = join(root, "source", "private");
    const output = join(root, "backups");
    const bin = join(root, "bin");
    mkdirSync(join(source, "models"), { recursive: true });
    mkdirSync(bin);
    writeFileSync(join(source, "access.json"), '{"owner":"paper"}');
    writeFileSync(join(source, "models", "candidate.json"), '{"model":"shadow"}');
    writeFileSync(join(bin, "pg_dump"), '#!/bin/sh\nprintf "valid mock database dump\\n"\n');
    writeFileSync(join(bin, "pg_restore"), '#!/bin/sh\ngrep -q "valid mock database dump" "$2"\n');
    for (const name of ["pg_dump", "pg_restore"]) {
      chmodSync(join(bin, name), 0o755);
    }

    const result = spawnSync("sh", [runner], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PGHOST: "db", PGUSER: "frankenstein", PGDATABASE: "frankenstein",
        PGPASSWORD: "test-only-not-a-real-secret", PRIVATE_DATA_DIR: source,
        BACKUP_DIR: output,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const [archiveName] = readdirSync(output);
    assert.match(archiveName, /^\d{8}T\d{6}Z(?:-\d+)?$/);
    const archive = join(output, archiveName);
    assert.equal(statSync(archive).mode & 0o777, 0o700);
    assert.equal(readFileSync(join(archive, "database.dump"), "utf8"), "valid mock database dump\n");
    const extract = join(root, "extract");
    mkdirSync(extract);
    const unpacked = spawnSync("tar", ["-xzf", join(archive, "private-files.tar.gz"), "-C", extract], { encoding: "utf8" });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    assert.equal(readFileSync(join(extract, "private", "access.json"), "utf8"), '{"owner":"paper"}');
    assert.equal(readFileSync(join(extract, "private", "models", "candidate.json"), "utf8"), '{"model":"shadow"}');
    assert.match(readFileSync(join(archive, "SHA256SUMS"), "utf8"), /database\.dump/);
    assert.match(readFileSync(join(archive, "SHA256SUMS"), "utf8"), /private-files\.tar\.gz/);
    assert.match(readFileSync(join(archive, "SUCCESS"), "utf8"), /^\d{4}-\d\d-\d\dT/);
    assert.equal(readdirSync(output).some((name) => name.startsWith(".working.")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses to publish a backup when required private files are missing", () => {
  const root = mkdtempSync(join(tmpdir(), "frankenstein-backup-incomplete-"));
  try {
    const source = join(root, "private");
    mkdirSync(join(source, "models"), { recursive: true });
    const result = spawnSync("sh", [runner], {
      encoding: "utf8",
      env: {
        ...process.env,
        PGHOST: "db", PGUSER: "frankenstein", PGDATABASE: "frankenstein",
        PGPASSWORD: "test-only-not-a-real-secret",
        PRIVATE_DATA_DIR: source, BACKUP_DIR: join(root, "backups"),
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /access file is missing/);
    assert.equal(existsSync(join(root, "backups")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
