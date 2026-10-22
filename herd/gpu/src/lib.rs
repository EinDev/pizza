//! Herd-GPU-Schicht (wgpu): zeichnet die Zeichenliste des Herd-Kerns – offscreen mit Auslesen (PNG, Tests) oder in
//! eine Fenster-Fläche (Paket H5, winit). Keine Geometrie, keine Mathematik: nur Hochladen und Zeichnen.
//!
//! ```ignore
//! let mut gpu = HerdGpu::neu(&Optionen { software_bevorzugen: true, ..Default::default() })?;
//! kern.bereite(640, 360);
//! let rgba = gpu.bild(&kern)?;            // 640 × 360 × 4 Bytes
//! ```

use std::collections::HashMap;
use std::fmt;

pub use herd_kern;
pub use wgpu;

use herd_kern::liste::{abschnitt, durchgang, flag, textur, Ansicht, ECKE2D_BYTES, ECKE3D_BYTES, INSTANZ_BYTES, SZENE_BYTES};
use wgpu::util::DeviceExt as _;

/// Mehrfachabtastung (Kantenglättung).
pub const MSAA: u32 = 4;
const TIEFE: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;
/// Inhalt des Uniform-Blocks `Geraet` für wgpu (siehe `gemeinsam.wgsl`).
const GERAET: [f32; 4] = [1.0, 0.0, 1.0, 0.0];

/// Woher die GPU-Schicht Zeichenliste und Ressourcendaten bekommt (der Kern selbst oder eine Kopie).
pub trait Quelle {
    fn liste(&self) -> &[u8];
    fn netz(&self, id: u32) -> Option<(&[u8], &[u8])>;
    fn textur(&self, id: u32) -> Option<&[u8]>;
}

impl Quelle for herd_kern::Kern {
    fn liste(&self) -> &[u8] {
        herd_kern::Kern::liste(self)
    }
    fn netz(&self, id: u32) -> Option<(&[u8], &[u8])> {
        herd_kern::Kern::netz(self, id)
    }
    fn textur(&self, id: u32) -> Option<&[u8]> {
        herd_kern::Kern::textur(self, id)
    }
}

#[derive(Clone, Debug)]
pub struct Optionen {
    /// Software-Adapter bevorzugen (WARP unter Windows, lavapipe/llvmpipe unter Linux) – reproduzierbar für Tests.
    pub software_bevorzugen: bool,
    /// Nur Software-Adapter zulassen (kein Rückfall auf die GPU).
    pub nur_software: bool,
    /// Bildwiederholung abwarten (Fenster): `true` = Fifo (VSync).
    pub vsync: bool,
}

impl Default for Optionen {
    fn default() -> Self {
        Optionen { software_bevorzugen: false, nur_software: false, vsync: true }
    }
}

/// Fehlerarten (für die Meldungen nach K-130).
#[derive(Debug)]
pub enum Fehler {
    /// Kein passender Grafikadapter (keine GPU, kein Treiber, kein Software-Adapter).
    KeinAdapter(String),
    /// Adapter gefunden, aber das Gerät ließ sich nicht öffnen.
    KeinGeraet(String),
    /// Fenster-Fläche ließ sich nicht anlegen oder einrichten.
    Flaeche(String),
    /// Zeichenliste unlesbar (Version/Format).
    Zeichenliste,
    /// Bild ließ sich nicht holen/auslesen (Gerät verloren, Zeitüberschreitung).
    Zeichnen(String),
}

impl fmt::Display for Fehler {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Fehler::KeinAdapter(s) => write!(f, "kein Grafikadapter: {}", s),
            Fehler::KeinGeraet(s) => write!(f, "Grafikgerät nicht verfügbar: {}", s),
            Fehler::Flaeche(s) => write!(f, "Fensterfläche: {}", s),
            Fehler::Zeichenliste => write!(f, "Zeichenliste unlesbar"),
            Fehler::Zeichnen(s) => write!(f, "Zeichnen fehlgeschlagen: {}", s),
        }
    }
}

impl std::error::Error for Fehler {}

/// Eine Fenster-Fläche (wgpu-Surface) mit ihrer Einrichtung.
pub struct Flaeche {
    pub surface: wgpu::Surface<'static>,
    pub einrichtung: wgpu::SurfaceConfiguration,
    ansicht_format: wgpu::TextureFormat,
}

