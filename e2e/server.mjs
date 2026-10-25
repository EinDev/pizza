// Kleiner statischer Server ohne Abhängigkeiten: liefert site/ aus und setzt
// dieselben Header wie nginx.conf (insb. die CSP), damit CSP-Fehler in den E2E-Tests auffallen.
// /api/… geht wie bei nginx an den echten Teilen-Dienst (durchreiche/server.mjs, im Prozess auf 127.0.0.1, zufälliger Port,
// Datenordner unter e2e/tmp/, beim Ende gelöscht) – PROJEKTE §4.9.
//   node server.mjs [port]      → http://127.0.0.1:<port>/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { starte as starteDurchreiche } from "../durchreiche/server.mjs";
import { teile, ladeGeteilt } from "../ui/src/teilen.js";
import { pizzaPfadAusName, projektNameAus } from "../ui/src/projekt.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const WURZEL = path.resolve(HIER, "..", "site");

export const NGINX_CONF = path.resolve(HIER, "..", "nginx.conf");

/**
 * Alle festen `add_header Name "Wert" …;` aus nginx.conf (Variablen wie `$pizza_cache_header` ausgenommen).
 * Bewusst KEIN hart codierter Rückfall: Server und nginx dürfen nicht auseinanderlaufen
 * (z. B. CSP mit/ohne 'wasm-unsafe-eval'). Fehlt nginx.conf oder die CSP, bricht der Start ab.
 */
export function headerAusNginx(datei = NGINX_CONF) {
  const conf = fs.readFileSync(datei, "utf8");
  const h = {};
  for (const m of conf.matchAll(/^[ \t]*add_header[ \t]+([A-Za-z0-9-]+)[ \t]+"([^"]*)"/gm)) h[m[1]] = m[2];
  if (!h["Content-Security-Policy"]) throw new Error("Keine Content-Security-Policy in " + datei + " gefunden");
  return h;
}

/** Die CSP aus nginx.conf. */
export function cspAusNginx(datei = NGINX_CONF) {
  return headerAusNginx(datei)["Content-Security-Policy"];
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",          // Modelle (H-K16)
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".pkarton": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pizza": "text/plain; charset=utf-8",
  ".erwartet": "text/plain; charset=utf-8",
};

function cacheControl(uri, status) {
  if (![200, 206, 304].includes(status)) return "no-store";
  if (/\.(?:js|css|mjs)$/i.test(uri)) return "public, max-age=3600, stale-while-revalidate=86400";
  if (/\.(?:svg|png|jpe?g|glb|gltf|bin|ico|webp|woff2?)$/i.test(uri)) return "public, max-age=86400";
  return "no-cache";
}

function header(basisHeader, uri, status) {
  return { ...basisHeader, "Cache-Control": cacheControl(uri, status) };
}

/** Cache-Control für /api/ wie die Map in nginx.conf (nur Status 200 bekommt die festen Werte). */
function apiCache(uri, status) {
  if (status !== 200) return "no-store";
  if (/^\/api\/blob\/[0-9a-f]{64}$/.test(uri) || /^\/api\/teilen\/[0-9A-Za-z]{12}@[0-9]+$/.test(uri)) return "private, max-age=31536000, immutable";
  return "no-store";
}

/**
 * Teilen-Dienst für die E2E: echte Durchreiche im Prozess. Die Schreib- und Byte-Grenzen je IP sind aus (alle Tests einer Datei
 * teilen sich 127.0.0.1 und legen Links in Sekunden an); Lese-Grenzen bleiben wie im Betrieb. 429 prüft teilen.modus = "limit".
 */
