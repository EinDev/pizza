//! Kann ein Theke-Programm ein Fenster bekommen? (Nutzerentscheidung K-096)
//!
//! Ein Programm mit Theke (Importgruppe `theke`, `pizza.ui_*`) bricht nativ **ab** (Meldung auf stderr, Exit 2), wenn
//! kein Fenster möglich ist – statt wie früher mit W0100 fensterlos weiterzulaufen. Im Browser gibt es immer ein Fenster.
//! Ausnahmen (kein Fenster, W0100 wie bisher): JSON-Modus, `--ui-ereignisse`, `PIZZA_THEKE=0` (Tests/CI).
//! Gebraucht von der Theke (src/theke.rs) und vom Linux-Starter (src/starter.rs) – beide ohne gemeinsame Abhängigkeiten.

/// Linux ohne `DISPLAY`/`WAYLAND_DISPLAY` (z. B. SSH). Stil wie `starter::WEBKIT_FEHLT`.
pub const KEINE_ANZEIGE: &str = "Dieses Programm braucht einen Bildschirm für sein Theke-Fenster. Es wurde keiner gefunden \
(weder DISPLAY noch WAYLAND_DISPLAY gesetzt, z. B. in einer SSH-Sitzung) – bitte in einer grafischen Sitzung starten.";

/// Windows ohne (funktionierende) WebView2-Runtime.
pub const WEBVIEW2_FEHLT: &str = "Dieses Programm braucht die Microsoft Edge WebView2 Runtime für sein Theke-Fenster. \
Bitte „Microsoft Edge WebView2 Runtime“ installieren (kostenlos von Microsoft: https://developer.microsoft.com/microsoft-edge/webview2/).";

/// Fenster/WebView ließ sich trotz bestandener Vorprüfung nicht erzeugen (Linux: WebKitGTK startet nicht).
pub const FENSTER_FEHLGESCHLAGEN: &str = "Das Theke-Fenster dieses Programms konnte nicht geöffnet werden \
(die WebView WebKitGTK 4.1 ließ sich nicht starten).";

/// `PIZZA_THEKE=0`: Theke abgeschaltet (Tests/CI) → kein Fenster, W0100 wie bisher.
pub fn theke_abgeschaltet() -> bool {
    std::env::var("PIZZA_THEKE").map(|v| v == "0").unwrap_or(false)
}

/// Gibt es eine Anzeige? Linux/BSD: `DISPLAY` oder `WAYLAND_DISPLAY` gesetzt; sonst immer ja.
pub fn anzeige_vorhanden() -> bool {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let gesetzt = |n: &str| std::env::var_os(n).map(|v| !v.is_empty()).unwrap_or(false);
        if !gesetzt("DISPLAY") && !gesetzt("WAYLAND_DISPLAY") {
            return false;
        }
    }
    true
}

/// Bricht ein Theke-Programm ab, das kein Fenster bekommt: Meldung nach stderr (unter Windows ohne Terminal zusätzlich
/// als Meldungsfenster), `detail` nur mit `--debug` (K-083). Liefert Exit-Code 2.
pub fn abbruch(text: &str, detail: Option<&str>, debug: bool) -> i32 {
    let mut t = text.to_string();
    if let (true, Some(d)) = (debug, detail) {
        t.push_str("\ndetail: ");
        t.push_str(d);
    }
    crate::konsole::wichtige_meldung(&t);
    2
}
