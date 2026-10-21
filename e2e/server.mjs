// Kleiner statischer Server ohne Abhängigkeiten: liefert site/ aus und setzt
// dieselben Header wie nginx.conf (insb. die CSP), damit CSP-Fehler in den E2E-Tests auffallen.
//   node server.mjs [port]      → http://127.0.0.1:<port>/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (/\.(?:svg|png|ico|webp|woff2?)$/i.test(uri)) return "public, max-age=86400";
  return "no-cache";
}

function header(basisHeader, uri, status) {
  return { ...basisHeader, "Cache-Control": cacheControl(uri, status) };
}

/**
 * Startet den Server. port 0 = freier Port. isolation:false → ohne COEP (kein crossOriginIsolated).
 * @returns {Promise<{url:string, port:number, anfragen:{methode:string,pfad:string,status:number}[], stop:()=>Promise<void>}>}
 */
export function starteServer({ port = 0, wurzel = WURZEL, isolation = true } = {}) {
  // Header wie nginx; Cross-Origin-Isolation (COOP+COEP) immer an – außer für Fallback-Tests (isolation: false)
  const basisHeader = headerAusNginx();
  if (isolation) {
    basisHeader["Cross-Origin-Opener-Policy"] = "same-origin";
    basisHeader["Cross-Origin-Embedder-Policy"] = "require-corp";
  } else {
    delete basisHeader["Cross-Origin-Embedder-Policy"];
  }
  const csp = basisHeader["Content-Security-Policy"];
  const teilen = { modus: "mock", zaehler: 0, ablage: new Map() };
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
    // /api/teilen: Attrappe für den nginx→Hastebin-Proxy (keine externen Requests in Tests).
    //   teilen.modus = "mock" (Standard) | "aus" (503 wie ohne HASTEBIN_URL) | "limit" (429 beim Senden)
    if (uri === "/api/konfig") {
      const aktiv = teilen.modus !== "aus";
      return senden(200, "application/json; charset=utf-8", JSON.stringify({ hastebin: aktiv ? "https://teilen.e2e.invalid" : "", teilen: aktiv }) + "\n", uri);
    }
    if (uri === "/api/teilen" || uri.startsWith("/api/teilen/")) {
      const json = (st, o) => senden(st, "application/json; charset=utf-8", JSON.stringify(o) + "\n", uri);
      if (teilen.modus === "aus") return json(503, { fehler: "Teilen ist nicht konfiguriert (HASTEBIN_URL fehlt)." });
      if (teilen.modus === "limit" && req.method === "POST") return json(429, { fehler: "Zu viele Anfragen." });
      if (uri === "/api/teilen") {
        if (req.method !== "POST") return json(405, { fehler: "Nur POST." });
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          const key = "e2e" + (++teilen.zaehler).toString(36);
          teilen.ablage.set(key, body);
          json(200, { key });
        });
        return;
      }
      const key = uri.slice("/api/teilen/".length);
      if (!teilen.ablage.has(key)) return json(404, { fehler: "Nicht gefunden." });
      return senden(200, "text/plain; charset=utf-8", teilen.ablage.get(key), uri);
    }
    if (uri.startsWith("/api/")) return senden(404, "application/json; charset=utf-8", "{}\n", uri);
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
    if (/\.(?:pizza|erwartet|js|mjs|css|json|map|svg|png|ico|webp|txt|woff2?|wasm|pkarton)$/i.test(uri)) {
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
        stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

// Direkt gestartet: als Dev-Server laufen lassen
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await starteServer({ port: Number(process.argv[2]) || 8080 });
  console.log("pizza-Site (mit nginx-Headern) unter " + s.url);
}
