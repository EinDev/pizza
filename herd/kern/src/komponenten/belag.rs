//! `Belag` (3D, H-K2): geteiltes Material wie Unity `Material`. Hängt an einem eigenen Teil (meist `herd.raum()`); jeder
//! `Koerper`, dessen Nachtragsfeld `belag` auf dieses Teil zeigt, zeichnet mit Farbe, Glanz, Leuchten und Bildchen des Belags
//! statt mit den eigenen (`koerper.rs`). Kein System, kein eigener Bildbeitrag: einen Wert ändern, alle Körper ändern sich.
//! Nachtragsfelder „Material“ (Oberflächen): `relief` (Bild mit Normale x, y in R, G und Rauheit in B), `kachel` (Wiederholung bzw.
//! Kachelgröße in Weltmaß), `abbildung` (uv | welt), `modell` (klassisch | pbr: GGX, Fresnel, Umgebungsglanz), `metall`, `nass`
//! (Pfützen und Feuchte) – als Zusatzstrom `ZUSATZ3D` je Instanz im Bildpaket (`paket.rs`), nur wenn benutzt.
//! Nachtragsfelder „Karten“ (H-K26, Unity Lit / glTF-PBR): `normalKarte` (Normale x, y, z im Tangentenraum wie glTF; Vorrang vor
//! der Normale des `relief`), `normalStaerke` (wirkt auf Normal-Karte und Relief), `stoffKarte` (R Verdeckung, G Rauheit, B Metall
//! wie glTF, mal `glanz`/`metall`; G hat Vorrang vor der Rauheit des Reliefs), `leuchtKarte` mit `leuchtFarbe` (Eigenleuchten =
//! Karte · `leuchtFarbe` · `leuchten` · `strahlen`, additiv), `schwelle` (Ausschnitt), `beidseitig` – als Zusatzstrom `KARTEN3D`
//! (`karten`), nur wenn benutzt.
//! Nachtragsfeld „Wind“ (H-K27): `wiegen` (0 … 1) – mit einem geltenden `Wind` schwingen die Ecken im Vertex-Shader, quadratisch
//! mit der Höhe über dem Netz-Ursprung (rein sichtbar). Reist in `ZUSATZ3D.merkmale` Bits 2–7.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const FARBE: usize = 0;
pub const GLANZ: usize = 1;
pub const LEUCHTEN: usize = 2;
pub const BILD: usize = 3;
/// Nachtragsfeld (Stimmung): Faktor auf `leuchten` wie `Koerper.strahlen`.
pub const STRAHLEN: usize = 4;
/// Nachtragsfelder „Material“
pub const RELIEF: usize = 5;
pub const KACHEL: usize = 6;
pub const ABBILDUNG: usize = 7;
pub const MODELL: usize = 8;
pub const METALL: usize = 9;
pub const NASS: usize = 10;
/// Nachtragsfelder „Karten“ (H-K26)
pub const NORMAL_KARTE: usize = 11;
pub const NORMAL_STAERKE: usize = 12;
pub const STOFF_KARTE: usize = 13;
pub const LEUCHT_KARTE: usize = 14;
pub const LEUCHT_FARBE: usize = 15;
pub const SCHWELLE: usize = 16;
pub const BEIDSEITIG: usize = 17;
/// Nachtragsfeld „Wind“ (H-K27): Ausschlag der Ecken im Wind 0 … 1 (`ZUSATZ3D.merkmale` Bits 2–7 · 63)
pub const WIEGEN: usize = 18;

pub static ART: Art = Art {
    schema: Schema {
        name: "Belag",
        genus: Genus::M,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::farbe("farbe", "weiss"),
            Feld::zahl("glanz", 0.3).bereich(0.0, 1.0),
            Feld::zahl("leuchten", 0.0).bereich(0.0, 1.0),
            Feld::bildchen("bild"),
            Feld::zahl("strahlen", 1.0).bereich(0.0, 1000.0).nachtrag(),
            Feld::bildchen("relief").nachtrag(),
            Feld::zahl("kachel", 0.0).bereich(0.0, 10000.0).nachtrag(),
            Feld::wahl("abbildung", &["uv", "welt"], 0).nachtrag(),
            Feld::wahl("modell", &["klassisch", "pbr"], 0).nachtrag(),
            Feld::zahl("metall", 0.0).bereich(0.0, 1.0).nachtrag(),
            Feld::zahl("nass", 0.0).bereich(0.0, 1.0).nachtrag(),
            Feld::bildchen("normalKarte").nachtrag(),
            Feld::zahl("normalStaerke", 1.0).bereich(0.0, 3.98).nachtrag(),
            Feld::bildchen("stoffKarte").nachtrag(),
            Feld::bildchen("leuchtKarte").nachtrag(),
            Feld::farbe("leuchtFarbe", "weiss").nachtrag(),
            Feld::zahl("schwelle", 0.0).bereich(0.0, 1.0).nachtrag(),
            Feld::diavolo("beidseitig", false).nachtrag(),
            Feld::zahl("wiegen", 0.0).bereich(0.0, 1.0).nachtrag(),
        ],
    },
    ..Art::LEER
};

