#!/bin/sh
# Baut vorgefertigte pizza-host-Binaries für den EXE-Download im Browser (site/js/exe.js).
#
#   sh host/baue-ziele.sh <ausgabeverzeichnis>     (Standard: $AUSGABE_DIR, sonst host/ziele)
#
# Läuft unter Linux (Docker-Stage "exe", siehe Dockerfile). Ziele (Auswahl über PIZZA_ZIELE):
#   windows-x64  x86_64-pc-windows-msvc    xwin + rust-lld   mit Theke-Fenster (WebView2), CRT statisch, keine Zusatz-DLL
#   linux-x64    x86_64-unknown-linux-gnu  gcc + webkit2gtk  mit Theke-Fenster (glibc ≥ 2.34, braucht WebKitGTK 4.1)
# Nur Varianten mit Theke-Fenster (Browser und nativ verhalten sich gleich); ohne Fenster wird nichts angeboten.
# Beide Builds brauchen site/js/theke/ (wird per build.rs eingebettet). Scheitert linux-x64, wird es übersprungen
# (außer STRICT_BUILD=1); windows-x64 muss gelingen.
# Windows-SDK/MSVC-CRT: `xwin --accept-license splat` nach $XWIN_DIR/splat (einmalig, danach Cache; Lizenz vom
# Nutzer freigegeben). Die Download-Rohdaten werden nach dem Entpacken gelöscht.
# macOS wird nicht gebaut: ohne Apple-SDK/Codesignatur nicht sinnvoll (siehe host/README.md).
#
# Ausgabe (direkt in <ausgabeverzeichnis>):
#   pizza-host-<ziel>-<sha12>[.exe]   (Dateiname enthält Inhalts-Hash → nginx darf "immutable" cachen)
#   ziele.json  { version, format, trailer, ziele: [{ id, name, triple, datei, endung, groesse, sha256, theke, voraussetzung }] }
set -eu

HIER=$(cd "$(dirname "$0")" && pwd)
AUS=${1:-${AUSGABE_DIR:-$HIER/ziele}}
ZIELE=${PIZZA_ZIELE:-"windows-x64 linux-x64"}
ZIELDIR=${CARGO_TARGET_DIR:-$HIER/target}
STRIKT=${STRICT_BUILD:-0}

mkdir -p "$AUS"
AUS=$(cd "$AUS" && pwd)
# CR entfernen: unter Windows ausgecheckt hat Cargo.toml CRLF (sonst landet \r in ziele.json → ungültiges JSON).
VERSION=$(tr -d '\r' < "$HIER/Cargo.toml" | sed -n 's/^version *= *"\(.*\)"/\1/p' | head -n 1)

triple() {
  case "$1" in
    windows-x64) echo x86_64-pc-windows-msvc ;;
    linux-x64) echo x86_64-unknown-linux-gnu ;;
    *) return 1 ;;
  esac
}
anzeigename() {
  case "$1" in
    windows-x64) echo "Windows (x64)" ;;
    linux-x64) echo "Linux (x64)" ;;
  esac
}
voraussetzung() {
  case "$1" in
    windows-x64) echo "Windows 10/11 (x64). Theke-Fenster über die Microsoft-Edge-WebView2-Runtime (ab Windows 10/11 meist vorinstalliert)." ;;
    linux-x64) echo "Linux x64 mit glibc ab 2.34 (z. B. Ubuntu 22.04+, Debian 12+, Fedora 36+) und WebKitGTK 4.1 (Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-0, Fedora: sudo dnf install webkit2gtk4.1). Ohne WebKitGTK startet das Programm nicht." ;;
  esac
}
endung() { case "$1" in windows-*) echo ".exe" ;; *) echo "" ;; esac; }
hat_ziel() { rustup target list --installed 2>/dev/null | grep -qx "$1"; }

