// Baut ui/src/main.js → site/js/app.bundle.js (IIFE, minifiziert, keine Laufzeit-Requests).
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const hier = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const optionen = {
  absWorkingDir: hier,
  entryPoints: ["src/main.js"],
  outfile: "../site/js/app.bundle.js",
  bundle: true,
  format: "iife",
  minify: !watch,
  sourcemap: false,
  target: ["es2020"],
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
  banner: { js: "/* pizza v3.0 Playground – generiert aus ui/src (npm run build). Nicht von Hand bearbeiten. */" },
};

if (watch) {
  const ctx = await esbuild.context(optionen);
  await ctx.watch();
  console.log("Beobachte ui/src …");
} else {
  await esbuild.build(optionen);
}
