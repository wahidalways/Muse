import { Text, View } from 'react-native';
import type { ArtSet } from '../settings/preferences';

/**
 * Muse art: covers drawn for songs that have none (or for every song, if
 * chosen in Settings). Each album gets the same art every time, from a hash
 * of its name. Plain views only, no SVG, so long lists stay light.
 */

export const ART_SETS: { id: ArtSet; label: string; hint: string }[] = [
  { id: 'shapes', label: 'Shapes', hint: 'One bold shape on a colour field' },
  { id: 'bauhaus', label: 'Bauhaus', hint: 'Quarter circles in primary colours' },
  { id: 'stripes', label: 'Stripes', hint: 'Retro bands of colour' },
  { id: 'orbit', label: 'Orbit', hint: 'Rings rising like a sunset' },
  { id: 'letter', label: 'Letter', hint: "The album's first letter, set large" },
];

/** Field and shape colours that sit well together, like a printed sleeve. */
const PAIRS: [string, string][] = [
  ['#2F4A6B', '#E8C872'],
  ['#C9773E', '#F3E3C3'],
  ['#3E6B5A', '#BFD8C8'],
  ['#5E3A55', '#E59AB8'],
  ['#7E8436', '#F1EFC8'],
  ['#45417E', '#A9C6F2'],
  ['#9C3F36', '#F6B26B'],
  ['#56656F', '#E9E4D8'],
  ['#2E5E63', '#F2C4A0'],
  ['#6B4A2F', '#E3D3A8'],
];
/** Four tones each, darkest first, for Stripes and Orbit. */
const PALETTES: string[][] = [
  ['#1F3B4D', '#3E7C74', '#9CC5B8', '#E8F1EE'],
  ['#481D24', '#E9724C', '#FFC857', '#FFF4D6'],
  ['#3C2A4D', '#8E5DA8', '#D7A6D9', '#F3E8F5'],
  ['#253237', '#5C6B73', '#9DB4C0', '#EAF0F6'],
  ['#2B3A1F', '#6E8B3D', '#C5D86D', '#F4F1DE'],
  ['#3D1F14', '#B5562E', '#E9A86C', '#F7E1C8'],
  ['#14213D', '#2F5DA8', '#F2B636', '#F4EEDC'],
  ['#2D1E2F', '#C1495B', '#F2A07B', '#FBE5D6'],
];
const BAUHAUS = ['#EFE7D6', '#1E1E1E', '#D8452F', '#2E5AAC', '#F2B636'];

type Shape = 'circle' | 'triangle' | 'wave' | 'ring' | 'dots' | 'bar';
const SHAPES: Shape[] = ['circle', 'triangle', 'wave', 'ring', 'dots', 'bar'];
type Corner = 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight';
const CORNERS: Corner[] = ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'];
type Cell = { background: string; color: string; kind: 'quarter' | 'half' | 'circle' | 'none'; corner: Corner };

/** What to draw. `background` also tints things that follow the art (the full player). */
export type Art =
  | { set: 'shapes'; background: string; color: string; shape: Shape }
  | { set: 'bauhaus'; background: string; cells: Cell[] }
  | { set: 'stripes'; background: string; colors: string[]; weights: number[]; vertical: boolean }
  | { set: 'orbit'; background: string; rings: string[]; radii: number[]; x: number; y: number }
  | { set: 'letter'; background: string; color: string; letter: string };

/** A small seeded random (mulberry32), so the same name always draws the same art. */
function seeded(name: string): () => number {
  let seed = 0;
  for (let index = 0; index < name.length; index += 1) {
    seed = (seed * 31 + name.charCodeAt(index)) | 0;
  }
  // Scrambled first (murmur3's finalizer): a plain string hash leaves nearby names close.
  seed ^= seed >>> 16;
  seed = Math.imul(seed, 0x85ebca6b);
  seed ^= seed >>> 13;
  seed = Math.imul(seed, 0xc2b2ae35);
  seed ^= seed >>> 16;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)];

function describe(name: string, set: ArtSet): Art {
  const random = seeded(name);
  switch (set) {
    case 'shapes': {
      const [background, color] = pick(random, PAIRS);
      return { set, background, color, shape: pick(random, SHAPES) };
    }
    case 'bauhaus': {
      const cells = [0, 1, 2, 3].map((): Cell => {
        const background = pick(random, BAUHAUS);
        const others = BAUHAUS.filter((color) => color !== background);
        return {
          background,
          color: pick(random, others),
          kind: pick(random, ['quarter', 'quarter', 'half', 'circle', 'none'] as const),
          corner: pick(random, CORNERS),
        };
      });
      return { set, background: cells[0].background, cells };
    }
    case 'stripes': {
      const palette = pick(random, PALETTES);
      const colors = random() < 0.5 ? palette : [...palette].reverse();
      return { set, background: palette[0], colors, weights: colors.map(() => 0.6 + random() * 0.8), vertical: random() < 0.3 };
    }
    case 'orbit': {
      const palette = pick(random, PALETTES);
      const [x, y] = pick(random, [[0.5, 1], [0, 1], [1, 0], [0.5, 0.5], [0.3, 0.75]] as const);
      const centred = x === 0.5 && y === 0.5;
      return { set, background: palette[0], rings: palette.slice(1), radii: centred ? [0.46, 0.31, 0.16] : [0.95, 0.64, 0.34], x, y };
    }
    case 'letter': {
      const [background, color] = pick(random, PAIRS);
      const letter = name.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? '#';
      return { set, background, color, letter };
    }
  }
}