# MSVC-CRT + Windows-SDK für das msvc-Ziel bereitstellen (gibt das splat-Verzeichnis aus).
xwin_splat() {
  basis=${XWIN_DIR:-$HIER/target/xwin}
  if [ ! -f "$basis/splat/.fertig" ]; then
    command -v xwin >/dev/null 2>&1 || { echo ">> FEHLER: xwin fehlt (cargo install --locked xwin)" >&2; return 1; }
    echo ">> xwin: lade MSVC-CRT + Windows-SDK …" >&2
    rm -rf "$basis/splat"
    xwin --accept-license --cache-dir "$basis/dl" splat --output "$basis/splat" >&2 || return 1
    rm -rf "$basis/dl"
    touch "$basis/splat/.fertig"
  fi
  echo "$basis/splat"
}

# cargo build für ein Ziel (immer mit Theke-Fenster = Standard-Features).
baue() {
  z=$1; t=$2
  set -- build --release --locked --manifest-path "$HIER/Cargo.toml" --target "$t" --bin pizza-host
  case "$t" in
    x86_64-pc-windows-msvc)
      x=$(xwin_splat) || return 1
      CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=rust-lld       CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS="-C target-feature=+crt-static -Lnative=$x/crt/lib/x86_64 -Lnative=$x/sdk/lib/um/x86_64 -Lnative=$x/sdk/lib/ucrt/x86_64"         cargo "$@" ;;
    *) cargo "$@" ;;
  esac
}

eintraege=""
gebaut=0
for z in $ZIELE; do
  t=$(triple "$z") || { echo ">> Unbekanntes Ziel: $z" >&2; exit 2; }
  if ! hat_ziel "$t"; then
    echo ">> Ziel $t fehlt – versuche rustup target add …"
    if ! rustup target add "$t" >/dev/null 2>&1; then
      echo ">> FEHLER: Ziel $t nicht verfügbar." >&2
      exit 1
    fi
  fi
  echo ">> Baue $z ($t) …"
  if ! baue "$z" "$t"; then
    if [ "$STRIKT" = "1" ]; then echo ">> FEHLER: $z fehlgeschlagen" >&2; exit 1; fi
    case "$z" in
      linux-x64)
        echo ">> WARNUNG: $z fehlgeschlagen – übersprungen."
        continue ;;
      *) exit 1 ;;
    esac
  fi
  e=$(endung "$z")
  quelle="$ZIELDIR/$t/release/pizza-host$e"
  [ -f "$quelle" ] || { echo ">> FEHLER: $quelle fehlt" >&2; exit 1; }
  sha=$(sha256sum "$quelle" | cut -d' ' -f1)
  kurz=$(printf '%s' "$sha" | cut -c1-12)
  datei="pizza-host-$z-$kurz$e"
  rm -f "$AUS"/pizza-host-"$z"-[0-9a-f]*
  cp "$quelle" "$AUS/$datei"
  chmod 755 "$AUS/$datei"
  groesse=$(wc -c < "$AUS/$datei" | tr -d ' ')
  eintrag=$(printf '    { "id": "%s", "name": "%s", "triple": "%s", "datei": "%s", "endung": "%s", "groesse": %s, "sha256": "%s", "theke": true, "voraussetzung": "%s" }' \
    "$z" "$(anzeigename "$z")" "$t" "$datei" "$e" "$groesse" "$sha" "$(voraussetzung "$z")")
  if [ -z "$eintraege" ]; then eintraege="$eintrag"; else eintraege="$eintraege,
$eintrag"; fi
  gebaut=$((gebaut + 1))
  echo ">> $datei ($groesse Bytes)"
done

[ "$gebaut" -gt 0 ] || { echo ">> FEHLER: kein Ziel gebaut" >&2; exit 1; }

cat > "$AUS/ziele.json" <<EOF
{
  "version": "$VERSION",
  "format": "pkarton/1",
  "trailer": "PKARTON1",
  "ziele": [
$eintraege
  ]
}
EOF
echo ">> $AUS/ziele.json ($gebaut Ziele)"
