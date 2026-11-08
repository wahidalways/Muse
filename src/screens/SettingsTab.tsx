import { useState, type ReactNode } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { ACCENT_OPTIONS, type Accent, type Appearance, type Theme } from '../theme/theme';
import { opticalSize } from '../components/icons';
import { GoalPicker } from '../components/GoalPicker';
import { setWeekStart, usePulse } from '../settings/pulse';
import type { WeekStart } from '../history/stats';
import { WEEK_STARTS } from './pulse/CustomizeSheet';
import {
  Segmented,
  SettingsBlock,
  SettingsRow,
  SettingsSection,
  SettingsSwitchRow,
  TILE,
} from '../components/SettingsList';
import { formatBytes, formatListeningTime } from '../utils/format';
import { useAppStyles } from '../theme/styles';
import { GLASS_CHOICES, setGlassChoice, useGlassChoice } from '../theme/glassStyle';
import {
  CROSSFADE_OPTIONS,
  SHORT_AUDIO_SECONDS,
  setPreference,
  usePreferences,
  type StartTab,
} from '../settings/preferences';
import { artworkCacheBytes, clearArtworkCache } from '../library/artworkCache';
import { hapticSelection } from '../utils/haptics';
import { canShowVolumeSlider } from '../player/VolumeSlider';
import { POP_IN, PUSH_IN, useNavDirection } from '../motion/motion';
import { APP_VERSION, BrandMark, CreditLink, MUSE_MOTTO } from '../components/Brand';

/** The category pages under the main Settings list. */
export type SettingsPage =
  | 'appearance'
  | 'playback'
  | 'nowPlaying'
  | 'library'
  | 'listening'
  | 'storage'
  | 'about';

const PAGE_TITLES: Record<SettingsPage, string> = {
  appearance: 'Appearance',
  playback: 'Playback',
  nowPlaying: 'Now Playing',
  library: 'Library',
  listening: 'Listening',
  storage: 'Storage',
  about: 'About',
};

const APPEARANCES: { id: Appearance; label: string; accessibilityLabel: string }[] = [
  { id: 'system', label: 'System', accessibilityLabel: 'Match the phone' },
  { id: 'light', label: 'Light', accessibilityLabel: 'Always light' },
  { id: 'dark', label: 'Dark', accessibilityLabel: 'Always dark' },
];

const START_TABS: { id: StartTab; label: string; accessibilityLabel: string }[] = [
  { id: 'last', label: 'Last used', accessibilityLabel: 'Where you left off' },
  { id: 'home', label: 'Home', accessibilityLabel: 'Home' },
  { id: 'library', label: 'Library', accessibilityLabel: 'Library' },
  { id: 'more', label: 'Collections', accessibilityLabel: 'Collections' },
];

// Segmented controls take string ids; these map back to the stored numbers.
const CROSSFADES = CROSSFADE_OPTIONS.map((seconds) => ({
  id: String(seconds),
  label: seconds === 0 ? 'Off' : `${seconds}s`,
  accessibilityLabel: seconds === 0 ? 'No fade' : `${seconds} seconds`,
}));

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
};

/**
 * Settings: a short list of categories, each opening its own page, like iOS
 * Settings. Pages slide in from the right; back slides the list back in.
 */
