//! Schema der Komponenten (die einzige Quelle für Sprache, Compiler, Editor und Doku; HERD.md §3.3) und der
//! spaltenweise Speicher (Struktur von Arrays) einer Komponentenart.

use alloc::string::String;
use alloc::vec::Vec;

use crate::farbe;

/// Feldtypen (SPEC §18.4). `Intern`/`Puffer` sind verborgene Zustandsfelder (nicht im Schema, nicht per ABI).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Typ {
    Zahl,
    Ganz,
    Diavolo,
    Text,
    Wahl,
    Farbe,
    Teil,
    Form,
    Bildchen,
    BildchenListe,
    /// verborgene Zahl (Systemzustand)
    Intern,
    /// verborgener Zahlenpuffer je Komponente (z. B. Teilchen)
    Puffer,
}

/// Alle öffentlichen Feldtypen in Schema-Reihenfolge.
pub const FELDTYPEN: [Typ; 10] =
    [Typ::Zahl, Typ::Ganz, Typ::Diavolo, Typ::Text, Typ::Wahl, Typ::Farbe, Typ::Teil, Typ::Form, Typ::Bildchen, Typ::BildchenListe];

impl Typ {
    pub fn name(self) -> &'static str {
        match self {
            Typ::Zahl => "zahl",
            Typ::Ganz => "ganz",
            Typ::Diavolo => "diavolo",
            Typ::Text => "text",
            Typ::Wahl => "wahl",
            Typ::Farbe => "farbe",
            Typ::Teil => "teil",
            Typ::Form => "form",
            Typ::Bildchen => "bildchen",
            Typ::BildchenListe => "bildchen-liste",
            Typ::Intern => "intern",
            Typ::Puffer => "puffer",
        }
    }
    /// Teil des TypAnanas-Texts: „braucht <erwartet>, nicht …“.
    pub fn erwartet(self) -> &'static str {
        match self {
            Typ::Zahl => "eine Zahl",
            Typ::Ganz => "eine Ganzzahl",
            Typ::Diavolo => "ja/nein",
            Typ::Text | Typ::Wahl => "einen Text",
            Typ::Farbe => "eine Farbe",
            Typ::Teil => "ein Teil",
            Typ::Form => "eine Form",
            Typ::Bildchen => "ein Bildchen",
            Typ::BildchenListe => "ein Blech aus Bildchen",
            Typ::Intern | Typ::Puffer => "nichts",
        }
    }
    pub fn oeffentlich(self) -> bool {
        !matches!(self, Typ::Intern | Typ::Puffer)
    }
    /// Wird als Zahl gespeichert (Spalte `Zahl`).
    pub fn zahlartig(self) -> bool {
        matches!(self, Typ::Zahl | Typ::Ganz | Typ::Diavolo | Typ::Wahl | Typ::Teil | Typ::Form | Typ::Bildchen | Typ::Intern)
    }
    /// Nummer im Schema (1 …), `FELDTYPEN`-Reihenfolge; verborgene 0.
    pub fn nummer(self) -> u32 {
        FELDTYPEN.iter().position(|t| *t == self).map(|p| p as u32 + 1).unwrap_or(0)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Raum {
    Zwei,
    Drei,
    Beide,
}

impl Raum {
    pub fn name(self) -> &'static str {
        match self {
            Raum::Zwei => "2D",
            Raum::Drei => "3D",
            Raum::Beide => "beide",
        }
    }
    pub fn passt(self, drei_d: bool) -> bool {
        match self {
            Raum::Zwei => !drei_d,
            Raum::Drei => drei_d,
            Raum::Beide => true,
        }
    }
}

