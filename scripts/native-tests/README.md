# Native checks

Muse's own decoders and its bit-perfect sample path are plain Kotlin under
`modules/muse-audio-metadata/.../formats`, so they run on a computer.

- `run.sh` runs `PcmConverterTest.kt`: the exact bytes Muse sends a USB DAC
  (16-bit, float, 24 and 32-bit) and the DoP guard. It needs a JDK 17+ and
  `kotlinc` on PATH, nothing else. Run it after any change to `PcmConverter.kt`.
- `decoders/` holds the harnesses that checked each decoder bit for bit
  against ffmpeg (ALAC, APE, WavPack, AIFF, DSD, tags) and the Media3
  extractors end to end. They need test files made with ffmpeg (and, for APE,
  `ApeVectorMaker.kt`) plus ffmpeg's decoded output, which are too big for the
  repo. Each file's header says what it expects. The extractor check also needs
  `android.jar` and the Media3 1.9.1 jars on the classpath.
