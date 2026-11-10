import { isRunningInExpoGo } from 'expo';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { ACCENT_OPTIONS, ThemeContext, type Accent, type Appearance, type Theme } from '../theme/theme';
import { opticalSize } from '../components/icons';
import { GoalPicker } from '../components/GoalPicker';
import { SearchInput } from '../components/SearchInput';
import { setWeekStart, usePulse } from '../settings/pulse';
import type { WeekStart } from '../history/stats';
import { WEEK_STARTS } from './pulse/CustomizeSheet';
import {
  Segmented,
  SettingsBlock,
  SettingsInfoRow,
  SettingsRow,
  SettingsSection,
  SettingsSwitchRow,
  TILE,
} from '../components/SettingsList';
import { formatBytes } from '../utils/format';
import { useAppStyles } from '../theme/styles';
import { GLASS_CHOICES, setGlassChoice, useGlassChoice } from '../theme/glassStyle';
import {
  CROSSFADE_OPTIONS,
  MUSE_LOOK,
  SAVER_LOOK,
  SHORT_AUDIO_OPTIONS,
  SLEEP_FADE_SECONDS,
  setPreference,
  setPreferences,
  usePreferences,
  type ArtworkStyle,
  type MiniDock,
  type PlayerSkin,
  type PreviousButton,
  type StartTab,
} from '../settings/preferences';
import { artworkCacheBytes, clearArtworkCache } from '../library/artworkCache';
import { coverColor } from '../library/covers';
import { hapticSelection } from '../utils/haptics';
import { ArtStyleSheet } from '../components/ArtStyleSheet';
import { AppIconMark, AppIconSheet, appIconName } from '../components/AppIconSheet';
import { SKIN_SAMPLE, SkinPreview, skinLabel } from '../player/PlayerSkinSheet';
import { MIN_TINT_COLORFULNESS, tintTones } from '../player/FullPlayer';
import { generatedArtHue } from '../components/AlbumArtwork';
import { getPlaybackController } from '../playback/PlaybackController';
import type { MusicTrack } from '../types';
import { ART_SETS } from '../components/MuseArt';
import { canShowVolumeSlider } from '../player/VolumeSlider';
import { POP_IN, PUSH_IN, useNavDirection } from '../motion/motion';
import { APP_VERSION, BrandMark, MakerCredit, MUSE_MOTTO } from '../components/Brand';
import { ConfirmSheet, type ConfirmRequest } from '../components/ConfirmSheet';
import { HomePreview } from '../onboarding/previews';
import { pickBackup, previewBackup, restoreBackup, saveBackup, savedDataSizes } from '../settings/backup';
import { checkForUpdate, type UpdateCheck } from '../settings/updates';
import { closeApp } from '../../modules/muse-audio-metadata';
import { showToast } from '../components/Toast';

/** The pages under the main Settings list. `search` finds a setting on any of them. */
export type SettingsPage = 'look' | 'player' | 'sound' | 'library' | 'listening' | 'app' | 'search';

const PAGES: Record<Exclude<SettingsPage, 'search'>, { title: string; subtitle: string }> = {
  look: { title: 'Look & feel', subtitle: 'How Muse looks, everywhere' },
  player: { title: 'Player', subtitle: 'The full-screen player' },
  sound: { title: 'Sound', subtitle: 'What you hear, and when' },
  library: { title: 'Library', subtitle: 'Where your songs come from' },
  listening: { title: 'Listening', subtitle: 'Your goal, your week, your history' },
  app: { title: 'App & data', subtitle: 'Backup, storage and help' },
};

