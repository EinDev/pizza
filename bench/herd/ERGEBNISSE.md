# Herd – Messergebnisse

Ziele und Messverfahren: `HERD.md` §6 (K-131). Weitere Abschnitte (Kern, Glut, Wasm-Programm in Chrome, EXE) ergänzen die
jeweiligen Pakete.

## Interpreter

Der Interpreter ist die Korrektheits-Referenz, **kein Leistungsziel** (HERD.md §6). Gemessen wird nur, dass die Anbindung dünn
bleibt: Setter gehen ohne JSON und ohne Objekt-Allokation direkt an die Exporte von `kern.wasm` (Feldnummern vorab aus dem Schema,
Austauschpuffer und Speicheransichten wiederverwendet).

`node bench/herd/setter-interpreter.js 1000 60` – 1000 Kreise, 60 Takte, je Takt jeder Setter einmal (B2 in klein); abgezogen wird
eine Leerlauf-Schleife gleicher Form (Blech-Zugriff, Rechnung), Bestwert aus 3 Läufen. Node v22.15.1, i7-13700KF, 2026-10-22:

| Aufruf | Kosten je Aufruf |
|---|---|
| `teil.setzeLage(x, y)` (Teil-Methode → `teil_lage`) | ≈ 100 ns |
| `kreis.setzeRadius(r)` (generischer Komponenten-Setter → `setze_zahl`) | ≈ 155 ns |
| zum Vergleich: `teil_lage` direkt aus JS (ohne Interpreter) | ≈ 40 ns |

Der Rest des Interpreter-Aufrufs ist Methodenauflösung, Argumentprüfung und der Küchen-Schutz (`nurHauptkueche`); der Grenzübergang
JS → Wasm selbst ist der kleinere Teil.
