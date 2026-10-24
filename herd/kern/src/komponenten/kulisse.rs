//! `Kulisse` (beide, H-K9): Szenenwechsel wie Unity Scenes – als **Teilbäume, die man an- und ausschaltet** (keine
//! `herd.lade(…)`-Methode, keine Szenen-Dateien). `aktiv: nein` lässt das Teil samt allen Kindern **ruhen** wie eine
//! `Vorlage` (H-K8): keine Systeme, nicht gezeichnet, `trifft` → nein, kein Fühler/Körper; Kameras, Blicke und Lichter darin
//! zählen nicht. `aktiv: ja` weckt den Teilbaum wieder (sofort, über den `setze_zahl`-Haken der Welt). Mehrere Kulissen dürfen
//! zugleich aktiv sein (additiv, z. B. Spiel + Pause darüber); Entladen = `entferne()`. Welt-Einstellungen bleiben global.
//!
//! Kein System, kein Bildbeitrag: nur [`Art::ruhe`] (ruht bei `aktiv` nein). Anders als `Vorlage` bleibt die Kulisse in
//! `kopie()` erhalten (samt `aktiv`). `name` dient nur der Anzeige.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const AKTIV: usize = 0;
pub const NAME: usize = 1;

pub static ART: Art = Art {
    schema: Schema {
        name: "Kulisse",
        genus: Genus::F,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[Feld::diavolo("aktiv", true), Feld::text("name", "")],
    },
    ruhe: Some(aus),
    ..Art::LEER
};

fn aus(s: &Speicher, kz: usize) -> bool {
    s.zahl(AKTIV)[kz] == 0.0
}