const APPEARANCES: { id: Appearance; label: string; accessibilityLabel: string }[] = [
  { id: 'system', label: 'System', accessibilityLabel: 'Match the phone' },
  { id: 'light', label: 'Light', accessibilityLabel: 'Always light' },
  { id: 'dark', label: 'Dark', accessibilityLabel: 'Always dark' },
];
const ARTWORK_STYLES: { id: ArtworkStyle; label: string; accessibilityLabel: string }[] = [
  { id: 'covers', label: 'Covers', accessibilityLabel: 'Real covers, Muse art when a song has none' },
  { id: 'generated', label: 'Muse art', accessibilityLabel: 'Muse art for every song' },
];
const MINI_DOCKS: { id: MiniDock; label: string; accessibilityLabel: string }[] = [
  { id: 'joined', label: 'Joined', accessibilityLabel: 'Joined to the tabs' },
  { id: 'floating', label: 'Floating', accessibilityLabel: 'Floating above the tabs' },
];
const START_TABS: { id: StartTab; label: string; accessibilityLabel: string }[] = [
  { id: 'last', label: 'Last used', accessibilityLabel: 'Where you left off' },
  { id: 'home', label: 'Home', accessibilityLabel: 'Home' },
  { id: 'library', label: 'Library', accessibilityLabel: 'Library' },
  { id: 'more', label: 'Collections', accessibilityLabel: 'Collections' },
];
const SKINS: { id: PlayerSkin; label: string; hint: string }[] = [
  { id: 'classic', label: 'Classic', hint: 'Big cover, controls below' },
  { id: 'bleed', label: 'Full-bleed', hint: 'Cover edge to edge' },
  { id: 'vinyl', label: 'Vinyl', hint: 'A record that turns' },
  { id: 'minimal', label: 'Minimal', hint: 'Small cover, huge title' },
];
const PREVIOUS: { id: PreviousButton; label: string }[] = [
  { id: 'restart', label: 'Restart first' },
  { id: 'back', label: 'Always go back' },
];
// Segmented controls take string ids; these map back to the stored numbers.
const CROSSFADES = CROSSFADE_OPTIONS.map((seconds) => ({
  id: String(seconds),
  label: seconds === 0 ? 'Off' : `${seconds}s`,
  accessibilityLabel: seconds === 0 ? 'No fade' : `${seconds} seconds`,
}));
const shortLabel = (seconds: number) => (seconds < 60 ? `${seconds}s` : `${seconds / 60} min`);
const SHORT_LIMITS = SHORT_AUDIO_OPTIONS.map((seconds) => ({
  id: String(seconds),
  label: shortLabel(seconds),
  accessibilityLabel: seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minutes`,
}));
const END_TIMES = [
  { id: 'length', label: 'Song length' },
  { id: 'left', label: 'Time left' },
];

/** Every setting search can find: [id, title, page, extra words]. */
const SEARCH_INDEX: [string, string, Exclude<SettingsPage, 'search'>, string][] = [
  ['theme', 'Light or dark', 'look', 'theme dark light system appearance night mode'],
  ['amoled', 'AMOLED black', 'look', 'black oled pure battery'],
  ['accent', 'Accent color', 'look', 'colour color tint green blue'],
  ['dynamicAccent', 'Match cover art', 'look', 'accent color dynamic'],
  ['glass', 'Bar style', 'look', 'glass blur solid tab bar frosted'],
  ['miniDock', 'Mini player', 'look', 'joined floating dock'],
  ['artworkStyle', 'Cover art', 'look', 'covers muse art artwork album'],
  ['artSet', 'Muse art style', 'look', 'shapes bauhaus stripes orbit letter generated'],
  ['bestCover', 'Best cover in the file', 'look', 'picture artwork quality front'],
  ['appIcon', 'App icon', 'look', 'logo launcher home screen icon'],
  ['fullScreen', 'Full screen', 'look', 'status bar immersive hide'],
  ['saver', 'Save battery', 'look', 'battery saver low power simple old phone'],
  ['skin', 'Player skin', 'player', 'classic vinyl minimal full-bleed layout'],
  ['coverBackground', 'Cover color wash', 'player', 'gradient colour tint background'],
  ['shrink', 'Shrink cover when paused', 'player', 'artwork pause'],
  ['audioDetails', 'Audio details', 'player', 'bitrate format flac sample rate quality'],
  ['playCount', 'Play count', 'player', 'plays times'],
  ['endTime', 'End time', 'player', 'remaining time left length duration'],
  ['volume', 'Volume slider', 'player', 'loudness media'],
  ['equalizer', 'Equalizer', 'sound', 'bass treble eq preset'],
  ['crossfade', 'Crossfade', 'sound', 'fade gap between songs gapless'],
  ['pauseOnDisconnect', 'Pause on disconnect', 'sound', 'bluetooth unplug headphones'],
  ['resumeOnConnect', 'Resume on reconnect', 'sound', 'bluetooth headphones connect'],
  ['previous', 'Previous button', 'sound', 'back restart rewind'],
  ['sleepFade', 'Fade out before sleep', 'sound', 'sleep timer fade bedtime night'],
  ['rescan', 'Rescan now', 'library', 'scan refresh new songs'],
  ['folders', 'Included folders', 'library', 'folder whatsapp telegram block exclude include'],
  ['skipShort', 'Skip short audio', 'library', 'voice notes ringtones short recordings'],
  ['shortLimit', 'Short audio limit', 'library', 'seconds voice notes'],
  ['startTab', 'Open on launch', 'library', 'start tab home'],
  ['permission', 'Audio permission', 'library', 'access allow'],
  ['goal', 'Daily goal', 'listening', 'minutes target streak'],
  ['weekStart', 'Week starts on', 'listening', 'saturday sunday monday recap'],
  ['historyPaused', 'Pause history', 'listening', 'incognito private stats tracking'],
  ['clearHistory', 'Clear listening history', 'listening', 'delete stats reset'],
  ['backup', 'Back up now', 'app', 'export save new phone transfer'],
  ['restore', 'Restore from a backup', 'app', 'import new phone transfer'],
  ['cache', 'Cover cache', 'app', 'storage space clear'],
  ['haptics', 'Haptic feedback', 'app', 'vibration vibrate'],
  ['setup', 'Set up Muse again', 'app', 'tour onboarding guide help'],
  ['reset', 'Reset settings', 'app', 'defaults'],
  ['update', 'Check for updates', 'app', 'new version upgrade latest'],
  ['about', 'About Muse', 'app', 'version credits'],
];
/** Shown before you type. */
const POPULAR = ['equalizer', 'crossfade', 'sleepFade', 'backup', 'historyPaused', 'theme'];
/** Rows that only show in some states point at the setting that reveals them. */
const REVEALED_BY: Record<string, string> = { shortLimit: 'skipShort', miniDock: 'glass' };
const BACKUP_MADE_KEY = '@muse/backup-made/v1';
/** When Check for updates last got an answer from GitHub. */
const UPDATE_CHECKED_KEY = '@muse/update-checked/v1';

type Props = {
  page: SettingsPage | null;
  onOpenPage: (page: SettingsPage) => void;
  onBack: () => void;
  isLoading: boolean;
  /** The theme in effect, after System is resolved. */
  theme: Theme;
  appearance: Appearance;
  accent: Accent;
  isAmoled: boolean;
  themeError: string;
  amoledError: string;
  onSelectAppearance: (appearance: Appearance) => void;
  onSelectAccent: (accent: Accent) => void;
  onToggleAmoled: () => void;
  isFullScreen: boolean;
  fullScreenError: string;
  onToggleFullScreen: () => void;
  onManageFolders: () => void;
  goalMinutes: number;
  onChangeGoal: (minutes: number) => void;
  onRefresh: () => void;
  onOpenPermissionSettings: () => void;
  /** Name of the chosen sound preset, shown on the Equalizer row. */
  equalizerPreset: string;
  onOpenEqualizer: () => void;
  /** Replays setup's look, player, battery, you and tour steps. Folders are left alone. */
  onSetUpAgain: () => void;
  /** The library, for the song count and the Look & feel preview. */
  tracks: MusicTrack[];
  /** How many plays listening history holds. */
  listenCount: number;
  onClearHistory: () => void;
  /** Look, player, sound, library and listening settings go back to how Muse starts. */
  onResetSettings: () => void;
  /** The scroll view Settings lives in, so search can scroll a setting into view. */
  scrollRef: RefObject<SettingsScroll | null>;
};

type SettingsScroll = ComponentRef<typeof ScrollView>;

// ---------------------------------------------------------------------------
// Search lands on a setting: its page opens, it scrolls into view and glows.

const FindContext = createContext<{
  target: string | null;
  glow: string;
  scrollRef: RefObject<SettingsScroll | null> | null;
  onFound: () => void;
}>({ target: null, glow: 'transparent', scrollRef: null, onFound: () => undefined });

/** Wraps one setting so search can find it. */
function Find({ id, children }: { id: string; children: ReactNode }) {
  const { target, glow, scrollRef, onFound } = useContext(FindContext);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const shine = useSharedValue(0);
  const shineStyle = useAnimatedStyle(() => ({ opacity: shine.get() }));
  const isTarget = target === id;
  useEffect(() => {
    if (!isTarget) {
      return;
    }
    // After the page has slid in and laid out.
    const timer = setTimeout(() => {
      const scroll = scrollRef?.current;
      const content = scroll?.getInnerViewRef();
      if (scroll && content && ref.current) {
        ref.current.measureLayout(content, (_x: number, y: number) => scroll.scrollTo({ y: Math.max(0, y - 160), animated: true }));
      }
      shine.set(withSequence(withTiming(1, { duration: 220 }), withDelay(700, withTiming(0, { duration: 900 }))));
      onFound();
    }, 380);
    return () => clearTimeout(timer);
  }, [isTarget, onFound, scrollRef, shine]);
  return (
    <View ref={ref}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: glow }, shineStyle]} />
      {children}
    </View>
  );
}

/**
 * Settings: a short list of pages, like iOS Settings, each opening its own
 * page. Pages slide in from the right; back slides the list back in.
 */
export function SettingsTab(props: Props) {
  const styles = useAppStyles();
  const { page, onOpenPage } = props;
  const direction = useNavDirection(page ? 1 : 0);
  const [target, setTarget] = useState<string | null>(null);
  const preferences = usePreferences();
  const glassChoice = useGlassChoice();
  const swatch = (ACCENT_OPTIONS.find((option) => option.id === props.accent) ?? ACCENT_OPTIONS[0]).swatch;
  const find = useMemo(
    () => ({ target, glow: `${swatch}33`, scrollRef: props.scrollRef, onFound: () => setTarget(null) }),
    [props.scrollRef, swatch, target],
  );
  const goTo = (id: string) => {
    const entry = SEARCH_INDEX.find(([key]) => key === id);
    if (!entry) {
      return;
    }
    // A row hidden right now glows its parent, the setting that reveals it.
    const hidden =
      (id === 'shortLimit' && !preferences.skipShortAudio) || (id === 'miniDock' && glassChoice === 'solid');
    setTarget(hidden ? REVEALED_BY[id] : id);
    onOpenPage(entry[2]);
  };
  return (
    <FindContext.Provider value={find}>
      <Animated.View
        key={page ?? 'list'}
        entering={direction === 'forward' ? PUSH_IN : direction === 'back' ? POP_IN : undefined}
        style={[styles.tabBody, styles.settingsEdge]}
      >
        {page === 'search' ? (
          <SearchPage onBack={props.onBack} onPick={goTo} />
        ) : page ? (
          <>
            <PageHeader title={PAGES[page].title} subtitle={PAGES[page].subtitle} onBack={props.onBack} />
            <PageBody {...props} page={page} />
          </>
        ) : (
          <MainList onOpenPage={onOpenPage} onGoTo={goTo} />
        )}
      </Animated.View>
    </FindContext.Provider>
  );
}

function RoundButton({ icon, label, onPress }: { icon: 'search' | 'chevron-back'; label: string; onPress: () => void }) {
  const styles = useAppStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={styles.settingsRoundButton}>
      <Ionicons accessible={false} name={icon} size={opticalSize(icon, 22)} color={String(styles.title.color)} />
    </Pressable>
  );
}

function PageHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  const styles = useAppStyles();
  return (
    <>
      <View style={styles.settingsPageHeader}>
        <RoundButton icon="chevron-back" label="Back to Settings" onPress={onBack} />
      </View>
      <Text accessibilityRole="header" style={[styles.settingsTitle, { marginTop: 14, paddingHorizontal: 6 }]}>
        {title}
      </Text>
      <Text style={styles.settingsPageSubtitle}>{subtitle}</Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// The main list: one row per page, saying what it holds.

function MainList({ onOpenPage, onGoTo }: { onOpenPage: (page: SettingsPage) => void; onGoTo: (id: string) => void }) {
  const styles = useAppStyles();
  return (
    <>
      <View style={styles.settingsHeader}>
        <View style={styles.flexSpacer}>
          <Text accessibilityRole="header" style={styles.settingsTitle}>
            Settings
          </Text>
          <Text style={styles.settingsLede}>Make Muse look, sound and play your way.</Text>
        </View>
        <RoundButton icon="search" label="Search settings" onPress={() => onOpenPage('search')} />
      </View>
      <View style={{ height: 8 }} />
      <SettingsSection large>
        <SettingsRow icon="color-palette" tint={TILE.blue} title="Look & feel" subtitle="Theme, accent, app icon, covers" onPress={() => onOpenPage('look')} />
        <SettingsRow icon="play-circle" tint={TILE.purple} title="Player" subtitle="Skin, cover, song details" onPress={() => onOpenPage('player')} />
        <SettingsRow icon="volume-high" tint={TILE.pink} title="Sound" subtitle="Equalizer, crossfade, sleep timer" onPress={() => onOpenPage('sound')} />
      </SettingsSection>
      <SettingsSection large>
        <SettingsRow icon="musical-notes" tint={TILE.orange} title="Library" subtitle="Folders, rescan, short audio" onPress={() => onOpenPage('library')} />
        <SettingsRow icon="headset" tint={TILE.green} title="Listening" subtitle="Daily goal, week, history" onPress={() => onOpenPage('listening')} />
      </SettingsSection>
      <SettingsSection large>
        <SettingsRow icon="phone-portrait" tint={TILE.slate} title="App & data" subtitle="Backup, storage, haptics, help" onPress={() => onOpenPage('app')} />
        <SettingsRow icon="information-circle" tint={TILE.gray} title="About & updates" subtitle={`Version ${APP_VERSION}`} onPress={() => onGoTo('update')} />
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Search

function SearchPage({ onBack, onPick }: { onBack: () => void; onPick: (id: string) => void }) {
  const styles = useAppStyles();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? SEARCH_INDEX.filter(([, title, page, extra]) =>
        words.every((word) => `${title} ${extra} ${PAGES[page].title}`.toLowerCase().includes(word)),
      )
    : POPULAR.map((id) => SEARCH_INDEX.find(([key]) => key === id)).filter((entry) => entry !== undefined);
  return (
    <>
      <View style={styles.settingsPageHeader}>
        <RoundButton icon="chevron-back" label="Back to Settings" onPress={onBack} />
      </View>
      <Text accessibilityRole="header" style={[styles.settingsTitle, { marginTop: 14, paddingHorizontal: 6 }]}>
        Search
      </Text>
      {/* SearchInput is only the inside of a field; the pill (a row) is supplied here, as in Library. */}
      <View
        style={[
          styles.searchPill,
          styles.librarySearchField,
          styles.settingsSearchField,
          focused && styles.librarySearchFieldFocused,
        ]}
      >
        <SearchInput
          query={query}
          onChangeQuery={setQuery}
          onFocusChange={setFocused}
          placeholder="Try sleep, dark or bluetooth"
          accessibilityLabel="Search settings"
          autoFocus
        />
      </View>
      {hits.length === 0 ? (
        <Text style={[styles.settingsPageSubtitle, { marginTop: 24, textAlign: 'center' }]}>
          {`Nothing called "${query.trim()}". Try sleep, cover or bluetooth.`}
        </Text>
      ) : (
        <SettingsSection large title={words.length ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}` : 'Popular'} inset={16}>
          {hits.map(([id, title, page]) => (
            <SettingsRow key={id} title={title} subtitle={PAGES[page].title} onPress={() => onPick(id)} />
          ))}
        </SettingsSection>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The pages

function PageBody(props: Props & { page: Exclude<SettingsPage, 'search'> }): ReactNode {
  switch (props.page) {
    case 'look':
      return <LookPage {...props} />;
    case 'player':
      return <PlayerPage {...props} />;
    case 'sound':
      return <SoundPage {...props} />;
    case 'library':
      return <LibraryPage {...props} />;
    case 'listening':
      return <ListeningPage {...props} />;
    case 'app':
      return <AppPage {...props} />;
  }
}

function useSwitchColor(accent: Accent) {
  return (ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]).swatch;
}

function LookPage({
  theme,
  appearance,
  accent,
  isAmoled,
  themeError,
  amoledError,
  onSelectAppearance,
  onSelectAccent,
  onToggleAmoled,
  isFullScreen,
  fullScreenError,
  onToggleFullScreen,
  tracks,
}: Props) {
  const styles = useAppStyles();
  const glassChoice = useGlassChoice();
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  const selectedAccent = ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0];
  const [sheet, setSheet] = useState<'art' | 'icon' | null>(null);
  const isSaver =
    glassChoice === 'solid' &&
    (Object.keys(SAVER_LOOK) as (keyof typeof SAVER_LOOK)[]).every((key) => preferences[key] === SAVER_LOOK[key]);
  const setSaver = (on: boolean) => {
    setPreferences(on ? SAVER_LOOK : MUSE_LOOK);
    setGlassChoice(on ? 'solid' : 'blur');
  };
  return (
    <>
      <SettingsSection large title="Theme" inset={16} footer={themeError || amoledError || undefined}>
        <Find id="theme">
          <SettingsBlock title="Light or dark">
            <Segmented label="Theme" options={APPEARANCES} value={appearance} onChange={onSelectAppearance} />
          </SettingsBlock>
        </Find>
        {/* Always listed so it is easy to find; it only applies to a dark theme. */}
        <Find id="amoled">
          <SettingsSwitchRow
            title="AMOLED black"
            subtitle={theme === 'dark' ? 'Pure black. Easier on battery with OLED screens' : 'Turn on Dark to use this'}
            value={theme === 'dark' && isAmoled}
            onValueChange={onToggleAmoled}
            accent={switchColor}
            disabled={theme !== 'dark'}
          />
        </Find>
      </SettingsSection>

      <SettingsSection
        large
        title="Accent"
        inset={16}
        footer={preferences.dynamicAccent ? 'Grey covers use the color above.' : undefined}
      >
        <Find id="accent">
          <SettingsBlock title={selectedAccent.label}>
            <View accessibilityRole="radiogroup" accessibilityLabel="Accent color" style={styles.prefSwatches}>
              {ACCENT_OPTIONS.map((option) => {
                const selected = option.id === accent;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      if (!selected) {
                        hapticSelection();
                        onSelectAccent(option.id);
                      }
                    }}
                    style={[styles.prefSwatchButton, { borderColor: selected ? option.swatch : 'transparent' }]}
                  >
                    <View style={[styles.prefSwatch, { backgroundColor: option.swatch }]} />
                  </Pressable>
                );
              })}
            </View>
          </SettingsBlock>
        </Find>
        <Find id="dynamicAccent">
          <SettingsSwitchRow
            title="Match cover art"
            subtitle="Takes the Muse color closest to the playing cover"
            value={preferences.dynamicAccent}
            onValueChange={(value) => setPreference('dynamicAccent', value)}
            accent={switchColor}
          />
        </Find>
      </SettingsSection>

      <SettingsSection
        large
        title="Bar"
        inset={16}
        footer={
          glassChoice === 'solid'
            ? 'No blur, easier on older phones. The mini player sits on the bar.'
            : 'See-through glass that blurs what scrolls behind it.'
        }
      >
        <Find id="glass">
          {/* The only preview here: blur, solid and the mini player are hard to picture. */}
          <View style={{ padding: 12, alignItems: 'center' }}>
            <HomePreview tracks={tracks} />
          </View>
        </Find>
        <SettingsBlock title="Style">
          <Segmented label="Bar style" options={GLASS_CHOICES} value={glassChoice} onChange={setGlassChoice} />
        </SettingsBlock>
        {/* Solid always keeps the mini player flush on the bar, so the choice only shows for glass. */}
        {glassChoice !== 'solid' && (
          <Find id="miniDock">
            <SettingsBlock title="Mini player">
              <Segmented
                label="Mini player"
                options={MINI_DOCKS}
                value={preferences.miniDock}
                onChange={(value) => setPreference('miniDock', value)}
              />
            </SettingsBlock>
          </Find>
        )}
      </SettingsSection>

      <SettingsSection large title="Covers" inset={16}>
        <Find id="artworkStyle">
          <SettingsBlock
            title="Cover art"
            subtitle={
              preferences.artworkStyle === 'generated'
                ? 'Muse art for every song, playlist and mix'
                : 'Muse art only shows when a song has no cover'
            }
          >
            <Segmented
              label="Cover art"
              options={ARTWORK_STYLES}
              value={preferences.artworkStyle}
              onChange={(value) => setPreference('artworkStyle', value)}
            />
          </SettingsBlock>
        </Find>
        <Find id="artSet">
          <SettingsRow
            title="Muse art style"
            detail={ART_SETS.find((set) => set.id === preferences.artSet)?.label}
            onPress={() => setSheet('art')}
          />
        </Find>
        <Find id="bestCover">
          <SettingsSwitchRow
            title="Best cover in the file"
            subtitle={
              preferences.artworkStyle === 'generated'
                ? 'Not used while Muse art is on'
                : 'If a song holds several pictures, show the biggest front cover'
            }
            value={preferences.bestFileCover}
            onValueChange={(value) => setPreference('bestFileCover', value)}
            accent={switchColor}
            disabled={preferences.artworkStyle === 'generated'}
          />
        </Find>
      </SettingsSection>
      <ArtStyleSheet visible={sheet === 'art'} onClose={() => setSheet(null)} />

      <SettingsSection large title="Display" inset={16} footer={fullScreenError || undefined}>
        <Find id="appIcon">
          <SettingsRow
            title="App icon"
            subtitle={appIconName(preferences.appIcon)}
            trailing={<AppIconMark id={preferences.appIcon} size={32} />}
            onPress={() => setSheet('icon')}
          />
        </Find>
        <Find id="fullScreen">
          <SettingsSwitchRow
            title="Full screen"
            subtitle="Hides the status bar while Muse is open"
            value={isFullScreen}
            onValueChange={onToggleFullScreen}
            accent={switchColor}
          />
        </Find>
      </SettingsSection>
      <AppIconSheet visible={sheet === 'icon'} onClose={() => setSheet(null)} />

      <SettingsSection
        large
        title="Battery"
        inset={16}
        footer={
          isSaver
            ? 'Turn it off to bring back the full Muse look.'
            : 'Changes the bar, covers and cover colors above, and the color wash in Player.'
        }
      >
        <Find id="saver">
          <SettingsSwitchRow
            title="Save battery"
            subtitle="Solid bar, simpler covers, no cover colors. Lighter on older phones"
            value={isSaver}
            onValueChange={setSaver}
            accent={switchColor}
          />
        </Find>
      </SettingsSection>
    </>
  );
}

