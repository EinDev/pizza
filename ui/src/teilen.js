// Code ↔ URL-Hash (#code=…). Komprimiert (deflate-raw) mit Präfix "z.", sonst "u." (rohes UTF-8).

function bytesZuBase64Url(bytes) {
  let bin = "";
  const STUECK = 0x8000;
  for (let i = 0; i < bytes.length; i += STUECK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STUECK));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlZuBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function durchStrom(bytes, strom) {
  const antwort = new Response(new Blob([bytes]).stream().pipeThrough(strom));
  return new Uint8Array(await antwort.arrayBuffer());
}

export async function codeKodieren(code) {
  const roh = new TextEncoder().encode(code);
  if (typeof CompressionStream === "function") {
    try {
      const komp = await durchStrom(roh, new CompressionStream("deflate-raw"));
      return "z." + bytesZuBase64Url(komp);
    } catch (e) { /* Fallback unten */ }
  }
  return "u." + bytesZuBase64Url(roh);
}

export async function codeDekodieren(wert) {
  if (!wert) return null;
  try {
    if (wert.startsWith("z.")) {
      const bytes = await durchStrom(base64UrlZuBytes(wert.slice(2)), new DecompressionStream("deflate-raw"));
      return new TextDecoder().decode(bytes);
    }
    const nutz = wert.startsWith("u.") ? wert.slice(2) : wert;
    return new TextDecoder().decode(base64UrlZuBytes(nutz));
  } catch (e) {
    return null;
  }
}

export function codeAusHash(hash) {
  const m = /(?:^#|&)code=([^&]*)/.exec(hash || "");
  return m ? decodeURIComponent(m[1]) : null;
}