async function starteTeilen() {
  const tmp = path.join(HIER, "tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const daten = fs.mkdtempSync(path.join(tmp, "durchreiche-"));
  const dienst = await starteDurchreiche({
    host: "127.0.0.1", port: 0, umgebung: {}, log: () => {},
    konfig: { daten, rateSchreiben: 0, rateBlobHoch: 0, rateFehlend: 0, loseJeIpBytes: 0, neueBytesJeIp: 0 },
  });
  return { dienst, daten, basis: "http://127.0.0.1:" + dienst.port + "/" };
}

/**
 * Startet den Server. port 0 = freier Port. isolation:false → ohne COEP (kein crossOriginIsolated).
 * teilen: modus "echt" (Standard: Durchreiche) | "aus" (wie ohne TEILEN_URL) | "limit" (429 auf schreibende Anfragen);
 * lege({ name, dateien | code, hauptdatei? }) legt einen Link direkt beim Dienst an (→ { id, version, schluessel }),
 * version(id, schluessel, {…}) eine neue Version, hole(id, version?) liest ein Projekt zurück.
 * @returns {Promise<{url:string, port:number, anfragen:{methode:string,pfad:string,status:number}[], teilen:object, stop:()=>Promise<void>}>}
 */
export async function starteServer({ port = 0, wurzel = WURZEL, isolation = true } = {}) {
  // Header wie nginx; Cross-Origin-Isolation (COOP+COEP) immer an – außer für Fallback-Tests (isolation: false)
  const basisHeader = headerAusNginx();
  if (isolation) {
    basisHeader["Cross-Origin-Opener-Policy"] = "same-origin";
    basisHeader["Cross-Origin-Embedder-Policy"] = "require-corp";
  } else {
    delete basisHeader["Cross-Origin-Embedder-Policy"];
  }
  const csp = basisHeader["Content-Security-Policy"];
  const t = await starteTeilen();
  const direkt = { basis: t.basis, warte: async () => {} };
  const sammlungAus = ({ name, dateien, code, hauptdatei }) => {
    const ds = dateien || { [pizzaPfadAusName(name)]: code };
    return { name: projektNameAus(name), hauptdatei: hauptdatei || Object.keys(ds).find((p) => p.endsWith(".pizza")), dateien: ds };
  };
  const teilen = {
    modus: "echt",
    dienst: t.dienst,
    lege: (o) => teile({ ...direkt, projekt: sammlungAus(o) }),
    version: (id, schluessel, o) => teile({ ...direkt, projekt: sammlungAus(o), link: { id, schluessel } }),
    hole: (id, version = null) => ladeGeteilt(direkt, id, version),
    /** Anzahl Links im Dienst. */
    get links() { return t.dienst.lager.links.size; },
  };
  const anfragen = [];
  const server = http.createServer((req, res) => {
    const senden = (status, typ, body, uri) => {
      anfragen.push({ methode: req.method, pfad: req.url, status });
      const h = header(basisHeader, uri, status);
      if (typ) h["Content-Type"] = typ;
      res.writeHead(status, h);
      res.end(req.method === "HEAD" ? undefined : body);
    };
    let uri;
    try {
      uri = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      return senden(400, "text/plain; charset=utf-8", "bad request\n", "/");
    }
    if (req.method !== "GET" && req.method !== "HEAD" && !uri.startsWith("/api/")) return senden(405, "text/plain; charset=utf-8", "method not allowed\n", uri);
    if (uri === "/healthz") return senden(200, "text/plain", "ok\n", uri);
    // /api/…: wie nginx (nginx.conf, nginx-proxy.conf) an die Durchreiche – Content-Type und Authorization weiterreichen,
    // X-Real-IP setzen, Cache-Control nach der Map; alte Hastebin-Schlüssel → 404 mit F6-Meldung.
    if (uri.startsWith("/api/")) {
      const json = (st, o, kopf = {}) => {
        anfragen.push({ methode: req.method, pfad: req.url, status: st });
        res.writeHead(st, { ...basisHeader, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...kopf });
        res.end(JSON.stringify(o) + "\n");
        req.resume();
      };
      if (teilen.modus === "aus") {
        if (uri === "/api/konfig") return json(200, { teilen: false });
        return json(503, { fehler: "Teilen ist auf diesem Server nicht eingerichtet." });
      }
      if (teilen.modus === "limit" && req.method !== "GET" && req.method !== "HEAD") return json(429, { fehler: "Zu viele Anfragen – bitte kurz warten." }, { "Retry-After": "60" });
      if (/^\/api\/teilen\/[a-z]{10}$/.test(uri)) return json(404, { fehler: "Dieser Link stammt vom alten Teilen-Dienst und ist nicht mehr verfügbar.", alt: true });
      const kopf = { "X-Real-IP": "127.0.0.1" };
      for (const k of ["content-type", "content-length", "authorization", "accept"]) if (req.headers[k] != null) kopf[k] = req.headers[k];
      const weiter = http.request(t.basis + req.url.replace(/^\//, ""), { method: req.method, headers: kopf }, (antwort) => {
        anfragen.push({ methode: req.method, pfad: req.url, status: antwort.statusCode });
        const h = { ...basisHeader, "Cache-Control": apiCache(uri, antwort.statusCode) };
        for (const k of ["content-type", "content-length", "retry-after", "content-disposition", "x-content-type-options", "allow"]) if (antwort.headers[k] != null) h[k] = antwort.headers[k];
        res.writeHead(antwort.statusCode, h);
        antwort.pipe(res);
      });
      weiter.on("error", () => { if (!res.headersSent) json(502, { fehler: "Der Teilen-Dienst ist nicht erreichbar." }); else res.destroy(); });
      req.pipe(weiter);
      return;
    }
    // Versteckte Dateien nie ausliefern (location ~ /\.)
    if (/\/\./.test(uri)) return senden(404, "text/html; charset=utf-8", "<h1>404</h1>", uri);

    const datei = path.resolve(wurzel, "." + uri);
    if (!datei.startsWith(wurzel)) return senden(404, "text/html; charset=utf-8", "<h1>404</h1>", uri);

    const lies = (p) => {
      const ext = path.extname(p).toLowerCase();
      return senden(200, MIME[ext] || "application/octet-stream", fs.readFileSync(p), uri);
    };
    const istDatei = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
    const istOrdner = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

    // .pizza/.erwartet und statische Assets: fehlende Dateien sind echte 404 (kein SPA-Fallback)
    if (/\.(?:pizza|erwartet|js|mjs|css|json|map|svg|png|jpe?g|glb|gltf|bin|ico|webp|txt|woff2?|wasm|pkarton)$/i.test(uri)) {
      return istDatei(datei) ? lies(datei) : senden(404, "text/html; charset=utf-8", "<h1>404</h1>", uri);
    }
    // try_files $uri $uri/ /index.html
    if (istDatei(datei)) return lies(datei);
    if (istOrdner(datei) && istDatei(path.join(datei, "index.html"))) return lies(path.join(datei, "index.html"));
    return lies(path.join(wurzel, "index.html"));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const p = server.address().port;
      resolve({
        url: `http://127.0.0.1:${p}/`,
        port: p,
        csp,
        header: basisHeader,
        teilen,
        isolation,
        anfragen,
        stop: async () => {
          await new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); });
          await t.dienst.schliesse();
          fs.rmSync(t.daten, { recursive: true, force: true });
        },
      });
    });
  });
}

// Direkt gestartet: als Dev-Server laufen lassen
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await starteServer({ port: Number(process.argv[2]) || 8080 });
  console.log("pizza-Site (mit nginx-Headern) unter " + s.url);
}