/** The player's background tones for the preview, the same way the full player picks them. */
function usePreviewTint(track: MusicTrack, isSample: boolean): [string, string] | null {
  const { coverBackground, artworkStyle, artSet } = usePreferences();
  const { theme } = useContext(ThemeContext);
  const museArt = isSample || artworkStyle === 'generated';
  const [cover, setCover] = useState<{ id: string; hue: number | null } | null>(null);
  useEffect(() => {
    if (!coverBackground || museArt) {
      return;
    }
    let isActive = true;
    void coverColor(track.id).then((color) => {
      if (isActive) {
        setCover({ id: track.id, hue: color && color.colorfulness >= MIN_TINT_COLORFULNESS ? color.hue : null });
      }
    });
    return () => {
      isActive = false;
    };
  }, [coverBackground, museArt, track.id]);
  if (!coverBackground) {
    return null;
  }
  const hue = museArt ? generatedArtHue(track, artSet) : cover?.id === track.id ? cover.hue : null;
  return hue === null ? null : tintTones(hue, theme);
}

function PlayerPage({ accent }: Props) {
  const styles = useAppStyles();
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  // The song playing when the page opened, or a sample.
  const [playing] = useState(() => getPlaybackController().getSnapshot().currentTrack);
  const track = playing ?? SKIN_SAMPLE;
  const tint = usePreviewTint(track, !playing);
  const skin = SKINS.find((item) => item.id === preferences.playerSkin) ?? SKINS[0];
  return (
    <>
      <View style={styles.settingsPreview} accessible accessibilityLabel={`Preview: ${skinLabel(preferences.playerSkin)}`}>
        <View style={styles.settingsPreviewCaption}>
          <Text style={styles.settingsPreviewLabel}>Preview</Text>
          <Text style={styles.settingsPreviewValue}>{skinLabel(preferences.playerSkin)}</Text>
        </View>
        <SkinPreview skin={preferences.playerSkin} track={track} tint={tint} previewWidth={196} />
      </View>

      <SettingsSection large inset={16} footer="Every skin has the same controls, lyrics and Up Next.">
        <Find id="skin">
          <SettingsBlock title="Skin" subtitle={skin.hint}>
            <Segmented
              label="Player skin"
              options={SKINS.map(({ id, label, hint }) => ({ id, label, accessibilityLabel: `${label}: ${hint}` }))}
              value={preferences.playerSkin}
              onChange={(value) => setPreference('playerSkin', value)}
            />
          </SettingsBlock>
        </Find>
      </SettingsSection>

      <SettingsSection large title="Cover" inset={16}>
        <Find id="coverBackground">
          <SettingsSwitchRow
            title="Cover color wash"
            subtitle="A soft wash of the cover's color behind the player"
            value={preferences.coverBackground}
            onValueChange={(value) => setPreference('coverBackground', value)}
            accent={switchColor}
          />
        </Find>
        <Find id="shrink">
          <SettingsSwitchRow
            title="Shrink cover when paused"
            value={preferences.shrinkArtworkOnPause}
            onValueChange={(value) => setPreference('shrinkArtworkOnPause', value)}
            accent={switchColor}
          />
        </Find>
      </SettingsSection>

      <SettingsSection large title="Under the title" inset={16}>
        <Find id="audioDetails">
          <SettingsSwitchRow
            title="Audio details"
            subtitle="Format, bitrate, sample rate"
            value={preferences.showAudioDetails}
            onValueChange={(value) => setPreference('showAudioDetails', value)}
            accent={switchColor}
          />
        </Find>
        <Find id="playCount">
          <SettingsSwitchRow
            title="Play count"
            value={preferences.showPlayCount}
            onValueChange={(value) => setPreference('showPlayCount', value)}
            accent={switchColor}
          />
        </Find>
        <Find id="endTime">
          <SettingsBlock title="End time" subtitle="You can also tap it in the player">
            <Segmented
              label="End time"
              options={END_TIMES}
              value={preferences.showTimeRemaining ? 'left' : 'length'}
              onChange={(value) => setPreference('showTimeRemaining', value === 'left')}
            />
          </SettingsBlock>
        </Find>
      </SettingsSection>

      <SettingsSection large title="Controls" inset={16}>
        <Find id="volume">
          <SettingsSwitchRow
            title="Volume slider"
            // Expo Go cannot read the phone's volume, so say so instead of a switch that does nothing.
            subtitle={canShowVolumeSlider() ? "Moves the phone's media volume" : 'Needs the Muse app. Not available in Expo Go.'}
            value={preferences.showVolumeSlider && canShowVolumeSlider()}
            onValueChange={(value) => setPreference('showVolumeSlider', value)}
            accent={switchColor}
            disabled={!canShowVolumeSlider()}
          />
        </Find>
      </SettingsSection>
    </>
  );
}

