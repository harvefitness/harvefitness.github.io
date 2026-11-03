// Build: bundle src/main.js -> dist/app.js and copy public/ -> dist/
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020", "safari14"],
  outfile: "dist/app.js",
  sourcemap: false,
  logLevel: "info",
});
