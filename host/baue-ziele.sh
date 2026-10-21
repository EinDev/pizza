#!/bin/sh
# Baut vorgefertigte pizza-host-Binaries für den EXE-Download im Browser (site/js/exe.js).
#
#   sh host/baue-ziele.sh <ausgabeverzeichnis>     (Standard: $AUSGABE_DIR, sonst host/ziele)
#
# Läuft unter Linux (Docker-Stage "exe", siehe Dockerfile). Benötigt: cargo/rustup,
#   windows-x64  → Ziel x86_64-pc-windows-gnu      + gcc-mingw-w64-x86-64
#   linux-x64    → Ziel x86_64-unknown-linux-musl  + musl-tools (statisch gelinkt)
#   linux-arm64  → Ziel aarch64-unknown-linux-musl (optional, gelinkt mit rust-lld; fehlt das Ziel und
#                  lässt es sich nicht per rustup nachinstallieren, wird es übersprungen)
# Auswahl über PIZZA_ZIELE (Standard: "windows-x64 linux-x64 linux-arm64").
# macOS wird nicht gebaut: ohne Apple-SDK/Codesignatur nicht sinnvoll (siehe host/README.md).
#
# Ausgabe (direkt in <ausgabeverzeichnis>):
#   pizza-host-<ziel>-<sha12>[.exe]   (Dateiname enthält Inhalts-Hash → nginx darf "immutable" cachen)
#   ziele.json                         { version, format, trailer, ziele: [{ id, name, datei, endung, groesse, sha256 }] }
set -eu

HIER=$(cd "$(dirname "$0")" && pwd)
AUS=${1:-${AUSGABE_DIR:-$HIER/ziele}}
ZIELE=${PIZZA_ZIELE:-"windows-x64 linux-x64 linux-arm64"}
ZIELDIR=${CARGO_TARGET_DIR:-$HIER/target}
STRIKT=${STRICT_BUILD:-0}

mkdir -p "$AUS"
AUS=$(cd "$AUS" && pwd)
VERSION=$(sed -n 's/^version *= *"\(.*\)"/\1/p' "$HIER/Cargo.toml" | head -n 1)

triple() {
  case "$1" in
    windows-x64) echo x86_64-pc-windows-gnu ;;
    linux-x64) echo x86_64-unknown-linux-musl ;;
    linux-arm64) echo aarch64-unknown-linux-musl ;;
    *) return 1 ;;
  esac
}
anzeigename() {
  case "$1" in
    windows-x64) echo "Windows (x64)" ;;
    linux-x64) echo "Linux (x64, statisch)" ;;
    linux-arm64) echo "Linux (ARM64, statisch)" ;;
  esac
}
endung() { case "$1" in windows-*) echo ".exe" ;; *) echo "" ;; esac; }

hat_ziel() { rustup target list --installed 2>/dev/null | grep -qx "$1"; }

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
  echo ">> Baue $z ($t) …"
  case "$t" in
    x86_64-pc-windows-gnu)
      CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=${CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER:-x86_64-w64-mingw32-gcc} \
        cargo build --release --locked --manifest-path "$HIER/Cargo.toml" --target "$t" --bin pizza-host ;;
    aarch64-unknown-linux-musl)
      if ! CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=${CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER:-rust-lld} \
        cargo build --release --locked --manifest-path "$HIER/Cargo.toml" --target "$t" --bin pizza-host; then
        if [ "$STRIKT" != "1" ]; then echo ">> WARNUNG: $z fehlgeschlagen – übersprungen."; continue; fi
        exit 1
      fi ;;
    *)
      cargo build --release --locked --manifest-path "$HIER/Cargo.toml" --target "$t" --bin pizza-host ;;
  esac
  e=$(endung "$z")
  quelle="$ZIELDIR/$t/release/pizza-host$e"
  [ -f "$quelle" ] || { echo ">> FEHLER: $quelle fehlt" >&2; exit 1; }
  sha=$(sha256sum "$quelle" | cut -d' ' -f1)
  kurz=$(printf '%s' "$sha" | cut -c1-12)
  datei="pizza-host-$z-$kurz$e"
  rm -f "$AUS"/pizza-host-"$z"-*
  cp "$quelle" "$AUS/$datei"
  chmod 755 "$AUS/$datei"
  groesse=$(wc -c < "$AUS/$datei" | tr -d ' ')
  eintrag=$(printf '    { "id": "%s", "name": "%s", "triple": "%s", "datei": "%s", "endung": "%s", "groesse": %s, "sha256": "%s" }' \
    "$z" "$(anzeigename "$z")" "$t" "$datei" "$e" "$groesse" "$sha")
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
