//! Fehler des Kerns: Art (welche Ananas), Code (welcher Fall) und fertiger Text (SPEC §18.4/§18.5).
//! Die Laufzeiten werfen `<ArtName>: <text>` – die Texte entstehen nur hier.

use alloc::format;
use alloc::string::String;

use crate::schema::Genus;
use crate::zahl::zahl_text;

/// Ananas-Arten (Rückgabe `-art` bzw. `fehler_art()`).
pub mod art {
    /// `TypAnanas`
    pub const TYP: i32 = 1;
    /// `LaufzeitAnanas`
    pub const LAUFZEIT: i32 = 2;
    /// Falsche Benutzung des ABI durch eine Anbindung (kein Sprachfehler) – die Anbindung meldet
    /// `LaufzeitAnanas: Interner Fehler im Herd: <text>`.
    pub const INTERN: i32 = 3;

    pub fn name(a: i32) -> &'static str {
        match a {
            TYP => "TypAnanas",
            LAUFZEIT => "LaufzeitAnanas",
            _ => "LaufzeitAnanas",
        }
    }
}

/// Fehlercodes (stabil, in `herd/README.md` aufgelistet).
pub mod code {
    pub const HERD_GANZ: i32 = 1;
    pub const HERD_BEREICH: i32 = 2;
    pub const KEINE_WELT: i32 = 3;
    pub const WELT_DOPPELT: i32 = 4;
    pub const TEIL_ENTFERNT: i32 = 10;
    pub const TEIL_UNBEKANNT: i32 = 11;
    pub const HAENGE_ZYKLUS: i32 = 12;
    pub const HAENGE_RAUM: i32 = 13;
    pub const NUR_3D: i32 = 14;
    pub const NUR_2D: i32 = 15;
    pub const LAGE_FELD: i32 = 16;
    pub const RAUM: i32 = 17;
    pub const LAGE_BEREICH: i32 = 18;
    pub const KOMP_TYP: i32 = 20;
    pub const KOMP_HAENGT: i32 = 21;
    pub const KOMP_RAUM: i32 = 22;
    pub const KOMP_DOPPELT: i32 = 23;
    pub const KOMP_BRAUCHT: i32 = 24;
    pub const KOMP_GEBRAUCHT: i32 = 25;
    pub const KOMP_UNBEKANNT: i32 = 26;
    pub const FELD_UNBEKANNT: i32 = 27;
    pub const FELD_TYP: i32 = 28;
    pub const FELD_BEREICH: i32 = 29;
    pub const FELD_WAHL: i32 = 30;
    pub const FARBE: i32 = 31;
    /// Lesefeld gesetzt (H-K0)
    pub const FELD_LESEN: i32 = 32;
    /// teil-liste/zahl-liste zu lang (H-K0)
    pub const LISTE_LAENGE: i32 = 33;
    pub const KOMP_NAME: i32 = 19;
    pub const FORM_TEILE: i32 = 40;
    pub const FORM_TEILE_GANZ: i32 = 51;
    pub const FORM_DICKE: i32 = 41;
    pub const FORM_PUNKTE: i32 = 42;
    pub const FORM_DREIECKE: i32 = 43;
    pub const FORM_INDEX: i32 = 44;
    pub const BILDCHEN_GROESSE: i32 = 45;
    pub const BILDCHEN_ZEICHEN: i32 = 46;
    pub const BILDCHEN_ZEILEN: i32 = 47;
    pub const RESSOURCE: i32 = 48;
    pub const FORM_ART: i32 = 49;
    pub const BILDCHEN_SCHLUESSEL: i32 = 50;
    pub const PUFFER: i32 = 60;
    /// Teigling: kein lesbares Bild (PROJEKTE PD1, K-147; auch ein ungültiger Teigling-Kopf)
    pub const TEIGLING_KEIN_BILD: i32 = 61;
    /// Teigling: Bild zu groß (> 2048 × 2048)
    pub const TEIGLING_ZU_GROSS: i32 = 62;
}

