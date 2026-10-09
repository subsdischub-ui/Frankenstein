import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import path from "node:path";
function file(bucket: string, name: string) {
  if (bucket !== "local" || !/^models\/[a-f0-9-]{36}\.json$/.test(name)) throw new Error("Chemin privé refusé.");
  const root = process.env.VPS_DATA_DIR;
  if (!root || !path.isAbsolute(root)) throw new Error("VPS_DATA_DIR absolu requis.");
  const filename = path.join(root, name);
  return {
    async save(data: string) {
      await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
      await writeFile(filename, data, { mode: 0o600, flag: "wx" });
    },
    async getMetadata() { return [{ size: (await stat(filename)).size }]; },
    async download() { return [await readFile(filename)]; },
  };
}
export const objectStorageClient = { bucket: (bucket: string) => ({ file: (name: string) => file(bucket, name) }) };
export class ObjectStorageService { getPrivateObjectDir() { return "local"; } }
// L'accès est assuré par le compte unique du VPS et les permissions Unix.
export async function setObjectAclPolicy() {}
