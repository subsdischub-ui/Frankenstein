import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
const filename = process.argv[2];
if (!filename || !process.stdin.isTTY) throw new Error("Usage interactif : node create-access.mjs /chemin/access.json");
const rl = createInterface({ input: process.stdin, output: process.stdout });
const username = (await rl.question("Identifiant opérateur (ex. operateur) : ")).trim();
rl.close();
if (!/^[a-zA-Z0-9_-]{3,40}$/.test(username)) throw new Error("Identifiant : 3 à 40 lettres, chiffres, _ ou -.");
async function hidden(prompt) {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let input = "";
    const finish = () => { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); };
    const onData = buffer => {
      for (const c of buffer.toString()) {
        if (c === "\u0003") { finish(); reject(new Error("Annulé.")); return; }
        if (c === "\r" || c === "\n") { finish(); resolve(input); return; }
        if (c === "\u007f" || c === "\b") input = input.slice(0, -1);
        else if (c >= " " && input.length < 256) input += c;
      }
    };
    process.stdin.on("data", onData);
  });
}
const password = await hidden("Mot de passe (invisible, 16 caractères minimum) : ");
const confirmation = await hidden("Confirmer : ");
if (password.length < 16 || password !== confirmation) throw new Error("Mot de passe trop court ou confirmation différente.");
// Une rotation conserve l'identité du portefeuille, jamais un nouveau compte implicite.
const owner = existsSync(filename) ? JSON.parse(readFileSync(filename, "utf8")).owner : "vps-owner";
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }).toString("hex");
writeFileSync(filename, JSON.stringify({ username, owner, salt, hash }), { mode: 0o600 });
console.log("Accès enregistré. Redémarrer le service pour appliquer une rotation et invalider les sessions.");