#[derive(Clone, Debug, PartialEq)]
pub struct Fehler {
    pub art: i32,
    pub code: i32,
    pub text: String,
}

pub type Erg<T> = Result<T, Fehler>;

fn f(art: i32, code: i32, text: String) -> Fehler {
    Fehler { art, code, text }
}

pub fn laufzeit(code: i32, text: String) -> Fehler {
    f(art::LAUFZEIT, code, text)
}
pub fn typ(code: i32, text: String) -> Fehler {
    f(art::TYP, code, text)
}
pub fn intern(text: String) -> Fehler {
    f(art::INTERN, code::PUFFER, text)
}

pub fn herd_ganz(param: &str, w: f64) -> Fehler {
    typ(code::HERD_GANZ, format!("Herd({}: …) braucht eine Ganzzahl, nicht {}.", param, zahl_text(w)))
}
pub fn herd_bereich(param: &str, w: f64) -> Fehler {
    laufzeit(code::HERD_BEREICH, format!("Herd({}: …) muss zwischen 64 und 4096 liegen, nicht {}.", param, zahl_text(w)))
}
pub fn keine_welt() -> Fehler {
    laufzeit(code::KEINE_WELT, String::from("Erst braucht es einen Herd (neu Herd(…))."))
}
pub fn welt_doppelt() -> Fehler {
    laufzeit(code::WELT_DOPPELT, String::from("Es gibt nur einen Herd pro Programm."))
}
pub fn teil_entfernt(id: u32) -> Fehler {
    laufzeit(code::TEIL_ENTFERNT, format!("Teil {} ist schon entfernt.", id))
}
pub fn teil_unbekannt(id: u32) -> Fehler {
    laufzeit(code::TEIL_UNBEKANNT, format!("Teil {} gibt es nicht.", id))
}
pub fn haenge_zyklus(id: u32) -> Fehler {
    laufzeit(code::HAENGE_ZYKLUS, format!("Teil {} kann nicht an seinem eigenen Kind hängen.", id))
}
pub fn haenge_raum(kind_3d: bool) -> Fehler {
    laufzeit(
        code::HAENGE_RAUM,
        String::from(if kind_3d {
            "Ein 3D-Teil kann nicht an einem 2D-Teil hängen."
        } else {
            "Ein 2D-Teil kann nicht an einem 3D-Teil hängen."
        }),
    )
}
pub fn nur_3d(id: u32, was: &str) -> Fehler {
    laufzeit(code::NUR_3D, format!("Teil {} ist ein 2D-Teil – {} gibt es nur für 3D-Teile.", id, was))
}
pub fn nur_2d(id: u32, was: &str) -> Fehler {
    laufzeit(code::NUR_2D, format!("Teil {} ist ein 3D-Teil – {} gibt es nur für 2D-Teile.", id, was))
}
pub fn lage_feld(feld: i32) -> Fehler {
    f(art::INTERN, code::LAGE_FELD, format!("Lage-Feld {} gibt es nicht.", feld))
}
pub fn lage_bereich(was: &str, min: f64, max: f64, w: f64) -> Fehler {
    laufzeit(
        code::LAGE_BEREICH,
        format!("{} muss zwischen {} und {} liegen, nicht {}.", was, zahl_text(min), zahl_text(max), zahl_text(w)),
    )
}
pub fn raum(r: i32) -> Fehler {
    f(art::INTERN, code::RAUM, format!("Raum {} gibt es nicht (2 oder 3).", r))
}
pub fn komp_typ(t: i32) -> Fehler {
    f(art::INTERN, code::KOMP_TYP, format!("Komponenten-Typ {} gibt es nicht.", t))
}
/// „Eine Komponente 'Pendel' gibt es nicht.“ (`typ_nummer` mit unbekanntem Namen)
pub fn komp_name(name: &str) -> Fehler {
    laufzeit(code::KOMP_NAME, format!("Eine Komponente '{}' gibt es nicht.", name))
}
/// „Form.kugel(teile: …) braucht eine Ganzzahl, nicht 24.5.“
pub fn form_teile_ganz(form: &str, w: f64) -> Fehler {
    typ(code::FORM_TEILE_GANZ, format!("Form.{}(teile: …) braucht eine Ganzzahl, nicht {}.", form, zahl_text(w)))
}
pub fn komp_unbekannt(k: u32) -> Fehler {
    f(art::INTERN, code::KOMP_UNBEKANNT, format!("Komponente {} gibt es nicht.", k))
}
pub fn komp_haengt(name: &str, genus: Genus, teil: u32) -> Fehler {
    laufzeit(code::KOMP_HAENGT, format!("{} {} hängt schon an Teil {}.", genus.dieser(), name, teil))
}
pub fn komp_raum(name: &str, drei_d: bool) -> Fehler {
    laufzeit(code::KOMP_RAUM, format!("{} gibt es nur für {}-Teile.", name, if drei_d { "3D" } else { "2D" }))
}
pub fn komp_doppelt(teil: u32, name: &str, genus: Genus) -> Fehler {
    laufzeit(code::KOMP_DOPPELT, format!("Teil {} hat schon {} {}.", teil, genus.einen(), name))
}
/// „Animation braucht ein Bild am selben Teil.“
pub fn komp_braucht(name: &str, braucht: &str, genus: Genus) -> Fehler {
    laufzeit(code::KOMP_BRAUCHT, format!("{} braucht {} {} am selben Teil.", name, genus.einen(), braucht))
}
pub fn komp_gebraucht(name: &str, von: &str) -> Fehler {
    laufzeit(code::KOMP_GEBRAUCHT, format!("{} wird von {} am selben Teil gebraucht.", name, von))
}
pub fn feld_unbekannt(name: &str, feld: &str) -> Fehler {
    laufzeit(code::FELD_UNBEKANNT, format!("{} hat kein Feld '{}'.", name, feld))
}
pub fn feld_nummer(name: &str, feld: i32) -> Fehler {
    f(art::INTERN, code::FELD_UNBEKANNT, format!("{} hat kein Feld Nummer {}.", name, feld))
}
/// `TypAnanas: <Name>.<feld> braucht <erwartet>, nicht <darstellung>.`
pub fn feld_typ(name: &str, feld: &str, erwartet: &str, darstellung: &str) -> Fehler {
    typ(code::FELD_TYP, format!("{}.{} braucht {}, nicht {}.", name, feld, erwartet, darstellung))
}
/// `LaufzeitAnanas: <Name>.<feld> kann man nur lesen.` (Lesefeld, H-K0)
pub fn feld_lesen(name: &str, feld: &str) -> Fehler {
    laufzeit(code::FELD_LESEN, format!("{}.{} kann man nur lesen.", name, feld))
}
/// `LaufzeitAnanas: <Name>.<feld> darf höchstens 65536 Einträge haben, nicht <n>.` (H-K0)
pub fn liste_laenge(name: &str, feld: &str, max: usize, n: usize) -> Fehler {
    laufzeit(code::LISTE_LAENGE, format!("{}.{} darf höchstens {} Einträge haben, nicht {}.", name, feld, max, n))
}
pub fn feld_bereich(name: &str, feld: &str, min: Option<f64>, max: Option<f64>, w: f64) -> Fehler {
    let t = match (min, max) {
        (Some(a), Some(b)) => format!("{}.{} muss zwischen {} und {} liegen, nicht {}.", name, feld, zahl_text(a), zahl_text(b), zahl_text(w)),
        (Some(a), None) => format!("{}.{} muss mindestens {} sein, nicht {}.", name, feld, zahl_text(a), zahl_text(w)),
        (None, Some(b)) => format!("{}.{} darf höchstens {} sein, nicht {}.", name, feld, zahl_text(b), zahl_text(w)),
        (None, None) => format!("{}.{} passt nicht: {}.", name, feld, zahl_text(w)),
    };
    laufzeit(code::FELD_BEREICH, t)
}
pub fn feld_wahl(name: &str, feld: &str, w: &str, erlaubt: &[&str]) -> Fehler {
    let mut liste = String::new();
    for (i, e) in erlaubt.iter().enumerate() {
        if i > 0 {
            liste.push_str(", ");
        }
        liste.push_str(e);
    }
    laufzeit(code::FELD_WAHL, format!("{}.{} kennt '{}' nicht. Erlaubt: {}.", name, feld, w, liste))
}
pub fn farbe(t: &str) -> Fehler {
    laufzeit(code::FARBE, format!("Farbe '{}' gibt es nicht. Erlaubt: Palettenname oder '#rrggbb'.", t))
}
pub fn form_teile(w: f64) -> Fehler {
    laufzeit(code::FORM_TEILE, format!("teile muss zwischen 3 und 128 liegen, nicht {}.", zahl_text(w)))
}
pub fn form_dicke(w: f64) -> Fehler {
    laufzeit(code::FORM_DICKE, format!("dicke muss zwischen 0.05 und 0.9 liegen, nicht {}.", zahl_text(w)))
}
pub fn form_punkte() -> Fehler {
    laufzeit(code::FORM_PUNKTE, String::from("Form braucht Punkte als Blech [x1, y1, z1, …] (Länge durch 3 teilbar)."))
}
pub fn form_dreiecke() -> Fehler {
    laufzeit(code::FORM_DREIECKE, String::from("Form braucht Dreiecke als Blech von Punkt-Nummern (Länge durch 3 teilbar)."))
}
pub fn form_index(i: f64, n: usize) -> Fehler {
    laufzeit(code::FORM_INDEX, format!("Punkt {} gibt es nicht – die Form hat {} Punkte.", zahl_text(i), n))
}
pub fn form_art(a: i32) -> Fehler {
    f(art::INTERN, code::FORM_ART, format!("Grundform {} gibt es nicht.", a))
}
pub fn bildchen_groesse() -> Fehler {
    laufzeit(code::BILDCHEN_GROESSE, String::from("Ein Bildchen darf höchstens 256 × 256 Pixel haben."))
}
pub fn bildchen_zeichen(c: char) -> Fehler {
    laufzeit(code::BILDCHEN_ZEICHEN, format!("Das Zeichen '{}' hat im Bildchen keine Farbe.", c))
}
pub fn bildchen_zeilen() -> Fehler {
    laufzeit(code::BILDCHEN_ZEILEN, String::from("Ein Bildchen braucht Zeilen als nicht leeres Blech aus Texten."))
}
pub fn bildchen_schluessel(k: &str) -> Fehler {
    laufzeit(code::BILDCHEN_SCHLUESSEL, format!("Bildchen-Farben brauchen einzelne Zeichen als Schlüssel, nicht '{}'.", k))
}
pub fn ressource(was: &str, id: u32) -> Fehler {
    laufzeit(code::RESSOURCE, format!("{} {} gibt es nicht.", was, id))
}
/// Code 61. Der Kern kennt den Pfad nicht: die Anbindung setzt `<pfad> ` vor den Text (SPEC §18.5).
pub fn teigling_kein_bild() -> Fehler {
    laufzeit(code::TEIGLING_KEIN_BILD, String::from("ist kein lesbares Bild (PNG oder JPEG)."))
}
/// Code 62 (Größe aus dem Fehler-Teigling, `u32`). Pfad wie bei Code 61.
pub fn teigling_zu_gross(b: u32, h: u32) -> Fehler {
    laufzeit(code::TEIGLING_ZU_GROSS, format!("ist zu groß ({} × {}) – höchstens 2048 × 2048 Pixel.", b, h))
}
pub fn puffer(was: &str) -> Fehler {
    intern(format!("Puffer ungültig: {}.", was))
}
