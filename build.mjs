// Build: bundle src/main.js -> dist/app.js and copy public/ -> dist/
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
// Cache-busting: every build gets new asset URLs so phones load the latest version.
const v = Date.now().toString(36);
const html = readFileSync("dist/index.html", "utf8").replace('src="app.js"', `src="app.js?v=${v}"`).replace('href="styles.css"', `href="styles.css?v=${v}"`).replace('src="config.js"', `src="config.js?v=${v}"`);
writeFileSync("dist/index.html", html);
await build({
  entryPoints: { app: "src/main.js" },
  bundle: true,
  minify: true,
  format: "esm",
  splitting: true, // three.js (3D model) loads only when the muscle page opens
  chunkNames: "chunks/[name]-[hash]",
  target: ["es2020", "safari14"],
  outdir: "dist",
  sourcemap: false,
  logLevel: "info",
});