/// Zusatzwörter je Instanz (Abschnitt `ZUSATZ3D`): Relief-Kennwort wie `INST3D.textur` (nur eigene Texturen, sonst 0),
/// `kachel` und `metall` als f32-Bits, Merkmale (Bit 0 pbr, Bit 1 Welt-Abbildung, Bits 2–7 wiegen · 63 (H-K27), Bits 8–15
/// nass · 255). Alles 0 = v1.
/// Bild-Kennwort einer Karte wie `INST3D.textur` (nur eigene Texturen, sonst 0).
fn kennwort(w: &Welt, id: f64) -> u32 {
    match w.ressourcen.bildchen(id as u32) {
        Some(t) if t.seite & crate::ressourcen::TEXTUR_MARKE != 0 => (t.seite & 0xFFFF) | 1 << 16 | 1 << 17,
        _ => 0,
    }
}

/// Karten je Instanz (Abschnitt `KARTEN3D`, H-K26): Wort 0 Normal-Kennwort, Bits 24–31 `normalStaerke` · 64; Wort 1
/// Stoff-Kennwort, Bit 24 beidseitig; Wort 2 Leucht-Kennwort; Wort 3 `leuchtFarbe` RGB (Bits 8–31 wie `farbe`) und `schwelle` ·
/// 255 (Bits 0–7, mindestens 1, wenn > 0). Alles Standard = `[0; 4]` (wie vor H-K26). Die Kennwörter nennen nur eigene
/// Texturen (PD3), Bits 18–23 bleiben 0.
///
/// Ausschnitt: mit `schwelle` > 0 ist der Körper **deckend** (FEST, wirft Schatten) – `farbe` bekommt Deckkraft 1, die Schwelle
/// wird durch die Deckkraft der Farbe geteilt (glTF MASK: Farbe.a · Bild.a ≥ Schwelle ⇔ Bild.a ≥ Schwelle / Farbe.a); liegt die
/// Deckkraft der Farbe unter der Schwelle, fällt alles weg (Deckkraft 0 → nicht gezeichnet).
pub fn karten(w: &Welt, s: &Speicher, z: usize, farbe: &mut u32) -> [u32; 4] {
    let (n, st, so, le) = (kennwort(w, s.zahl(NORMAL_KARTE)[z]), s.zahl(NORMAL_STAERKE)[z], kennwort(w, s.zahl(STOFF_KARTE)[z]), kennwort(w, s.zahl(LEUCHT_KARTE)[z]));
    let (lf, mut sw, bs) = (s.farbe(LEUCHT_FARBE)[z], s.zahl(SCHWELLE)[z], s.zahl(BEIDSEITIG)[z] != 0.0);
    if n == 0 && st == 1.0 && so == 0 && le == 0 && lf == 0xFFFF_FFFF && sw == 0.0 && !bs {
        return [0; 4];
    }
    if sw > 0.0 {
        let fa = (*farbe & 0xFF) as f64 / 255.0;
        if fa < sw {
            *farbe &= 0xFFFF_FF00;
        } else {
            sw /= fa;
            *farbe |= 0xFF;
        }
    }
    let st8 = ((st * 64.0 + 0.5) as u32).min(255);
    let sw8 = if sw > 0.0 { ((sw * 255.0 + 0.5) as u32).clamp(1, 255) } else { 0 };
    [n | st8 << 24, so | (bs as u32) << 24, le, (lf & 0xFFFF_FF00) | sw8]
}

pub fn zusatz(w: &Welt, s: &Speicher, z: usize) -> [u32; 4] {
    let relief = match w.ressourcen.bildchen(s.zahl(RELIEF)[z] as u32) {
        Some(t) if t.seite & crate::ressourcen::TEXTUR_MARKE != 0 => (t.seite & 0xFFFF) | 1 << 16 | 1 << 17,
        _ => 0,
    };
    let nass = (s.zahl(NASS)[z] * 255.0 + 0.5) as u32;
    // H-K27: wiegen · 63 in Bits 2–7 (0 = starr wie vorher)
    let wg = s.zahl(WIEGEN)[z];
    let wiegen = if wg > 0.0 { ((wg * 63.0 + 0.5) as u32).clamp(1, 63) } else { 0 };
    let merkmale = (s.zahl(MODELL)[z] as u32 & 1) | (s.zahl(ABBILDUNG)[z] as u32 & 1) << 1 | wiegen << 2 | (nass & 255) << 8;
    [relief, crate::paket::f32w(s.zahl(KACHEL)[z]).to_bits(), crate::paket::f32w(s.zahl(METALL)[z]).to_bits(), merkmale]
}

/// Material eines `Belag` am Teil `teil` (H-K27, für `Streu`): Farbe (Ausschnitt eingerechnet), Glanz, Leuchten · strahlen, Bild,
/// Zusatz- und Karten-Wörter – wie `Koerper.bild` mit Belag. `None`, wenn das Teil nicht lebt oder keinen Belag hat.
pub fn material(w: &Welt, teil: f64) -> Option<(u32, f64, f64, f64, [u32; 4], [u32; 4])> {
    if teil == 0.0 {
        return None;
    }
    let a = w.art_index(ART.schema.name)?;
    let z = w.komp_zeile(w.zeile_opt(teil as u32)?, a)?;
    let s = &w.speicher[a];
    let mut farbe = s.farbe(FARBE)[z];
    let karten = karten(w, s, z, &mut farbe);
    Some((farbe, s.zahl(GLANZ)[z], s.zahl(LEUCHTEN)[z] * s.zahl(STRAHLEN)[z], s.zahl(BILD)[z], zusatz(w, s, z), karten))
}