function SoundPage({ accent, equalizerPreset, onOpenEqualizer }: Props) {
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  // Headphone events come from Muse's own native code, which Expo Go does not have.
  const canResume = !isRunningInExpoGo();
  return (
    <>
      <SettingsSection large inset={16}>
        <Find id="equalizer">
          <SettingsRow title="Equalizer" detail={equalizerPreset} onPress={onOpenEqualizer} />
        </Find>
      </SettingsSection>

      <SettingsSection large title="Between songs" inset={16} footer="Skipping always cuts over at once.">
        <Find id="crossfade">
          <SettingsBlock
            title="Crossfade"
            subtitle={
              preferences.crossfadeSeconds
                ? `Each song fades out over ${preferences.crossfadeSeconds} seconds as the next fades in`
                : 'One song ends, the next starts'
            }
          >
            <Segmented
              label="Crossfade"
              options={CROSSFADES}
              value={String(preferences.crossfadeSeconds)}
              onChange={(value) => setPreference('crossfadeSeconds', Number(value))}
            />
          </SettingsBlock>
        </Find>
      </SettingsSection>

      <SettingsSection large title="Headphones" inset={16}>
        <Find id="pauseOnDisconnect">
          <SettingsSwitchRow
            title="Pause on disconnect"
            subtitle="Headphones or Bluetooth"
            value={preferences.pauseOnDisconnect}
            onValueChange={(value) => setPreference('pauseOnDisconnect', value)}
            accent={switchColor}
          />
        </Find>
        <Find id="resumeOnConnect">
          <SettingsSwitchRow
            title="Resume on reconnect"
            subtitle={
              !canResume
                ? 'Needs the Muse app. Not available in Expo Go.'
                : preferences.pauseOnDisconnect
                  ? 'Plays again when they come back, if Muse paused for them'
                  : 'Needs Pause on disconnect'
            }
            value={canResume && preferences.pauseOnDisconnect && preferences.resumeOnConnect}
            onValueChange={(value) => setPreference('resumeOnConnect', value)}
            accent={switchColor}
            disabled={!canResume || !preferences.pauseOnDisconnect}
          />
        </Find>
      </SettingsSection>

      <SettingsSection large inset={16}>
        <Find id="previous">
          <SettingsBlock
            title="Previous button"
            subtitle={
              preferences.previousButton === 'restart'
                ? 'Past 3 seconds it starts the song again. Tap again to go back'
                : 'Always goes to the song before'
            }
          >
            <Segmented
              label="Previous button"
              options={PREVIOUS}
              value={preferences.previousButton}
              onChange={(value) => setPreference('previousButton', value)}
            />
          </SettingsBlock>
        </Find>
      </SettingsSection>

      <SettingsSection large title="Sleep timer" inset={16}>
        <Find id="sleepFade">
          <SettingsSwitchRow
            title="Fade out before sleep"
            subtitle={`Lowers the volume over the last ${SLEEP_FADE_SECONDS} seconds`}
            value={preferences.sleepFade}
            onValueChange={(value) => setPreference('sleepFade', value)}
            accent={switchColor}
          />
        </Find>
      </SettingsSection>
    </>
  );
}

