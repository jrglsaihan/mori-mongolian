#!/bin/bash
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$NATIVE_DIR")"
OUTPUTS_DIR="$(dirname "$PROJECT_DIR")/outputs"
APP_PATH="$OUTPUTS_DIR/Mori.app"

if [[ ! -f "$PROJECT_DIR/web/index.html" ]]; then
    printf '%s\n' 'Build skipped: web/index.html does not exist. Build the web UI first.' >&2
    exit 1
fi
if [[ ! -d "$OUTPUTS_DIR" ]]; then
    printf '%s\n' "Missing output directory: $OUTPUTS_DIR" >&2
    exit 1
fi

SDK="$(/usr/bin/xcrun --sdk macosx --show-sdk-path)"
STAGE="$(/usr/bin/mktemp -d "$OUTPUTS_DIR/.mori-build.XXXXXX")"
trap '/bin/rm -rf "$STAGE"' EXIT

/usr/bin/plutil -lint "$NATIVE_DIR/Info.plist"
for ARCH in arm64 x86_64; do
    /usr/bin/xcrun swiftc \
        -swift-version 5 -parse-as-library -O \
        -sdk "$SDK" \
        -target "$ARCH-apple-macosx13.0" \
        -framework AppKit -framework WebKit -framework CoreText -framework UniformTypeIdentifiers \
        "$NATIVE_DIR/Main.swift" \
        -o "$STAGE/Mori-$ARCH"
done

STAGED_APP="$STAGE/Mori.app"
/bin/mkdir -p "$STAGED_APP/Contents/MacOS" "$STAGED_APP/Contents/Resources"
/usr/bin/lipo -create "$STAGE/Mori-arm64" "$STAGE/Mori-x86_64" -output "$STAGED_APP/Contents/MacOS/Mori"
ARCHS="$(/usr/bin/lipo -archs "$STAGED_APP/Contents/MacOS/Mori")"
[[ "$ARCHS" == *arm64* && "$ARCHS" == *x86_64* ]]
/usr/bin/ditto "$NATIVE_DIR/Info.plist" "$STAGED_APP/Contents/Info.plist"
/usr/bin/ditto "$PROJECT_DIR/web" "$STAGED_APP/Contents/Resources/web"
/bin/chmod 755 "$STAGED_APP/Contents/MacOS/Mori"
/usr/bin/codesign --force --sign - "$STAGED_APP"
/usr/bin/codesign --verify --strict "$STAGED_APP"

# Keep the previous bundle until the replacement has compiled and passed signing checks.
if [[ -e "$APP_PATH" ]]; then
    /bin/mv "$APP_PATH" "$STAGE/Previous-Mori.app"
fi
if ! /bin/mv "$STAGED_APP" "$APP_PATH"; then
    if [[ -e "$STAGE/Previous-Mori.app" ]]; then
        /bin/mv "$STAGE/Previous-Mori.app" "$APP_PATH"
    fi
    exit 1
fi
printf '%s\n' "Built universal macOS 13+ application: $APP_PATH"
/usr/bin/lipo -info "$APP_PATH/Contents/MacOS/Mori"
