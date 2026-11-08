// Self-check for src/equalizer/sound.ts. Run: node scripts/check-eq.mjs
import assert from 'node:assert/strict';
import { BANDS, DEFAULT_SOUND, PRESETS, buildEffects, parseSound, withPreset } from '../src/equalizer/sound.ts';

// Every preset has a gain per band.
for (const preset of PRESETS) assert.equal(preset.gains.length, BANDS.length, preset.name);

// Flat is flat, and off stays off.
const flat = buildEffects(DEFAULT_SOUND, false);
assert.equal(flat.enabled, false);
assert.ok(flat.gains.every((gain) => gain === 0));

// Cutoffs rise, one per band, and each band's centre sits inside its range.
assert.equal(flat.cutoffs.length, BANDS.length);
flat.cutoffs.forEach((cutoff, index) => {
  assert.ok(BANDS[index] <= cutoff, `band ${BANDS[index]} below its cutoff`);
  if (index > 0) assert.ok(cutoff > flat.cutoffs[index - 1]);
});

// Boosts never push past 0 dB (no clipping), and the shape is kept.
const rock = buildEffects(withPreset(DEFAULT_SOUND, PRESETS.find((p) => p.name === 'Rock')), true);
assert.equal(Math.max(...rock.gains), 0);
assert.equal(rock.gains[0] - rock.gains[4], 6);

// Bass boost lifts the low end only, and still never clips.
const boosted = buildEffects({ ...DEFAULT_SOUND, bassBoost: 6 }, true);
assert.equal(Math.max(...boosted.gains), 0);
assert.equal(boosted.gains[0] - boosted.gains[9], 6);
assert.equal(boosted.gains[5], boosted.gains[9]);

// The older equalizer's saves keep their 10-band gains; junk is clamped or dropped.
const old = parseSound({ eqType: 'graphic10', graphic10: [3, 99, -99], presetName: 'Rock', loudness: 5 });
assert.deepEqual(old.gains.slice(0, 4), [3, 12, -12, 0]);
assert.equal(old.bassBoost, 0);
assert.equal(old.presetName, 'Rock');
assert.equal(parseSound(null), null);

console.log('eq ok');