impl Flaeche {
    /// Neue Größe in Gerätepixeln (bei Fenster-Größenänderung aufrufen).
    pub fn groesse_aendern(&mut self, gpu: &HerdGpu, breite: u32, hoehe: u32) {
        self.einrichtung.width = breite.max(1);
        self.einrichtung.height = hoehe.max(1);
        self.surface.configure(&gpu.device, &self.einrichtung);
    }
    pub fn groesse(&self) -> (u32, u32) {
        (self.einrichtung.width, self.einrichtung.height)
    }
}

struct Netz {
    version: u32,
    ecken: wgpu::Buffer,
    indizes: wgpu::Buffer,
}

struct Tex {
    version: u32,
    gruppe: wgpu::BindGroup,
}

struct Pipelines {
    flach: wgpu::RenderPipeline,
    himmel: wgpu::RenderPipeline,
    fest: wgpu::RenderPipeline,
    durch_hinten: wgpu::RenderPipeline,
    durch_vorn: wgpu::RenderPipeline,
}

struct Ziel {
    breite: u32,
    hoehe: u32,
    format: wgpu::TextureFormat,
    msaa: wgpu::TextureView,
    tiefe: wgpu::TextureView,
    /// nur offscreen: Auflösungsziel + Auslesepuffer
    aufgeloest: Option<(wgpu::Texture, wgpu::TextureView, wgpu::Buffer, u32)>,
}

/// Wachsender GPU-Puffer für die Daten eines Bildes.
struct Wachspuffer {
    puffer: wgpu::Buffer,
    groesse: u64,
    nutzung: wgpu::BufferUsages,
    name: &'static str,
}

impl Wachspuffer {
    fn neu(dev: &wgpu::Device, name: &'static str, nutzung: wgpu::BufferUsages) -> Self {
        let groesse = 1024;
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
            self.puffer = dev.create_buffer(&wgpu::BufferDescriptor {
                label: Some(self.name),
                size: self.groesse,
                usage: self.nutzung | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
        }
        q.write_buffer(&self.puffer, 0, daten);
    }
}

/// Die GPU-Schicht.
#[allow(dead_code)]
pub struct HerdGpu {
    pub instance: wgpu::Instance,
    pub adapter: wgpu::Adapter,
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    lay_tex: wgpu::BindGroupLayout,
    lay_szene: wgpu::BindGroupLayout,
    lay_szene_schatten: wgpu::BindGroupLayout,
    pl_flach: wgpu::PipelineLayout,
    pl_himmel: wgpu::PipelineLayout,
    pl_licht: wgpu::PipelineLayout,
    pl_schatten: wgpu::PipelineLayout,
    mod_flach: wgpu::ShaderModule,
    mod_himmel: wgpu::ShaderModule,
    mod_licht: wgpu::ShaderModule,
    mod_schatten: wgpu::ShaderModule,
    schatten_pipeline: wgpu::RenderPipeline,
    pipelines: HashMap<wgpu::TextureFormat, Pipelines>,
    s_naechster: wgpu::Sampler,
    s_linear: wgpu::Sampler,
    s_vergleich: wgpu::Sampler,
    netze: HashMap<u32, Netz>,
    texturen: HashMap<u32, Tex>,
    schatten: (u32, wgpu::TextureView),
    szene: wgpu::Buffer,
    geraet: wgpu::Buffer,
    ecken2d: Wachspuffer,
    indizes2d: Wachspuffer,
    instanzen: Wachspuffer,
    ziel: Option<Ziel>,
}

fn instanz(opt: &Optionen) -> wgpu::Instance {
    let mut d = wgpu::InstanceDescriptor::new_without_display_handle();
    d.backends = wgpu::Backends::from_env().unwrap_or(standard_backends());
    let _ = opt;
    wgpu::Instance::new(d)
}

fn standard_backends() -> wgpu::Backends {
    if cfg!(windows) {
        wgpu::Backends::DX12
    } else if cfg!(target_os = "linux") {
        wgpu::Backends::VULKAN | wgpu::Backends::GL
    } else {
        wgpu::Backends::PRIMARY
    }
}

fn adapter_waehlen(inst: &wgpu::Instance, opt: &Optionen, flaeche: Option<&wgpu::Surface<'_>>) -> Result<wgpu::Adapter, Fehler> {
    let anfrage = |fallback: bool| {
        pollster::block_on(inst.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: fallback,
            compatible_surface: flaeche,
            ..Default::default()
        }))
    };
    let mut fehler = String::new();
    if opt.software_bevorzugen || opt.nur_software {
        match anfrage(true) {
            Ok(a) => return Ok(a),
            Err(e) => fehler = e.to_string(),
        }
        // manche Backends melden den Software-Adapter nicht als „fallback“: nach Gerätetyp suchen
        let alle = pollster::block_on(inst.enumerate_adapters(wgpu::Backends::all()));
        for a in alle {
            if a.get_info().device_type == wgpu::DeviceType::Cpu && flaeche.map(|f| a.is_surface_supported(f)).unwrap_or(true) {
                return Ok(a);
            }
        }
        if opt.nur_software {
            return Err(Fehler::KeinAdapter(format!("kein Software-Adapter ({})", fehler)));
        }
    }
    anfrage(false).map_err(|e| Fehler::KeinAdapter(if fehler.is_empty() { e.to_string() } else { format!("{}; {}", fehler, e) }))
}

