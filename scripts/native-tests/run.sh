#!/bin/bash
# Runs Muse's native checks that need no phone. Needs a JDK (17+) and kotlinc on PATH.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
FORMATS="$HERE/../../modules/muse-audio-metadata/android/src/main/java/expo/modules/musemetadata/formats"
OUT="$(mktemp -d)"
kotlinc "$FORMATS/PcmConverter.kt" "$HERE/PcmConverterTest.kt" -include-runtime -d "$OUT/pcm.jar" 2>&1 | grep -v "^warning" || true
[ -f "$OUT/pcm.jar" ] || { echo "compile failed"; exit 1; }
java -jar "$OUT/pcm.jar"