export function SettingsTab(props: Props) {
  const styles = useAppStyles();
  const { page } = props;
  const direction = useNavDirection(page ? 1 : 0);
  // Read when Settings opens and after clearing; shown on the list and page.
  const [cacheBytes, setCacheBytes] = useState(artworkCacheBytes);

  return (
    <Animated.View
      key={page ?? 'list'}
      entering={direction === 'forward' ? PUSH_IN : direction === 'back' ? POP_IN : undefined}
      style={styles.tabBody}
    >
      {page ? (
        <>
          <PageHeader title={PAGE_TITLES[page]} onBack={props.onBack} />
          <PageBody {...props} page={page} cacheBytes={cacheBytes} onCacheCleared={setCacheBytes} />
        </>
      ) : (
        <SettingsList {...props} cacheBytes={cacheBytes} />
      )}
    </Animated.View>
  );
}

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const styles = useAppStyles();
  return (
    <View style={[styles.moreTopBar, styles.intro]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Settings"
        hitSlop={8}
        onPress={onBack}
        style={styles.headerBackButton}
      >
        <Ionicons accessible={false} name="chevron-back" size={opticalSize('chevron-back', 24)} style={styles.headerBackIcon} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={styles.statsTitle}>
        {title}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The main list: one row per category. The line under each says what the
// page holds, so a setting is easy to find; the right side shows its value.

// Each row names its page and what it holds. Current values live on the
// pages themselves; repeating them here only added noise.
function SettingsList({ onOpenPage }: Props & { cacheBytes: number }) {
  const styles = useAppStyles();

  return (
    <>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.settingsTitle}>
          Settings
        </Text>
        <Text style={styles.description}>Make Muse look, sound and play your way.</Text>
      </View>
      <SettingsSection>
        <SettingsRow
          icon="contrast"
          tint={TILE.indigo}
          title="Appearance"
          subtitle="Theme, accent, glass bar"
          onPress={() => onOpenPage('appearance')}
        />
        <SettingsRow
          icon="play"
          tint={TILE.pink}
          title="Playback"
          subtitle="Crossfade, equalizer, haptics"
          onPress={() => onOpenPage('playback')}
        />
        <SettingsRow
          icon="musical-notes"
          tint={TILE.purple}
          title="Now Playing"
          subtitle="Song details, volume, cover"
          onPress={() => onOpenPage('nowPlaying')}
        />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow
          icon="albums"
          tint={TILE.blue}
          title="Library"
          subtitle="Start tab, folders, access"
          onPress={() => onOpenPage('library')}
        />
        <SettingsRow
          icon="trophy"
          tint={TILE.orange}
          title="Listening"
          subtitle="Daily goal"
          onPress={() => onOpenPage('listening')}
        />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow
          icon="server"
          tint={TILE.gray}
          title="Storage"
          subtitle="Cover art cache"
          onPress={() => onOpenPage('storage')}
        />
        <SettingsRow
          icon="information-circle"
          tint={TILE.gray}
          title="About"
          subtitle={`Credits, version ${APP_VERSION}`}
          onPress={() => onOpenPage('about')}
        />
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// The pages.

function PageBody(
  props: Props & {
    page: SettingsPage;
    cacheBytes: number;
    onCacheCleared: (bytes: number) => void;
  },
): ReactNode {
  switch (props.page) {
    case 'appearance':
      return <AppearancePage {...props} />;
    case 'playback':
      return <PlaybackPage {...props} />;
    case 'nowPlaying':
      return <NowPlayingPage {...props} />;
    case 'library':
      return <LibraryPage {...props} />;
    case 'listening':
      return <ListeningPage {...props} />;
    case 'storage':
      return <StoragePage {...props} />;
    case 'about':
      return <AboutPage />;
  }
}

function useSwitchColor(accent: Accent) {
  return (ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]).swatch;
}

function AppearancePage({
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
}: Props) {
  const styles = useAppStyles();
  const glassChoice = useGlassChoice();
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  const selectedAccent = ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0];
  return (
    <>
      <SettingsSection title="Theme" footer={themeError || amoledError || undefined}>
        <SettingsBlock icon="contrast" tint={TILE.indigo} title="Appearance">
          <Segmented label="Appearance" options={APPEARANCES} value={appearance} onChange={onSelectAppearance} />
        </SettingsBlock>
        {/* Always listed so it is easy to find; it only applies to a dark theme. */}
        <SettingsSwitchRow
          icon="moon"
          tint={TILE.gray}
          title="AMOLED black"
          subtitle={theme === 'dark' ? undefined : 'Available in dark mode'}
          value={theme === 'dark' && isAmoled}
          onValueChange={onToggleAmoled}
          accent={switchColor}
          disabled={theme !== 'dark'}
        />
      </SettingsSection>

      <SettingsSection
        title="Accent color"
        footer={
          preferences.dynamicAccent
            ? 'Uses the Muse color closest to the playing cover. Grey covers use the color above.'
            : undefined
        }
      >
        <SettingsSwitchRow
          icon="sparkles"
          tint={TILE.purple}
          title="Match cover art"
          value={preferences.dynamicAccent}
          onValueChange={(value) => setPreference('dynamicAccent', value)}
          accent={switchColor}
        />
        <SettingsBlock
          icon="color-palette"
          tint={TILE.pink}
          title={preferences.dynamicAccent ? `${selectedAccent.label} (when no cover)` : selectedAccent.label}
        >
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
      </SettingsSection>

      <SettingsSection
        title="Glass bar"
        footer={
          glassChoice === 'blur'
            ? 'Frosted in light mode, a deeper blur in dark mode.'
            : GLASS_CHOICES.find((option) => option.id === 'solid')?.hint
        }
      >
        <SettingsBlock icon="layers" tint={TILE.teal} title="Style">
          <Segmented label="Glass bar" options={GLASS_CHOICES} value={glassChoice} onChange={setGlassChoice} />
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection title="Display" footer={fullScreenError || 'Hides the status bar while Muse is open.'}>
        <SettingsSwitchRow
          icon="expand"
          tint={TILE.blue}
          title="Full screen"
          value={isFullScreen}
          onValueChange={onToggleFullScreen}
          accent={switchColor}
        />
      </SettingsSection>
    </>
  );
}

function PlaybackPage({ accent, equalizerPreset, onOpenEqualizer }: Props) {
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  return (
    <>
      <SettingsSection
        title="Between songs"
        footer="Each song fades out at its end and the next fades in. Skipping cuts over at once."
      >
        <SettingsBlock icon="git-merge" tint={TILE.purple} title="Crossfade">
          <Segmented
            label="Crossfade"
            options={CROSSFADES}
            value={String(preferences.crossfadeSeconds)}
            onChange={(value) => setPreference('crossfadeSeconds', Number(value))}
          />
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection title="Sound">
        <SettingsRow icon="options" tint={TILE.orange} title="Equalizer" detail={equalizerPreset} onPress={onOpenEqualizer} />
        <SettingsSwitchRow
          icon="headset"
          tint={TILE.blue}
          title="Pause on disconnect"
          subtitle="Headphones or Bluetooth"
          value={preferences.pauseOnDisconnect}
          onValueChange={(value) => setPreference('pauseOnDisconnect', value)}
          accent={switchColor}
        />
      </SettingsSection>

      <SettingsSection title="Feel">
        <SettingsSwitchRow
          icon="pulse"
          tint={TILE.pink}
          title="Haptic feedback"
          value={preferences.haptics}
          onValueChange={(value) => setPreference('haptics', value)}
          accent={switchColor}
        />
      </SettingsSection>
    </>
  );
}

function NowPlayingPage({ accent }: Props) {
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  return (
    <>
    <SettingsSection title="Show in the player" footer="Shown under the artist in the full player.">
      <SettingsSwitchRow
        icon="information-circle"
        tint={TILE.teal}
        title="Audio details"
        subtitle="Format, bitrate, sample rate"
        value={preferences.showAudioDetails}
        onValueChange={(value) => setPreference('showAudioDetails', value)}
        accent={switchColor}
      />
      <SettingsSwitchRow
        icon="bar-chart"
        tint={TILE.green}
        title="Play count"
        value={preferences.showPlayCount}
        onValueChange={(value) => setPreference('showPlayCount', value)}
        accent={switchColor}
      />
    </SettingsSection>

    <SettingsSection
      title="Player"
      footer="Tap the end time under the progress bar to switch between length and time left."
    >
      <SettingsSwitchRow
        icon="volume-high"
        tint={TILE.blue}
        title="Volume slider"
        // Expo Go cannot read the phone's volume, so say so instead of a switch that does nothing.
        subtitle={
          canShowVolumeSlider()
            ? "Moves the phone's media volume"
            : 'Needs the Muse app. Not available in Expo Go.'
        }
        value={preferences.showVolumeSlider && canShowVolumeSlider()}
        onValueChange={(value) => setPreference('showVolumeSlider', value)}
        accent={switchColor}
        disabled={!canShowVolumeSlider()}
      />
      <SettingsSwitchRow
        icon="color-fill"
        tint={TILE.purple}
        title="Cover color background"
        value={preferences.coverBackground}
        onValueChange={(value) => setPreference('coverBackground', value)}
        accent={switchColor}
      />
      <SettingsSwitchRow
        icon="contract"
        tint={TILE.orange}
        title="Shrink cover when paused"
        value={preferences.shrinkArtworkOnPause}
        onValueChange={(value) => setPreference('shrinkArtworkOnPause', value)}
        accent={switchColor}
      />
    </SettingsSection>
    </>
  );
}

function LibraryPage({ accent, isLoading, onManageFolders, onRefresh, onOpenPermissionSettings }: Props) {
  const preferences = usePreferences();
  const switchColor = useSwitchColor(accent);
  return (
    <>
      <SettingsSection title="On launch">
        <SettingsBlock icon="albums" tint={TILE.blue} title="Open on">
          <Segmented
            label="Open on launch"
            options={START_TABS}
            value={preferences.startTab}
            onChange={(value) => setPreference('startTab', value)}
          />
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection
        title="Songs"
        footer={`Short audio is anything under ${SHORT_AUDIO_SECONDS} seconds, like voice notes and ringtones.`}
      >
        <SettingsSwitchRow
          icon="time"
          tint={TILE.gray}
          title="Skip short audio"
          value={preferences.skipShortAudio}
          onValueChange={(value) => setPreference('skipShortAudio', value)}
          accent={switchColor}
        />
        <SettingsRow icon="folder" tint={TILE.blue} title="Included folders" onPress={onManageFolders} />
        <SettingsRow
          icon="refresh"
          tint={TILE.green}
          title={isLoading ? 'Scanning…' : 'Rescan music'}
          chevron={false}
          busy={isLoading}
          onPress={onRefresh}
        />
      </SettingsSection>

      <SettingsSection title="Access">
        <SettingsRow
          icon="lock-closed"
          tint={TILE.gray}
          title="Audio permission"
          onPress={onOpenPermissionSettings}
          accessibilityHint="Opens the phone's settings for Muse"
        />
      </SettingsSection>
    </>
  );
}

function ListeningPage({ goalMinutes, onChangeGoal }: Props) {
  const styles = useAppStyles();
  return (
    <>
    <PulseWeekSection />
    <SettingsSection title="Daily goal" footer="Track your progress on Home.">
      <SettingsBlock
        icon="trophy"
        tint={TILE.orange}
        title={goalMinutes > 0 ? `${formatListeningTime(goalMinutes * 60)} a day` : 'No goal set'}
      >
        <View style={styles.goalPickerWrap}>
          <GoalPicker goalMinutes={goalMinutes} onChange={onChangeGoal} />
        </View>
      </SettingsBlock>
    </SettingsSection>
    </>
  );
}

function PulseWeekSection() {
  const { weekStart } = usePulse();
  return (
    <SettingsSection title="Home" footer="Sets This week on Home and when your weekly recap arrives.">
      <SettingsBlock icon="calendar" tint={TILE.blue} title="Week starts on">
        <Segmented
          label="Week starts on"
          options={WEEK_STARTS}
          value={String(weekStart)}
          onChange={(value) => setWeekStart(Number(value) as WeekStart)}
        />
      </SettingsBlock>
    </SettingsSection>
  );
}

function StoragePage({
  cacheBytes,
  onCacheCleared,
}: Props & { cacheBytes: number; onCacheCleared: (bytes: number) => void }) {
  const confirmClear = () =>
    Alert.alert(
      'Clear cover art cache?',
      'Covers are made again, one by one, as songs show up. Your music is not touched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            try {
              clearArtworkCache();
            } finally {
              onCacheCleared(artworkCacheBytes());
            }
          },
        },
      ],
    );
  return (
    <SettingsSection
      title="Cover art"
      footer="Covers are saved small so lists scroll smoothly. Clearing frees space; they come back as songs show up."
    >
      <SettingsRow
        icon="trash"
        tint={TILE.red}
        title="Clear cover art cache"
        detail={formatBytes(cacheBytes)}
        chevron={false}
        destructive
        disabled={cacheBytes === 0}
        onPress={confirmClear}
      />
    </SettingsSection>
  );
}

function AboutPage() {
  const styles = useAppStyles();
  return (
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
        <View style={styles.aboutCreditRow}>
          <View style={styles.aboutAvatar}>
            <Ionicons
              accessible={false}
              name="logo-github"
              size={opticalSize('logo-github', 22)}
              style={styles.aboutAvatarIcon}
            />
          </View>
          <View style={styles.settingCopy}>
            <Text style={styles.aboutCreditLabel}>Credit goes to</Text>
            <CreditLink withIcon />
          </View>
        </View>
      </View>
    </View>
  );
}