function LibraryPage({ accent, isLoading, onManageFolders, onRefresh, onOpenPermissionSettings, tracks }: Props) {
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  return (
    <>
      <SettingsSection large inset={16} footer="Muse also checks for new music each time it opens.">
        <Find id="rescan">
          <SettingsRow
            title={isLoading ? 'Scanning…' : 'Rescan now'}
            subtitle={isLoading ? 'Looking through your folders' : `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`}
            chevron={false}
            busy={isLoading}
            onPress={onRefresh}
          />
        </Find>
        <Find id="folders">
          <SettingsRow title="Included folders" onPress={onManageFolders} />
        </Find>
      </SettingsSection>

      <SettingsSection
        large
        title="Short audio"
        inset={16}
        footer={
          preferences.skipShortAudio
            ? 'Short files stay on the phone. Muse just does not list them.'
            : 'Voice notes and ringtones are usually under 30 seconds.'
        }
      >
        <Find id="skipShort">
          <SettingsSwitchRow
            title="Skip short audio"
            subtitle="Leaves out voice notes and ringtones"
            value={preferences.skipShortAudio}
            onValueChange={(value) => setPreference('skipShortAudio', value)}
            accent={switchColor}
          />
        </Find>
        {preferences.skipShortAudio && (
          <Find id="shortLimit">
            <SettingsBlock title="Shorter than">
              <Segmented
                label="Short audio limit"
                options={SHORT_LIMITS}
                value={String(preferences.shortAudioSeconds)}
                onChange={(value) => setPreference('shortAudioSeconds', Number(value))}
              />
            </SettingsBlock>
          </Find>
        )}
      </SettingsSection>

      <SettingsSection large inset={16}>
        <Find id="startTab">
          <SettingsBlock title="Open on launch">
            <Segmented
              label="Open on launch"
              options={START_TABS}
              value={preferences.startTab}
              onChange={(value) => setPreference('startTab', value)}
            />
          </SettingsBlock>
        </Find>
      </SettingsSection>

      <SettingsSection large title="Access" inset={16} footer="Opens Android settings for Muse.">
        <Find id="permission">
          <SettingsRow
            title="Audio permission"
            onPress={onOpenPermissionSettings}
            accessibilityHint="Opens the phone's settings for Muse"
          />
        </Find>
      </SettingsSection>
    </>
  );
}

