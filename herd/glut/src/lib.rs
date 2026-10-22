//! Herd-Glut (Schicht 1, HERD.md §3.1): zeichnet **Bildpakete v1** des Herd-Kerns (`herd/README.md` §4) mit wgpu.
//! Sie lädt nur hoch und zeichnet – keine Geometrie, keine Szenenlogik.
//!
//! ```ignore
//! let mut glut = Glut::neu(Ziel::Offscreen { breite: 1280, hoehe: 720 }, &Optionen::default())?; // Software-Adapter
//! kern.bild(1);
//! let stat = glut.bild(kern.paket())?;
//! let rgba = glut.lies_pixel()?;           // 1280 × 720 × 4 Bytes, Zeilen von oben
//! ```
//!
//! Fenster (Paket H5): `Glut::neu(Ziel::Fenster { fenster: Arc::new(winit_fenster), breite, hoehe }, &opt)`, dann je Bild
//! `glut.bild(paket)` (zeichnet und zeigt an) und bei Größenänderung `glut.groesse(b, h)`.
//!
//! Browser (Paket H6, `herd/glut-web`): `Glut::neu_async(Ziel::OffscreenCanvas { canvas, breite, hoehe }, &opt).await`
//! (bzw. `Ziel::Canvas` im Hauptthread-Rückfall) – wgpu nimmt WebGPU, sonst WebGL2; gleiche Shader, gleiche Instanzformate.
//!
//! **Adapter:** Standard ist der Software-Adapter (WARP unter Windows, lavapipe/llvmpipe unter Linux); die echte GPU nur mit
//! `Optionen { adapter: Adapter::Gpu, .. }`. `HERD_SOFTWARE=1` erzwingt immer Software. Ohne Software-Adapter → Fehler,
//! nie ein stiller Rückfall auf die GPU.

use std::fmt;
use std::sync::Arc;

pub use herd_kern;
pub use wgpu;

use herd_kern::paket::{abschnitt, flag, zug, Leser, ECKE_BYTES, INST2D_BYTES, INST3D_BYTES, SCHATTEN_GROESSE, SZENE_BYTES, ZUG_BYTES};
use wgpu::util::DeviceExt as _;

/// Mehrfachabtastung (Kantenglättung), wenn der Adapter sie kann.
pub const MSAA_STANDARD: u32 = 4;
const TIEFE: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;
const ATLAS_SEITE: u32 = herd_kern::ressourcen::SEITE as u32;

const GEMEINSAM: &str = include_str!("../shader/gemeinsam.wgsl");
const FLACH: &str = include_str!("../shader/flach.wgsl");
const HIMMEL: &str = include_str!("../shader/himmel.wgsl");
const LICHT: &str = include_str!("../shader/licht.wgsl");
const SCHATTEN: &str = include_str!("../shader/schatten.wgsl");

/// Welcher Grafikadapter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Adapter {
    /// Software (WARP/lavapipe/llvmpipe) – Standard, reproduzierbar, belastet die GPU nicht.
    Software,
    /// Echte GPU – nur auf ausdrücklichen Wunsch (z. B. `herd-bild … --gpu`, Host-Fenster in H5).
    Gpu,
}

#[derive(Clone, Debug)]
pub struct Optionen {
    pub adapter: Adapter,
    /// 1 oder 4 (fällt auf 1 zurück, wenn das Format 4× nicht kann)
    pub msaa: u32,
    /// `false` = Grundlinie: ein Draw-Call je Objekt (HERD.md §6 „vorher/nachher“)
    pub instancing: bool,
    /// Fenster: auf Bildwiederholung warten
    pub vsync: bool,
}

impl Default for Optionen {
    fn default() -> Self {
        Optionen { adapter: Adapter::Software, msaa: MSAA_STANDARD, instancing: true, vsync: true }
    }
}

/// Alles, was ein Fenster-Handle für wgpu braucht (z. B. `winit::window::Window`).
pub trait FensterHandle: raw_window_handle::HasWindowHandle + raw_window_handle::HasDisplayHandle + fmt::Debug + Send + Sync + 'static {}
impl<T: raw_window_handle::HasWindowHandle + raw_window_handle::HasDisplayHandle + fmt::Debug + Send + Sync + 'static> FensterHandle for T {}

/// Wohin die Glut zeichnet. Größen in Gerätepixeln; das Spielfeld wird seitentreu eingepasst (Ränder = Hintergrund).
pub enum Ziel {
    Offscreen { breite: u32, hoehe: u32 },
    Fenster { fenster: Arc<dyn FensterHandle>, breite: u32, hoehe: u32 },
    /// Browser: ein (per `transferControlToOffscreen` übertragenes) `OffscreenCanvas` im Render-Worker (H6).
    #[cfg(target_arch = "wasm32")]
    OffscreenCanvas { canvas: web_sys::OffscreenCanvas, breite: u32, hoehe: u32 },
    /// Browser-Rückfall: `<canvas>` im Hauptthread (ohne OffscreenCanvas/rAF im Worker).
    #[cfg(target_arch = "wasm32")]
    Canvas { canvas: web_sys::HtmlCanvasElement, breite: u32, hoehe: u32 },
}

#[derive(Debug)]
pub enum Fehler {
    /// Kein Adapter (nur bei `Adapter::Gpu`).
    KeinAdapter(String),
    /// Software verlangt, aber kein Software-Adapter vorhanden (es wird **nicht** auf die GPU ausgewichen).
    KeinSoftwareAdapter(String),
    KeinGeraet(String),
    Flaeche(String),
    /// Bildpaket unlesbar (Magie/Version/Abschnitte).
    Paket(String),
    Zeichnen(String),
    /// `lies_pixel` gibt es nur offscreen.
    NurOffscreen,
}

impl fmt::Display for Fehler {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Fehler::KeinAdapter(s) => write!(f, "kein Grafikadapter: {}", s),
            Fehler::KeinSoftwareAdapter(s) => write!(f, "kein Software-Grafikadapter (WARP/lavapipe): {}", s),
            Fehler::KeinGeraet(s) => write!(f, "Grafikgerät nicht verfügbar: {}", s),
            Fehler::Flaeche(s) => write!(f, "Fensterfläche: {}", s),
            Fehler::Paket(s) => write!(f, "Bildpaket unlesbar: {}", s),
            Fehler::Zeichnen(s) => write!(f, "Zeichnen fehlgeschlagen: {}", s),
            Fehler::NurOffscreen => write!(f, "Pixel lesen geht nur offscreen"),
        }
    }
}

impl std::error::Error for Fehler {}

