import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, copyFile, readdir, readFile, writeFile, cp } from "node:fs/promises";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const webRequire = createRequire(path.join(root, "artifacts/frankenstein/package.json"));
const { build } = apiRequire("esbuild");
const { default: pinoPlugin } = await import(apiRequire.resolve("esbuild-plugin-pino"));
const { build: viteBuild } = await import(webRequire.resolve("vite"));
const { default: react } = await import(webRequire.resolve("@vitejs/plugin-react"));
const { default: tailwind } = await import(webRequire.resolve("@tailwindcss/vite"));
const output = path.resolve(process.env.VPS_BUILD_DIR || path.join(root, "dist-vps"));
await mkdir(output, { recursive: true });
const alias = {
  name: "vps-platform",
  setup(build) {
    build.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: path.join(dir, "auth.ts") }));
    build.onResolve({ filter: /\/objectStorage$/ }, () => ({ path: path.join(dir, "storage.ts") }));
    build.onResolve({ filter: /\/objectAcl$/ }, () => ({ path: path.join(dir, "storage.ts") }));
  },
};
await build({
  entryPoints: { index: path.join(dir, "server.ts") }, outdir: path.join(output, "server"),
  outExtension: { ".js": ".mjs" },
  bundle: true, platform: "node", format: "esm", sourcemap: false,
  nodePaths: [path.join(root, "artifacts/api-server/node_modules")],
  external: ["pg-native"], plugins: [alias, pinoPlugin({ transports: ["pino-pretty"] })],
  banner: { js: `import { createRequire as __vpsCr } from 'node:module'; import __vpsPath from 'node:path'; import { fileURLToPath as __vpsUrl } from 'node:url';
globalThis.require = __vpsCr(import.meta.url); globalThis.__filename = __vpsUrl(import.meta.url); globalThis.__dirname = __vpsPath.dirname(globalThis.__filename);` },
});
// Le plugin Pino incorpore sinon le chemin de build : le paquet doit rester deplacable.
for (const name of await readdir(path.join(output, "server"))) {
  if (!name.endsWith(".mjs")) continue;
  const filename = path.join(output, "server", name);
  const source = await readFile(filename, "utf8");
  await writeFile(filename, source.replaceAll(
    `const outputDir = ${JSON.stringify(path.join(output, "server"))};`,
    "const outputDir = globalThis.__dirname;",
  ));
}
await viteBuild({
  configFile: false, root: path.join(root, "artifacts/frankenstein"), base: "/", publicDir: false,
  define: {
    "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(""),
    "import.meta.env.VITE_CLERK_PROXY_URL": JSON.stringify(""),
    "import.meta.env.VITE_VPS_BUILD": "true",
  },
  plugins: [react(), tailwind({ optimize: false })],
  resolve: { dedupe: ["react", "react-dom"], alias: [
    { find: "@clerk/react/internal", replacement: path.join(dir, "clerk-internal.ts") },
    { find: "@clerk/react", replacement: path.join(dir, "auth-client.tsx") },
    { find: "@", replacement: path.join(root, "artifacts/frankenstein/src") },
  ] },
  build: { outDir: path.join(output, "web"), emptyOutDir: true },
});
await cp(path.join(root, "artifacts/frankenstein/public"), path.join(output, "web"), {
  recursive: true, filter: source => !["frankenstein-vps.tar.gz", "frankenstein-vps.zip", "frankenstein-vps.sha256.txt"].includes(path.basename(source)),
});
await copyFile(path.join(dir, "schema.sql"), path.join(output, "schema.sql"));
console.log("Build VPS terminé, distinct de Clerk et du stockage Replit :", output);
