import { useContext, type ComponentProps } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemeContext } from '../theme/theme';
import { useAppStyles } from '../theme/styles';

type IconTone = 'text' | 'muted' | 'accent';

/** Theme colors for icons, matching the text and accent colors. */
function useIconColor(tone: IconTone): string {
  const { theme, accent } = useContext(ThemeContext);
  if (tone === 'accent') {
    return theme === 'light'
      ? {
          lime: '#4F7A12',
          muse: '#4A7323',
          ocean: '#17678F',
          sunset: '#9B5B12',
          rose: '#B0275B',
          coral: '#A64643',
          teal: '#28766E',
          red: '#C3121C',
        }[accent]
      : {
          lime: '#C4F27A',
          muse: '#B9E77B',
          ocean: '#8BD7FF',
          sunset: '#FFD18A',
          rose: '#FF8FB8',
          coral: '#FFB0A8',
          teal: '#8DE1D5',
          red: '#FF4D4D',
        }[accent];
  }
  if (tone === 'muted') {
    return theme === 'light' ? '#767D6E' : '#AEAEB2';
  }
  return theme === 'light' ? '#202719' : '#F5F5F7';
}

export type ControlIconName =
  | 'close'
  | 'chevron-up'
  | 'chevron-down'
  | 'timer'
  | 'shuffle'
  | 'repeat'
  | 'sort-up'
  | 'sort-down'
  | 'check'
  | 'heart'
  | 'heart-outline'
  | 'star'
  | 'star-outline'
  | 'more'
  | 'plus'
  | 'playlist'
  | 'playlist-add'
  | 'album'
  | 'artist'
  | 'album-artist'
  | 'genre'
  | 'year'
  | 'most-played'
  | 'low-rated'
  | 'recently-added'
  | 'recently-played'
  | 'longest'
  | 'image'
  | 'edit'
  | 'delete'
  | 'chevron-right'
  | 'back'
  | 'note'
  | 'play'
  | 'search'
  | 'equalizer'
  | 'folder'
  | 'drag'
  | 'info'
  | 'lyrics'
  | 'play-next'
  | 'queue-add'
  | 'queue'
  | 'moon'
  | 'skin'
  | 'hide'
  | 'pin';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Ionicons are not drawn to one optical size the way SF Symbols are: home
 * fills its box, close leaves a margin. Each factor brings a glyph's ink
 * footprint (sqrt of width x height, measured from the font file) back to
 * the size the app was tuned for. Play and pause share a height, as on iOS.
 */
const OPTICAL_SCALE: Partial<Record<IoniconName, number>> = {
  add: 0.95,
  'add-circle-outline': 0.85,
  albums: 1.05,
  'albums-outline': 1.05,
  'calendar-outline': 0.9,
  'chevron-down': 0.8,
  'chevron-forward': 0.8,
  'chevron-up': 0.8,
  close: 1.1,
  'ellipsis-horizontal': 0.85,
  'flame-outline': 0.9,
  'hourglass-outline': 0.85,
  'image-outline': 0.95,
  'logo-github': 0.95,
  'mic-outline': 1.1,
  'open-outline': 0.9,
  pause: 0.85,
  'pencil-outline': 0.9,
  play: 0.8,
  'play-back': 0.75,
  'play-forward': 0.75,
  'pricetag-outline': 0.95,
  'reorder-three-outline': 0.85,
  repeat: 1.15,
  search: 0.9,
  settings: 0.95,
  'stats-chart': 0.85,
  'stats-chart-outline': 0.85,
  'settings-outline': 0.95,
  shuffle: 1.1,
  'sparkles-outline': 0.75,
  star: 0.9,
  'star-outline': 0.9,
  'trash-outline': 0.85,
};

/** Font size that draws `name` at the optical size `size` stands for. */
export function opticalSize(name: IoniconName, size: number): number {
  return Math.round(size * (OPTICAL_SCALE[name] ?? 1));
}

/**
 * The play triangle's box is centred, but its weight sits 8% of the size to
 * the left (measured from the font), so it looks off-centre in a round
 * button. Moving it most of the way back centres it to the eye, as iOS does.
 */
function opticalOffset(name: IoniconName, fontSize: number) {
  return name === 'play' ? { transform: [{ translateX: fontSize * 0.05 }] } : undefined;
}

/** iOS-style glyphs (Ionicons), the closest match to SF Symbols. */
const CONTROL_GLYPHS: Record<
  ControlIconName,
  IoniconName
