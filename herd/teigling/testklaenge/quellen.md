# Testklänge – Herkunft

WAV/FLAC (H-K19a) schreibt `scripts/klaenge-test.js` selbst; `ffmpeg-*.flac` sind einmal mit ffmpeg aus dessen WAV-Quellen
kodiert (verlustfrei, Erwartung = Quelle).

## OGG Vorbis (H-K19b)

HERD.md §13.1 Regel 7 sah Kenney-OGG vor; Downloads waren beim Umsetzen nicht erlaubt, deshalb sind die Vorbis-Testdateien
**synthetische Signale** (ffmpeg `lavfi`, keine Aufnahme, keine Lizenzfrage), einmal lokal mit ffmpeg 9.0.1 (Gyan-Build mit
libvorbis) kodiert und eingecheckt. Ausgangsoptionen jeweils `-map_metadata -1 -fflags +bitexact -flags:a +bitexact`.

| Datei | Quelle (`-f lavfi -i …`) | Kodierer |
|---|---|---|
| `vorbis-mono-22050.ogg` | `sine=f=440:r=22050:d=0.4`, `-af volume=0.6 -ac 1` | `libvorbis -q:a 3` |
| `vorbis-stereo-44100.ogg` | `aevalsrc=0.5*sin(2*PI*330*t)+0.1*sin(2*PI*2900*t)\|0.4*sin(2*PI*554*t+1):s=44100:d=0.4` | `libvorbis -q:a 5` |
| `vorbis-klick-48000.ogg` | `aevalsrc=0.8*sin(2*PI*1000*t)*exp(-60*mod(t\,0.1))\|0.6*sin(2*PI*1500*t)*exp(-80*mod(t\,0.13)):s=48000:d=0.4` (kurze Blöcke) | `libvorbis -q:a 4` |
| `vorbis-rauschen-8000.ogg` | `anoisesrc=d=0.5:c=pink:r=8000:a=0.3:seed=7`, `-ac 1` | `libvorbis -q:a 0` |
| `vorbis-hoch-96000.ogg` | `aevalsrc=0.5*sin(2*PI*(200+20000*t)*t)\|0.5*sin(2*PI*(300+15000*t)*t):s=96000:d=0.25` | `libvorbis -q:a 10` |
| `vorbis-ffmpeg-44100.ogg` | `aevalsrc=0.4*sin(2*PI*440*t)\|0.4*sin(2*PI*660*t):s=44100:d=0.3` | ffmpeg-eigener Kodierer `-c:a vorbis -strict -2` |
| `vorbis-stille-16000.ogg` | `aevalsrc=0.6*sin(2*PI*700*t)*lt(t\,0.1):s=16000:d=0.3`, `-ac 1` (Stille → ungenutzte Floors) | `libvorbis -q:a 2` |
| `fehler-opus.ogg` | `sine=f=440:r=48000:d=0.1`, `-ac 1` | `libopus -b:a 24k` (Opus im Ogg → Code 6) |
| `fehler-kanaele.ogg` | `sine=f=440:r=22050:d=0.1`, `-ac 3` | `libvorbis -q:a 0` (3 Kanäle → Code 4) |

Abgeleitet (Seiten-genau, Ogg-CRC neu) schreibt `scripts/klaenge-test.js`: `fehler-ogg-crc.ogg`, `fehler-ogg-rate.ogg`,
`fehler-ogg-version.ogg`, `fehler-ogg-zu-lang.ogg`, `fehler-ogg-zu-gross.ogg`, `vorbis-zwei-stroeme.ogg`, `vorbis-seiten.ogg`,
`vorbis-abgeschnitten.ogg`. Residue 0 und Floor 0 erzeugt keiner der beiden Kodierer (Floor 0 prüft `vorbis_tests.rs` mit einem
künstlichen Setup-Kopf).

## libvorbis-Referenz (`libvorbis/*.flac`)

Je Grunddatei: `ffmpeg -c:a libvorbis -i <name>.ogg -f f32le <name>.f32`, dann `node scripts/klaenge-test.js --pruefe --libvorbis
<ordner>` (i16 nach der Herd-Regel, auf die Frames des eigenen Dekoders gekürzt → `<name>.wav`), dann `ffmpeg -i <name>.wav
-map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a flac -compression_level 12 libvorbis/<name>.flac`.

**Gegenprobe** (H-K19b, lokal, nicht eingecheckt): 98 weitere Dateien (`libvorbis -q:a` −1/0/2/4/6/8/10 × 8 000/11 025/22 050/
32 000/44 100/48 000/96 000 Hz × mono/stereo, Rauschen/Gleitton/Rechteck-Stöße) plus 60 s Stereo und 20 s ffmpeg-Kodierer: in
f32 Abstände um 10⁻⁷, nach i16 **höchstens 1 LSB**, 11 530 von 10 889 747 Werten (0,11 %) um 1 LSB anders. Bitgleich
ist nur nativ = `teigling.wasm` verlangt (`node herd/test-teigling.js`). ffmpegs eigener Ogg-Weg schneidet das Ende anders ab
(bis zu einem halben Block); die Länge des Herds folgt libvorbis/vorbisfile (letzte Granulposition).
