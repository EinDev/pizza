//! `Etikett` (beide, H-K16): ein Name am Teil – `herd.modell` setzt ihn je glTF-Knoten, jedes Programm kann ihn auch selbst
//! verwenden. `teil.finde(name)` (Kern-Export `teil_finde`) sucht das erste Teil im Teilbaum (Wurzel eingeschlossen,
//! Tiefensuche in Kindreihenfolge) mit diesem Etikett. Verborgenes Feld `knoten`: Knotennummer im Modell + 1 (0 = nicht aus
//! einem Modell), für die Zuordnung der Animationskanäle (H-K23a) – glTF-Namen sind oft leer oder doppelt.
//! Kein System, kein Bildbeitrag, keine Hülle.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const NAME: usize = 0;
/// verborgen: Knotennummer + 1
pub const KNOTEN: usize = 1;

pub static ART: Art = Art {
    schema: Schema {
        name: "Etikett",
        genus: Genus::N,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[Feld::text("name", ""), Feld::intern("knoten", 0.0)],
    },
    ..Art::LEER
};
