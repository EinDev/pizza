// Startet alle E2E-Tests (node:test, Dateien parallel). Optionen über Umgebung:
//   CHROME_PFAD=…        Pfad zu Chrome/Chromium (sonst Standardorte)
//   E2E_FILTER=regex     nur Tests, deren Name passt (--test-name-pattern)
//   E2E_SICHTBAR=1       Browser sichtbar starten
//   E2E_IGNORIERE=regex  bekannte, vorübergehende Konsolen-/HTTP-Probleme ignorieren (nur lokal!)
//   E2E_PARALLEL=n       Anzahl paralleler Testdateien (Standard 4)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const dateien = fs.readdirSync(path.join(hier, "tests")).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => path.join("tests", f));
const args = ["--test", "--test-concurrency=" + (process.env.E2E_PARALLEL || 4), "--test-reporter=spec"];
if (process.env.E2E_FILTER) args.push("--test-name-pattern=" + process.env.E2E_FILTER);
args.push(...process.argv.slice(2), ...dateien);
const start = Date.now();
const p = spawn(process.execPath, args, { cwd: hier, stdio: "inherit" });
p.on("exit", (code) => {
  console.log(`\nE2E-Laufzeit: ${((Date.now() - start) / 1000).toFixed(1)} s` + (code ? " – Screenshots: e2e/artefakte/" : ""));
  process.exit(code ?? 1);
});