fn pipeline_layout(dev: &wgpu::Device, name: &str, gruppen: &[&wgpu::BindGroupLayout]) -> wgpu::PipelineLayout {
    let g: Vec<Option<&wgpu::BindGroupLayout>> = gruppen.iter().map(|g| Some(*g)).collect();
    dev.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some(name), bind_group_layouts: &g, immediate_size: 0 })
}

const NETZ_ATTRIBUTE: [wgpu::VertexAttribute; 3] = wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x2];
const INSTANZ_ATTRIBUTE: [wgpu::VertexAttribute; 9] = wgpu::vertex_attr_array![
    3 => Float32x4, 4 => Float32x4, 5 => Float32x4, 6 => Float32x4,
    7 => Float32x4, 8 => Float32x4, 9 => Float32x4, 10 => Float32x4, 11 => Float32x4
];
const FLACH_ATTRIBUTE: [wgpu::VertexAttribute; 4] = wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x2, 2 => Unorm8x4, 3 => Float32];

fn netz_puffer() -> [Option<wgpu::VertexBufferLayout<'static>>; 2] {
    [
        Some(wgpu::VertexBufferLayout { array_stride: ECKE3D_BYTES as u64, step_mode: wgpu::VertexStepMode::Vertex, attributes: &NETZ_ATTRIBUTE }),
        Some(wgpu::VertexBufferLayout { array_stride: INSTANZ_BYTES as u64, step_mode: wgpu::VertexStepMode::Instance, attributes: &INSTANZ_ATTRIBUTE }),
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

impl HerdGpu {
    /// Offscreen-GPU (für Bilder/Tests).
    pub fn neu(opt: &Optionen) -> Result<HerdGpu, Fehler> {
        let inst = instanz(opt);
        let adapter = adapter_waehlen(&inst, opt, None)?;
        HerdGpu::mit_adapter(inst, adapter)
    }

    /// GPU für ein Fenster: `fenster` ist z. B. ein `Arc<winit::window::Window>` (Display- und Window-Handle).
    /// Liefert die GPU und die eingerichtete Fläche (Größe in Gerätepixeln).
    pub fn neu_fuer_fenster<W>(fenster: W, breite: u32, hoehe: u32, opt: &Optionen) -> Result<(HerdGpu, Flaeche), Fehler>
    where
        W: wgpu::WindowHandle + raw_window_handle::HasDisplayHandle + fmt::Debug + Clone + Send + Sync + 'static,
    {
        let mut d = wgpu::InstanceDescriptor::new_without_display_handle();
        d.backends = wgpu::Backends::from_env().unwrap_or(standard_backends());
        d.display = Some(Box::new(fenster.clone()));
        let inst = wgpu::Instance::new(d);
        let surface = inst.create_surface(wgpu::SurfaceTarget::DisplayAndWindow(Box::new(fenster))).map_err(|e| Fehler::Flaeche(e.to_string()))?;
        let adapter = adapter_waehlen(&inst, opt, Some(&surface))?;
        let gpu = HerdGpu::mit_adapter(inst, adapter)?;
        let caps = surface.get_capabilities(&gpu.adapter);
        if caps.formats.is_empty() {
            return Err(Fehler::Flaeche("die Fläche bietet kein Format an".into()));
        }
        // Shader geben sRGB-kodierte Werte aus → Format ohne automatische sRGB-Umwandlung
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
        surface.configure(&gpu.device, &einrichtung);
        Ok((gpu, Flaeche { surface, einrichtung, ansicht_format }))
    }

    fn mit_adapter(instance: wgpu::Instance, adapter: wgpu::Adapter) -> Result<HerdGpu, Fehler> {
        let limits = wgpu::Limits::downlevel_webgl2_defaults().using_resolution(adapter.limits());
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("herd"),
            required_features: wgpu::Features::empty(),
            required_limits: limits,
            ..Default::default()
        }))
        .map_err(|e| Fehler::KeinGeraet(e.to_string()))?;
        let dev = &device;

        let vs_fs = wgpu::ShaderStages::VERTEX_FRAGMENT;
        let tex_eintrag = |b: u32| wgpu::BindGroupLayoutEntry {
            binding: b,
            visibility: vs_fs,
            ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
            count: None,
        };
        let samp_eintrag = |b: u32| wgpu::BindGroupLayoutEntry { binding: b, visibility: vs_fs, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None };
        let ubo = |b: u32| wgpu::BindGroupLayoutEntry {
            binding: b,
            visibility: vs_fs,
            ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
            count: None,
        };
        let lay_tex = dev.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("herd textur"), entries: &[tex_eintrag(0), samp_eintrag(1)] });
        let lay_szene = dev.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("herd szene"),
            entries: &[
                ubo(0),
                ubo(1),
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: vs_fs,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Depth, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry { binding: 3, visibility: vs_fs, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison), count: None },
            ],
        });
        let lay_szene_schatten = dev.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("herd szene schatten"), entries: &[ubo(0), ubo(1)] });
        let pl_flach = pipeline_layout(dev, "herd flach", &[&lay_tex, &lay_tex]);
        let pl_himmel = pipeline_layout(dev, "herd himmel", &[&lay_szene]);
        let pl_licht = pipeline_layout(dev, "herd licht", &[&lay_szene, &lay_tex]);
        let pl_schatten = pipeline_layout(dev, "herd schatten", &[&lay_szene_schatten, &lay_tex]);
        let modul = |name: &str, q: &str| dev.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some(name), source: wgpu::ShaderSource::Wgsl(q.into()) });
        let mod_flach = modul("flach", herd_kern::shader::FLACH);
        let mod_himmel = modul("himmel", herd_kern::shader::HIMMEL);
        let mod_licht = modul("licht", herd_kern::shader::LICHT);
        let mod_schatten = modul("schatten", herd_kern::shader::SCHATTEN);

        let puffer = netz_puffer();
        let schatten_pipeline = dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("herd schatten"),
            layout: Some(&pl_schatten),
            vertex: wgpu::VertexState { module: &mod_schatten, entry_point: Some("vs_schatten"), compilation_options: Default::default(), buffers: &puffer },
            primitive: wgpu::PrimitiveState { cull_mode: None, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: TIEFE,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: Default::default(),
                bias: Default::default(),
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
        let s_naechster = sampler("herd nächster", wgpu::FilterMode::Nearest, None);
        let s_linear = sampler("herd linear", wgpu::FilterMode::Linear, None);
        let s_vergleich = sampler("herd vergleich", wgpu::FilterMode::Linear, Some(wgpu::CompareFunction::LessEqual));
        let schatten = (0, HerdGpu::schatten_textur(dev, 1));
        let szene = dev.create_buffer(&wgpu::BufferDescriptor { label: Some("herd szene"), size: SZENE_BYTES as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let gb: Vec<u8> = GERAET.iter().flat_map(|f| f.to_le_bytes()).collect();
        let geraet = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("herd gerät"), contents: &gb, usage: wgpu::BufferUsages::UNIFORM });
        let ecken2d = Wachspuffer::neu(dev, "herd ecken2d", wgpu::BufferUsages::VERTEX);
        let indizes2d = Wachspuffer::neu(dev, "herd indizes2d", wgpu::BufferUsages::INDEX);
        let instanzen = Wachspuffer::neu(dev, "herd instanzen", wgpu::BufferUsages::VERTEX);
        Ok(HerdGpu {
            instance,
            adapter,
            device,
            queue,
            lay_tex,
            lay_szene,
            lay_szene_schatten,
            pl_flach,
            pl_himmel,
            pl_licht,
            pl_schatten,
            mod_flach,
            mod_himmel,
            mod_licht,
            mod_schatten,
            schatten_pipeline,
            pipelines: HashMap::new(),
            s_naechster,
            s_linear,
            s_vergleich,
            netze: HashMap::new(),
            texturen: HashMap::new(),
            schatten,
            szene,
            geraet,
            ecken2d,
            indizes2d,
            instanzen,
            ziel: None,
        })
    }

    /// Angaben zum gewählten Adapter (Name, Backend, Gerätetyp).
    pub fn adapter_info(&self) -> wgpu::AdapterInfo {
        self.adapter.get_info()
    }

    fn schatten_textur(dev: &wgpu::Device, groesse: u32) -> wgpu::TextureView {
        dev.create_texture(&wgpu::TextureDescriptor {
            label: Some("herd shadow-map"),
            size: wgpu::Extent3d { width: groesse, height: groesse, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: TIEFE,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        })
        .create_view(&Default::default())
    }

    fn pipelines(&mut self, format: wgpu::TextureFormat) -> &Pipelines {
        if !self.pipelines.contains_key(&format) {
            let dev = &self.device;
            let ms = wgpu::MultisampleState { count: MSAA, ..Default::default() };
            let tiefe = |schreiben: bool, vergleich: wgpu::CompareFunction| {
                Some(wgpu::DepthStencilState {
                    format: TIEFE,
                    depth_write_enabled: Some(schreiben),
                    depth_compare: Some(vergleich),
                    stencil: Default::default(),
                    bias: Default::default(),
                })
            };
            let ziel = |blend: wgpu::BlendState| [Some(wgpu::ColorTargetState { format, blend: Some(blend), write_mask: wgpu::ColorWrites::ALL })];
            let z_misch = ziel(MISCHEN);
            let z_ersetz = ziel(ERSETZEN);
            let flach_puffer = [Some(wgpu::VertexBufferLayout { array_stride: ECKE2D_BYTES as u64, step_mode: wgpu::VertexStepMode::Vertex, attributes: &FLACH_ATTRIBUTE })];
            let flach = dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("herd flach"),
                layout: Some(&self.pl_flach),
                vertex: wgpu::VertexState { module: &self.mod_flach, entry_point: Some("vs_flach"), compilation_options: Default::default(), buffers: &flach_puffer },
                primitive: Default::default(),
                depth_stencil: tiefe(false, wgpu::CompareFunction::Always),
                multisample: ms,
                fragment: Some(wgpu::FragmentState { module: &self.mod_flach, entry_point: Some("fs_flach"), compilation_options: Default::default(), targets: &z_misch }),
                multiview_mask: None,
                cache: None,
            });
            let himmel = dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("herd himmel"),
                layout: Some(&self.pl_himmel),
                vertex: wgpu::VertexState { module: &self.mod_himmel, entry_point: Some("vs_himmel"), compilation_options: Default::default(), buffers: &[] },
                primitive: Default::default(),
                depth_stencil: tiefe(false, wgpu::CompareFunction::Always),
                multisample: ms,
                fragment: Some(wgpu::FragmentState { module: &self.mod_himmel, entry_point: Some("fs_himmel"), compilation_options: Default::default(), targets: &z_ersetz }),
                multiview_mask: None,
                cache: None,
            });
            let puffer = netz_puffer();
            let licht = |name: &str, cull: Option<wgpu::Face>, schreiben: bool, ziele: &[Option<wgpu::ColorTargetState>]| {
                dev.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some(name),
                    layout: Some(&self.pl_licht),
                    vertex: wgpu::VertexState { module: &self.mod_licht, entry_point: Some("vs_licht"), compilation_options: Default::default(), buffers: &puffer },
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
            self.pipelines.insert(format, Pipelines { flach, himmel, fest, durch_hinten, durch_vorn });
        }
        &self.pipelines[&format]
    }

    /// Lädt neue/geänderte Netze und Texturen hoch.
    fn ressourcen(&mut self, a: &Ansicht, q: &dyn QuelleDyn) {
        for n in a.netze() {
            if self.netze.get(&n.id).map(|x| x.version == n.version).unwrap_or(false) {
                continue;
            }
            let Some((e, i)) = q.netz(n.id) else { continue };
            if e.is_empty() || i.is_empty() {
                self.netze.remove(&n.id);
                continue;
            }
            let ecken = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("herd netz ecken"), contents: e, usage: wgpu::BufferUsages::VERTEX });
            let indizes = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("herd netz indizes"), contents: i, usage: wgpu::BufferUsages::INDEX });
            self.netze.insert(n.id, Netz { version: n.version, ecken, indizes });
        }
        for t in a.texturen() {
            if self.texturen.get(&t.id).map(|x| x.version == t.version).unwrap_or(false) {
                continue;
            }
            let Some(d) = q.textur(t.id) else { continue };
            let (format, bpp) = if t.format == textur::R8 { (wgpu::TextureFormat::R8Unorm, 1) } else { (wgpu::TextureFormat::Rgba8Unorm, 4) };
            if t.breite == 0 || t.hoehe == 0 || d.len() < (t.breite * t.hoehe * bpp) as usize {
                continue;
            }
            let groesse = wgpu::Extent3d { width: t.breite, height: t.hoehe, depth_or_array_layers: 1 };
            let tex = self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("herd textur"),
                size: groesse,
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            self.queue.write_texture(
                wgpu::TexelCopyTextureInfo { texture: &tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                &d[..(t.breite * t.hoehe * bpp) as usize],
                wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(t.breite * bpp), rows_per_image: Some(t.hoehe) },
                groesse,
            );
            let ansicht = tex.create_view(&Default::default());
            let sampler = if t.filter == textur::LINEAR { &self.s_linear } else { &self.s_naechster };
            let gruppe = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("herd textur"),
                layout: &self.lay_tex,
                entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&ansicht) }, wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(sampler) }],
            });
            self.texturen.insert(t.id, Tex { version: t.version, gruppe });
        }
    }

    fn ziel_fuer(&mut self, breite: u32, hoehe: u32, format: wgpu::TextureFormat, offscreen: bool) {
        if let Some(z) = &self.ziel {
            if z.breite == breite && z.hoehe == hoehe && z.format == format && z.aufgeloest.is_some() == offscreen {
                return;
            }
        }
        let groesse = wgpu::Extent3d { width: breite, height: hoehe, depth_or_array_layers: 1 };
        let tex = |name: &str, f: wgpu::TextureFormat, proben: u32, nutzung: wgpu::TextureUsages| {
            self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some(name),
                size: groesse,
                mip_level_count: 1,
                sample_count: proben,
                dimension: wgpu::TextureDimension::D2,
                format: f,
                usage: nutzung,
                view_formats: &[],
            })
        };
        let msaa = tex("herd msaa", format, MSAA, wgpu::TextureUsages::RENDER_ATTACHMENT).create_view(&Default::default());
        let tiefe = tex("herd tiefe", TIEFE, MSAA, wgpu::TextureUsages::RENDER_ATTACHMENT).create_view(&Default::default());
        let aufgeloest = if offscreen {
            let t = tex("herd bild", format, 1, wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC);
            let v = t.create_view(&Default::default());
            let zeile = (breite * 4).div_ceil(256) * 256;
            let b = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("herd auslesen"),
                size: zeile as u64 * hoehe as u64,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            Some((t, v, b, zeile))
        } else {
            None
        };
        self.ziel = Some(Ziel { breite, hoehe, format, msaa, tiefe, aufgeloest });
    }

    /// Zeichnet die Zeichenliste in `aufloesen` (Ansicht einer Textur im Format `format`).
    fn kodiere(&mut self, q: &dyn QuelleDyn, format: wgpu::TextureFormat, aufloesen: Option<&wgpu::TextureView>) -> Result<wgpu::CommandEncoder, Fehler> {
        let liste = q.liste();
        let a = Ansicht::neu(liste).ok_or(Fehler::Zeichenliste)?;
        self.ressourcen(&a, q);
        self.pipelines(format);
        let dev = &self.device;
        let qu = &self.queue;
        let drei_d = a.flags() & flag::DREI_D != 0;
        if drei_d {
            qu.write_buffer(&self.szene, 0, a.abschnitt(abschnitt::SZENE));
        }
        self.ecken2d.schreibe(dev, qu, a.abschnitt(abschnitt::ECKEN2D));
        self.indizes2d.schreibe(dev, qu, a.abschnitt(abschnitt::INDIZES2D));
        self.instanzen.schreibe(dev, qu, a.abschnitt(abschnitt::INSTANZEN));
        let sg = a.schatten_groesse();
        if a.flags() & flag::SCHATTEN != 0 && sg != self.schatten.0 {
            self.schatten = (sg, HerdGpu::schatten_textur(dev, sg.max(1)));
        }
        let dev = &self.device;
        let szene_bg = dev.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("herd szene"),
            layout: &self.lay_szene,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: self.szene.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: self.geraet.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(&self.schatten.1) },
                wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Sampler(&self.s_vergleich) },
            ],
        });
        let szene_schatten_bg = dev.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("herd szene schatten"),
            layout: &self.lay_szene_schatten,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: self.szene.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: self.geraet.as_entire_binding() },
            ],
        });
        let mut enc = dev.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("herd") });
        let zuege: Vec<herd_kern::liste::Zug> = a.zuege().collect();
        let weiss = self.texturen.get(&textur::WEISS).map(|t| &t.gruppe);
        let tex = |id: u32| self.texturen.get(&id).map(|t| &t.gruppe).or(weiss);

        // ---- Schatten ----
        if a.flags() & flag::SCHATTEN != 0 {
            let mut p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("herd schatten"),
                color_attachments: &[],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.schatten.1,
                    depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Store }),
                    stencil_ops: None,
                }),
                ..Default::default()
            });
            p.set_pipeline(&self.schatten_pipeline);
            p.set_bind_group(0, &szene_schatten_bg, &[]);
            for z in zuege.iter().filter(|z| z.durchgang == durchgang::SCHATTEN) {
                let (Some(n), Some(t)) = (self.netze.get(&z.netz), tex(z.textur)) else { continue };
                p.set_bind_group(1, t, &[]);
                p.set_vertex_buffer(0, n.ecken.slice(..));
                p.set_vertex_buffer(1, self.instanzen.puffer.slice(z.erste_instanz as u64 * INSTANZ_BYTES as u64..));
                p.set_index_buffer(n.indizes.slice(..), wgpu::IndexFormat::Uint32);
                p.draw_indexed(z.erster_index..z.erster_index + z.index_anzahl, 0, 0..z.instanz_anzahl);
            }
        }

        // ---- Hauptdurchgang ----
        let ziel = self.ziel.as_ref().expect("Ziel");
        let k = a.klar();
        let pl = &self.pipelines[&format];
        let schrift = self.texturen.get(&textur::SCHRIFT).map(|t| &t.gruppe).or(weiss);
        {
            let mut p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("herd bild"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &ziel.msaa,
                    depth_slice: None,
                    resolve_target: aufloesen,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color { r: k[0] as f64, g: k[1] as f64, b: k[2] as f64, a: 1.0 }),
                        store: wgpu::StoreOp::Discard,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &ziel.tiefe,
                    depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
                    stencil_ops: None,
                }),
                ..Default::default()
            });
            let vp = a.ansichtsfenster();
            let vb = (vp[2].min(ziel.breite.saturating_sub(vp[0]))).max(1);
            let vh = (vp[3].min(ziel.hoehe.saturating_sub(vp[1]))).max(1);
            p.set_viewport(vp[0] as f32, vp[1] as f32, vb as f32, vh as f32, 0.0, 1.0);
            for z in &zuege {
                match z.durchgang {
                    durchgang::HIMMEL => {
                        p.set_pipeline(&pl.himmel);
                        p.set_bind_group(0, &szene_bg, &[]);
                        p.draw(0..3, 0..1);
                    }
                    durchgang::UNDURCHSICHTIG | durchgang::DURCHSICHTIG => {
                        let (Some(n), Some(t)) = (self.netze.get(&z.netz), tex(z.textur)) else { continue };
                        let pipe = match (z.durchgang, z.seiten) {
                            (durchgang::UNDURCHSICHTIG, _) => &pl.fest,
                            (_, 1) => &pl.durch_hinten,
                            _ => &pl.durch_vorn,
                        };
                        p.set_pipeline(pipe);
                        p.set_bind_group(0, &szene_bg, &[]);
                        p.set_bind_group(1, t, &[]);
                        p.set_vertex_buffer(0, n.ecken.slice(..));
                        p.set_vertex_buffer(1, self.instanzen.puffer.slice(z.erste_instanz as u64 * INSTANZ_BYTES as u64..));
                        p.set_index_buffer(n.indizes.slice(..), wgpu::IndexFormat::Uint32);
                        p.draw_indexed(z.erster_index..z.erster_index + z.index_anzahl, 0, 0..z.instanz_anzahl);
                    }
                    durchgang::FLACH => {
                        let (Some(s), Some(t)) = (schrift, tex(z.textur)) else { continue };
                        p.set_pipeline(&pl.flach);
                        p.set_bind_group(0, s, &[]);
                        p.set_bind_group(1, t, &[]);
                        p.set_vertex_buffer(0, self.ecken2d.puffer.slice(..));
                        p.set_index_buffer(self.indizes2d.puffer.slice(..), wgpu::IndexFormat::Uint32);
                        p.draw_indexed(z.erster_index..z.erster_index + z.index_anzahl, 0, 0..1);
                    }
                    _ => {}
                }
            }
        }
        Ok(enc)
    }

    /// Zeichnet die (vorbereitete) Zeichenliste offscreen und liefert RGBA8 (Zeilen dicht, oben zuerst).
    /// Größe = Zielgröße der Liste.
    pub fn bild(&mut self, q: &impl Quelle) -> Result<Vec<u8>, Fehler> {
        let a = Ansicht::neu(q.liste()).ok_or(Fehler::Zeichenliste)?;
        let (b, h) = a.ziel();
        let format = wgpu::TextureFormat::Rgba8Unorm;
        self.ziel_fuer(b, h, format, true);
        let ansicht = self.ziel.as_ref().and_then(|z| z.aufgeloest.as_ref()).map(|x| x.1.clone()).expect("Ziel");
        let mut enc = self.kodiere(&Dyn(q), format, Some(&ansicht))?;
        let (tex, _, puffer, zeile) = self.ziel.as_ref().and_then(|z| z.aufgeloest.as_ref()).expect("Ziel");
        enc.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo { texture: tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            wgpu::TexelCopyBufferInfo { buffer: puffer, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(*zeile), rows_per_image: Some(h) } },
            wgpu::Extent3d { width: b, height: h, depth_or_array_layers: 1 },
        );
        self.queue.submit([enc.finish()]);
        let scheibe = puffer.slice(..);
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
        puffer.unmap();
        Ok(aus)
    }

    /// Zeichnet die (für die Flächengröße vorbereitete) Zeichenliste ins Fenster und zeigt sie an.
    /// `Ok(false)` = Bild ausgelassen (Fenster verdeckt/minimiert oder Fläche neu einzurichten – wurde erledigt).
    pub fn praesentiere(&mut self, q: &impl Quelle, f: &mut Flaeche) -> Result<bool, Fehler> {
        let tex = match f.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t) | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => return Ok(false),
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                f.surface.configure(&self.device, &f.einrichtung);
                return Ok(false);
            }
            wgpu::CurrentSurfaceTexture::Validation => return Err(Fehler::Zeichnen("Fläche ungültig".into())),
        };
        let format = f.ansicht_format;
        let ansicht = tex.texture.create_view(&wgpu::TextureViewDescriptor { format: Some(format), ..Default::default() });
        self.ziel_fuer(tex.texture.width(), tex.texture.height(), format, false);
        let enc = self.kodiere(&Dyn(q), format, Some(&ansicht))?;
        self.queue.submit([enc.finish()]);
        self.queue.present(tex);
        Ok(true)
    }
}

/// Objektsichere Hülle um `Quelle`.
trait QuelleDyn {
    fn liste(&self) -> &[u8];
    fn netz(&self, id: u32) -> Option<(&[u8], &[u8])>;
    fn textur(&self, id: u32) -> Option<&[u8]>;
}
struct Dyn<'a, Q: Quelle>(&'a Q);
impl<Q: Quelle> QuelleDyn for Dyn<'_, Q> {
    fn liste(&self) -> &[u8] {
        self.0.liste()
    }
    fn netz(&self, id: u32) -> Option<(&[u8], &[u8])> {
        self.0.netz(id)
    }
    fn textur(&self, id: u32) -> Option<&[u8]> {
        self.0.textur(id)
    }
}
