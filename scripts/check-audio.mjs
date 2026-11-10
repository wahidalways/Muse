// Self-check for the player's audio badge row (src/utils/format.ts). Run: node scripts/check-audio.mjs
import assert from 'node:assert/strict';
import { formatAudioDetails, summarizeAudio } from '../src/utils/format.ts';

const file = (codec, sampleRate, bitDepth, bitrate = 1_411_000, channels = 2) => ({
  mimeType: null,
  codec,
  bitrate,
  sampleRate,
  channels,
  bitDepth,
});

// CD-quality FLAC is Lossless; beyond 16-bit or 48 kHz it is Hi-Res.
assert.equal(summarizeAudio(file('audio/flac', 44100, 16), 'a.flac').quality, 'Lossless');
assert.equal(summarizeAudio(file('audio/flac', 44100, 24), 'a.flac').quality, 'Hi-Res');
assert.equal(summarizeAudio(file('audio/flac', 96000, null), 'a.flac').quality, 'Hi-Res');
assert.equal(summarizeAudio(file('audio/flac', 48000, null), 'a.flac').quality, 'Lossless');

// Lossy formats get no quality label and never show a bit depth.
const mp3 = summarizeAudio(file('audio/mpeg', 44100, 16, 320_000), 'a.mp3');
assert.equal(mp3.quality, null);
assert.deepEqual(mp3.specs, ['44.1 kHz', '320 kbps']);

// Specs: bit depth, sample rate, bitrate; Stereo left out, Mono shown.
assert.deepEqual(summarizeAudio(file('audio/flac', 96000, 24, 4_608_000), 'a.flac').specs, ['24-bit', '96 kHz', '4,608 kbps']);
assert.deepEqual(summarizeAudio(file('audio/mpeg', 44100, null, 128_000, 1), 'a.mp3').specs, ['44.1 kHz', '128 kbps', 'Mono']);

// No details: the format falls back to the extension.
assert.deepEqual(summarizeAudio(null, 'song.ogg'), { format: 'OGG', quality: null, specs: [] });

// Song info's full line keeps Stereo.
assert.equal(formatAudioDetails(file('audio/flac', 96000, 24, 4_608_000), 'a.flac'), 'FLAC · Hi-Res · 24-bit · 96 kHz · 4,608 kbps · Stereo');

console.log('audio badge checks passed');
