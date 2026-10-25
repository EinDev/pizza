# Klangquellen – Geräuschkiste

Alle Geräusche stammen von **Freesound** (https://freesound.org) und stehen unter **CC0 1.0** (Creative Commons 0, gemeinfrei,
https://creativecommons.org/publicdomain/zero/1.0/ – keine Namensnennung nötig, wir nennen die Urheber trotzdem). Geladen wurde je
Geräusch die öffentliche HQ-Vorschau (MP3, 128 kbit/s); umgewandelt mit ffmpeg nach **FLAC, mono, 22 050 Hz, 16 Bit**
(`-ac 1 -ar 22050 -sample_fmt s16 -c:a flac -compression_level 8`, Metadaten entfernt).

| Datei | Freesound-Titel | Urheber | Seite | Lizenz | Bearbeitung |
|---|---|---|---|---|---|
| `klaenge/schritt-1.flac`, `klaenge/schritt-2.flac` | footsteps pavement street (Lederschuhe auf nassem Pflaster) | Yuval | https://freesound.org/people/Yuval/sounds/205817/ | CC0 | zwei einzelne Schritte (ab 3,138 s bzw. 4,360 s, je 0,42 s), 4 ms Einblendung, Ausblendung ab 0,27 s, Spitze −3 dBFS |
| `klaenge/ladenglocke.flac` | shop_door_bell.wav | 3bagbrew | https://freesound.org/people/3bagbrew/sounds/57743/ | CC0 | 0 … 4 s, Ausblendung ab 2,8 s über 1,2 s, Spitze −3 dBFS |
| `klaenge/neon-summen.flac` | neon sign buzz hum frizzy mono3.flac | kyles | https://freesound.org/people/kyles/sounds/637729/ | CC0 | Schleife 10 … 16 s, die folgende halbe Sekunde linear in den Anfang geblendet (nahtlos), −24 LUFS |

Das Gewitter-Grollen erzeugt das Programm selbst (`Klang.rauschen` mit Tiefpass und Hüllkurve).
