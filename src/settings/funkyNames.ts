/**
 * "Surprise me" on the onboarding name field: a music-flavoured two-word
 * profile name such as "Velvet Bassline". Every pair fits NAME_LIMIT (24).
 */
const ADJECTIVES = [
  'Velvet', 'Midnight', 'Groovy', 'Neon', 'Cosmic', 'Golden', 'Funky', 'Electric', 'Mellow', 'Silver',
  'Disco', 'Lo-fi', 'Smooth', 'Sunset', 'Retro', 'Jazzy', 'Stereo', 'Analog', 'Moonlit', 'Bouncy',
];
const NOUNS = [
  'Bassline', 'Mixtape', 'Falsetto', 'Groove', 'Riff', 'Encore', 'Vinyl', 'Tempo', 'Chorus', 'Synth',
  'Backbeat', 'Melody', 'Rhythm', 'Remix', 'Cassette', 'Echo', 'Harmony', 'Drumroll', 'Jukebox', 'Crescendo',
];

const pick = <T,>(list: T[], random: () => number) => list[Math.floor(random() * list.length) % list.length];

/** A new funky name, never the same as `previous`, so every tap changes it. */
export function funkyName(previous = '', random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const name = `${pick(ADJECTIVES, random)} ${pick(NOUNS, random)}`;
    if (name !== previous) {
      return name;
    }
  }
  return previous === 'Velvet Bassline' ? 'Groovy Encore' : 'Velvet Bassline';
}

export const FUNKY_WORDS = { ADJECTIVES, NOUNS };
