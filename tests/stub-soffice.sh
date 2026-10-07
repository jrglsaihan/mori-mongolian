#!/bin/bash
# Minimal soffice stand-in used to exercise Mori's DOCX conversion plumbing
# (argument passing, temp workspace, output discovery, error paths) on machines
# without LibreOffice installed. It performs no real conversion.
set -eu
outdir=""; target=""; input=""
args=("$@")
i=0
while [ $i -lt ${#args[@]} ]; do
  arg="${args[$i]}"
  case "$arg" in
    --outdir) outdir="${args[$((i+1))]:-}"; i=$((i+2)); continue;;
    --convert-to) target="${args[$((i+1))]:-}"; target="${target%%:*}"; i=$((i+2)); continue;;
    --headless|--norestore|--nolockcheck) i=$((i+1)); continue;;
    -env:*) i=$((i+1)); continue;;
    -*) i=$((i+1)); continue;;
    *) input="$arg"; i=$((i+1)); continue;;
  esac
done
if [ -z "$outdir" ] || [ -z "$input" ] || [ -z "$target" ]; then
  printf 'stub-soffice: missing arguments (outdir=%s input=%s target=%s)\n' "$outdir" "$input" "$target" >&2
  exit 2
fi
if [ ! -f "$input" ]; then
  printf 'stub-soffice: input not found: %s\n' "$input" >&2
  exit 3
fi
base="$(basename "$input")"; stem="${base%.*}"
case "$target" in
  docx) printf 'PK\003\004mori-stub-docx' > "$outdir/$stem.docx";;
  html) printf '<!doctype html><html><body><p>ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ stub round trip</p></body></html>' > "$outdir/$stem.html";;
  *) printf 'stub-soffice: unsupported target %s\n' "$target" >&2; exit 4;;
esac
exit 0
