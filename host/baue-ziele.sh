#!/bin/sh
# Baut vorgefertigte pizza-host-Binaries für den EXE-Download im Browser (site/js/exe.js).
#
#   sh host/baue-ziele.sh <ausgabeverzeichnis>     (Standard: $AUSGABE_DIR, sonst host/ziele)
#
# Läuft unter Linux (Docker-Stage "exe", siehe Dockerfile). Ziele (Auswahl über PIZZA_ZIELE):
#   windows-x64      x86_64-pc-windows-msvc     xwin + rust-lld  mit Theke-Fenster (WebView2), CRT statisch, keine Zusatz-DLL
#   linux-x64        x86_64-unknown-linux-musl  musl-tools       statisch, ohne Theke (W0100)
#   linux-x64-theke  x86_64-unknown-linux-gnu   gcc + webkit2gtk mit Theke-Fenster (glibc, braucht WebKitGTK 4.1)
#   linux-arm64      aarch64-unknown-linux-musl rust-lld         statisch, ohne Theke (optional)
# Theke-Builds brauchen site/js/theke/ (wird per build.rs eingebettet). Scheitert ein Theke-Build, wird
# linux-x64-theke übersprungen (außer STRICT_BUILD=1); windows-x64 muss gelingen.
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
ZIELE=${PIZZA_ZIELE:-"windows-x64 linux-x64 linux-x64-theke linux-arm64"}
ZIELDIR=${CARGO_TARGET_DIR:-$HIER/target}
STRIKT=${STRICT_BUILD:-0}

mkdir -p "$AUS"
AUS=$(cd "$AUS" && pwd)
# CR entfernen: unter Windows ausgecheckt hat Cargo.toml CRLF (sonst landet \r in ziele.json → ungültiges JSON).
VERSION=$(tr -d '\r' < "$HIER/Cargo.toml" | sed -n 's/^version *= *"\(.*\)"/\1/p' | head -n 1)

triple() {
  case "$1" in
    windows-x64) echo x86_64-pc-windows-msvc ;;
    linux-x64) echo x86_64-unknown-linux-musl ;;
    linux-x64-theke) echo x86_64-unknown-linux-gnu ;;
    linux-arm64) echo aarch64-unknown-linux-musl ;;
    *) return 1 ;;
  esac
}
anzeigename() {
  case "$1" in
    windows-x64) echo "Windows (x64)" ;;
    linux-x64) echo "Linux (x64, statisch, ohne Fenster)" ;;
    linux-x64-theke) echo "Linux (x64, mit Theke-Fenster)" ;;
    linux-arm64) echo "Linux (ARM64, statisch, ohne Fenster)" ;;
  esac
}
voraussetzung() {
  case "$1:$2" in
    windows-x64:1) echo "Windows 10/11 (x64). Theke-Fenster über die Microsoft-Edge-WebView2-Runtime (ab Windows 10/11 meist vorinstalliert)." ;;
    windows-x64:0) echo "Windows 10/11 (x64). Ohne Theke-Fenster (W0100)." ;;
    linux-x64:*) echo "Linux x64, keine Abhängigkeiten (statisch). Kein Theke-Fenster (W0100)." ;;
    linux-x64-theke:*) echo "Linux x64 mit glibc ab 2.34 (z. B. Ubuntu 22.04+, Debian 12+, Fedora 36+) und WebKitGTK 4.1 (Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-0, Fedora: sudo dnf install webkit2gtk4.1). Ohne WebKitGTK startet das Programm nicht." ;;
    linux-arm64:*) echo "Linux ARM64 (z. B. Raspberry Pi 4/5, 64 Bit), keine Abhängigkeiten (statisch). Kein Theke-Fenster (W0100)." ;;
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

# cargo build für ein Ziel; $3 = 1 → mit Theke (Standard-Features), sonst --no-default-features.
baue() {
  z=$1; t=$2; mit=$3
  set -- build --release --locked --manifest-path "$HIER/Cargo.toml" --target "$t" --bin pizza-host
  [ "$mit" = "1" ] || set -- "$@" --no-default-features
  case "$t" in
    x86_64-pc-windows-msvc)
      x=$(xwin_splat) || return 1
      CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=rust-lld       CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS="-C target-feature=+crt-static -Lnative=$x/crt/lib/x86_64 -Lnative=$x/sdk/lib/um/x86_64 -Lnative=$x/sdk/lib/ucrt/x86_64"         cargo "$@" ;;
    aarch64-unknown-linux-musl)
      CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=${CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER:-rust-lld} cargo "$@" ;;
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
      if [ "$z" = "linux-arm64" ] && [ "$STRIKT" != "1" ]; then
        echo ">> WARNUNG: $t nicht verfügbar – $z wird übersprungen."
        continue
      fi
      echo ">> FEHLER: Ziel $t nicht verfügbar." >&2
      exit 1
    fi
  fi
  case "$z" in windows-x64|linux-x64-theke) theke=1 ;; *) theke=0 ;; esac
  echo ">> Baue $z ($t, Theke: $theke) …"
  if ! baue "$z" "$t" "$theke"; then
    if [ "$STRIKT" = "1" ]; then echo ">> FEHLER: $z fehlgeschlagen" >&2; exit 1; fi
    case "$z" in
      linux-x64-theke|linux-arm64)
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
  if [ "$theke" = "1" ]; then theke_json=true; else theke_json=false; fi
  eintrag=$(printf '    { "id": "%s", "name": "%s", "triple": "%s", "datei": "%s", "endung": "%s", "groesse": %s, "sha256": "%s", "theke": %s, "voraussetzung": "%s" }' \
    "$z" "$(anzeigename "$z")" "$t" "$datei" "$e" "$groesse" "$sha" "$theke_json" "$(voraussetzung "$z" "$theke")")
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