/// Zahlen des letzten Bildes.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Statistik {
    /// Draw-Calls insgesamt (inkl. Schatten und Himmel)
    pub draw_calls: u32,
    pub schatten_draw_calls: u32,
    pub instanzen_2d: u32,
    pub instanzen_3d: u32,
    /// gezeichnete Dreiecke (Haupt- und Schattendurchgang)
    pub dreiecke: u64,
    /// in diesem Bild hochgeladene Bytes (Ressourcen-Deltas + Instanzen + Uniforms)
    pub hochgeladen: u64,
}

struct Netz {
    ecken: wgpu::Buffer,
    indizes: wgpu::Buffer,
    anzahl: u32,
}

/// Wachsender GPU-Puffer (wird nie kleiner, nur bei Bedarf auf die nächste Zweierpotenz vergrößert).
struct Wachspuffer {
    puffer: wgpu::Buffer,
    groesse: u64,
    nutzung: wgpu::BufferUsages,
    name: &'static str,
}

impl Wachspuffer {
    fn neu(dev: &wgpu::Device, name: &'static str, nutzung: wgpu::BufferUsages) -> Self {
        let groesse = 4096;
        let puffer = dev.create_buffer(&wgpu::BufferDescriptor { label: Some(name), size: groesse, usage: nutzung | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        Wachspuffer { puffer, groesse, nutzung, name }
    }
    fn schreibe(&mut self, dev: &wgpu::Device, q: &wgpu::Queue, daten: &[u8]) {
        if daten.is_empty() {
            return;
        }
        let n = daten.len() as u64;
        if n > self.groesse {
            self.groesse = n.next_power_of_two();
            self.puffer = dev.create_buffer(&wgpu::BufferDescriptor { label: Some(self.name), size: self.groesse, usage: self.nutzung | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        }
        q.write_buffer(&self.puffer, 0, daten);
    }
}

struct Pipelines {
    format: wgpu::TextureFormat,
    flach: wgpu::RenderPipeline,
    himmel: wgpu::RenderPipeline,
    fest: wgpu::RenderPipeline,
    durch_hinten: wgpu::RenderPipeline,
    durch_vorn: wgpu::RenderPipeline,
}

enum ZielArt {
    Offscreen { textur: wgpu::Texture, ansicht: wgpu::TextureView, auslesen: wgpu::Buffer, zeile: u32 },
    Fenster { flaeche: wgpu::Surface<'static>, einrichtung: wgpu::SurfaceConfiguration, ansicht_format: wgpu::TextureFormat },
}

/// Die Glut.
pub struct Glut {
    pub instance: wgpu::Instance,
    pub adapter: wgpu::Adapter,
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    opt: Optionen,
    msaa: u32,
    lay_haupt: wgpu::BindGroupLayout,
    lay_schatten: wgpu::BindGroupLayout,
    pl_haupt: wgpu::PipelineLayout,
    mod_flach: wgpu::ShaderModule,
    mod_himmel: wgpu::ShaderModule,
    mod_licht: wgpu::ShaderModule,
    schatten_pipeline: wgpu::RenderPipeline,
    pipelines: Vec<Pipelines>,
    s_linear: wgpu::Sampler,
    s_vergleich: wgpu::Sampler,
    szene: wgpu::Buffer,
    ansicht: wgpu::Buffer,
    schatten_map: wgpu::TextureView,
    atlas: (wgpu::Texture, wgpu::TextureView, u32),
    /// GL/WebGL2: ein Textur-Array mit nur einer Schicht wird dort zu TEXTURE_2D (wgpu-hal) und passt dann nicht zur
    /// D2Array-Ansicht → Atlas immer mit mindestens 2 Schichten anlegen (sonst 1)
    atlas_min: u32,
    schrift: (wgpu::Texture, wgpu::TextureView, u32, u32),
    netze: Vec<Option<Netz>>,
    inst2d: Wachspuffer,
    inst3d: Wachspuffer,
    bg_haupt: Option<wgpu::BindGroup>,
    bg_schatten: Option<wgpu::BindGroup>,
    ziel: ZielArt,
    breite: u32,
    hoehe: u32,
    mehrfach: Option<wgpu::TextureView>,
    tiefe: wgpu::TextureView,
    stat: Statistik,
    zuege: Vec<[u32; 4]>,
}

/// Welche Schnittstelle die Glut nutzt (im Browser WebGPU oder WebGL2; nativ immer `Nativ`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Schnittstelle {
    Nativ,
    WebGpu,
    WebGl2,
}

fn software_erzwungen() -> bool {
    std::env::var("HERD_SOFTWARE").map(|v| !v.is_empty() && v != "0").unwrap_or(false)
}

fn standard_backends() -> wgpu::Backends {
    if cfg!(target_arch = "wasm32") {
        wgpu::Backends::BROWSER_WEBGPU | wgpu::Backends::GL
    } else if cfg!(windows) {
        wgpu::Backends::DX12
    } else if cfg!(target_os = "linux") {
        wgpu::Backends::VULKAN | wgpu::Backends::GL
    } else {
        wgpu::Backends::PRIMARY
    }
}

/// Adapterwahl. Software: `force_fallback_adapter` + Prüfung `DeviceType::Cpu`, sonst Fehler (kein Rückfall auf die GPU).
/// Hinweis: wgpu fragt beim Aufzählen unter DX12 die Fähigkeiten **aller** Adapter ab (kurzlebiges Gerät je Adapter,
/// ohne Zeichnen) – das lässt sich über die öffentliche wgpu-API nicht vermeiden.
async fn adapter_waehlen(inst: &wgpu::Instance, opt: &Optionen, flaeche: Option<&wgpu::Surface<'_>>) -> Result<wgpu::Adapter, Fehler> {
    let software = opt.adapter == Adapter::Software || software_erzwungen();
    if software {
        let a = inst
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::LowPower,
                force_fallback_adapter: true,
                compatible_surface: flaeche,
                ..Default::default()
            })
            .await
            .map_err(|e| Fehler::KeinSoftwareAdapter(e.to_string()))?;
        let info = a.get_info();
        if info.device_type != wgpu::DeviceType::Cpu {
            return Err(Fehler::KeinSoftwareAdapter(format!("angeboten wurde {} ({:?}) – kein Software-Adapter", info.name, info.device_type)));
        }
        return Ok(a);
    }
    inst.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        force_fallback_adapter: false,
        compatible_surface: flaeche,
        ..Default::default()
    })
    .await
    .map_err(|e| Fehler::KeinAdapter(e.to_string()))
}