// Lists redraw rows often; each album's art is worked out once per set.
const cache = new Map<string, Art>();
export function museArt(name: string, set: ArtSet): Art {
  const key = `${set}\u0000${name}`;
  let art = cache.get(key);
  if (!art) {
    art = describe(name, set);
    cache.set(key, art);
  }
  return art;
}

const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Draws `art` filling a square of `size`. The caller clips and rounds it. */
export function MuseArtView({ art, size: s }: { art: Art; size: number }) {
  switch (art.set) {
    case 'shapes':
      return (
        <View style={[fill, { backgroundColor: art.background }]}>
          <ShapeView shape={art.shape} size={s} color={art.color} background={art.background} />
        </View>
      );
    case 'bauhaus': {
      const cell = s / 2;
      return (
        <View style={fill}>
          {art.cells.map((part, index) => (
            // Placed, not wrapped: a rounded half width could push a quarter onto the next line.
            <View
              key={index}
              style={{ position: 'absolute', left: (index % 2) * cell, top: Math.floor(index / 2) * cell, width: cell, height: cell, backgroundColor: part.background, overflow: 'hidden' }}
            >
              {part.kind === 'quarter' ? (
                // A square with one corner rounded to its full side is a quarter circle.
                <View style={[fill, { backgroundColor: part.color, [`border${part.corner}Radius`]: cell }]} />
              ) : part.kind === 'half' ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: cell / 2,
                    backgroundColor: part.color,
                    borderTopLeftRadius: cell / 2,
                    borderTopRightRadius: cell / 2,
                  }}
                />
              ) : part.kind === 'circle' ? (
                <View
                  style={{
                    position: 'absolute',
                    left: cell * 0.18,
                    top: cell * 0.18,
                    width: cell * 0.64,
                    height: cell * 0.64,
                    borderRadius: cell * 0.32,
                    backgroundColor: part.color,
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>
      );
    }
    case 'stripes':
      return (
        <View style={[fill, { flexDirection: art.vertical ? 'row' : 'column' }]}>
          {art.colors.map((color, index) => (
            <View key={index} style={{ flex: art.weights[index], backgroundColor: color }} />
          ))}
        </View>
      );
    case 'orbit':
      return (
        <View style={[fill, { backgroundColor: art.background }]}>
          {art.rings.map((color, index) => {
            const r = art.radii[index] * s;
            return (
              <View
                key={index}
                style={{ position: 'absolute', left: art.x * s - r, top: art.y * s - r, width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: color }}
              />
            );
          })}
        </View>
      );
    case 'letter':
      return (
        <View style={[fill, { backgroundColor: art.background, alignItems: 'center', justifyContent: 'center' }]}>
          {/* Centred both ways by its own line box. No lineHeight: a squeezed line
              is placed differently by Android and the web, which pushed the letter
              down. With the natural box and no font padding, Roboto's capitals sit
              within ~1% of the true centre on both. */}
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{
              color: art.color,
              fontSize: 0.66 * s,
              fontWeight: '900',
              textAlign: 'center',
              includeFontPadding: false,
            }}
          >
            {art.letter}
          </Text>
        </View>
      );
  }
}

function ShapeView({ shape, size: s, color, background }: { shape: Shape; size: number; color: string; background: string }) {
  switch (shape) {
    case 'circle':
      return <View style={{ position: 'absolute', left: 0.27 * s, top: 0.22 * s, width: 0.46 * s, height: 0.46 * s, borderRadius: 0.23 * s, backgroundColor: color }} />;
    case 'triangle':
      // A zero-size box whose bottom border is the triangle.
      return (
        <View
          style={{
            position: 'absolute',
            left: 0.2 * s,
            top: 0.24 * s,
            width: 0,
            height: 0,
            borderLeftWidth: 0.3 * s,
            borderRightWidth: 0.3 * s,
            borderBottomWidth: 0.52 * s,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
          }}
        />
      );
    case 'wave':
      return <View style={{ position: 'absolute', left: 0, right: 0, top: 0.56 * s, height: 0.15 * s, backgroundColor: color }} />;
    case 'ring':
      return (
        <View
          style={{ position: 'absolute', left: 0.22 * s, top: 0.22 * s, width: 0.56 * s, height: 0.56 * s, borderRadius: 0.28 * s, borderWidth: 0.14 * s, borderColor: color, backgroundColor: background }}
        />
      );
    case 'dots': {
      const cell = 0.24 * s;
      const dot = 0.085 * s;
      return (
        <>
          {[0, 1, 2].flatMap((row) =>
            [0, 1, 2].map((column) => (
              <View
                key={`${row}-${column}`}
                style={{
                  position: 'absolute',
                  left: 0.14 * s + column * cell + (cell - dot) / 2,
                  top: 0.14 * s + row * cell + (cell - dot) / 2,
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  backgroundColor: color,
                }}
              />
            )),
          )}
        </>
      );
    }
    case 'bar':
      return <View style={{ position: 'absolute', left: 0.18 * s, width: 0.22 * s, top: 0, bottom: 0, backgroundColor: color }} />;
  }
}

/** A square of Muse art on its own, for previews. */
export function MuseArtTile({ name, set, size, radius }: { name: string; set: ArtSet; size: number; radius: number }) {
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
      <MuseArtView art={museArt(name, set)} size={size} />
    </View>
  );
}
