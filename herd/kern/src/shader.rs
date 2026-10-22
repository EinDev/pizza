//! WGSL-Quellen der Herd-Shader (eine Quelle für wgpu und – per naga erzeugt – WebGL2).
//! Jedes Programm = `gemeinsam.wgsl` + eigene Datei.

macro_rules! programm {
    ($datei:literal) => {
        concat!(include_str!("../shader/gemeinsam.wgsl"), "\n", include_str!(concat!("../shader/", $datei)))
    };
}

pub const FLACH: &str = programm!("flach.wgsl");
pub const HIMMEL: &str = programm!("himmel.wgsl");
pub const LICHT: &str = programm!("licht.wgsl");
pub const SCHATTEN: &str = programm!("schatten.wgsl");

/// (Name, Quelle, Vertex-Einstieg, Fragment-Einstieg)
pub const PROGRAMME: [(&str, &str, &str, &str); 4] = [
    ("flach", FLACH, "vs_flach", "fs_flach"),
    ("himmel", HIMMEL, "vs_himmel", "fs_himmel"),
    ("licht", LICHT, "vs_licht", "fs_licht"),
    ("schatten", SCHATTEN, "vs_schatten", "fs_schatten"),
];
