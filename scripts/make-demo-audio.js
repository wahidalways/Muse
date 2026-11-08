// Generates Muse's Expo Go test songs (WAV tones) and album covers (PNG).
// Usage: node scripts/make-demo-audio.js assets/demo
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

// --- WAV: a slow arpeggio over a soft pad, one key per song -----------------
const RATE = 22050;
const DURATIONS = [15, 15, 15, 15, 15, 24, 31, 19, 36, 28, 22, 33, 26, 21, 38];
const ROOTS = [220, 246.94, 261.63, 293.66, 329.63, 196, 207.65, 233.08, 174.61, 185, 164.81, 277.18, 311.13, 349.23, 155.56];
const CHORD = [1, 1.25, 1.5, 2]; // major triad + octave

function wav(seconds, root, seed) {
  const n = seconds * RATE;
  const data = Buffer.alloc(n * 2);
  const step = 0.25 + (seed % 4) * 0.05; // seconds per arpeggio note
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    const note = CHORD[Math.floor(t / step) % CHORD.length];
    const local = (t % step) / step;
    const pluck = Math.sin(2 * Math.PI * root * 2 * note * t) * Math.exp(-local * 4) * 0.35;
    const pad = CHORD.slice(0, 3).reduce((sum, ratio) => sum + Math.sin(2 * Math.PI * root * ratio * t), 0) * 0.08;
    const fade = Math.min(1, t / 0.5, (seconds - t) / 1.5);
    const sample = Math.max(-1, Math.min(1, (pluck + pad) * fade));
    data.writeInt16LE(Math.round(sample * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

DURATIONS.forEach((seconds, index) => {
  fs.writeFileSync(path.join(out, `demo-${index + 1}.wav`), wav(seconds, ROOTS[index], index));
});

// --- PNG: diagonal gradient with a soft sun disc ----------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}
function png(size, from, to, disc) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x += 1) {
      const g = (x + y) / (2 * size);
      let rgb = from.map((c, i) => c + (to[i] - c) * g);
      const d = Math.hypot(x - size * 0.62, y - size * 0.4) / (size * 0.22);
      if (d < 1) rgb = rgb.map((c, i) => c + (disc[i] - c) * Math.min(1, (1 - d) * 6));
      rgb.forEach((c, i) => { row[1 + x * 3 + i] = Math.round(c); });
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const COVERS = {
  'cover-test-tones': [[60, 60, 75], [150, 110, 200], [255, 200, 120]],
  'cover-golden-hour': [[240, 150, 70], [170, 60, 90], [255, 225, 150]],
  'cover-night-drive': [[30, 20, 70], [200, 40, 140], [80, 220, 255]],
  'cover-field-notes': [[90, 130, 70], [220, 200, 140], [250, 245, 220]],
  'cover-blue-rooms': [[20, 40, 90], [70, 120, 180], [200, 220, 245]],
};
for (const [name, [from, to, disc]] of Object.entries(COVERS)) {
  fs.writeFileSync(path.join(out, `${name}.png`), png(600, from, to, disc));
}

// Self-check: every file exists, WAV lengths match the durations the app lists.
DURATIONS.forEach((seconds, index) => {
  const size = fs.statSync(path.join(out, `demo-${index + 1}.wav`)).size;
  if (size !== 44 + seconds * RATE * 2) throw new Error(`demo-${index + 1}.wav has the wrong length`);
});
Object.keys(COVERS).forEach((name) => fs.statSync(path.join(out, `${name}.png`)));
console.log('ok:', fs.readdirSync(out).length, 'files');