/// Browser: den Adapter wählt der Browser (WebGPU bzw. WebGL2 der Fläche). Kein Software-Zwang – in Tests sorgt der
/// Browser selbst dafür (Chrome headless `--disable-gpu` → SwiftShader).
#[cfg(target_arch = "wasm32")]
async fn adapter_web(inst: &wgpu::Instance, flaeche: &wgpu::Surface<'_>) -> Result<wgpu::Adapter, Fehler> {
    inst.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        force_fallback_adapter: false,
        compatible_surface: Some(flaeche),
        ..Default::default()
    })
    .await
    .map_err(|e| Fehler::KeinAdapter(e.to_string()))
}

const NETZ_ATTR: [wgpu::VertexAttribute; 3] = wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x2];
const INST3D_ATTR: [wgpu::VertexAttribute; 7] = wgpu::vertex_attr_array![
    3 => Float32x4, 4 => Float32x4, 5 => Float32x4, 6 => Unorm8x4, 7 => Float32x2, 8 => Uint16x4, 9 => Uint32
];
const INST2D_ATTR: [wgpu::VertexAttribute; 7] = wgpu::vertex_attr_array![
    0 => Float32x4, 1 => Float32x2, 2 => Float32x2, 3 => Float32x2, 4 => Unorm8x4, 5 => Uint32, 6 => Uint16x4
];

fn netz_layouts() -> [Option<wgpu::VertexBufferLayout<'static>>; 2] {
    [
        Some(wgpu::VertexBufferLayout { array_stride: ECKE_BYTES as u64, step_mode: wgpu::VertexStepMode::Vertex, attributes: &NETZ_ATTR }),
        Some(wgpu::VertexBufferLayout { array_stride: INST3D_BYTES as u64, step_mode: wgpu::VertexStepMode::Instance, attributes: &INST3D_ATTR }),
    ]
}

const MISCHEN: wgpu::BlendState = wgpu::BlendState {
    color: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::SrcAlpha, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
    alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
};
/// Farbe ersetzen, Deckkraft des Ziels behalten (das Bild bleibt undurchsichtig).
const ERSETZEN: wgpu::BlendState = wgpu::BlendState {
    color: wgpu::BlendComponent::REPLACE,
    alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::Zero, dst_factor: wgpu::BlendFactor::One, operation: wgpu::BlendOperation::Add },
};

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}
fn u16_at(b: &[u8], i: usize) -> u32 {
    u16::from_le_bytes([b[i], b[i + 1]]) as u32
}

impl Glut {
    /// Neue Glut für ein Ziel (nativ: blockiert, bis Adapter und Gerät bereit sind).
    #[cfg(not(target_arch = "wasm32"))]
    pub fn neu(ziel: Ziel, opt: &Optionen) -> Result<Glut, Fehler> {
        pollster::block_on(Glut::neu_async(ziel, opt))
    }