function ListeningPage({ accent, goalMinutes, onChangeGoal, listenCount, onClearHistory }: Props) {
  const styles = useAppStyles();
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  const { weekStart } = usePulse();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const confirmClear = () =>
    setConfirm({
      eyebrow: 'HISTORY',
      title: 'Clear listening history?',
      message: `This removes ${listenCount} ${listenCount === 1 ? 'play' : 'plays'}. Stats, play counts, goal streaks, the weekly recap and mixes start over. Playlists, favorites and ratings stay.`,
      confirmLabel: 'Clear history',
      destructive: true,
      onConfirm: () => {
        onClearHistory();
        showToast('Listening history cleared');
      },
    });
  return (
    <>
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
      <SettingsSection large title="Daily goal" inset={16} footer="Your progress shows on Home.">
        <Find id="goal">
          <SettingsBlock title={goalMinutes > 0 ? `${goalMinutes} minutes a day` : 'No goal set'}>
            <View style={styles.goalPickerWrap}>
              <GoalPicker goalMinutes={goalMinutes} onChange={onChangeGoal} />
            </View>
          </SettingsBlock>
        </Find>
      </SettingsSection>

      <SettingsSection large inset={16} footer='Sets "This week" on Home and the day your weekly recap arrives.'>
        <Find id="weekStart">
          <SettingsBlock title="Week starts on">
            <Segmented
              label="Week starts on"
              options={WEEK_STARTS}
              value={String(weekStart)}
              onChange={(value) => setWeekStart(Number(value) as WeekStart)}
            />
          </SettingsBlock>
        </Find>
      </SettingsSection>

      <SettingsSection
        large
        title="History"
        inset={16}
        footer={
          preferences.historyPaused
            ? 'While paused, stats, play counts, your goal, the recap and mixes all stand still.'
            : 'History stays on this phone. It powers stats, play counts, your goal, the recap and mixes.'
        }
      >
        <Find id="historyPaused">
          <SettingsSwitchRow
            title="Pause history"
            subtitle={preferences.historyPaused ? 'Paused. Home reminds you' : 'Nothing gets recorded while this is on'}
            value={preferences.historyPaused}
            onValueChange={(value) => setPreference('historyPaused', value)}
            accent={switchColor}
          />
        </Find>
        <Find id="clearHistory">
          <SettingsRow
            title="Clear listening history"
            detail={`${listenCount} ${listenCount === 1 ? 'play' : 'plays'}`}
            chevron={false}
            destructive
            disabled={listenCount === 0}
            onPress={confirmClear}
          />
        </Find>
      </SettingsSection>
    </>
  );
}

