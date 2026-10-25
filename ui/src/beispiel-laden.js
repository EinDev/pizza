// Beispiel aus der Galerie laden (PROJEKTE §3.3, §7.2; ohne DOM, Node-Test ui/test/beispiele.mjs):
// Manifest-Eintrag mit `ordner` + `dateien` → Dateisammlung { pfad → Text | Uint8Array } – pruefung/ wird nie geladen.
import { dateiArt, dekodiereText, istPruefung, pruefePfad } from "./projekt.js";

export const BASIS = "beispiele/";

/** Quelle eines Galerie-Projekts (gleiche Quelle → in die unveränderte Kopie springen, §3.3). */
export const beispielQuelle = (b) => "beispiel:" + (b.id || b.ordner);

/** Zeigt die Galerie diesen Eintrag? (Ordner mit Dateiliste) */
export const istGalerieEintrag = (b) => !!b && typeof b.ordner === "string" && Array.isArray(b.dateien) && b.dateien.length > 0;

async function holeBytes(holen, url) {
  const r = await holen(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url.replace(BASIS, "") + ": HTTP " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * → { name, dateien, hauptdatei: null } (die Hauptdatei leitet projekte.neu aus pizza.json ab).
 * Texte streng UTF-8 und mit `\n` (§1.3, wie ZIP-Import und Teilen), alles andere als Bytes. Wirft bei HTTP-/Pfad-/UTF-8-Fehlern.
 */
export async function ladeBeispielDateien(b, holen = (u, o) => fetch(u, o)) {
  const pfade = (b.dateien || []).filter((p) => !istPruefung(p));
  for (const p of pfade) { const f = pruefePfad(p); if (f) throw new Error(f); }
  const inhalte = await Promise.all(pfade.map(async (p) => {
    const bytes = await holeBytes(holen, BASIS + b.ordner + "/" + p);
    const art = dateiArt(p);
    if (art !== "pizza" && art !== "text") return [p, bytes];
    const d = dekodiereText(bytes, p);
    if (!d.ok) throw new Error(d.fehler);
    return [p, d.text];
  }));
  return { name: b.titel || b.id || b.ordner.split("/").pop(), dateien: Object.fromEntries(inhalte), hauptdatei: null };
}
