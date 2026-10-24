//! `Vorlage` (beide, H-K8): ruhendes Muster wie Unity Prefab. Ein Teil mit Vorlage **ruht** samt allen Kindern: keine
//! Systeme, nicht gezeichnet, `trifft` → nein, kein Fühler/Körper, Kameras und Blicke zählen nicht. `kopie()` einer Vorlage
//! liefert ein waches Teil **ohne** Vorlage (sonst wie v1); `ohne("Vorlage")` weckt das Original.
//!
//! Kein System, kein Bildbeitrag: die Komponente setzt nur [`Art::ruhe`] (immer ruhend) und [`Art::kopie_ohne`]. Die Welt
//! leitet daraus den vererbten Zustand `Teile::welt_ruht` ab (`welt.rs`, sofort bei mit/ohne/haenge/kopie), Systeme fragen
//! [`wach`](super::wach). `name` dient nur der Anzeige.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const NAME: usize = 0;

pub static ART: Art = Art {
    schema: Schema {
        name: "Vorlage",
        genus: Genus::F,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[Feld::text("name", "")],
    },
    ruhe: Some(immer),
    kopie_ohne: true,
    ..Art::LEER
};

fn immer(_: &Speicher, _: usize) -> bool {
    true
}