const sinceLabel = (time: number) =>
  new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** "just now", "5 min ago", "3 h ago", then the date. */
const checkedAgo = (time: number) => {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  return minutes < 24 * 60 ? `${Math.floor(minutes / 60)} h ago` : `on ${sinceLabel(time)}`;
};

function AppPage({ accent, onSetUpAgain, onResetSettings }: Props) {
  const styles = useAppStyles();
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  const [cacheBytes, setCacheBytes] = useState(artworkCacheBytes);
  const [sizes, setSizes] = useState<{ photos: number; history: number } | null>(null);
  const [backupMade, setBackupMade] = useState<number | null>(null);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | 'checking' | null>(null);
  const [updateChecked, setUpdateChecked] = useState<number | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(UPDATE_CHECKED_KEY).then(
      (value) => setUpdateChecked(value ? Number(value) || null : null),
      () => undefined,
    );
    void savedDataSizes().then(setSizes, () => undefined);
    void AsyncStorage.getItem(BACKUP_MADE_KEY).then(
      (value) => setBackupMade(value ? Number(value) || null : null),
      () => undefined,
    );
  }, []);

  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const confirmClearCache = () =>
    setConfirm({
      eyebrow: 'STORAGE',
      title: 'Clear cover cache?',
      message: 'Covers are made again, one by one, as songs show up. Your music is not touched.',
      confirmLabel: 'Clear',
      destructive: true,
      onConfirm: () => {
        try {
          clearArtworkCache();
        } finally {
          setCacheBytes(artworkCacheBytes());
        }
      },
    });

  const backUp = async () => {
    setBusy('backup');
    try {
      const summary = await previewBackup();
      setBusy(null);
      setConfirm({
        eyebrow: 'BACKUP',
        title: 'Back up Muse',
        icon: 'cloud-upload-outline',
        message: `${summary.playlists} playlists, ${summary.favorites} favorites, ${summary.ratings} ratings, ${summary.listens} plays, ${summary.photos} photos and your settings go into one file. Next, pick where to save it.`,
        confirmLabel: 'Pick a folder',
        onConfirm: async () => {
          try {
            const name = await saveBackup();
            if (name) {
              const now = Date.now();
              setBackupMade(now);
              void AsyncStorage.setItem(BACKUP_MADE_KEY, String(now)).catch(() => undefined);
              showToast('Backup saved', { detail: name });
            }
          } catch {
            showToast('Could not save the backup', { detail: 'Try a different folder', icon: 'info' });
          }
        },
      });
    } catch {
      setBusy(null);
      showToast('Could not make the backup', { icon: 'info' });
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const picked = await pickBackup();
      setBusy(null);
      if (!picked) {
        return;
      }
      const { summary, backup } = picked;
      setConfirm({
        eyebrow: 'RESTORE',
        title: 'Restore this backup?',
        message: `Made ${sinceLabel(summary.createdAt)}: ${summary.playlists} playlists, ${summary.favorites} favorites, ${summary.ratings} ratings, ${summary.listens} plays and ${summary.photos} photos.\n\nThis replaces everything Muse has saved on this phone now. Your music files are not touched. Muse closes when it is done; open it again to see everything.`,
        confirmLabel: 'Replace everything',
        destructive: true,
        onConfirm: async () => {
          try {
            // Nothing plays (and saves history) while the saved data is swapped.
            getPlaybackController().pause();
            await restoreBackup(backup);
            // The open screens still hold the old values and would save them back,
            // so Muse ends at once. Expo Go cannot, so it only closes the screen.
            if (!closeApp()) {
              BackHandler.exitApp();
            }
          } catch {
            showToast('Could not restore the backup', { icon: 'info' });
          }
        },
      });
    } catch (error) {
      setBusy(null);
      showToast(error instanceof Error ? error.message : 'Could not open that file', { icon: 'info' });
    }
  };

  const confirmReset = () =>
    setConfirm({
      eyebrow: 'HELP',
      title: 'Reset settings?',
      message:
        'Look, player, sound, library and listening settings go back to how Muse starts. Your music, playlists, favorites, ratings, history and equalizer stay.',
      confirmLabel: 'Reset',
      destructive: true,
      onConfirm: () => {
        onResetSettings();
        showToast('Settings reset');
      },
    });

  // Every check ends in a Muse sheet, so there is always a clear answer.
  const showUpdate = (result: UpdateCheck) => {
    if (result.status === 'available') {
      const released = result.publishedAt ? ` It came out on ${sinceLabel(Date.parse(result.publishedAt))}.` : '';
      setConfirm({
        eyebrow: 'UPDATE',
        title: `Muse ${result.version} is out`,
        icon: 'arrow-down-circle-outline',
        message: `You have Muse ${APP_VERSION}.${released}`,
        confirmLabel: 'Download',
        cancelLabel: 'Later',
        onConfirm: () => void Linking.openURL(result.url).catch(() => undefined),
        children: result.notes ? (
          <ScrollView style={styles.confirmNotes} contentContainerStyle={styles.confirmNotesContent}>
            <Text style={styles.confirmNotesHeading}>What&apos;s new</Text>
            <Text style={styles.confirmNotesText}>{result.notes}</Text>
          </ScrollView>
        ) : undefined,
      });
    } else if (result.status === 'latest') {
      setConfirm({
        eyebrow: 'UPDATES',
        title: "You're up to date",
        icon: 'checkmark-circle-outline',
        message: `Muse ${APP_VERSION} is the newest version.`,
        confirmLabel: 'Done',
        cancelLabel: null,
      });
    } else if (result.status === 'none') {
      setConfirm({
        eyebrow: 'UPDATES',
        title: 'No release yet',
        icon: 'time-outline',
        message: 'Muse has not published a release on GitHub yet. Check again later.',
        confirmLabel: 'Done',
        cancelLabel: null,
      });
    } else {
      setConfirm({
        eyebrow: 'UPDATES',
        title: "Couldn't check",
        icon: 'cloud-offline-outline',
        message: 'Muse could not reach GitHub. Check your connection and try again.',
        confirmLabel: 'Try again',
        cancelLabel: 'Close',
        onConfirm: () => void runUpdateCheck(),
      });
    }
  };
  const runUpdateCheck = async () => {
    setUpdate('checking');
    const result = await checkForUpdate(APP_VERSION);
    setUpdate(result);
    if (result.status !== 'error') {
      const now = Date.now();
      setUpdateChecked(now);
      void AsyncStorage.setItem(UPDATE_CHECKED_KEY, String(now)).catch(() => undefined);
    }
    showUpdate(result);
  };
  const status = update === 'checking' || update === null ? null : update.status;
  const checkedLine = update === 'checking' ? 'Checking GitHub…' : updateChecked ? `Checked ${checkedAgo(updateChecked)}` : 'Not checked yet';

  return (
    <>
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
      <SettingsSection
        large
        title="Backup"
        inset={16}
        footer="One file with your playlists, favorites, ratings, history, photos and settings. Your music files are not included."
      >
        <Find id="backup">
          <SettingsRow
            title="Back up now"
            subtitle={backupMade ? `Last backup ${sinceLabel(backupMade)}` : 'Not backed up yet'}
            busy={busy === 'backup'}
            onPress={() => void backUp()}
          />
        </Find>
        <Find id="restore">
          <SettingsRow title="Restore from a backup" busy={busy === 'restore'} onPress={() => void restore()} />
        </Find>
      </SettingsSection>

      <SettingsSection large title="Storage" inset={16} footer="Your music files are never touched.">
        <Find id="cache">
          <SettingsRow
            title="Cover cache"
            subtitle={cacheBytes > 0 ? 'Tap to clear. Covers come back as songs show up' : 'Empty'}
            detail={formatBytes(cacheBytes)}
            chevron={false}
            disabled={cacheBytes === 0}
            onPress={confirmClearCache}
          />
        </Find>
        <SettingsInfoRow title="Photos you picked" detail={sizes ? formatBytes(sizes.photos) : '…'} />
        <SettingsInfoRow title="Listening history" detail={sizes ? formatBytes(sizes.history) : '…'} />
      </SettingsSection>

      <SettingsSection large title="Feel" inset={16}>
        <Find id="haptics">
          <SettingsSwitchRow
            title="Haptic feedback"
            subtitle="A light tap on buttons and switches"
            value={preferences.haptics}
            onValueChange={(value) => setPreference('haptics', value)}
            accent={switchColor}
          />
        </Find>
      </SettingsSection>

      <SettingsSection large title="Help" inset={16} footer="Your folders and music stay as they are.">
        <Find id="setup">
          <SettingsRow title="Set up Muse again" subtitle="Look, player, battery and a quick tour" onPress={onSetUpAgain} />
        </Find>
        <Find id="reset">
          <SettingsRow title="Reset settings" chevron={false} destructive onPress={confirmReset} />
        </Find>
      </SettingsSection>

      <SettingsSection
        large
        title="Updates"
        inset={16}
        footer="Muse asks GitHub for the latest version number only when you tap. Nothing about you or your music is sent."
      >
        <Find id="update">
          <View style={styles.updateCard}>
            <View style={styles.updateHead}>
              <AppIconMark id={preferences.appIcon} size={44} />
              <View style={styles.settingCopy}>
                <Text style={styles.updateTitle}>Muse {APP_VERSION}</Text>
                <Text style={styles.updateSubtitle}>{checkedLine}</Text>
              </View>
              {status ? (
                <View style={styles.updateStatus}>
                  <View
                    style={[
                      styles.updateDot,
                      status === 'error' ? styles.updateDotError : status === 'none' ? styles.updateDotQuiet : null,
                    ]}
                  />
                  <Text style={styles.updateStatusText}>
                    {status === 'latest' ? 'Up to date' : status === 'available' ? 'Update ready' : status === 'none' ? 'No release' : 'Offline'}
                  </Text>
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: update === 'checking' }}
              onPress={() => {
                if (update === 'checking') {
                  return;
                }
                // With an update found, the button reopens its sheet instead of asking again.
                if (update?.status === 'available') {
                  showUpdate(update);
                } else {
                  void runUpdateCheck();
                }
              }}
              style={({ pressed }) => [styles.primaryButton, styles.updateButton, pressed && styles.primaryButtonPressed]}
            >
              {update === 'checking' ? <ActivityIndicator color={String(styles.primaryButtonLabel.color)} /> : null}
              <Text style={styles.primaryButtonLabel}>
                {update === 'checking' ? 'Checking…' : update?.status === 'available' ? `Get Muse ${update.version}` : 'Check for updates'}
              </Text>
            </Pressable>
          </View>
        </Find>
      </SettingsSection>

      <Find id="about">
        <View style={styles.prefSection}>
          <View style={styles.aboutCard}>
            <BrandMark size={30} />
            <Text style={styles.aboutTagline}>{MUSE_MOTTO}</Text>
            <View style={styles.aboutMetaRow}>
              {[`Version ${APP_VERSION}`, 'Works offline', 'No account'].map((fact) => (
                <View key={fact} style={styles.aboutPill}>
                  <Text style={styles.aboutPillText}>{fact}</Text>
                </View>
              ))}
            </View>
            <View style={styles.aboutDivider} />
            {/* The same credit as Welcome: name, divider, X and GitHub chips. */}
            <MakerCredit
              colors={{
                text: String(styles.aboutPillText.color),
                muted: String(styles.aboutTagline.color),
                chip: String(styles.aboutPill.backgroundColor),
              }}
            />
          </View>
        </View>
      </Find>
    </>
  );
}