/// Ein Feld einer Komponente.
#[derive(Clone, Copy, Debug)]
pub struct Feld {
    pub name: &'static str,
    pub typ: Typ,
    /// Standard für zahlartige Felder (Wahl: Index in `wahl`, Diavolo: 0/1, Referenzen: 0 = karton).
    pub zahl: f64,
    /// Standard für Text/Farbe.
    pub text: &'static str,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub wahl: &'static [&'static str],
}

impl Feld {
    const fn neu(name: &'static str, typ: Typ) -> Feld {
        Feld { name, typ, zahl: 0.0, text: "", min: None, max: None, wahl: &[] }
    }
    pub const fn zahl(name: &'static str, standard: f64) -> Feld {
        Feld { zahl: standard, ..Feld::neu(name, Typ::Zahl) }
    }
    pub const fn ganz(name: &'static str, standard: f64) -> Feld {
        Feld { zahl: standard, ..Feld::neu(name, Typ::Ganz) }
    }
    pub const fn diavolo(name: &'static str, standard: bool) -> Feld {
        Feld { zahl: if standard { 1.0 } else { 0.0 }, ..Feld::neu(name, Typ::Diavolo) }
    }
    pub const fn text(name: &'static str, standard: &'static str) -> Feld {
        Feld { text: standard, ..Feld::neu(name, Typ::Text) }
    }
    /// Text aus fester Liste; `standard` = Index.
    pub const fn wahl(name: &'static str, liste: &'static [&'static str], standard: usize) -> Feld {
        Feld { wahl: liste, zahl: standard as f64, ..Feld::neu(name, Typ::Wahl) }
    }
    pub const fn farbe(name: &'static str, standard: &'static str) -> Feld {
        Feld { text: standard, ..Feld::neu(name, Typ::Farbe) }
    }
    pub const fn teil(name: &'static str) -> Feld {
        Feld::neu(name, Typ::Teil)
    }
    pub const fn form(name: &'static str) -> Feld {
        Feld::neu(name, Typ::Form)
    }
    pub const fn bildchen(name: &'static str) -> Feld {
        Feld::neu(name, Typ::Bildchen)
    }
    pub const fn bildchen_liste(name: &'static str) -> Feld {
        Feld::neu(name, Typ::BildchenListe)
    }
    pub const fn intern(name: &'static str, standard: f64) -> Feld {
        Feld { zahl: standard, ..Feld::neu(name, Typ::Intern) }
    }
    pub const fn puffer(name: &'static str) -> Feld {
        Feld::neu(name, Typ::Puffer)
    }
    pub const fn min(self, m: f64) -> Feld {
        Feld { min: Some(m), ..self }
    }
    pub const fn bereich(self, a: f64, b: f64) -> Feld {
        Feld { min: Some(a), max: Some(b), ..self }
    }
}

/// Schema einer Komponentenart. Öffentliche Felder zuerst (Feldnummer = Position + 1), verborgene danach.
#[derive(Clone, Copy, Debug)]
pub struct Schema {
    pub name: &'static str,
    pub raum: Raum,
    /// Namen der Komponenten, die am selben Teil hängen müssen.
    pub braucht: &'static [&'static str],
    pub felder: &'static [Feld],
}

impl Schema {
    pub fn oeffentliche(&self) -> usize {
        self.felder.iter().take_while(|f| f.typ.oeffentlich()).count()
    }
    /// Index (0 …) eines Felds nach Name.
    pub fn feld(&self, name: &str) -> Option<usize> {
        self.felder.iter().position(|f| f.name == name && f.typ.oeffentlich())
    }
}

/// Eine Spalte (alle Werte eines Felds über alle Komponenten der Art).
#[derive(Clone, Debug)]
pub enum Spalte {
    Zahl(Vec<f64>),
    Text(Vec<String>),
    /// gepacktes RGBA8 und der Text, wie er gesetzt wurde
    Farbe(Vec<u32>, Vec<String>),
    Liste(Vec<Vec<u32>>),
    Puffer(Vec<Vec<f64>>),
}

/// Speicher einer Komponentenart: Sparse-Set-Zeilen mit dichten Spalten (Struktur von Arrays).
#[derive(Clone, Debug, Default)]
pub struct Speicher {
    /// Handle der Komponente je Zeile
    pub komp: Vec<u32>,
    /// Teil je Zeile (0 = hängt nirgends)
    pub teil: Vec<u32>,
    pub spalten: Vec<Spalte>,
}

impl Speicher {
    pub fn neu(s: &Schema) -> Speicher {
        let spalten = s
            .felder
            .iter()
            .map(|f| match f.typ {
                Typ::Text => Spalte::Text(Vec::new()),
                Typ::Farbe => Spalte::Farbe(Vec::new(), Vec::new()),
                Typ::BildchenListe => Spalte::Liste(Vec::new()),
                Typ::Puffer => Spalte::Puffer(Vec::new()),
                _ => Spalte::Zahl(Vec::new()),
            })
            .collect();
        Speicher { komp: Vec::new(), teil: Vec::new(), spalten }
    }

    pub fn len(&self) -> usize {
        self.komp.len()
    }
    pub fn is_empty(&self) -> bool {
        self.komp.is_empty()
    }

