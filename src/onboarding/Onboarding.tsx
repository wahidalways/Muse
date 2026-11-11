import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDocumentAsync } from 'expo-document-picker';
import { launchImageLibraryAsync } from 'expo-image-picker';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Avatar, PRESETS } from '../components/Avatar';
import { BrandMark, MakerCredit } from '../components/Brand';
import { GoalPicker } from '../components/GoalPicker';
import { ART_SETS, MuseArtTile } from '../components/MuseArt';
import { Segmented, SettingsBlock, SettingsSection, SettingsSwitchRow, TILE } from '../components/SettingsList';
import { opticalSize } from '../components/icons';
import { SKIN_SAMPLE, PLAYER_SKINS, SkinPreview } from '../player/PlayerSkinSheet';
import { MUSE_LOOK, SAVER_LOOK, setPreference, usePreferences, type ArtworkStyle, type MiniDock } from '../settings/preferences';
import { funkyName } from '../settings/funkyNames';
import { SurpriseButton } from '../components/SurpriseButton';
import { NAME_LIMIT, setProfileName, setProfilePhoto, setProfilePreset, clearProfileImage, useProfile } from '../settings/profile';
import { setGlassChoice, useGlassChoice } from '../theme/glassStyle';
import { ACCENT_OPTIONS, type Accent, type Appearance, type Theme } from '../theme/theme';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';
import { formatListeningTime } from '../utils/format';
import type { MusicFolder, MusicTrack } from '../types';
import { GestureDemo, GreetingPreview, HomeDemo, LibraryDemo, LookPhone, PlayerDemo, useTokens } from './previews';
import { WelcomeScene } from './WelcomeScene';

export type AccessResult = 'granted' | 'denied' | 'unsupported';

type Step = 'welcome' | 'access' | 'look' | 'player' | 'you' | 'folders' | 'tour' | 'denied';
type Flow = Exclude<Step, 'welcome' | 'denied'>;

/** The first run: access first, so the scan runs while people pick their look. */
const FIRST_FLOW: Flow[] = ['access', 'look', 'player', 'you', 'folders', 'tour'];
/** "Set up Muse again" from Settings › About: the choices and the tour, never access or folders. */
const REPLAY_FLOW: Flow[] = ['look', 'player', 'you', 'tour'];

