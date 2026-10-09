// Distribution sélective de sources : ni données utilisateur, ni secrets, ni Git local.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, cp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../..");
const temporary = await mkdtemp(path.join(tmpdir(), "frankenstein-git-export-"));
const target = path.join(temporary, "Frankenstein");
await mkdir(target);
const allowedFiles = [
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json",
  ".gitignore", ".dockerignore", "README.md",
];
const allowedDirectories = [
  "artifacts/api-server", "artifacts/frankenstein", "lib/db", "lib/api-client-react",
  "lib/api-zod", "lib/api-spec", "deployment/vps", "deployment/dokploy", ".github/workflows",
];
const filter = source => {
  const relative = path.relative(root, source), parts = relative.split(path.sep);
  const name = path.basename(source);
  return !parts.some(p => ["node_modules", "dist", "__pycache__", ".git", ".agents", ".local"].includes(p))
    && !name.endsWith(".pyc") && !name.endsWith(".tsbuildinfo") && name !== ".env"
    && (!name.startsWith(".env.") || name.endsWith(".example"))
    && !name.startsWith("frankenstein-vps") && !name.startsWith("frankenstein-dokploy");
};
try {
  for (const file of allowedFiles) await cp(path.join(root, file), path.join(target, file));
  for (const dir of allowedDirectories) await cp(path.join(root, dir), path.join(target, dir), { recursive: true, filter });
  await mkdir(path.join(target, "research"), { recursive: true });
  for (const name of ["README.md", "PROTOCOLE_VALIDATION.md", "download_binance.py", "train_model.py",
    "validation.py", "openclaw_adapter.py", "requirements.txt", "test_validation.py"])
    await cp(path.join(root, "research", name), path.join(target, "research", name));
  async function check(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Lien symbolique exclu : " + file);
      if (entry.isDirectory()) await check(file);
      if (entry.name === "access.json" || /\.(pem|key)$/.test(entry.name))
        throw new Error("Fichier privé refusé.");
    }
  }
  await check(target);
  await mkdir(path.join(root, "downloads"), { recursive: true });
  const archive = path.join(root, "downloads/frankenstein-dokploy.zip");
  execFileSync("python3", ["-c", `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:
 for p in root.rglob("*"):
  if p.is_file(): z.write(p,p.relative_to(root.parent))
`, target, archive]);
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
  await writeFile(path.join(root, "downloads/frankenstein-dokploy.sha256.txt"), digest + "  frankenstein-dokploy.zip\n");
  console.log(JSON.stringify({ archive: "downloads/frankenstein-dokploy.zip", sha256: digest }));
} finally { await rm(temporary, { recursive: true, force: true }); }
