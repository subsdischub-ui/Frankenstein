import { mkdtemp, cp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../..");
const staging = await mkdtemp(path.join(tmpdir(), "frankenstein-release-"));
const release = path.join(staging, "frankenstein-vps");
try {
  await mkdir(release);
  await cp(path.join(root, "dist-vps"), path.join(release, "app"), { recursive: true });
  await cp(path.join(here, "tools"), path.join(release, "tools"), { recursive: true });
  for (const name of ["install.sh", "README.md", "VERIFICATION.md", "frankenstein.service", "frankenstein-backup.service", "frankenstein-backup.timer"])
    await cp(path.join(here, name), path.join(release, name));
  await mkdir(path.join(release, "research"));
  for (const name of ["README.md", "PROTOCOLE_VALIDATION.md", "download_binance.py", "train_model.py",
    "validation.py", "openclaw_adapter.py", "requirements.txt", "test_validation.py"])
    await cp(path.join(root, "research", name), path.join(release, "research", name));
  const hashes = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(release, absolute);
        if (/\.env$|access\.json$|\.pem$|\.key$|password|consumed_holdouts/i.test(relative))
          throw new Error("Fichier privé refusé : " + relative);
        const data = await readFile(absolute);
        if (relative.startsWith("app/server/") && (data.includes("127.0.0.1:1106") || data.includes("/home/runner/workspace")))
          throw new Error("Backend non portable : " + relative);
        hashes.push(createHash("sha256").update(data).digest("hex") + "  " + relative);
      } else throw new Error("Symlink ou fichier spécial refusé : " + entry.name);
    }
  }
  await walk(release);
  await writeFile(path.join(release, "SHA256SUMS"), hashes.sort().join("\n") + "\n");
  const downloads = path.join(root, "downloads");
  await mkdir(downloads, { recursive: true });
  const archive = path.join(downloads, "frankenstein-vps.zip");
  execFileSync("python3", ["-c", `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:
 for p in root.rglob("*"):
  if p.is_file(): z.write(p,p.relative_to(root.parent))
`, release, archive]);
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
  await writeFile(path.join(downloads, "frankenstein-vps.sha256.txt"), digest + "  frankenstein-vps.zip\n");
  await cp(archive, path.join(root, "artifacts/frankenstein/public/frankenstein-vps.zip"));
  await cp(path.join(downloads, "frankenstein-vps.sha256.txt"), path.join(root, "artifacts/frankenstein/public/frankenstein-vps.sha256.txt"));
  console.log(JSON.stringify({ archive: "downloads/frankenstein-vps.zip", files: hashes.length, sha256: digest }));
} finally { await rm(staging, { recursive: true, force: true }); }