> = {
  close: 'close',
  'chevron-up': 'chevron-up',
  'chevron-down': 'chevron-down',
  timer: 'timer-outline',
  shuffle: 'shuffle',
  repeat: 'repeat',
  'sort-up': 'arrow-up',
  'sort-down': 'arrow-down',
  check: 'checkmark',
  heart: 'heart',
  'heart-outline': 'heart-outline',
  star: 'star',
  'star-outline': 'star-outline',
  more: 'ellipsis-horizontal',
  plus: 'add',
  playlist: 'list',
  'playlist-add': 'add-circle-outline',
  album: 'disc-outline',
  artist: 'mic-outline',
  'album-artist': 'people-outline',
  genre: 'pricetag-outline',
  year: 'calendar-outline',
  'most-played': 'flame-outline',
  'low-rated': 'star-half-outline',
  'recently-added': 'sparkles-outline',
  'recently-played': 'time-outline',
  longest: 'hourglass-outline',
  image: 'image-outline',
  edit: 'pencil-outline',
  delete: 'trash-outline',
  'chevron-right': 'chevron-forward',
  back: 'chevron-back',
  note: 'musical-notes-outline',
  play: 'play',
  search: 'search',
  equalizer: 'options-outline',
  folder: 'folder-outline',
  drag: 'reorder-three-outline',
  info: 'information-circle-outline',
  hide: 'eye-off-outline',
  pin: 'pin-outline',
  lyrics: 'document-text-outline',
  'play-next': 'return-down-forward-outline',
  'queue-add': 'add-outline',
  queue: 'list-outline',
  moon: 'moon-outline',
  skin: 'phone-portrait-outline',
};

/**
 * Vector icons from one set, so every control has the same weight and shape
 * on every phone. (These used to be drawn from views and text characters,
 * which looked different from font to font.)
 */
export function ControlIcon({
  name,
  size = 20,
  tone = 'text',
  showOne = false,
  color: fixedColor,
}: {
  name: ControlIconName;
  size?: number;
  tone?: IconTone;
  /** For repeat: show the repeat-one icon. */
  showOne?: boolean;
  /** Overrides the tone, for icons over a picture (white on a cover). */
  color?: string;
}) {
  const toneColor = useIconColor(tone);
  const color = fixedColor ?? toneColor;
  const iconSize = opticalSize(CONTROL_GLYPHS[name], size * 1.25);
  const icon = (
    <Ionicons
      accessible={false}
      name={CONTROL_GLYPHS[name]}
      size={iconSize}
      color={color}
      style={opticalOffset(CONTROL_GLYPHS[name], iconSize)}
    />
  );
  if (name !== 'repeat' || !showOne) {
    return icon;
  }
  // Ionicons has no repeat-one glyph, so the "1" sits in the loop, as on iOS.
  return (
    <View>
      {icon}
      <Text
        accessible={false}
        allowFontScaling={false}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          textAlign: 'center',
          textAlignVertical: 'center',
          lineHeight: iconSize,
          fontSize: Math.round(iconSize * 0.36),
          fontWeight: '800',
          color,
        }}
      >
        1
      </Text>
    </View>
  );
}

export function CloseIcon({
  color = 'muted',
  size = 14,
}: {
  color?: 'text' | 'muted' | 'accent';
  size?: number;
}) {
  return <ControlIcon name="close" size={size} tone={color} />;
}

export function CheckIcon() {
  return <ControlIcon name="check" size={15} tone="accent" />;
}

const PLAYBACK_GLYPHS = {
  play: 'play',
  pause: 'pause',
  previous: 'play-back',
  next: 'play-forward',
} as const;

export function PlaybackGlyph({
  mode,
  color,
  size,
}: {
  mode: 'play' | 'pause' | 'previous' | 'next';
  /**
   * `action`: on an accent-colored button. `inverse`: on the neutral play
   * button from `usePlayButtonColor`.
   */
  color: 'text' | 'action' | 'inverse';
  size: number;
}) {
  const { theme, accent } = useContext(ThemeContext);
  const textColor = useIconColor('text');
  // In light mode accent buttons use the accent's strong shade, so the glyph
  // on them is white. In dark mode they use the light shade, so it is dark.
  const actionColor =
    theme === 'light'
      ? '#FFFFFF'
      : {
          lime: '#24331A',
          muse: '#24331A',
          ocean: '#173247',
          sunset: '#3B2A18',
          rose: '#4A1028',
          coral: '#4A2423',
          teal: '#173E3A',
          red: '#FFFFFF',
        }[accent];

  const glyphSize = opticalSize(PLAYBACK_GLYPHS[mode], size * 1.5);
  return (
    <Ionicons
      accessible={false}
      name={PLAYBACK_GLYPHS[mode]}
      size={glyphSize}
      style={opticalOffset(PLAYBACK_GLYPHS[mode], glyphSize)}
      color={
        color === 'action'
          ? actionColor
          : color === 'inverse'
            ? inverseGlyphColor(theme)
            : textColor
      }
    />
  );
}

function inverseGlyphColor(theme: 'light' | 'dark'): string {
  return theme === 'light' ? '#FFFFFF' : '#0B0B0C';
}

/**
 * The play button is a neutral, high-contrast circle: near-black in light
 * mode, off-white in dark mode. It reads clearly with every accent color;
 * the accent is carried by the progress bar and active controls instead.
 */
export function usePlayButtonColors(): { background: string; glyph: string } {
  const { theme } = useContext(ThemeContext);
  return {
    background: theme === 'light' ? '#202719' : '#F5F5F7',
    glyph: inverseGlyphColor(theme),
  };
}

export function MusicNote() {
  const styles = useAppStyles();
  return (
    <View style={styles.musicIcon}>
      <View style={styles.noteStem} />
      <View style={styles.noteFlag} />
      <View style={styles.noteDot} />
    </View>
  );
}