    /// Neue Glut für ein Ziel, ohne zu blockieren (im Browser der einzige Weg; nativ gleichwertig zu `neu`).
    pub async fn neu_async(ziel: Ziel, opt: &Optionen) -> Result<Glut, Fehler> {
        let mut d = wgpu::InstanceDescriptor::new_without_display_handle();
        d.backends = wgpu::Backends::from_env().unwrap_or(standard_backends());
        match ziel {
            Ziel::Offscreen { breite, hoehe } => {
                let instance = wgpu::Instance::new(d);
                let adapter = adapter_waehlen(&instance, opt, None).await?;
                let (device, queue) = Glut::geraet(&adapter).await?;
                let format = wgpu::TextureFormat::Rgba8Unorm;
                let z = Glut::offscreen_ziel(&device, breite.max(1), hoehe.max(1), format);
                Glut::fertig(instance, adapter, device, queue, opt, z, breite.max(1), hoehe.max(1), format)
            }
            Ziel::Fenster { fenster, breite, hoehe } => {
                d.display = Some(Box::new(fenster.clone()));
                let instance = wgpu::Instance::new(d);
                let flaeche = instance.create_surface(wgpu::SurfaceTarget::DisplayAndWindow(Box::new(fenster))).map_err(|e| Fehler::Flaeche(e.to_string()))?;
                let adapter = adapter_waehlen(&instance, opt, Some(&flaeche)).await?;
                Glut::flaeche_glut(instance, adapter, flaeche, opt, breite, hoehe).await
            }
            #[cfg(target_arch = "wasm32")]
            Ziel::OffscreenCanvas { canvas, breite, hoehe } => {
                let instance = wgpu::util::new_instance_with_webgpu_detection(d).await;
                let flaeche = instance.create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas)).map_err(|e| Fehler::Flaeche(e.to_string()))?;
                let adapter = adapter_web(&instance, &flaeche).await?;
                Glut::flaeche_glut(instance, adapter, flaeche, opt, breite, hoehe).await
            }
            #[cfg(target_arch = "wasm32")]
            Ziel::Canvas { canvas, breite, hoehe } => {
                let instance = wgpu::util::new_instance_with_webgpu_detection(d).await;
                let flaeche = instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas)).map_err(|e| Fehler::Flaeche(e.to_string()))?;
                let adapter = adapter_web(&instance, &flaeche).await?;
                Glut::flaeche_glut(instance, adapter, flaeche, opt, breite, hoehe).await
            }
        }
    }

    /// Fenster bzw. Canvas: Gerät anlegen und die Fläche einrichten (Format ohne sRGB-Umwandlung, undurchsichtig).
    async fn flaeche_glut(instance: wgpu::Instance, adapter: wgpu::Adapter, flaeche: wgpu::Surface<'static>, opt: &Optionen, breite: u32, hoehe: u32) -> Result<Glut, Fehler> {
        let (device, queue) = Glut::geraet(&adapter).await?;
        let caps = flaeche.get_capabilities(&adapter);
        if caps.formats.is_empty() {
            return Err(Fehler::Flaeche("die Fläche bietet kein Format an".into()));
        }
        // Shader geben sRGB-kodierte Werte aus → Ansicht ohne automatische sRGB-Umwandlung
        let format = caps.formats.iter().copied().find(|f| !f.is_srgb()).unwrap_or(caps.formats[0]);
        let ansicht_format = format.remove_srgb_suffix();
        let alpha = if caps.alpha_modes.contains(&wgpu::CompositeAlphaMode::Opaque) { wgpu::CompositeAlphaMode::Opaque } else { caps.alpha_modes[0] };
        let einrichtung = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: breite.max(1),
            height: hoehe.max(1),
            present_mode: if opt.vsync { wgpu::PresentMode::AutoVsync } else { wgpu::PresentMode::AutoNoVsync },
            desired_maximum_frame_latency: 2,
            alpha_mode: alpha,
            view_formats: if ansicht_format != format { vec![ansicht_format] } else { vec![] },
            color_space: wgpu::SurfaceColorSpace::Auto,
        };
        flaeche.configure(&device, &einrichtung);
        let z = ZielArt::Fenster { flaeche, einrichtung, ansicht_format };
        Glut::fertig(instance, adapter, device, queue, opt, z, breite.max(1), hoehe.max(1), ansicht_format)
    }

    async fn geraet(adapter: &wgpu::Adapter) -> Result<(wgpu::Device, wgpu::Queue), Fehler> {
        // WebGL2 kann weniger als „downlevel“ (z. B. keine Storage-Puffer) – die Glut braucht davon nichts
        let webgl = cfg!(target_arch = "wasm32") && adapter.get_info().backend == wgpu::Backend::Gl;
        let grund = if webgl { wgpu::Limits::downlevel_webgl2_defaults() } else { wgpu::Limits::downlevel_defaults() };
        adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("herd glut"),
                required_features: wgpu::Features::empty(),
                required_limits: grund.using_resolution(adapter.limits()),
                ..Default::default()
            })
            .await
            .map_err(|e| Fehler::KeinGeraet(e.to_string()))
    }

    fn offscreen_ziel(dev: &wgpu::Device, breite: u32, hoehe: u32, format: wgpu::TextureFormat) -> ZielArt {
        let textur = dev.create_texture(&wgpu::TextureDescriptor {
            label: Some("herd bild"),
            size: wgpu::Extent3d { width: breite, height: hoehe, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let ansicht = textur.create_view(&Default::default());
        let zeile = (breite * 4).div_ceil(256) * 256;
        let auslesen = dev.create_buffer(&wgpu::BufferDescriptor {
            label: Some("herd auslesen"),
            size: zeile as u64 * hoehe as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        ZielArt::Offscreen { textur, ansicht, auslesen, zeile }
    }

    #[allow(clippy::too_many_arguments)]
    fn fertig(
        instance: wgpu::Instance,
        adapter: wgpu::Adapter,
        device: wgpu::Device,
        queue: wgpu::Queue,
        opt: &Optionen,
        ziel: ZielArt,
        breite: u32,
        hoehe: u32,
        format: wgpu::TextureFormat,
    ) -> Result<Glut, Fehler> {
        let dev = &device;
        let msaa = {
            let kann = |f: wgpu::TextureFormat| adapter.get_texture_format_features(f).flags.sample_count_supported(4);
            if opt.msaa >= 4 && kann(format) && kann(TIEFE) {
                4
            } else {
                1
            }
        };
        let vs_fs = wgpu::ShaderStages::VERTEX_FRAGMENT;
        let ubo = |b: u32| wgpu::BindGroupLayoutEntry {
            binding: b,
            visibility: vs_fs,
            ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
            count: None,
        };
        let atlas_eintrag = wgpu::BindGroupLayoutEntry {
            binding: 4,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: false }, view_dimension: wgpu::TextureViewDimension::D2Array, multisampled: false },
            count: None,
        };
        let lay_haupt = dev.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("herd haupt"),
            entries: &[
                ubo(0),
                ubo(1),
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Depth, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry { binding: 3, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison), count: None },
                atlas_eintrag,
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry { binding: 6, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            ],
        });
        let lay_schatten = dev.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("herd schatten"), entries: &[ubo(0), atlas_eintrag] });
        let pl = |name: &str, l: &wgpu::BindGroupLayout| dev.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some(name), bind_group_layouts: &[Some(l)], immediate_size: 0 });
        let pl_haupt = pl("herd haupt", &lay_haupt);
        let pl_schatten = pl("herd schatten", &lay_schatten);
        let modul = |name: &str, q: &str| dev.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some(name), source: wgpu::ShaderSource::Wgsl(format!("{}\n{}", GEMEINSAM, q).into()) });
        let mod_flach = modul("herd flach", FLACH);
        let mod_himmel = modul("herd himmel", HIMMEL);
        let mod_licht = modul("herd licht", LICHT);
        let mod_schatten = modul("herd schatten", SCHATTEN);

        let layouts = netz_layouts();
        let schatten_pipeline = dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("herd schatten"),
            layout: Some(&pl_schatten),
            vertex: wgpu::VertexState { module: &mod_schatten, entry_point: Some("vs_schatten"), compilation_options: Default::default(), buffers: &layouts },
            primitive: wgpu::PrimitiveState { cull_mode: None, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: TIEFE,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: Default::default(),
                // Steigungsabhängiger Versatz gegen Schatten-Akne auf schrägen Flächen
                bias: wgpu::DepthBiasState { constant: 2, slope_scale: 1.5, clamp: 0.0 },
            }),
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState { module: &mod_schatten, entry_point: Some("fs_schatten"), compilation_options: Default::default(), targets: &[] }),
            multiview_mask: None,
            cache: None,
        });

        let sampler = |name: &str, filter: wgpu::FilterMode, vergleich: Option<wgpu::CompareFunction>| {
            dev.create_sampler(&wgpu::SamplerDescriptor {
                label: Some(name),
                address_mode_u: wgpu::AddressMode::ClampToEdge,
                address_mode_v: wgpu::AddressMode::ClampToEdge,
                address_mode_w: wgpu::AddressMode::ClampToEdge,
                mag_filter: filter,
                min_filter: filter,
                compare: vergleich,
                ..Default::default()
            })
        };
        let s_linear = sampler("herd linear", wgpu::FilterMode::Linear, None);
        let s_vergleich = sampler("herd vergleich", wgpu::FilterMode::Linear, Some(wgpu::CompareFunction::LessEqual));
        let szene = dev.create_buffer(&wgpu::BufferDescriptor { label: Some("herd szene"), size: SZENE_BYTES as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let ansicht = dev.create_buffer(&wgpu::BufferDescriptor { label: Some("herd ansicht"), size: 16, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let schatten_map = Glut::tiefen_textur(dev, "herd shadow-map", 1, 1, 1);
        let atlas_min = if adapter.get_info().backend == wgpu::Backend::Gl { 2 } else { 1 };
        let atlas = Glut::atlas_textur(dev, 1, atlas_min);
        let schrift = Glut::schrift_textur(dev, 1, 1);
        let inst2d = Wachspuffer::neu(dev, "herd inst2d", wgpu::BufferUsages::VERTEX);
        let inst3d = Wachspuffer::neu(dev, "herd inst3d", wgpu::BufferUsages::VERTEX);
        let (mehrfach, tiefe) = Glut::mehrfach_ziele(dev, breite, hoehe, format, msaa);
        Ok(Glut {
            instance,
            adapter,
            device,
            queue,
            opt: opt.clone(),
            msaa,
            lay_haupt,
            lay_schatten,
            pl_haupt,
            mod_flach,
            mod_himmel,
            mod_licht,
            schatten_pipeline,
            pipelines: Vec::new(),
            s_linear,
            s_vergleich,
            szene,
            ansicht,
            schatten_map,
            atlas: (atlas.0, atlas.1, 0),
            atlas_min,
            schrift: (schrift.0, schrift.1, 1, 1),
            netze: Vec::new(),
            inst2d,
            inst3d,
            bg_haupt: None,
            bg_schatten: None,
            ziel,
            breite,
            hoehe,
            mehrfach,
            tiefe,
            stat: Statistik::default(),
            zuege: Vec::new(),
        })
    }

    fn tiefen_textur(dev: &wgpu::Device, name: &str, b: u32, h: u32, proben: u32) -> wgpu::TextureView {
        dev.create_texture(&wgpu::TextureDescriptor {
            label: Some(name),
            size: wgpu::Extent3d { width: b, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: proben,
            dimension: wgpu::TextureDimension::D2,
            format: TIEFE,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | if proben == 1 { wgpu::TextureUsages::TEXTURE_BINDING } else { wgpu::TextureUsages::empty() },
            view_formats: &[],
        })
        .create_view(&Default::default())
    }

    fn atlas_textur(dev: &wgpu::Device, kante: u32, schichten: u32) -> (wgpu::Texture, wgpu::TextureView) {
        let t = dev.create_texture(&wgpu::TextureDescriptor {
            label: Some("herd atlas"),
            size: wgpu::Extent3d { width: kante, height: kante, depth_or_array_layers: schichten },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let v = t.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() });
        (t, v)
    }

    fn schrift_textur(dev: &wgpu::Device, b: u32, h: u32) -> (wgpu::Texture, wgpu::TextureView) {
        let t = dev.create_texture(&wgpu::TextureDescriptor {
            label: Some("herd schrift"),
            size: wgpu::Extent3d { width: b, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let v = t.create_view(&Default::default());
        (t, v)
    }

    fn mehrfach_ziele(dev: &wgpu::Device, b: u32, h: u32, format: wgpu::TextureFormat, msaa: u32) -> (Option<wgpu::TextureView>, wgpu::TextureView) {
        let mehrfach = if msaa > 1 {
            Some(
                dev.create_texture(&wgpu::TextureDescriptor {
                    label: Some("herd msaa"),
                    size: wgpu::Extent3d { width: b, height: h, depth_or_array_layers: 1 },
                    mip_level_count: 1,
                    sample_count: msaa,
                    dimension: wgpu::TextureDimension::D2,
                    format,
                    usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                    view_formats: &[],
                })
                .create_view(&Default::default()),
            )
        } else {
            None
        };
        (mehrfach, Glut::tiefen_textur(dev, "herd tiefe", b, h, msaa))
    }

    /// Browser: WebGPU oder WebGL2 (nativ: `Nativ`).
    pub fn schnittstelle(&self) -> Schnittstelle {
        match self.adapter.get_info().backend {
            wgpu::Backend::BrowserWebGpu => Schnittstelle::WebGpu,
            wgpu::Backend::Gl if cfg!(target_arch = "wasm32") => Schnittstelle::WebGl2,
            _ => Schnittstelle::Nativ,
        }
    }
    /// Angaben zum gewählten Adapter (Name, Backend, Gerätetyp).
    pub fn adapter_info(&self) -> wgpu::AdapterInfo {
        self.adapter.get_info()
    }
    /// Zahlen des letzten Bildes.
    pub fn statistik(&self) -> Statistik {
        self.stat
    }
    /// Tatsächliche Mehrfachabtastung (1 oder 4).
    pub fn msaa(&self) -> u32 {
        self.msaa
    }
    /// Zielgröße in Gerätepixeln.
    pub fn ziel_groesse(&self) -> (u32, u32) {
        (self.breite, self.hoehe)
    }
    /// Instancing an/aus (Messung vorher/nachher).
    pub fn setze_instancing(&mut self, an: bool) {
        self.opt.instancing = an;
    }

    /// Neue Zielgröße (Gerätepixel): Fenster-Größenänderung bzw. andere Offscreen-Auflösung.
    pub fn groesse(&mut self, breite: u32, hoehe: u32) {
        let (b, h) = (breite.max(1), hoehe.max(1));
        if (b, h) == (self.breite, self.hoehe) {
            return;
        }
        self.breite = b;
        self.hoehe = h;
        let format = match &mut self.ziel {
            ZielArt::Offscreen { .. } => {
                self.ziel = Glut::offscreen_ziel(&self.device, b, h, wgpu::TextureFormat::Rgba8Unorm);
                wgpu::TextureFormat::Rgba8Unorm
            }
            ZielArt::Fenster { flaeche, einrichtung, ansicht_format } => {
                einrichtung.width = b;
                einrichtung.height = h;
                flaeche.configure(&self.device, einrichtung);
                *ansicht_format
            }
        };
        let (m, t) = Glut::mehrfach_ziele(&self.device, b, h, format, self.msaa);
        self.mehrfach = m;
        self.tiefe = t;
    }

    fn pipelines(&mut self, format: wgpu::TextureFormat) -> usize {
        if let Some(i) = self.pipelines.iter().position(|p| p.format == format) {
            return i;
        }
        let dev = &self.device;
        let ms = wgpu::MultisampleState { count: self.msaa, ..Default::default() };
        let tiefe = |schreiben: bool, vergleich: wgpu::CompareFunction| {
            Some(wgpu::DepthStencilState { format: TIEFE, depth_write_enabled: Some(schreiben), depth_compare: Some(vergleich), stencil: Default::default(), bias: Default::default() })
        };
        let ziel = |blend: wgpu::BlendState| [Some(wgpu::ColorTargetState { format, blend: Some(blend), write_mask: wgpu::ColorWrites::ALL })];
        let z_misch = ziel(MISCHEN);
        let z_ersetz = ziel(ERSETZEN);
        let flach_layout = [Some(wgpu::VertexBufferLayout { array_stride: INST2D_BYTES as u64, step_mode: wgpu::VertexStepMode::Instance, attributes: &INST2D_ATTR })];
        let flach = dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("herd flach"),
            layout: Some(&self.pl_haupt),
            vertex: wgpu::VertexState { module: &self.mod_flach, entry_point: Some("vs_flach"), compilation_options: Default::default(), buffers: &flach_layout },
            primitive: Default::default(),
            depth_stencil: tiefe(false, wgpu::CompareFunction::Always),
            multisample: ms,
            fragment: Some(wgpu::FragmentState { module: &self.mod_flach, entry_point: Some("fs_flach"), compilation_options: Default::default(), targets: &z_misch }),
            multiview_mask: None,
            cache: None,
        });
        let himmel = dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("herd himmel"),
            layout: Some(&self.pl_haupt),
            vertex: wgpu::VertexState { module: &self.mod_himmel, entry_point: Some("vs_himmel"), compilation_options: Default::default(), buffers: &[] },
            primitive: Default::default(),
            depth_stencil: tiefe(false, wgpu::CompareFunction::Always),
            multisample: ms,
            fragment: Some(wgpu::FragmentState { module: &self.mod_himmel, entry_point: Some("fs_himmel"), compilation_options: Default::default(), targets: &z_ersetz }),
            multiview_mask: None,
            cache: None,
        });
        let layouts = netz_layouts();
        let licht = |name: &str, cull: Option<wgpu::Face>, schreiben: bool, ziele: &[Option<wgpu::ColorTargetState>]| {
            dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(name),
                layout: Some(&self.pl_haupt),
                vertex: wgpu::VertexState { module: &self.mod_licht, entry_point: Some("vs_licht"), compilation_options: Default::default(), buffers: &layouts },
                primitive: wgpu::PrimitiveState { cull_mode: cull, front_face: wgpu::FrontFace::Ccw, ..Default::default() },
                depth_stencil: tiefe(schreiben, wgpu::CompareFunction::Less),
                multisample: ms,
                fragment: Some(wgpu::FragmentState { module: &self.mod_licht, entry_point: Some("fs_licht"), compilation_options: Default::default(), targets: ziele }),
                multiview_mask: None,
                cache: None,
            })
        };
        let fest = licht("herd fest", None, true, &z_ersetz);
        let durch_hinten = licht("herd durch hinten", Some(wgpu::Face::Front), false, &z_misch);
        let durch_vorn = licht("herd durch vorn", Some(wgpu::Face::Back), false, &z_misch);
        self.pipelines.push(Pipelines { format, flach, himmel, fest, durch_hinten, durch_vorn });
        self.pipelines.len() - 1
    }

    // ------------------------------------------------------------------------------------------ Ressourcen-Deltas

    fn atlas_schichten(&mut self, n: u32) {
        if n <= self.atlas.2 {
            return;
        }
        let (t, v) = Glut::atlas_textur(&self.device, ATLAS_SEITE, n.max(self.atlas_min));
        if self.atlas.2 > 0 {
            let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("herd atlas kopie") });
            enc.copy_texture_to_texture(
                wgpu::TexelCopyTextureInfo { texture: &self.atlas.0, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                wgpu::TexelCopyTextureInfo { texture: &t, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                wgpu::Extent3d { width: ATLAS_SEITE, height: ATLAS_SEITE, depth_or_array_layers: self.atlas.2 },
            );
            self.queue.submit([enc.finish()]);
        }
        self.atlas = (t, v, n);
        self.bg_haupt = None;
        self.bg_schatten = None;
    }

    fn ressource(&mut self, art: u32, d: &[u8]) -> Result<u64, Fehler> {
        let kurz = || Fehler::Paket(format!("Abschnitt {} zu kurz", art));
        match art {
            abschnitt::SCHRIFT => {
                if d.len() < 12 {
                    return Err(kurz());
                }
                let (b, h) = (u16_at(d, 0), u16_at(d, 2));
                let px = d.get(12..12 + (b * h) as usize).ok_or_else(kurz)?;
                if b == 0 || h == 0 {
                    return Ok(0);
                }
                let (t, v) = Glut::schrift_textur(&self.device, b, h);
                self.queue.write_texture(
                    wgpu::TexelCopyTextureInfo { texture: &t, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                    px,
                    wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(b), rows_per_image: Some(h) },
                    wgpu::Extent3d { width: b, height: h, depth_or_array_layers: 1 },
                );
                self.schrift = (t, v, b, h);
                self.bg_haupt = None;
                Ok(px.len() as u64)
            }
            abschnitt::ATLAS_SEITE => {
                if d.len() < 8 {
                    return Err(kurz());
                }
                self.atlas_schichten(u32_at(d, 0) + 1);
                Ok(0)
            }
            abschnitt::ATLAS_STUECK => {
                if d.len() < 12 {
                    return Err(kurz());
                }
                let (seite, x, y, b, h) = (u32_at(d, 0), u16_at(d, 4), u16_at(d, 6), u16_at(d, 8), u16_at(d, 10));
                let px = d.get(12..12 + (b * h * 4) as usize).ok_or_else(kurz)?;
                if b == 0 || h == 0 || x + b > ATLAS_SEITE || y + h > ATLAS_SEITE {
                    return Ok(0);
                }
                self.atlas_schichten(seite + 1);
                self.queue.write_texture(
                    wgpu::TexelCopyTextureInfo { texture: &self.atlas.0, mip_level: 0, origin: wgpu::Origin3d { x, y, z: seite }, aspect: wgpu::TextureAspect::All },
                    px,
                    wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(b * 4), rows_per_image: Some(h) },
                    wgpu::Extent3d { width: b, height: h, depth_or_array_layers: 1 },
                );
                Ok(px.len() as u64)
            }
            abschnitt::NETZ => {
                if d.len() < 36 {
                    return Err(kurz());
                }
                let (id, ecken, indizes) = (u32_at(d, 0) as usize, u32_at(d, 4) as usize, u32_at(d, 8) as usize);
                let e = d.get(36..36 + ecken * ECKE_BYTES).ok_or_else(kurz)?;
                let i = d.get(36 + ecken * ECKE_BYTES..36 + ecken * ECKE_BYTES + indizes * 4).ok_or_else(kurz)?;
                if self.netze.len() <= id {
                    self.netze.resize_with(id + 1, || None);
                }
                self.netze[id] = if ecken == 0 || indizes == 0 {
                    None
                } else {
                    let ecken = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("herd netz ecken"), contents: e, usage: wgpu::BufferUsages::VERTEX });
                    let ib = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("herd netz indizes"), contents: i, usage: wgpu::BufferUsages::INDEX });
                    Some(Netz { ecken, indizes: ib, anzahl: indizes as u32 })
                };
                Ok((e.len() + i.len()) as u64)
            }
            _ => Ok(0),
        }
    }

    fn bindegruppen(&mut self, schatten_noetig: bool) {
        // Shadow-Map erst anlegen, wenn ein Bild Schatten hat (16 MB bei 2048²) – auch wenn frühere Bilder keine hatten
        if schatten_noetig && self.schatten_map.texture().width() != SCHATTEN_GROESSE {
            self.schatten_map = Glut::tiefen_textur(&self.device, "herd shadow-map", SCHATTEN_GROESSE, SCHATTEN_GROESSE, 1);
            self.bg_haupt = None;
        }
        if self.bg_haupt.is_none() {
            self.bg_haupt = Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("herd haupt"),
                layout: &self.lay_haupt,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: self.szene.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: self.ansicht.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(&self.schatten_map) },
                    wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Sampler(&self.s_vergleich) },
                    wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(&self.atlas.1) },
                    wgpu::BindGroupEntry { binding: 5, resource: wgpu::BindingResource::TextureView(&self.schrift.1) },
                    wgpu::BindGroupEntry { binding: 6, resource: wgpu::BindingResource::Sampler(&self.s_linear) },
                ],
            }));
        }
        if self.bg_schatten.is_none() {
            self.bg_schatten = Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("herd schatten"),
                layout: &self.lay_schatten,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: self.szene.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(&self.atlas.1) },
                ],
            }));
        }
    }

    // ------------------------------------------------------------------------------------------ Zeichnen

    /// Lädt die Ressourcen-Deltas und Instanzen eines Bildpakets hoch und zeichnet es (offscreen: in die Zieltextur,
    /// Fenster: zeichnet und zeigt an). Liefert die Zahlen des Bildes.
    pub fn bild(&mut self, paket: &[u8]) -> Result<Statistik, Fehler> {
        let leser = Leser::neu(paket).ok_or_else(|| Fehler::Paket("Kopf (Magie/Version)".into()))?;
        let (feld_b, feld_h) = leser.feld();
        let flags = leser.flags();
        let mut stat = Statistik::default();
        let mut inst2d: &[u8] = &[];
        let mut inst3d: &[u8] = &[];
        self.zuege.clear();
        let mut szene_da = false;
        let mut klar = wgpu::Color::BLACK;
        for (art, d) in leser.abschnitte() {
            match art {
                abschnitt::SZENE => {
                    if d.len() != SZENE_BYTES {
                        return Err(Fehler::Paket(format!("SZENE hat {} Bytes", d.len())));
                    }
                    self.queue.write_buffer(&self.szene, 0, d);
                    // hintergrund (sRGB) bei Byte 272 – das Ziel speichert sRGB-kodierte Werte
                    let f = |i: usize| f32::from_le_bytes([d[i], d[i + 1], d[i + 2], d[i + 3]]) as f64;
                    klar = wgpu::Color { r: f(272), g: f(276), b: f(280), a: 1.0 };
                    stat.hochgeladen += d.len() as u64;
                    szene_da = true;
                }
                abschnitt::INST3D => inst3d = d,
                abschnitt::INST2D => inst2d = d,
                abschnitt::ZUEGE3D => {
                    for z in d.chunks_exact(ZUG_BYTES) {
                        self.zuege.push([u32_at(z, 0), u32_at(z, 4), u32_at(z, 8), u32_at(z, 12)]);
                    }
                }
                _ => stat.hochgeladen += self.ressource(art, d)?,
            }
        }
        if !szene_da {
            return Err(Fehler::Paket("SZENE fehlt".into()));
        }
        let n2 = (inst2d.len() / INST2D_BYTES) as u32;
        let n3 = (inst3d.len() / INST3D_BYTES) as u32;
        self.inst2d.schreibe(&self.device, &self.queue, inst2d);
        self.inst3d.schreibe(&self.device, &self.queue, inst3d);
        stat.hochgeladen += (inst2d.len() + inst3d.len()) as u64;
        stat.instanzen_2d = n2;
        stat.instanzen_3d = n3;

        // Spielfeld seitentreu einpassen
        let (zb, zh) = (self.breite as f32, self.hoehe as f32);
        let s = (zb / feld_b.max(1) as f32).min(zh / feld_h.max(1) as f32);
        let (vb, vh) = (feld_b as f32 * s, feld_h as f32 * s);
        let (vx, vy) = ((zb - vb) * 0.5, (zh - vh) * 0.5);
        let ansicht = [s, ATLAS_SEITE as f32, self.schrift.2 as f32, self.schrift.3 as f32];
        let ab: Vec<u8> = ansicht.iter().flat_map(|f| f.to_le_bytes()).collect();
        self.queue.write_buffer(&self.ansicht, 0, &ab);

        let schatten = flags & flag::SCHATTEN != 0;
        self.bindegruppen(schatten);

        // Ziel-Ansicht
        let mut fenster_textur = None;
        let (format, ziel_ansicht) = match &self.ziel {
            ZielArt::Offscreen { ansicht, .. } => (wgpu::TextureFormat::Rgba8Unorm, ansicht.clone()),
            ZielArt::Fenster { flaeche, einrichtung, ansicht_format } => {
                let tex = match flaeche.get_current_texture() {
                    wgpu::CurrentSurfaceTexture::Success(t) | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
                    wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => return Ok(stat),
                    wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                        flaeche.configure(&self.device, einrichtung);
                        return Ok(stat);
                    }
                    wgpu::CurrentSurfaceTexture::Validation => return Err(Fehler::Zeichnen("Fläche ungültig".into())),
                };
                let v = tex.texture.create_view(&wgpu::TextureViewDescriptor { format: Some(*ansicht_format), ..Default::default() });
                fenster_textur = Some(tex);
                (*ansicht_format, v)
            }
        };
        let pi = self.pipelines(format);
        let instancing = self.opt.instancing;
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("herd bild") });

        // ---- Schattendurchgang ----
        if schatten {
            let mut p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("herd schatten"),
                color_attachments: &[],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.schatten_map,
                    depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Store }),
                    stencil_ops: None,
                }),
                ..Default::default()
            });
            p.set_pipeline(&self.schatten_pipeline);
            p.set_bind_group(0, self.bg_schatten.as_ref(), &[]);
            for z in self.zuege.iter().filter(|z| z[0] == zug::SCHATTEN) {
                let Some(Some(n)) = self.netze.get(z[1] as usize) else { continue };
                if z[2] + z[3] > n3 {
                    continue;
                }
                p.set_vertex_buffer(0, n.ecken.slice(..));
                p.set_index_buffer(n.indizes.slice(..), wgpu::IndexFormat::Uint32);
                let anzahl = Glut::zeichne_netz(&mut p, &self.inst3d.puffer, n.anzahl, z[2], z[3], instancing);
                stat.draw_calls += anzahl;
                stat.schatten_draw_calls += anzahl;
                stat.dreiecke += (n.anzahl / 3) as u64 * z[3] as u64;
            }
        }

        // ---- Hauptdurchgang ----
        {
            let pl = &self.pipelines[pi];
            let (ansicht, aufloesen) = match &self.mehrfach {
                Some(m) => (m, Some(&ziel_ansicht)),
                None => (&ziel_ansicht, None),
            };
            let mut p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("herd haupt"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: ansicht,
                    depth_slice: None,
                    resolve_target: aufloesen,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(klar), store: if aufloesen.is_some() { wgpu::StoreOp::Discard } else { wgpu::StoreOp::Store } },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.tiefe,
                    depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
                    stencil_ops: None,
                }),
                ..Default::default()
            });
            p.set_viewport(vx, vy, vb.max(1.0), vh.max(1.0), 0.0, 1.0);
            p.set_bind_group(0, self.bg_haupt.as_ref(), &[]);
            if flags & flag::HIMMEL != 0 {
                p.set_pipeline(&pl.himmel);
                p.draw(0..3, 0..1);
                stat.draw_calls += 1;
            }
            for z in self.zuege.iter().filter(|z| z[0] == zug::FEST || z[0] == zug::DURCH) {
                let Some(Some(n)) = self.netze.get(z[1] as usize) else { continue };
                if z[2] + z[3] > n3 {
                    continue;
                }
                p.set_vertex_buffer(0, n.ecken.slice(..));
                p.set_index_buffer(n.indizes.slice(..), wgpu::IndexFormat::Uint32);
                let pipes: &[&wgpu::RenderPipeline] = if z[0] == zug::FEST { &[&pl.fest] } else { &[&pl.durch_hinten, &pl.durch_vorn] };
                for pipe in pipes {
                    p.set_pipeline(pipe);
                    stat.draw_calls += Glut::zeichne_netz(&mut p, &self.inst3d.puffer, n.anzahl, z[2], z[3], instancing);
                    stat.dreiecke += (n.anzahl / 3) as u64 * z[3] as u64;
                }
            }
            if n2 > 0 {
                p.set_pipeline(&pl.flach);
                if instancing {
                    p.set_vertex_buffer(0, self.inst2d.puffer.slice(..n2 as u64 * INST2D_BYTES as u64));
                    p.draw(0..6, 0..n2);
                    stat.draw_calls += 1;
                } else {
                    for i in 0..n2 as u64 {
                        p.set_vertex_buffer(0, self.inst2d.puffer.slice(i * INST2D_BYTES as u64..(i + 1) * INST2D_BYTES as u64));
                        p.draw(0..6, 0..1);
                    }
                    stat.draw_calls += n2;
                }
                stat.dreiecke += 2 * n2 as u64;
            }
        }
        self.queue.submit([enc.finish()]);
        if let Some(t) = fenster_textur {
            self.queue.present(t);
        }
        self.stat = stat;
        Ok(stat)
    }

    /// Zeichnet `anzahl` Instanzen ab `erste` mit dem gesetzten Netz: instanziert ein Draw-Call, sonst einer je Instanz.
    fn zeichne_netz(p: &mut wgpu::RenderPass<'_>, inst: &wgpu::Buffer, indizes: u32, erste: u32, anzahl: u32, instancing: bool) -> u32 {
        let b = INST3D_BYTES as u64;
        if anzahl == 0 {
            return 0;
        }
        if instancing {
            p.set_vertex_buffer(1, inst.slice(erste as u64 * b..(erste + anzahl) as u64 * b));
            p.draw_indexed(0..indizes, 0, 0..anzahl);
            1
        } else {
            for i in erste..erste + anzahl {
                p.set_vertex_buffer(1, inst.slice(i as u64 * b..(i + 1) as u64 * b));
                p.draw_indexed(0..indizes, 0, 0..1);
            }
            anzahl
        }
    }

    /// Wartet, bis die GPU alle eingereichten Arbeiten erledigt hat (für Messungen).
    pub fn warte(&self) -> Result<(), Fehler> {
        self.device.poll(wgpu::PollType::Wait { submission_index: None, timeout: None }).map(|_| ()).map_err(|e| Fehler::Zeichnen(e.to_string()))
    }

    /// Liest das zuletzt gezeichnete Bild (nur offscreen): RGBA8, Zeilen dicht, oben zuerst, Größe = Zielgröße.
    pub fn lies_pixel(&mut self) -> Result<Vec<u8>, Fehler> {
        let ZielArt::Offscreen { textur, auslesen, zeile, .. } = &self.ziel else { return Err(Fehler::NurOffscreen) };
        let (b, h) = (self.breite, self.hoehe);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("herd auslesen") });
        enc.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo { texture: textur, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            wgpu::TexelCopyBufferInfo { buffer: auslesen, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(*zeile), rows_per_image: Some(h) } },
            wgpu::Extent3d { width: b, height: h, depth_or_array_layers: 1 },
        );
        self.queue.submit([enc.finish()]);
        let scheibe = auslesen.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        scheibe.map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        self.device.poll(wgpu::PollType::Wait { submission_index: None, timeout: None }).map_err(|e| Fehler::Zeichnen(e.to_string()))?;
        rx.recv().map_err(|e| Fehler::Zeichnen(e.to_string()))?.map_err(|e| Fehler::Zeichnen(e.to_string()))?;
        let mut aus = Vec::with_capacity((b * h * 4) as usize);
        {
            let daten = scheibe.get_mapped_range().map_err(|e| Fehler::Zeichnen(format!("{:?}", e)))?;
            for y in 0..h as usize {
                let s = y * *zeile as usize;
                aus.extend_from_slice(&daten[s..s + b as usize * 4]);
            }
        }
        auslesen.unmap();
        Ok(aus)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use raw_window_handle::{DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, WindowHandle};

    /// Ein Fenster-Ersatz nur für den Typprüfer – es wird **nie** eine Glut damit angelegt (kein Fenster in Tests).
    #[derive(Debug)]
    struct KeinFenster;
    impl HasWindowHandle for KeinFenster {
        fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
            Err(HandleError::Unavailable)
        }
    }
    impl HasDisplayHandle for KeinFenster {
        fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
            Err(HandleError::Unavailable)
        }
    }

    #[test]
    fn fenster_variante_kompiliert() {
        // nur bauen, nicht aufrufen: die H5-Schnittstelle (Arc<Fenster> → Ziel::Fenster) muss typprüfen
        let _baue = |f: Arc<KeinFenster>| Glut::neu(Ziel::Fenster { fenster: f, breite: 640, hoehe: 360 }, &Optionen { adapter: Adapter::Gpu, vsync: true, ..Default::default() });
        let o = Optionen::default();
        assert_eq!(o.adapter, Adapter::Software);
        assert!(o.instancing);
    }
}