const APPEARANCES: { id: Appearance; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const ARTWORK_STYLES: { id: ArtworkStyle; label: string }[] = [
  { id: 'covers', label: 'Covers' },
  { id: 'generated', label: 'Muse art' },
];
const MINI_DOCKS: { id: MiniDock; label: string }[] = [
  { id: 'joined', label: 'Joined' },
  { id: 'floating', label: 'Floating' },
];
/**
 * Look, Player and You are three cards of one Personalize step: one part of
 * the progress bar, a switch to move between them, Next going card to card.
 */
const CARDS: { id: 'look' | 'player' | 'you'; label: string }[] = [
  { id: 'look', label: 'Look' },
  { id: 'player', label: 'Player' },
  { id: 'you', label: 'You' },
];
/** What the progress bar counts: each flow step's part, named under the bar. */
const PART: Record<Flow, string> = {
  access: 'Music access',
  look: 'Personalize',
  player: 'Personalize',
  you: 'Personalize',
  folders: 'Folders',
  tour: 'Tour',
};
/** The top bar's height under the status bar; steps scroll from just below it. */
const TOP_BAR = 56;
/** Save battery turns these off; Muse default is how a new install starts (shared with Settings). */
const SAVER = SAVER_LOOK;
const DEFAULT_LOOK = MUSE_LOOK;
/** The Welcome scene's second color for each accent: [dark theme, light theme]. */
const SECOND: Record<Accent, [string, string]> = {
  lime: ['#4FD1C5', '#1F8A7E'],
  muse: ['#4FD1C5', '#1F8A7E'],
  ocean: ['#A78BFA', '#6D4FD8'],
  sunset: ['#FF7A9A', '#C2416B'],
  rose: ['#A78BFA', '#7A4FD0'],
  coral: ['#FFC46B', '#B7791F'],
  teal: ['#7AA2FF', '#3B5BD6'],
  red: ['#FFB347', '#C25B12'],
};

type Props = {
  mode: 'first' | 'replay';
  theme: Theme;
  appearance: Appearance;
  accent: Accent;
  isAmoled: boolean;
  onSelectAppearance: (appearance: Appearance) => void;
  onSelectAccent: (accent: Accent) => void;
  onToggleAmoled: () => void;
  goalMinutes: number;
  onChangeGoal: (minutes: number) => void;
  /** Asks Android for music access and starts the scan in the background. */
  onRequestAccess: () => Promise<AccessResult>;
  /** What the scan found; null until it is done. */
  library: { folders: MusicFolder[]; tracks: MusicTrack[] } | null;
  blockedFolderIds: string[];
  onToggleFolder: (folderId: string) => void;
  onIncludeAllFolders: () => void;
  /** Android's settings page for Muse, to turn access back on. */
  onOpenAppSettings: () => void;
  /** First run: save the folders and open the app. Replay: close. */
  onFinish: () => Promise<void> | void;
};

export function Onboarding(props: Props) {
  const { mode, library, onRequestAccess, onFinish } = props;
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const flow = mode === 'first' ? FIRST_FLOW : REPLAY_FLOW;
  const [step, setStep] = useState<Step>(mode === 'first' ? 'welcome' : 'look');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const history = useRef<Step[]>([]);
  const [quick, setQuick] = useState(false);
  const [access, setAccess] = useState<'unknown' | 'granted' | 'later' | 'denied'>('unknown');
  /** Where to go once access is allowed, when it was asked for again on the way. */
  const [after, setAfter] = useState<Flow | 'finish' | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  /** The step the scan finished on, which says "Found"; later steps stay quiet. */
  const [foundOn, setFoundOn] = useState<Step | null>(null);
  // "More below": shown while a step has options out of sight under the footer.
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollBox = useRef({ y: 0, view: 0, content: 0 });
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMore = useCallback(() => {
    const { y, view, content } = scrollBox.current;
    // The content's bottom padding is the footer's height, so this is what the footer still covers.
    const hidden = view > 0 && content - (y + view) > 32;
    setMoreBelow((shown) => (shown === hidden ? shown : hidden));
  }, []);
  const showMore = useCallback(() => {
    const { y, view } = scrollBox.current;
    scroller.current?.scrollTo({ y: y + view * 0.6, animated: true });
  }, []);

  // New installs start Joined; people who set Muse up before keep Floating.
  useEffect(() => {
    if (mode === 'first') {
      setPreference('miniDock', 'joined');
    }
  }, [mode]);
  // Noted while rendering, the way React suggests for state that follows a prop.
  if (library && foundOn === null) {
    setFoundOn(step);
  }

  const finish = useCallback(async () => {
    setIsFinishing(true);
    try {
      await onFinish();
    } finally {
      setIsFinishing(false);
    }
  }, [onFinish]);

  const go = useCallback(
    (target: Step, justAllowed = false) => {
      let next = target;
      // Folders needs the scan, so access is asked for once more first.
      if (target === 'folders' && access !== 'granted' && !justAllowed) {
        setAfter('folders');
        next = 'access';
      }
      history.current.push(step);
      setDirection('forward');
      setStep(next);
    },
    [access, step],
  );
  const back = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) {
      if (mode === 'replay') {
        void finish();
        return true;
      }
      return false;
    }
    if (previous !== 'access') {
      setAfter(null);
    }
    setDirection('back');
    setStep(previous);
    return true;
  }, [finish, mode]);
  const next = useCallback(() => {
    const index = flow.indexOf(step as Flow);
    if (index >= 0 && index < flow.length - 1) {
      go(flow[index + 1]);
    } else {
      void finish();
    }
  }, [finish, flow, go, step]);
  const skipRest = useCallback(() => {
    if (mode === 'replay' || access === 'granted') {
      void finish();
      return;
    }
    setAfter('finish');
    go('access');
  }, [access, finish, go, mode]);

  const askForAccess = useCallback(async () => {
    setIsAsking(true);
    let result: AccessResult;
    try {
      result = await onRequestAccess();
    } finally {
      setIsAsking(false);
    }
    if (result === 'denied') {
      setAccess('denied');
      go('denied');
      return;
    }
    if (result !== 'granted') {
      return;
    }
    setAccess('granted');
    if (quick || after === 'finish') {
      void finish();
    } else if (after) {
      setAfter(null);
      // `access` in this closure is still the old value; this step was just allowed.
      go(after, true);
    } else {
      go('look');
    }
  }, [after, finish, go, onRequestAccess, quick]);

  // Android's back button walks back through the steps; on Welcome it leaves the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => (isAsking || isFinishing ? true : back()));
    return () => subscription.remove();
  }, [back, isAsking, isFinishing]);

  const flowIndex = flow.indexOf(step as Flow);
  const parts = [...new Set(flow.map((item) => PART[item]))];
  const card = CARDS.find((item) => item.id === step);
  const progressLabel = flowIndex >= 0 ? (card ? `${PART[step as Flow]} · ${card.label}` : PART[step as Flow]) : '';
  /** The card switch above each Personalize card's heading; moving left slides in from the left. */
  const cardSwitch = card ? (
    <View style={local.cardSwitch}>
      <Segmented
        label="Personalize"
        options={CARDS}
        value={card.id}
        onChange={(target) => {
          hapticSelection();
          const forward = CARDS.findIndex((item) => item.id === target) > CARDS.indexOf(card);
          go(target);
          if (!forward) {
            setDirection('back');
          }
        }}
      />
    </View>
  ) : null;
  const askingAgain = step === 'access' && (after !== null || access === 'later');
  const inFlow = !quick && flowIndex >= 0 && !askingAgain;
  const tracks = library?.tracks ?? [];
  const status =
    mode === 'replay' || access !== 'granted' || step === 'denied'
      ? null
      : !library
        ? 'scanning'
        : foundOn === step
          ? `Found ${library.tracks.length.toLocaleString('en-US')} songs`
          : null;

  if (step === 'welcome') {
    return (
      <Welcome
        accent={props.accent}
        onSetUp={() => go('access')}
        onQuickStart={() => {
          setQuick(true);
          go('access');
        }}
      />
    );
  }

  const shared = { ...props, tracks };
  // Steps with a preview pin it under the top bar, so every change shows while the options scroll under it.
  let heading: ReactNode = null;
  let pinned: ReactNode = null;
  let body: ReactNode;
  let footer: ReactNode;
  const nextButton = (label = 'Next') => <MainButton label={label} busy={isFinishing} onPress={next} />;
  switch (step) {
    case 'access':
      body = <AccessStep again={askingAgain} />;
      footer = (
        <>
          <MainButton label="Allow access" busy={isAsking} onPress={askForAccess} />
          {mode === 'first' && !quick && !askingAgain && (
            <TextButton
              label="Not now"
              onPress={() => {
                setAccess('later');
                go('look');
              }}
            />
          )}
        </>
      );
      break;
    case 'denied':
      body = <DeniedStep />;
      footer = (
        <>
          <MainButton label="Open Settings" onPress={props.onOpenAppSettings} />
          <TextButton label="Try again" onPress={askForAccess} />
        </>
      );
      break;
    case 'look':
      heading = <Heading title="Pick your look" text="Start from a base, then make it yours. Muse changes as you tap." />;
      pinned = <LookPhone tracks={tracks} />;
      body = <LookStep {...shared} />;
      footer = nextButton();
      break;
    case 'player':
      heading = <Heading title="Choose your player" text="Swipe to try each one. They all have the same controls, lyrics and Up Next." />;
      pinned = <PlayerPicker tracks={tracks} />;
      body = <PlayerArtwork />;
      footer = nextButton();
      break;
    case 'you':
      heading = <Heading title="Make it yours" text="All of this is optional and stays on this phone." />;
      pinned = <GreetingPreview goalLabel={props.goalMinutes > 0 ? formatListeningTime(props.goalMinutes * 60) : null} />;
      body = <YouStep goalMinutes={props.goalMinutes} onChangeGoal={props.onChangeGoal} />;
      footer = nextButton();
      break;
    case 'folders':
      body = <FoldersStep {...shared} />;
      footer = nextButton();
      break;
    case 'tour':
      body = null;
      break;
  }

  return (
    <View style={[local.screen, { backgroundColor: tokens.bg }]}>
      {step === 'tour' ? (
        <TourStep
          key="tour"
          tracks={tracks}
          topInset={insets.top}
          bottomInset={insets.bottom}
          status={status}
          busy={isFinishing}
          onDone={finish}
        />
      ) : (
        <Animated.View
          key={step}
          entering={(direction === 'forward' ? FadeInRight : FadeInLeft).duration(240)}
          style={local.flex}
        >
          {/* Starts under the top bar, so a pinned preview sticks just below it. */}
          <ScrollView
            ref={scroller}
            style={[local.flex, { marginTop: insets.top + TOP_BAR }]}
            contentContainerStyle={[local.content, { paddingTop: 16, paddingBottom: insets.bottom + 168 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            stickyHeaderIndices={pinned ? [1] : undefined}
            scrollEventThrottle={64}
            onLayout={(event) => {
              scrollBox.current = { ...scrollBox.current, y: 0, view: event.nativeEvent.layout.height };
              checkMore();
            }}
            onContentSizeChange={(_, contentHeight) => {
              scrollBox.current.content = contentHeight;
              checkMore();
            }}
            onScroll={(event) => {
              scrollBox.current.y = event.nativeEvent.contentOffset.y;
              checkMore();
            }}
          >
            {heading ? (
              <View>
                {cardSwitch}
                {heading}
              </View>
            ) : null}
            {pinned ? <View style={[local.pinned, { backgroundColor: tokens.bg }]}>{pinned}</View> : null}
            <View>{body}</View>
          </ScrollView>
          <Footer bottomInset={insets.bottom} status={status} onMore={moreBelow ? showMore : null}>
            {footer}
          </Footer>
        </Animated.View>
      )}
      <TopBar
        topInset={insets.top}
        onBack={back}
        progress={inFlow ? { index: parts.indexOf(PART[step as Flow]), count: parts.length, label: progressLabel } : null}
        onSkip={inFlow ? skipRest : null}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Frame: top bar, footer, buttons, step heading.

function TopBar({
  topInset,
  onBack,
  progress,
  onSkip,
}: {
  topInset: number;
  onBack: () => void;
  progress: { index: number; count: number; label: string } | null;
  onSkip: (() => void) | null;
}) {
  const tokens = useTokens();
  return (
    // Back, the bar and Skip share one center line; the label hangs under the bar so it never shifts it.
    <View style={[local.topBar, { paddingTop: topInset, height: topInset + TOP_BAR, backgroundColor: tokens.bg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [local.backChip, { backgroundColor: tokens.card }, pressed && local.pressed]}
      >
        <Ionicons accessible={false} name="chevron-back" size={opticalSize('chevron-back', 20)} color={tokens.text} />
      </Pressable>
      {progress ? (
        <View style={local.progressColumn}>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`Step ${progress.index + 1} of ${progress.count}, ${progress.label}`}
            accessibilityValue={{ min: 1, max: progress.count, now: progress.index + 1 }}
            style={local.progress}
          >
            {Array.from({ length: progress.count }, (_, index) => (
              <View key={index} style={[local.progressPart, { backgroundColor: index <= progress.index ? tokens.accent : tokens.line }]} />
            ))}
          </View>
          {/* Where you are and how far: "2 of 4 · Personalize · Player". */}
          <Text numberOfLines={1} style={[local.progressLabel, { color: tokens.muted }]}>
            {`${progress.index + 1} of ${progress.count} · ${progress.label}`}
          </Text>
        </View>
      ) : (
        <View style={local.flex} />
      )}
      {onSkip && (
        <Pressable
          accessibilityRole="button"
          hitSlop={6}
          onPress={onSkip}
          style={({ pressed }) => [local.skip, { backgroundColor: tokens.card }, pressed && local.pressed]}
        >
          <Text style={[local.skipLabel, { color: tokens.text }]}>Skip the rest</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Same shape on every step: a quiet status line, then the main button in the same spot. */
function Footer({
  bottomInset,
  status,
  onMore = null,
  children,
}: {
  bottomInset: number;
  status: string | null;
  /** Set while options sit out of sight: a "More below" pill that scrolls to them. */
  onMore?: (() => void) | null;
  children: ReactNode;
}) {
  const tokens = useTokens();
  return (
    <View pointerEvents="box-none" style={[local.footer, { paddingBottom: bottomInset + 20, backgroundColor: tokens.bg }]}>
      {onMore ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={local.moreSpot} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options below"
            onPress={onMore}
            style={({ pressed }) => [local.morePill, { backgroundColor: tokens.card, borderColor: tokens.line }, pressed && local.pressed]}
          >
            <Text style={[local.moreLabel, { color: tokens.text }]}>More below</Text>
            <Ionicons accessible={false} name="chevron-down" size={14} color={tokens.text} />
          </Pressable>
        </Animated.View>
      ) : null}
      {/* Content fades out above the footer instead of being cut off. */}
      <Svg pointerEvents="none" style={local.footerFade} width="100%" height={24}>
        <Defs>
          <LinearGradient id="footerFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tokens.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={tokens.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="24" fill="url(#footerFade)" />
      </Svg>
      <ScanStatus status={status} />
      {children}
    </View>
  );
}

function ScanStatus({ status }: { status: string | null }) {
  const tokens = useTokens();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(status === 'scanning' ? withRepeat(withTiming(0.25, { duration: 600 }), -1, true) : 1);
  }, [pulse, status]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <View accessibilityLiveRegion="polite" style={local.status}>
      {status === 'scanning' ? (
        <>
          <Animated.View style={[local.statusDot, { backgroundColor: tokens.accent }, dotStyle]} />
          <Text style={[local.statusText, { color: tokens.muted }]}>Finding your music</Text>
        </>
      ) : status ? (
        <Text style={[local.statusText, { color: tokens.text }]}>{status}</Text>
      ) : null}
    </View>
  );
}

function MainButton({ label, onPress, busy = false }: { label: string; onPress: () => void; busy?: boolean }) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      onPress={busy ? undefined : onPress}
      style={({ pressed }) => [styles.primaryButton, local.button, pressed && styles.primaryButtonPressed]}
    >
      {busy ? (
        <ActivityIndicator color={String(styles.primaryButtonLabel.color)} />
      ) : (
        <Text style={[styles.primaryButtonLabel, local.mainLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={local.textButton}>
      <Text style={[local.textButtonLabel, { color: tokens.muted }]}>{label}</Text>
    </Pressable>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  const tokens = useTokens();
  return (
    <View style={local.heading}>
      <Text accessibilityRole="header" style={[local.title, { color: tokens.text }]}>
        {title}
      </Text>
      <Text style={[local.lead, { color: tokens.muted }]}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Steps.

function Welcome({ accent, onSetUp, onQuickStart }: { accent: Accent; onSetUp: () => void; onQuickStart: () => void }) {
  const styles = useAppStyles();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const sceneHeight = Math.round(height * 0.55);
  return (
    <Animated.View entering={FadeIn.duration(320)} style={[local.screen, { backgroundColor: tokens.bg }]}>
      <View style={[local.scene, { height: sceneHeight }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <WelcomeScene accent={tokens.accent} second={SECOND[accent][tokens.dark ? 0 : 1]} dark={tokens.dark} still={still} layoutWidth={width} />
        <Svg pointerEvents="none" style={local.sceneFade} width="100%" height={sceneHeight * 0.45}>
          <Defs>
            <LinearGradient id="sceneFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tokens.bg} stopOpacity={0} />
              <Stop offset="1" stopColor={tokens.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sceneFade)" />
        </Svg>
      </View>
      <View style={[local.welcomeBrand, { top: insets.top + 16 }]}>
        <BrandMark size={22} />
      </View>
      <View style={[local.welcomeBody, { paddingBottom: insets.bottom + 20 }]}>
        <Text accessibilityRole="header" style={[local.welcomeTitle, { color: tokens.text }]}>
          Play the music on your phone.
        </Text>
        <Text style={[local.lead, local.welcomeLead, { color: tokens.muted }]}>
          No account and no streaming. Muse finds the songs saved on this phone and keeps everything here.
        </Text>
        <View style={local.welcomeActions}>
          <MainButton label="Make it yours" onPress={onSetUp} />
          {/* Same size and text as the main button, outlined so the main one still leads. */}
          <Pressable
            accessibilityRole="button"
            onPress={onQuickStart}
            style={({ pressed }) => [local.button, local.outlined, { borderColor: tokens.line }, pressed && styles.primaryButtonPressed]}
          >
            <Text style={[styles.primaryButtonLabel, local.mainLabel, { color: tokens.text }]}>Start listening</Text>
          </Pressable>
        </View>
        <MakerCredit colors={{ text: tokens.text, muted: tokens.muted, chip: tokens.card }} style={local.credit} />
      </View>
    </Animated.View>
  );
}

function AccessStep({ again }: { again: boolean }) {
  const tokens = useTokens();
  return (
    <>
      {again ? (
        <Heading title="One last thing: your music" text="Muse needs access to show your folders and songs. You can turn it off any time in Android Settings." />
      ) : (
        <Heading title="Let Muse find your music" text="Android will ask once. Muse only reads music and audio files." />
      )}
      {/* A drawing of the popup Android shows next, so it is no surprise. */}
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[local.systemPopup, { backgroundColor: tokens.card }]}>
        <Ionicons name="musical-notes-outline" size={26} color={tokens.accent} />
        <Text style={[local.popupText, { color: tokens.text }]}>
          Allow <Text style={local.bold}>Muse</Text> to access music and audio on this device?
        </Text>
        <View style={[local.popupButton, { borderColor: tokens.accent }]}>
          <Text style={[local.popupLabel, { color: tokens.text }]}>Allow</Text>
        </View>
        <View style={[local.popupButton, { borderColor: 'transparent', backgroundColor: tokens.bg }]}>
          <Text style={[local.popupLabel, { color: tokens.muted }]}>Don&apos;t allow</Text>
        </View>
      </View>
      <Text style={[local.caption, { color: tokens.muted }]}>Tap Allow when this shows up</Text>
    </>
  );
}

function DeniedStep() {
  const tokens = useTokens();
  const steps = ['Tap Open Settings below', 'Tap Permissions', 'Tap Music and audio, then Allow'];
  return (
    <>
      <Heading title="Muse can't see your music yet" text="Turn on music access for Muse in Android Settings, then come back." />
      <View style={[local.group, { backgroundColor: tokens.card }]}>
        {steps.map((text, index) => (
          <View key={text} style={[local.numberRow, index > 0 && { borderTopColor: tokens.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[local.number, { backgroundColor: tokens.bg }]}>
              <Text style={[local.numberText, { color: tokens.text }]}>{index + 1}</Text>
            </View>
            <Text style={[local.rowText, { color: tokens.text }]}>{text}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function LookStep({
  theme,
  appearance,
  accent,
  isAmoled,
  onSelectAppearance,
  onSelectAccent,
  onToggleAmoled,
}: Props & { tracks: MusicTrack[] }) {
  const styles = useAppStyles();
  const { miniDock } = usePreferences();
  const glassChoice = useGlassChoice();
  const selected = ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0];
  return (
    <>
      <StartFrom />
      <SettingsSection title="Theme">
        <SettingsBlock icon="contrast" tint={TILE.indigo} title="Appearance">
          <Segmented label="Appearance" options={APPEARANCES} value={appearance} onChange={onSelectAppearance} />
        </SettingsBlock>
        <SettingsSwitchRow
          icon="moon"
          tint={TILE.gray}
          title="AMOLED black"
          subtitle={theme === 'dark' ? 'Pure black. Easier on battery with OLED screens.' : 'Available in dark mode'}
          value={theme === 'dark' && isAmoled}
          onValueChange={onToggleAmoled}
          accent={selected.swatch}
          disabled={theme !== 'dark'}
        />
      </SettingsSection>
      {glassChoice !== 'solid' && (
        <SettingsSection title="Mini player">
          <SettingsBlock
            icon="albums"
            tint={TILE.purple}
            title={miniDock === 'joined' ? 'Joined' : 'Floating'}
            subtitle={miniDock === 'joined' ? 'Sits on top of the tabs, in one piece of glass.' : 'Floats in its own piece of glass above the tabs.'}
          >
            <Segmented label="Mini player" options={MINI_DOCKS} value={miniDock} onChange={(value) => setPreference('miniDock', value)} />
          </SettingsBlock>
        </SettingsSection>
      )}
      <SettingsSection title="Accent color">
        <SettingsBlock icon="color-palette" tint={TILE.pink} title={selected.label}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Accent color" style={styles.prefSwatches}>
            {ACCENT_OPTIONS.map((option) => {
              const isOn = option.id === accent;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: isOn }}
                  onPress={() => {
                    if (!isOn) {
                      hapticSelection();
                      onSelectAccent(option.id);
                    }
                  }}
                  hitSlop={5}
                  style={[styles.prefSwatchButton, { borderColor: isOn ? option.swatch : 'transparent' }]}
                >
                  <View style={[styles.prefSwatch, { backgroundColor: option.swatch }]} />
                </Pressable>
              );
            })}
          </View>
        </SettingsBlock>
      </SettingsSection>
    </>
  );
}

/**
 * Choose your player's pinned part: swipe between big previews of your own
 * song (the page that settles is the skin), its name, and chips to jump.
 */
function PlayerPicker({ tracks }: { tracks: MusicTrack[] }) {
  const tokens = useTokens();
  const { playerSkin } = usePreferences();
  const { width, height } = useWindowDimensions();
  // A page is the full screen width, the same distance a swipe snaps, so every skin lands centered.
  const pageWidth = width;
  // The preview is a scaled phone (screen-shaped); about 30% of the screen tall keeps room for the options.
  const previewWidth = Math.round(Math.min(height * 0.3, 280) * (width / height));
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const index = Math.max(0, PLAYER_SKINS.findIndex((skin) => skin.id === playerSkin));
  const current = PLAYER_SKINS[index];
  const choose = (next: number) => {
    const skin = PLAYER_SKINS[next];
    if (skin && skin.id !== playerSkin) {
      hapticSelection();
      setPreference('playerSkin', skin.id);
    }
  };
  return (
    <>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * pageWidth, y: 0 }}
        onMomentumScrollEnd={(event) => choose(Math.round(event.nativeEvent.contentOffset.x / pageWidth))}
        style={local.pager}
        accessibilityLabel="Player skins"
      >
        {PLAYER_SKINS.map((skin) => (
          <View key={skin.id} style={[local.page, { width: pageWidth }]} accessible accessibilityLabel={`Preview of ${skin.label}`}>
            <SkinPreview skin={skin.id} track={tracks[0] ?? SKIN_SAMPLE} tint={null} previewWidth={previewWidth} />
          </View>
        ))}
      </ScrollView>
      <Animated.View key={current.id} entering={FadeIn.duration(180)} style={local.skinCaption}>
        <Text style={[local.skinName, { color: tokens.text }]}>{current.label}</Text>
        <Text style={[local.choiceText, { color: tokens.muted }]}>{current.hint}</Text>
      </Animated.View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Player skin" style={local.skinChips}>
        {PLAYER_SKINS.map((skin, chip) => {
          const isOn = chip === index;
          return (
            <Pressable
              key={skin.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: isOn }}
              accessibilityHint={skin.hint}
              onPress={() => {
                choose(chip);
                pager.current?.scrollTo({ x: chip * pageWidth, animated: true });
              }}
              style={[local.skinChip, { backgroundColor: isOn ? tokens.text : tokens.card }]}
            >
              <Text numberOfLines={1} style={[local.skinChipLabel, { color: isOn ? tokens.bg : tokens.text }]}>
                {skin.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/** Under the pinned player: covers, and the Muse art that songs without one get. */
function PlayerArtwork() {
  const tokens = useTokens();
  const { artworkStyle, artSet } = usePreferences();
  return (
    <>
      <SettingsSection
        title="Artwork"
        footer={artworkStyle === 'generated' ? 'Muse art for every song, even ones with a cover.' : 'Covers come from your song files. Songs without one get Muse art.'}
      >
        <SettingsBlock icon="image" tint={TILE.orange} title="Song covers">
          <Segmented label="Song covers" options={ARTWORK_STYLES} value={artworkStyle} onChange={(value) => setPreference('artworkStyle', value)} />
          {/* The Muse art style sits in the same block: it is what songs without a cover get. */}
          <Text style={[local.subLabel, { color: tokens.muted }]}>Muse art style</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Muse art style" style={local.arts}>
            {ART_SETS.map((set) => {
              const isOn = set.id === artSet;
              return (
                <Pressable
                  key={set.id}
                  accessibilityRole="radio"
                  accessibilityLabel={set.label}
                  accessibilityHint={set.hint}
                  accessibilityState={{ checked: isOn }}
                  onPress={() => {
                    if (!isOn) {
                      hapticSelection();
                      setPreference('artSet', set.id);
                    }
                  }}
                  style={local.art}
                >
                  <View style={[local.artTile, { borderColor: isOn ? tokens.text : 'transparent' }]}>
                    <MuseArtTile name="Night Crossings" set={set.id} size={48} radius={9} />
                  </View>
                  <Text numberOfLines={1} style={[local.artLabel, { color: isOn ? tokens.text : tokens.muted }]}>
                    {set.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SettingsBlock>
      </SettingsSection>
    </>
  );
}

/**
 * The first choice on Pick your look, since it sets the base the rest builds
 * on: the full Muse look (glass bar, best covers, cover colors) or Save
 * battery (solid bar, simpler covers). The finer switches live in Settings.
 */
function StartFrom() {
  const tokens = useTokens();
  const preferences = usePreferences();
  const glassChoice = useGlassChoice();
  const matches = (look: typeof SAVER | typeof DEFAULT_LOOK) =>
    (Object.keys(look) as (keyof typeof look)[]).every((key) => preferences[key] === look[key]);
  const isDefault = glassChoice !== 'solid' && matches(DEFAULT_LOOK);
  const isSaver = glassChoice === 'solid' && matches(SAVER);
  const apply = (look: typeof SAVER | typeof DEFAULT_LOOK, glass: 'blur' | 'solid') => {
    hapticSelection();
    setGlassChoice(glass);
    (Object.keys(look) as (keyof typeof look)[]).forEach((key) => setPreference(key, look[key]));
  };
  const card = (isOn: boolean, solid: boolean, title: string, text: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isOn }}
      accessibilityHint={text}
      onPress={onPress}
      style={[local.choice, local.choiceHalf, { backgroundColor: tokens.card, borderColor: isOn ? tokens.text : 'transparent' }]}
    >
      {/* A tiny drawing of the tab bar each one gives: floating glass, or solid on the edge. */}
      <View style={[local.barSample, { backgroundColor: tokens.bg }]} accessible={false}>
        <View
          style={[
            solid ? local.barSolid : local.barGlass,
            { backgroundColor: solid ? tokens.line : tokens.card, borderColor: tokens.line },
          ]}
        />
      </View>
      <View style={local.startTitleRow}>
        <Ionicons accessible={false} name={solid ? 'battery-half-outline' : 'sparkles-outline'} size={15} color={tokens.accent} />
        <Text style={[local.choiceTitle, { color: tokens.text }]}>{title}</Text>
      </View>
      <Text style={[local.choiceText, { color: tokens.muted }]}>{text}</Text>
    </Pressable>
  );
  return (
    <>
      <Text style={[local.label, local.firstLabel, { color: tokens.muted }]}>Start from</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Start from" style={local.pairTight}>
        {card(isDefault, false, 'Muse default', 'Glass bar, best covers, cover colors', () => apply(DEFAULT_LOOK, 'blur'))}
        {card(isSaver, true, 'Save battery', 'Solid bar, simpler covers. Lighter on older phones', () => apply(SAVER, 'solid'))}
      </View>
      {!isDefault && !isSaver && (
        <Text style={[local.caption, local.left, { color: tokens.muted }]}>Your own mix from Settings. Pick one to start again.</Text>
      )}
    </>
  );
}

function YouStep({ goalMinutes, onChangeGoal }: { goalMinutes: number; onChangeGoal: (minutes: number) => void }) {
  const styles = useAppStyles();
  const tokens = useTokens();
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [photoError, setPhotoError] = useState('');
  // Surprise me picks a character only until a picture is chosen: one set before this step opened, or a tap here.
  const pictureChosen = useRef(profile.photoUri !== null || profile.preset >= 0);
  // Both are Android's own pickers: Muse gets only the one picture chosen, so no permission is asked.
  const pickPicture = async (from: 'photos' | 'files') => {
    setPhotoError('');
    try {
      const uri =
        from === 'photos'
          ? await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.85 }).then((result) =>
              result.canceled ? null : (result.assets[0]?.uri ?? null),
            )
          : await getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true }).then((result) =>
              result.canceled ? null : (result.assets[0]?.uri ?? null),
            );
      if (uri) {
        await setProfilePhoto(uri);
        pictureChosen.current = true;
      }
    } catch {
      setPhotoError('Could not use that picture. Please try another one.');
    }
  };
  // Read by each shuffle of the roll, so every pick differs from the one before it.
  const lastName = useRef(name);
  const surprise = (final: boolean) => {
    const next = funkyName(lastName.current);
    lastName.current = next;
    setName(next);
    if (final) {
      setProfileName(next);
    }
    // A matching random avatar too, until they choose a picture themselves.
    if (!pictureChosen.current) {
      setProfilePreset(Math.floor(Math.random() * PRESETS.length));
    }
  };
  const isPhoto = Boolean(profile.photoUri);
  return (
    <>
      <Text style={[local.label, local.firstLabel, { color: tokens.muted }]}>Your name</Text>
      <View style={local.nameRow}>
        <TextInput
          accessibilityLabel="Your name"
          value={name}
          maxLength={NAME_LIMIT}
          autoComplete="given-name"
          placeholder="Used in the Home greeting"
          placeholderTextColor={tokens.muted}
          returnKeyType="done"
          onChangeText={(text) => {
            setName(text);
            lastName.current = text;
            setProfileName(text.trim());
          }}
          style={[styles.sheetInput, local.input, local.nameInput]}
        />
        <SurpriseButton
          onRoll={surprise}
          color={tokens.accent}
          label="Surprise me"
          labelColor={tokens.text}
          style={[local.surprise, { backgroundColor: tokens.card }]}
        />
      </View>
      <Text style={[local.label, { color: tokens.muted }]}>Picture</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Picture" style={local.avatars}>
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel="No picture"
          accessibilityState={{ checked: profile.preset < 0 && !isPhoto }}
          onPress={() => {
            hapticSelection();
            pictureChosen.current = true;
            clearProfileImage();
          }}
          style={[local.avatarCell, { backgroundColor: tokens.card, borderColor: profile.preset < 0 && !isPhoto ? tokens.text : 'transparent' }]}
        >
          <Text style={[local.avatarNone, { color: tokens.muted }]}>None</Text>
        </Pressable>
        {PRESETS.map((preset, index) => {
          const isOn = !isPhoto && profile.preset === index;
          return (
            <Pressable
              key={preset.name}
              accessibilityRole="radio"
              accessibilityLabel={preset.name}
              accessibilityState={{ checked: isOn }}
              onPress={() => {
                hapticSelection();
                pictureChosen.current = true;
                setProfilePreset(index);
              }}
              style={[local.avatarCell, { borderColor: isOn ? tokens.text : 'transparent' }]}
            >
              <Avatar profile={{ preset: index, photoUri: null }} size={48} />
            </Pressable>
          );
        })}
        {isPhoto ? (
          <View accessibilityRole="radio" accessibilityLabel="Your picture" accessibilityState={{ checked: true }} style={[local.avatarCell, { borderColor: tokens.text }]}>
            <Avatar profile={profile} size={48} />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick from Photos"
          onPress={() => void pickPicture('photos')}
          style={({ pressed }) => [local.avatarCell, { backgroundColor: tokens.card, borderColor: 'transparent' }, pressed && local.pressed]}
        >
          <Ionicons accessible={false} name="images-outline" size={21} color={tokens.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick from Files"
          onPress={() => void pickPicture('files')}
          style={({ pressed }) => [local.avatarCell, { backgroundColor: tokens.card, borderColor: 'transparent' }, pressed && local.pressed]}
        >
          <Ionicons accessible={false} name="folder-open-outline" size={21} color={tokens.text} />
        </Pressable>
      </View>
      <Text style={[local.caption, local.left, { color: tokens.muted }]}>
        {photoError || 'Or pick your own from Photos or Files. Muse only sees the picture you choose.'}
      </Text>
      <Text style={[local.label, { color: tokens.muted }]}>Daily listening goal</Text>
      <GoalPicker goalMinutes={goalMinutes} onChange={onChangeGoal} />
      <Text style={[local.caption, local.left, { color: tokens.muted }]}>Home shows how close you are each day.</Text>
    </>
  );
}

function FoldersStep({
  library,
  blockedFolderIds,
  onToggleFolder,
  onIncludeAllFolders,
  accent,
}: Props & { tracks: MusicTrack[] }) {
  const tokens = useTokens();
  const swatch = (ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]).swatch;
  const folders = library?.folders ?? [];
  const kept = folders.filter((folder) => !blockedFolderIds.includes(folder.id));
  const songs = kept.reduce((sum, folder) => sum + folder.trackCount, 0);
  return (
    <>
      <Heading title="Choose your folders" text="Muse plays songs from the folders you keep on. You can change this in Settings." />
      {!library ? (
        <View style={local.waiting}>
          <ActivityIndicator color={tokens.accent} />
          <Text style={[local.caption, { color: tokens.muted }]}>Still finding your music</Text>
        </View>
      ) : folders.length === 0 ? (
        <Text style={[local.caption, local.left, { color: tokens.muted }]}>No music found yet. Add songs to your phone, then rescan from Settings.</Text>
      ) : (
        <>
          <View style={local.folderSummary}>
            <Text style={[local.rowText, { color: tokens.muted }]}>
              <Text style={{ color: tokens.text }}>{songs.toLocaleString('en-US')} songs</Text> · {kept.length} of {folders.length} folders on
            </Text>
            {blockedFolderIds.length > 0 && (
              <Pressable accessibilityRole="button" onPress={onIncludeAllFolders} style={local.linkButton}>
                <Text style={[local.link, { color: tokens.accent }]}>Turn all on</Text>
              </Pressable>
            )}
          </View>
          <SettingsSection>
            {folders.map((folder) => (
              <SettingsSwitchRow
                key={folder.id}
                icon="folder"
                tint={TILE.blue}
                title={folder.title}
                subtitle={`${folder.trackCount.toLocaleString('en-US')} ${folder.trackCount === 1 ? 'song' : 'songs'}`}
                value={!blockedFolderIds.includes(folder.id)}
                onValueChange={() => onToggleFolder(folder.id)}
                accent={swatch}
              />
            ))}
          </SettingsSection>
        </>
      )}
    </>
  );
}

const TOUR = [
  {
    title: 'Move around with gestures',
    lines: [
      'Swipe left or right to switch tabs.',
      'Tap the song above the tabs to open the full player.',
      'Swipe a song right to play it next, or left to add it to the queue.',
      'Press and hold a song to select several.',
    ],
  },
  {
    title: 'Make the player yours',
    lines: ['Lyrics and Up Next sit right under the controls.', 'Tap the moon to set a sleep timer.', 'Change the player skin in Settings any time.'],
  },
  {
    title: 'Home fills up as you listen',
    lines: ['Mixes are made from what you play.', 'Each week gets a short recap you can share.', 'Tap Customize to choose and order your widgets.'],
  },
  {
    title: 'Keep your library tidy',
    lines: ['Sort any list. Muse remembers how you left it.', "Change a song's cover from its menu.", 'Make playlists and keep Favorites in Collections.'],
  },
];

function TourStep({
  tracks,
  topInset,
  bottomInset,
  status,
  busy,
  onDone,
}: {
  tracks: MusicTrack[];
  topInset: number;
  bottomInset: number;
  status: string | null;
  busy: boolean;
  onDone: () => void;
}) {
  const tokens = useTokens();
  const { width } = useWindowDimensions();
  const { miniDock } = usePreferences();
  const glassChoice = useGlassChoice();
  const [card, setCard] = useState(0);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const show = (index: number) => {
    setCard(index);
    pager.current?.scrollTo({ x: index * width, animated: true });
  };
  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => setCard(Math.round(event.nativeEvent.contentOffset.x / width));
  const lines = (index: number) =>
    index === 0 && (glassChoice === 'solid' || miniDock === 'floating')
      ? TOUR[0].lines.map((line, at) => (at === 1 ? 'Tap the mini player to open the full player.' : line))
      : TOUR[index].lines;
  return (
    <Animated.View entering={FadeInRight.duration(240)} style={local.flex}>
      <ScrollView style={local.flex} contentContainerStyle={{ paddingTop: topInset + 72, paddingBottom: bottomInset + 168 }} showsVerticalScrollIndicator={false}>
        <View style={local.content}>
          <Heading title="How Muse works" text="Four quick things worth knowing." />
        </View>
        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onSettle}>
          {TOUR.map((item, index) => (
            <View key={item.title} accessible accessibilityLabel={`${index + 1} of 4: ${item.title}. ${lines(index).join(' ')}`} style={[local.card, { width }]}>
              <View importantForAccessibility="no-hide-descendants">
                {index === 0 && <GestureDemo active={card === 0} tracks={tracks} />}
                {index === 1 && <PlayerDemo active={card === 1} />}
                {index === 2 && <HomeDemo active={card === 2} />}
                {index === 3 && <LibraryDemo active={card === 3} tracks={tracks} />}
                <Text style={[local.cardTitle, { color: tokens.text }]}>{item.title}</Text>
                {lines(index).map((line) => (
                  <View key={line} style={local.bullet}>
                    <View style={[local.bulletDot, { backgroundColor: tokens.muted }]} />
                    <Text style={[local.bulletText, { color: tokens.muted }]}>{line}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={local.dots}>
          {TOUR.map((item, index) => (
            <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={`Card ${index + 1} of 4`} onPress={() => show(index)} style={local.dotHit}>
              <View style={[local.dot, { backgroundColor: index === card ? tokens.text : tokens.line, width: index === card ? 20 : 8 }]} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Footer bottomInset={bottomInset} status={status}>
        <MainButton label={card < 3 ? 'Next' : 'Start listening'} busy={busy} onPress={() => (card < 3 ? show(card + 1) : onDone())} />
      </Footer>
    </Animated.View>
  );
}

const local = StyleSheet.create({
  screen: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24 },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  // A round soft chip, the same height the bar's line sits in the middle of.
  backChip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // 40dp tall like the chips, the bar in its middle; the label hangs below without moving it.
  progressColumn: { flex: 1, height: 40, justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 4 },
  progressLabel: { position: 'absolute', left: 0, right: 0, top: 27, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cardSwitch: { marginBottom: 18 },
  progressPart: { flex: 1, height: 4, borderRadius: 2 },
  skip: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center' },
  skipLabel: { fontSize: 13, fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24 },
  footerFade: { position: 'absolute', left: 0, right: 0, top: -24 },
  status: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 13 },
  button: { minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // Onboarding's big buttons; the theme still gives the on-accent color.
  mainLabel: { fontSize: 16 },
  outlined: { borderWidth: 1.5 },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
  heading: { marginBottom: 4 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 },
  lead: { marginTop: 8, fontSize: 15, lineHeight: 22, maxWidth: 340 },
  label: { marginTop: 24, marginBottom: 10, marginLeft: 4, fontSize: 13, fontWeight: '600' },
  caption: { marginTop: 10, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  left: { textAlign: 'left', marginLeft: 4 },
  bold: { fontWeight: '700' },
  // Welcome
  scene: { position: 'absolute', left: 0, right: 0, top: 0 },
  sceneFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  welcomeBrand: { position: 'absolute', left: 24 },
  welcomeBody: { position: 'absolute', left: 24, right: 24, bottom: 0 },
  welcomeTitle: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.9 },
  welcomeLead: { marginTop: 10, maxWidth: 320 },
  // A clear gap between the words and the buttons lifts the text and splits the page into two groups.
  welcomeActions: { marginTop: 40, gap: 10 },
  // Its own breathing room, so the credit reads as a footer and not part of the hint above.
  credit: { marginTop: 32 },
  // Access and denied
  systemPopup: { marginTop: 24, borderRadius: 24, padding: 20, alignItems: 'center' },
  popupText: { marginTop: 12, marginBottom: 16, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  popupButton: { alignSelf: 'stretch', height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  popupLabel: { fontSize: 14, fontWeight: '600' },
  group: { marginTop: 24, borderRadius: 14, paddingHorizontal: 16 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 13, fontWeight: '700' },
  rowText: { flex: 1, fontSize: 15, fontWeight: '500' },
  // Player
  // Choose your player: a pager of big previews, the name, dots, then chips.
  pager: { marginHorizontal: -24 },
  page: { alignItems: 'center' },
  skinCaption: { marginTop: 10, alignItems: 'center', gap: 2 },
  skinName: { fontSize: 18, fontWeight: '700' },
  skinChips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  skinChip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  skinChipLabel: { fontSize: 13, fontWeight: '600' },
  subLabel: { marginTop: 14, fontSize: 12, fontWeight: '600' },
  // Start from: two cards, each with a tiny drawing of its tab bar.
  pairTight: { flexDirection: 'row', gap: 8 },
  barSample: { height: 34, borderRadius: 9, justifyContent: 'flex-end', overflow: 'hidden', marginBottom: 8 },
  barGlass: { height: 14, marginHorizontal: 10, marginBottom: 5, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
  barSolid: { height: 12 },
  startTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Make it yours: the name field with Surprise me beside it.
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1 },
  surprise: { minHeight: 52, borderRadius: 14, paddingHorizontal: 12 },
  pressed: { opacity: 0.7 },
  // The pinned preview: full width background so options scroll cleanly under it.
  pinned: { marginHorizontal: -24, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 },
  firstLabel: { marginTop: 4 },
  moreSpot: { position: 'absolute', left: 0, right: 0, top: -44, alignItems: 'center' },
  morePill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  moreLabel: { fontSize: 13, fontWeight: '600' },
  choice: { borderRadius: 14, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  choiceHalf: { flex: 1, justifyContent: 'center' },
  choiceTitle: { fontSize: 15, fontWeight: '600' },
  choiceText: { fontSize: 13, lineHeight: 17 },
  arts: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
  art: { alignItems: 'center', gap: 6, minWidth: 52 },
  artTile: { borderWidth: 2, borderRadius: 12, padding: 1 },
  artLabel: { fontSize: 12 },
  // Battery
  pair: { marginTop: 16, flexDirection: 'row', gap: 8 },
  // You
  input: { minHeight: 52, fontSize: 16 },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarCell: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarNone: { fontSize: 12, fontWeight: '600' },
  // Folders
  waiting: { marginTop: 40, alignItems: 'center' },
  folderSummary: { marginTop: 20, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  link: { fontSize: 14, fontWeight: '600' },
  // Tour
  card: { paddingHorizontal: 24, paddingTop: 20 },
  cardTitle: { marginTop: 20, marginBottom: 6, fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  bullet: { flexDirection: 'row', gap: 10, marginTop: 6 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 21 },
  dots: { marginTop: 12, flexDirection: 'row', justifyContent: 'center', gap: 2 },
  dotHit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4 },
});