    /// Neue Zeile mit Standardwerten; liefert die Zeilennummer.
    pub fn zeile_neu(&mut self, s: &Schema, komp: u32) -> usize {
        for (sp, f) in self.spalten.iter_mut().zip(s.felder) {
            match sp {
                Spalte::Zahl(v) => v.push(f.zahl),
                Spalte::Text(v) => v.push(String::from(f.text)),
                Spalte::Farbe(v, t) => {
                    v.push(farbe::lies(f.text).unwrap_or(farbe::WEISS));
                    t.push(String::from(f.text));
                }
                Spalte::Liste(v) => v.push(Vec::new()),
                Spalte::Puffer(v) => v.push(Vec::new()),
            }
        }
        self.komp.push(komp);
        self.teil.push(0);
        self.komp.len() - 1
    }

    /// Kopiert Zeile `z` in eine neue Zeile.
    pub fn zeile_kopie(&mut self, z: usize, komp: u32) -> usize {
        for sp in self.spalten.iter_mut() {
            match sp {
                Spalte::Zahl(v) => v.push(v[z]),
                Spalte::Text(v) => v.push(v[z].clone()),
                Spalte::Farbe(v, t) => {
                    v.push(v[z]);
                    t.push(t[z].clone());
                }
                Spalte::Liste(v) => v.push(v[z].clone()),
                Spalte::Puffer(v) => v.push(v[z].clone()),
            }
        }
        self.komp.push(komp);
        self.teil.push(0);
        self.komp.len() - 1
    }

    /// Entfernt Zeile `z` (swap_remove). Liefert das Handle der Komponente, die nun in `z` steht (falls eine nachrückte).
    pub fn zeile_weg(&mut self, z: usize) -> Option<u32> {
        for sp in self.spalten.iter_mut() {
            match sp {
                Spalte::Zahl(v) => {
                    v.swap_remove(z);
                }
                Spalte::Text(v) => {
                    v.swap_remove(z);
                }
                Spalte::Farbe(v, t) => {
                    v.swap_remove(z);
                    t.swap_remove(z);
                }
                Spalte::Liste(v) => {
                    v.swap_remove(z);
                }
                Spalte::Puffer(v) => {
                    v.swap_remove(z);
                }
            }
        }
        self.komp.swap_remove(z);
        self.teil.swap_remove(z);
        if z < self.komp.len() {
            Some(self.komp[z])
        } else {
            None
        }
    }

    #[inline]
    pub fn zahl(&self, f: usize) -> &[f64] {
        match &self.spalten[f] {
            Spalte::Zahl(v) => v,
            _ => &[],
        }
    }
    #[inline]
    pub fn zahl_mut(&mut self, f: usize) -> &mut [f64] {
        match &mut self.spalten[f] {
            Spalte::Zahl(v) => v,
            _ => &mut [],
        }
    }
    #[inline]
    pub fn text(&self, f: usize) -> &[String] {
        match &self.spalten[f] {
            Spalte::Text(v) => v,
            _ => &[],
        }
    }
    #[inline]
    pub fn farbe(&self, f: usize) -> &[u32] {
        match &self.spalten[f] {
            Spalte::Farbe(v, _) => v,
            _ => &[],
        }
    }
    #[inline]
    pub fn liste(&self, f: usize) -> &[Vec<u32>] {
        match &self.spalten[f] {
            Spalte::Liste(v) => v,
            _ => &[],
        }
    }
    #[inline]
    pub fn puffer(&self, f: usize) -> &[Vec<f64>] {
        match &self.spalten[f] {
            Spalte::Puffer(v) => v,
            _ => &[],
        }
    }
    #[inline]
    pub fn puffer_mut(&mut self, f: usize) -> &mut [Vec<f64>] {
        match &mut self.spalten[f] {
            Spalte::Puffer(v) => v,
            _ => &mut [],
        }
    }

    /// Teil-Spalte und mehrere Zahlenspalten gleichzeitig veränderlich (Indizes paarweise verschieden).
    pub fn zahlen_mut<const N: usize>(&mut self, felder: [usize; N]) -> (&[u32], [&mut [f64]; N]) {
        let anzahl = self.spalten.len();
        for i in 0..N {
            assert!(felder[i] < anzahl, "Spalte fehlt");
            for j in 0..i {
                assert!(felder[i] != felder[j], "Spalte doppelt");
            }
        }
        let basis = self.spalten.as_mut_ptr();
        let sp = felder.map(|f| {
            // Sicherheit: Indizes sind verschieden und gültig → disjunkte Borrows.
            match unsafe { &mut *basis.add(f) } {
                Spalte::Zahl(v) => v.as_mut_slice(),
                _ => &mut [],
            }
        });
        (&self.teil, sp)
    }
}
