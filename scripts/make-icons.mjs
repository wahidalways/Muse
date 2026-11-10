// Draws Muse's app icons from the brand mark in src/components/Brand.tsx
// (BAR_HEIGHTS, bar width 3.5 and gap 3 at size 22). Flat lime bars on the
// icon green-black: no glow, no gradient. Rerun after changing the mark:
//   node scripts/make-icons.mjs
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const HEIGHTS = [8, 13, 18, 11];
const BAR = 3.5;
const GAP = 3;
const LIME = [0xc4, 0xf0, 0x78];
const WHITE = [0xff, 0xff, 0xff];
/** Keep in step with android.adaptiveIcon.backgroundColor in app.json. */
const GROUND = [0x14, 0x17, 0x12];

const markWidth = HEIGHTS.length * BAR + (HEIGHTS.length - 1) * GAP;
const markHeight = Math.max(...HEIGHTS);
// The bars stand on one baseline, as in the app.
const bars = HEIGHTS.map((height, index) => ({ x: index * (BAR + GAP) + BAR / 2, top: markHeight - height, bottom: markHeight }));

// Optical centre: bars on a baseline carry their weight low and to the right
// (the tallest is third), so centring the box looks off. The point put at the
// canvas centre sits halfway between the box's centre and the bars' centre of mass.
const area = HEIGHTS.reduce((sum, height) => sum + height, 0);
const massX = bars.reduce((sum, bar, index) => sum + bar.x * HEIGHTS[index], 0) / area;
const massY = bars.reduce((sum, bar, index) => sum + ((bar.top + bar.bottom) / 2) * HEIGHTS[index], 0) / area;
const originX = (markWidth / 2 + massX) / 2;
const originY = (markHeight / 2 + massY) / 2;

/** How much of the pixel centred at (px, py) the bars cover, 0 to 1, on a `size` canvas where the mark is `share` of the width. */
function coverage(px, py, size, share) {
  const unit = (size * share) / markWidth;
  const x = (px - size / 2) / unit + originX;
  const y = (py - size / 2) / unit + originY;
  const radius = BAR / 2;
  let best = 0;
  for (const bar of bars) {
    // Distance to a vertical capsule, in pixels; half a pixel of ramp is the anti-aliasing.
    const nearestY = Math.min(Math.max(y, bar.top + radius), bar.bottom - radius);
    const distance = (Math.hypot(x - bar.x, y - nearestY) - radius) * unit;
    best = Math.max(best, Math.min(1, Math.max(0, 0.5 - distance)));
  }
  return best;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * One square icon. With `ground` it is opaque RGB (store icons may not carry
 * alpha); without, RGBA on transparent. `safeRadius` (a share of the size)
 * asserts that every inked pixel sits inside the launcher's mask safe zone.
 */
function drawIcon(file, { size, share, ink, ground = null, safeRadius = null }) {
  const channels = ground ? 3 : 4;
  const raw = Buffer.alloc(size * (size * channels + 1));
  let offset = 0;
  for (let py = 0; py < size; py++) {
    raw[offset++] = 0; // no row filter
    for (let px = 0; px < size; px++) {
      const cover = coverage(px + 0.5, py + 0.5, size, share);
      if (cover > 0 && safeRadius !== null) {
        const fromCentre = Math.hypot(px + 0.5 - size / 2, py + 0.5 - size / 2);
        if (fromCentre > safeRadius * size) {
          throw new Error(`${file}: the mark leaves the safe zone at ${px},${py}`);
        }
      }
      for (let c = 0; c < 3; c++) {
        raw[offset++] = ground ? Math.round(ground[c] + (ink[c] - ground[c]) * cover) : ink[c];
      }
      if (!ground) {
        raw[offset++] = Math.round(cover * 255);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = ground ? 2 : 6; // RGB or RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(new URL(`../assets/${file}`, import.meta.url), png);
  console.log(`${file} ${size}px, ${(png.length / 1024).toFixed(1)} KB`);
}

// Android adaptive icons: a 108dp canvas, masked to a shape by the launcher;
// only the central 66dp circle is sure to show.
const ADAPTIVE_SAFE = 33 / 108;
drawIcon('android-icon-foreground.png', { size: 1024, share: 0.4, ink: LIME, safeRadius: ADAPTIVE_SAFE });
drawIcon('android-icon-monochrome.png', { size: 1024, share: 0.4, ink: WHITE, safeRadius: ADAPTIVE_SAFE });
// Full-bleed square (iOS, and anywhere without adaptive icons).
drawIcon('icon.png', { size: 1024, share: 0.5, ink: LIME, ground: GROUND });
drawIcon('favicon.png', { size: 48, share: 0.6, ink: LIME, ground: GROUND });
