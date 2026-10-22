//! Herd-Glut im Browser (HERD.md §7.2, Paket H6): eine dünne wasm-bindgen-Hülle um `herd-glut`.
//! Dieselbe Glut wie nativ – gleiche Shader, gleiche Instanzformate, Bildpaket v1 unverändert. wgpu wählt WebGPU, sonst
//! WebGL2. Gebaut von `node herd/baue-web.js` → `site/js/herd/glut.js` (Glue, `--target no-modules`) + `glut_bg.wasm`.
//!
//! JS (Render-Worker oder Hauptthread-Rückfall):
//! ```js
//! const g = await wasm_bindgen.GlutWeb.erzeuge(offscreenCanvas, breite, hoehe, 4);   // wirft bei Fehler (Text)
//! g.bild(paketBytes);              // Uint8Array – Ressourcen-Deltas + Instanzen, zeichnet und präsentiert
//! g.groesse(b, h);                 // neue Gerätepixel-Größe (setzt auch canvas.width/height)
//! g.schnittstelle();               // "WebGPU" | "WebGL2"
//! g.statistik();                   // Float64Array [draw_calls, schatten_draw_calls, instanzen_2d, instanzen_3d, dreiecke, hochgeladen]
//! ```
#![cfg(target_arch = "wasm32")]

use std::sync::{Arc, Mutex};

use herd_glut::{Adapter, Glut, Optionen, Schnittstelle, Ziel};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

/// Die Glut für ein Canvas.
#[wasm_bindgen]
pub struct GlutWeb {
    glut: Glut,
    /// letzter nicht abgefangener wgpu-Fehler (Validierung, Speicher) – `bild` meldet ihn einmal
    fehler: Arc<Mutex<Option<String>>>,
}

fn js_fehler(text: impl AsRef<str>) -> JsValue {
    JsValue::from_str(text.as_ref())
}

#[wasm_bindgen]
impl GlutWeb {
    /// Legt die Glut für ein `OffscreenCanvas` (Render-Worker) oder ein `HTMLCanvasElement` (Hauptthread) an.
    /// `breite`/`hoehe` in Gerätepixeln, `msaa` 1 oder 4. Fehler: Text (z. B. kein WebGPU/WebGL2).
    pub async fn erzeuge(canvas: JsValue, breite: u32, hoehe: u32, msaa: u32) -> Result<GlutWeb, JsValue> {
        let opt = Optionen { adapter: Adapter::Gpu, msaa: if msaa >= 4 { 4 } else { 1 }, instancing: true, vsync: true };
        let ziel = match canvas.dyn_into::<web_sys::OffscreenCanvas>() {
            Ok(c) => Ziel::OffscreenCanvas { canvas: c, breite, hoehe },
            Err(v) => match v.dyn_into::<web_sys::HtmlCanvasElement>() {
                Ok(c) => Ziel::Canvas { canvas: c, breite, hoehe },
                Err(_) => return Err(js_fehler("Glut: kein Canvas übergeben")),
            },
        };
        let glut = Glut::neu_async(ziel, &opt).await.map_err(|e| js_fehler(e.to_string()))?;
        let fehler: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let f = fehler.clone();
        glut.device.on_uncaptured_error(Arc::new(move |e: herd_glut::wgpu::Error| {
            if let Ok(mut g) = f.lock() {
                if g.is_none() {
                    *g = Some(e.to_string());
                }
            }
        }));
        Ok(GlutWeb { glut, fehler })
    }

    /// Zeichnet ein Bildpaket (v1) und präsentiert es. Fehler: Text.
    pub fn bild(&mut self, paket: &[u8]) -> Result<(), JsValue> {
        self.glut.bild(paket).map_err(|e| js_fehler(e.to_string()))?;
        if let Some(t) = self.fehler.lock().ok().and_then(|mut g| g.take()) {
            return Err(js_fehler(format!("wgpu: {}", t)));
        }
        Ok(())
    }

    /// Neue Zielgröße in Gerätepixeln (Canvas wird von wgpu beim Einrichten angepasst).
    pub fn groesse(&mut self, breite: u32, hoehe: u32) {
        self.glut.groesse(breite, hoehe);
    }

    /// "WebGPU" oder "WebGL2".
    pub fn schnittstelle(&self) -> String {
        match self.glut.schnittstelle() {
            Schnittstelle::WebGpu => "WebGPU".into(),
            Schnittstelle::WebGl2 => "WebGL2".into(),
            Schnittstelle::Nativ => "nativ".into(),
        }
    }

    /// Name des Adapters (so weit der Browser ihn verrät).
    pub fn adapter(&self) -> String {
        self.glut.adapter_info().name
    }

    /// Tatsächliche Mehrfachabtastung (1 oder 4).
    pub fn msaa(&self) -> u32 {
        self.glut.msaa()
    }

    /// Zahlen des letzten Bildes: [Draw-Calls, davon Schatten, Instanzen 2D, Instanzen 3D, Dreiecke, hochgeladene Bytes].
    pub fn statistik(&self) -> Vec<f64> {
        let s = self.glut.statistik();
        vec![s.draw_calls as f64, s.schatten_draw_calls as f64, s.instanzen_2d as f64, s.instanzen_3d as f64, s.dreiecke as f64, s.hochgeladen as f64]
    }
}
