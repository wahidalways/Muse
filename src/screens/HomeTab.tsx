import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SettingsRow, SettingsSection } from '../components/SettingsList';
import { setPreference, usePreferences } from '../settings/preferences';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { MusicTrack, ListeningEvent, MusicFolder } from '../types';
import {
  computeStats,
  dayKey,
  getLibraryCoverage,
  getRecentTracks,
  getStreaks,
  getWeek,
} from '../history/stats';
import { getMixes } from '../history/mixes';
import { useToday } from '../history/useToday';
import { useFavoriteIds } from '../library/favorites';
import { markGoalCelebrated, openRecapCard, markRecapSeen, usePulse } from '../settings/pulse';
import { getPlaybackController } from '../playback/PlaybackController';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT } from '../motion/motion';
import { hapticSuccess } from '../utils/haptics';
import { PulseBoard, type DetailRequest } from './pulse/PulseBoard';
import { CustomizeSheet } from './pulse/CustomizeSheet';
import { DetailSheet } from './pulse/DetailSheet';
import { RecapStory, recapCard, useRecap } from './pulse/RecapStory';
import { ProfileSheet } from './pulse/ProfileSheet';
import { ShareSheet } from './pulse/ShareSheet';
import { Avatar } from '../components/Avatar';
import { BrandMark } from '../components/Brand';
import { RollingLine, RollingText } from '../components/RollingText';
import { greetingParts } from '../utils/greeting';
import { useProfile } from '../settings/profile';
import { RevealContext, RevealView, RiseIn } from './pulse/reveal';

/**
 * Home: your listening at a glance, as a board of widgets you can show,
 * hide, reorder and resize. Its entrance plays once per launch, not on every
 * tab switch, and only once it is really on screen.
 *
 * Battery: nothing loops unless it shows something live (the spinning record,
 * playing bars) and Home is on screen; live numbers step every 15 s, not
 * every frame; every entrance plays once and stops.
 */
let hasPlayedIntro = false;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/** A load quicker than this never shows the skeleton. */
const SKELETON_DELAY_MS = 300;
/** How often live numbers step while a song plays. */
const LIVE_STEP_MS = 15_000;
/** The large title folds into the compact bar over this stretch of scroll. */
const COLLAPSE_FROM = 60;
const COLLAPSE_OVER = 50;

// Memoized: the app's other state (search, library, player sheet) does not redraw Home.
/** Settings › Listening › Pause history leaves a reminder here, so it is never forgotten. */
function HistoryPausedNote() {
  const { historyPaused } = usePreferences();
  if (!historyPaused) {
    return null;
  }
  return (
    <SettingsSection large>
      <SettingsRow
        icon="pause"
        tint="#8E8E93"
        title="History is paused"
        subtitle="Plays are not counted toward stats, your goal or mixes. Tap to resume."
        chevron={false}
        onPress={() => setPreference('historyPaused', false)}
        accessibilityHint="Turns listening history back on"
      />
    </SettingsSection>
  );
}

export const HomeTab = memo(function HomeTab({
  trackCount,
  tracks,
  folders,
  blockedFolderIds,
  tracksById,
  history: liveHistory,
  historyLoaded,
  historyError,
  playbackError,
  currentTrack,
  isPlaying,
  queueSource,
  revealed,
  active,
  contentContainerStyle,
  onBarScroll,
  onPlayTrack,
  onPlayMix,
  onPlayFromList,
  onOpenPlayer,
  onOpenStats,
  goalMinutes,
  onChangeGoal,
  onRefresh,
  isLoading,
}: {
  trackCount: number;
  /** Playable songs in included folders. */
  tracks: MusicTrack[];
  folders: MusicFolder[];
  blockedFolderIds: string[];
  tracksById: Map<string, MusicTrack>;
  /** Plays, already without hidden folders. */
  history: ListeningEvent[];
  historyLoaded: boolean;
  historyError: string;
  playbackError: string;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  /** What the queue was started from, such as a mix's title. */
  queueSource: string | null;
  /** Home is the page on screen and the launch screen has gone. */
  revealed: boolean;
  /** Home can be seen right now (not under the player, another tab or the background). */
  active: boolean;
  contentContainerStyle: StyleProp<ViewStyle>;
  /** The glass bar's shrink-on-scroll, fed a position now and then. */
  onBarScroll: (y: number, contentHeight: number, viewHeight: number) => void;
  onPlayTrack: (track: MusicTrack) => void;
  onPlayMix: (tracks: MusicTrack[], shuffle: boolean, source?: string) => void;
  onPlayFromList: (track: MusicTrack, list: MusicTrack[], source: string) => void;
  onOpenPlayer: () => void;
  onOpenStats: () => void;
  goalMinutes: number;
  onChangeGoal: (minutes: number) => void;
  onRefresh: () => void;
  isLoading: boolean;
}) {
  const styles = useAppStyles();
  const [playIntro] = useState(() => !hasPlayedIntro);
  const scrollY = useSharedValue(0);
  const isRevealed = useSharedValue(revealed);
  useEffect(() => {
    isRevealed.set(revealed);
    if (revealed) {
      hasPlayedIntro = true;
    }
  }, [isRevealed, revealed]);
  const reveal = useMemo(() => ({ scrollY, revealed: isRevealed, playIntro }), [isRevealed, playIntro, scrollY]);

  // Scroll runs on the UI thread (the compact bar follows it); the glass bar
  // only hears about it every few points.
  const lastSent = useSharedValue(-1000);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      scrollY.set(y);
      if (Math.abs(y - lastSent.get()) >= 6 || y <= 0) {
        lastSent.set(y);
        scheduleOnRN(onBarScroll, y, event.contentSize.height, event.layoutMeasurement.height);
      }
    },
  });

  const favorites = useFavoriteIds();
  const { board, weekStart, recapSeen, recapOpen, goalCelebrated } = usePulse();
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [detail, setDetail] = useState<DetailRequest | null>(null);
  const profile = useProfile();
  const name = profile.name.trim();
  // Stats rebuild at low priority, so a new song's title and button show
  // first and the numbers catch up a moment later.
  const history = useDeferredValue(liveHistory);
  const goalSeconds = goalMinutes * 60;
  // Rebuilds the stats when the day turns, even with no new play.
  const today = useToday();

  const data = useMemo(() => {
    const lookup = (id: string) => tracksById.get(id);
    const month = computeStats(history, '30d', lookup);
    const week = getWeek(history, lookup, weekStart);
    // The top artist's albums, one cover each, so the tile shows the artist rather than one song.
    const topArtist = month.topArtists[0]?.name;
    const albums = new Map<string, MusicTrack>();
    tracks.forEach((track) => {
      const album = track.album || track.title;
      if (topArtist && track.artist === topArtist && !albums.has(album)) {
        albums.set(album, track);
      }
    });
    return {
      week,
      month,
      artistAlbums: [...albums.values()],
      goalSeconds,
      // Today is the week's last day so far (later days are null).
      todaySeconds: week.days.filter((day) => day.seconds !== null).at(-1)?.seconds ?? 0,
      streak: getStreaks(history),
      coverage: getLibraryCoverage(history, tracks),
      recent: getRecentTracks(history, 12),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today`: the stats read the clock, so they rebuild when the day turns.
  }, [goalSeconds, history, today, tracks, tracksById, weekStart]);
  // Apart from the stats, so liking a song only rebuilds the mixes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `today`, as above.
  const mixes = useMemo(() => getMixes(history, tracks, favorites), [favorites, history, today, tracks]);
  const boardData = useMemo(() => ({ ...data, mixes }), [data, mixes]);

  const live = useLiveSeconds(liveHistory, currentTrack, isPlaying, active);

  // The goal moment: once a day, when the goal is reached while Home is open.
  const [goalMoment, setGoalMoment] = useState(0);
  const goalMet = goalSeconds > 0 && data.todaySeconds + live >= goalSeconds;
  const wasMet = useRef<boolean | null>(null);
  useEffect(() => {
    if (!historyLoaded) {
      return;
    }
    const before = wasMet.current;
    wasMet.current = goalMet;
    const today = dayKey(Date.now());
    if (before === false && goalMet && active && goalCelebrated !== today) {
      hapticSuccess();
      markGoalCelebrated(today);
      setGoalMoment((count) => count + 1);
    }
  }, [active, goalCelebrated, goalMet, historyLoaded]);

  // A new best streak gets a success tick when it happens.
  const isNewBest = data.streak.previousBest > 0 && data.streak.current > data.streak.previousBest;
  const wasNewBest = useRef<boolean | null>(null);
  useEffect(() => {
    if (!historyLoaded) {
      return;
    }
    if (wasNewBest.current === false && isNewBest && active) {
      hapticSuccess();
    }
    wasNewBest.current = isNewBest;
  }, [active, historyLoaded, isNewBest]);

  const recap = useRecap(history, tracksById, goalSeconds, weekStart);
  // Built once per recap, not on every render (the live listening time ticks every 15 s).
  const recapShare = useMemo(
    () => (recap ? recapCard(recap, tracksById, goalSeconds) : null),
    [goalSeconds, recap, tracksById],
  );

  // The skeleton only comes when loading is still going a moment after Home shows.
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    if (historyLoaded || !revealed) {
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [historyLoaded, revealed]);

  const hiddenFolderCount = folders.filter((folder) => blockedFolderIds.includes(folder.id)).length;
  // The mini player has no room for errors, so Home says them here instead of the date.
  const notice = playbackError || (!historyLoaded ? 'Loading your listening...' : historyError);
  const openProfile = useCallback(() => setIsProfileOpen(true), []);
  // Stable, so the memoized cards only redraw when their own numbers change.
  const openCustomize = useCallback(() => setIsCustomizing(true), []);
  const openRecap = useCallback(() => {
    if (recap) {
      markRecapSeen(recap.key);
      setIsRecapOpen(true);
    }
  }, [recap]);
  const onFoldRecap = useCallback((folded: boolean) => recap && openRecapCard(folded ? null : recap.key), [recap]);
  const helloText = greetingText(name);
  // Only built while a sheet is open, so a live tick with no sheet costs nothing here.
  const detailContext = useMemo(
    () => ({
      history,
      tracks,
      tracksById,
      weekStart,
      data: boardData,
      live,
      goalMoment,
      currentTrack,
      isPlaying,
      queueSource,
      onPlayMix,
      onPlayFromList,
      onPlayTrack,
      onOpenPlayer,
      onOpenStats,
      onChangeGoal,
    }),
    [boardData, currentTrack, goalMoment, history, isPlaying, live, onChangeGoal, onOpenPlayer, onOpenStats, onPlayFromList, onPlayMix, onPlayTrack, queueSource, tracks, tracksById, weekStart],
  );

  return (
    <RevealContext.Provider value={reveal}>
      <View style={styles.mainScroll}>
        <Animated.ScrollView
          style={styles.mainScroll}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View style={[styles.screenBody, styles.tabBody]}>
            {/* The logo row: the mark and your picture. Customize lives in your profile and at the end. */}
            <View style={styles.header}>
              <BrandMark />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Your profile"
                onPress={openProfile}
                hitSlop={4}
                style={styles.pulseAvatarButton}
              >
                <Avatar profile={profile} size={44} />
              </Pressable>
            </View>
            <Hello name={name} notice={notice} />
            <HistoryPausedNote />

            {historyLoaded ? (
              <>
                <PulseBoard
                  board={board}
                  data={boardData}
                  tracksById={tracksById}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  active={active}
                  live={live}
                  goalMoment={goalMoment}
                  queueSource={queueSource}
                  onPlayTrack={onPlayTrack}
                  onOpenPlayer={onOpenPlayer}
                  onOpenDetail={setDetail}
                  onCustomize={openCustomize}
                  recap={recap}
                  recapNew={recap !== null && recap.key !== recapSeen}
                  recapFolded={recap !== null && recap.key !== recapOpen}
                  onOpenRecap={openRecap}
                  onFoldRecap={onFoldRecap}
                />
                <Animated.View layout={LinearTransition.duration(320).easing(EASE_OUT)}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={openCustomize}
                    style={({ pressed }) => [styles.pulseCustomizeButton, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons accessible={false} name="options-outline" size={18} color={String(styles.pulseCustomizeText.color)} />
                    <Text style={styles.pulseCustomizeText}>Customize Home</Text>
                  </Pressable>
                  <Footer
                    trackCount={trackCount}
                    folderCount={folders.length - hiddenFolderCount}
                    hiddenFolderCount={hiddenFolderCount}
                    isLoading={isLoading}
                    onRefresh={onRefresh}
                  />
                </Animated.View>
              </>
            ) : (
              isSlow && <Skeleton />
            )}
          </View>
        </Animated.ScrollView>

        <CompactBar scrollY={scrollY} first={helloText.first} second={helloText.second} profile={profile} onOpenProfile={openProfile} />

        {recap && (
          <RecapStory
            visible={isRecapOpen}
            recap={recap}
            tracksById={tracksById}
            goalSeconds={goalSeconds}
            onPlayTrack={onPlayTrack}
            onClose={() => setIsRecapOpen(false)}
            onShare={() => {
              setIsRecapOpen(false);
              setIsSharing(true);
            }}
          />
        )}
        {recapShare && (
          <ShareSheet
            visible={isSharing}
            title="Share your week"
            data={recapShare}
            onClose={() => setIsSharing(false)}
          />
        )}
        <ProfileSheet
          visible={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          onCustomize={() => {
            setIsProfileOpen(false);
            setIsCustomizing(true);
          }}
        />
        <CustomizeSheet visible={isCustomizing} onClose={() => setIsCustomizing(false)} />
        <DetailSheet
          request={detail}
          onClose={() => setDetail(null)}
          ctx={detailContext}
        />
      </View>
    </RevealContext.Provider>
  );
});

/**
 * Seconds heard of the song playing now that are not in the history yet, so
 * the goal, today's bar and This week move while you listen. Read every 15 s
 * while a song plays and Home is on screen, and once whenever anything changes.
 */
function useLiveSeconds(history: ListeningEvent[], currentTrack: MusicTrack | null, isPlaying: boolean, active: boolean): number {
  const [live, setLive] = useState(0);
  useEffect(() => {
    const read = () => {
      const latest = history[0];
      // The current listen is the newest event; what it already saved is counted by the stats.
      if (!currentTrack || !latest || latest.trackId !== currentTrack.id || dayKey(latest.playedAt) !== dayKey(Date.now())) {
        setLive(0);
        return;
      }
      setLive(Math.max(0, Math.floor(getPlaybackController().getListenSeconds() - (latest.listenedSeconds ?? 0))));
    };
    const first = setTimeout(read, 0);
    const timer = isPlaying && active ? setInterval(read, LIVE_STEP_MS) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active, currentTrack, history, isPlaying]);
  return live;
}

/** "Good evening," / "Wahid" as the two lines of the title, or one line without a name. */
function greetingText(name: string, hour = new Date().getHours()) {
  const hello = greetingParts(hour);
  return name
    ? { first: `${hello.before},`, second: `${name}${hello.after}`, full: `${hello.before}, ${name}${hello.after}` }
    : { first: `${hello.before}${hello.after}`, second: '', full: `${hello.before}${hello.after}` };
}

/** 9:41 PM */
function clockTime(date: Date): string {
  const hours = date.getHours();
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * The big two-line greeting, then the date and a 12-hour clock whose minutes
 * roll. On launch the lines rise in one after another; when the time of day
 * changes on screen the words roll and the name stays put. It ticks on the
 * minute by itself, so only these lines redraw.
 */
const Hello = memo(function Hello({ name, notice }: { name: string; notice: string }) {
  const styles = useAppStyles();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(timer);
  }, []);
  const hello = greetingText(name, now.getHours());
  const dateLine = [styles.homeHeroLine, { marginTop: 0 }];
  return (
    <RevealView order={0} frame={false} style={styles.pulseHelloRow}>
      <View accessible accessibilityRole="header" accessibilityLabel={hello.full}>
        <RiseIn delay={150}>
          <RollingLine text={hello.first} style={styles.pulseGreeting} />
        </RiseIn>
        {hello.second ? (
          <RiseIn delay={240}>
            <Text style={[styles.pulseGreeting, styles.pulseGreetingName]}>{hello.second}</Text>
          </RiseIn>
        ) : null}
      </View>
      <RiseIn delay={410}>
        <View style={styles.pulseDateRow}>
          {notice ? (
            <Text style={dateLine}>{notice}</Text>
          ) : (
            <>
              <Text style={dateLine}>{`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} · `}</Text>
              <RollingText text={clockTime(now)} style={dateLine} />
            </>
          )}
        </View>
      </RiseIn>
    </RevealView>
  );
});

/**
 * The bar the large title folds into once it scrolls away: the Muse bars,
 * "Good evening, Wahid" and your picture. Follows the scroll on the UI thread.
 */
const CompactBar = memo(function CompactBar({
  scrollY,
  first,
  second,
  profile,
  onOpenProfile,
}: {
  scrollY: SharedValue<number>;
  first: string;
  second: string;
  profile: ReturnType<typeof useProfile>;
  onOpenProfile: () => void;
}) {
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  const barStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (scrollY.get() - COLLAPSE_FROM) / COLLAPSE_OVER)),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - Math.min(1, Math.max(0, (scrollY.get() - COLLAPSE_FROM) / COLLAPSE_OVER))) * 8 }],
  }));
  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pulseCompact, { paddingTop: insets.top, height: insets.top + 56 }, barStyle]}
    >
      <BrandMark size={14} withName={false} />
      <Animated.Text numberOfLines={1} style={[styles.pulseCompactTitle, titleStyle]}>
        {second ? (
          <>
            {first} <Text style={styles.pulseGreetingName}>{second}</Text>
          </>
        ) : (
          first
        )}
      </Animated.Text>
      <Pressable onPress={onOpenProfile} hitSlop={6}>
        <Avatar profile={profile} size={34} />
      </Pressable>
    </Animated.View>
  );
});

function Footer({
  trackCount,
  folderCount,
  hiddenFolderCount,
  isLoading,
  onRefresh,
}: {
  trackCount: number;
  folderCount: number;
  hiddenFolderCount: number;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const styles = useAppStyles();
  return (
    <>
      <View style={styles.pulseFooterRow}>
        <Text style={styles.pulseFooter}>
          {trackCount} {trackCount === 1 ? 'song' : 'songs'} · {folderCount} folders
          {hiddenFolderCount > 0 ? ` · ${hiddenFolderCount} hidden` : ''} ·{' '}
        </Text>
        {/* Its own button, so it is big enough to tap and screen readers can reach it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLoading ? 'Scanning for new music' : 'Scan for new music'}
          accessibilityState={{ busy: isLoading, disabled: isLoading }}
          disabled={isLoading}
          onPress={onRefresh}
          hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
        >
          <Text style={[styles.pulseFooter, styles.homeLinkLabel]}>{isLoading ? 'Scanning...' : 'Scan'}</Text>
        </Pressable>
      </View>
      <Text style={styles.pulseCopyright}>© {new Date().getFullYear()} Muse</Text>
    </>
  );
}

/**
 * The page's shapes while a slow load runs: the recap, mixes, the shelf and
 * the first cards. One soft breathing fade for the whole thing (no shimmer),
 * still under Reduce Motion, and gone the moment the data is in.
 */
function Skeleton() {
  const styles = useAppStyles();
  const breath = useSharedValue(1);
  useEffect(() => {
    breath.set(withRepeat(withTiming(0.5, { duration: 1100 }), -1, true, undefined, ReduceMotion.System));
  }, [breath]);
  const breathe = useAnimatedStyle(() => ({ opacity: breath.get() }));
  const line = (width: `${number}%` | number, card = false) => (
    <View style={[card ? styles.pulseSkelCard : styles.pulseSkel, styles.pulseSkelLine, { width }]} />
  );
  return (
    <Animated.View
      exiting={FadeOut.duration(180)}
      accessible
      accessibilityLabel="Loading your listening"
      accessibilityState={{ busy: true }}
      style={[styles.pulseBoard, breathe]}
    >
      <View style={[styles.pulseTile, styles.pulseRecap]}>
        <View style={styles.pulseStorySegs}>
          {Array.from({ length: 7 }, (_, index) => (
            <View key={index} style={[styles.pulseStorySeg, { opacity: 0.25 }]} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            {line('56%', true)}
            <View style={[styles.pulseSkelCard, { width: '62%', height: 34, marginTop: 12 }]} />
            {line('80%', true)}
          </View>
          <View style={[styles.pulseSkelCard, { width: 84, height: 84, borderRadius: 14 }]} />
        </View>
      </View>
      <View style={styles.pulseOpen}>
        <Text style={styles.pulseSectionTitle}>Mixes for you</Text>
        <View style={styles.pulseMixGrid}>
          {Array.from({ length: 6 }, (_, index) => (
            <View key={index} style={{ width: '31%' }}>
              <View style={[styles.pulseSkel, { aspectRatio: 1, borderRadius: 14 }]} />
              {line('72%')}
              {line('46%')}
            </View>
          ))}
        </View>
      </View>
      <View>
        <Text style={[styles.pulseSectionTitle, styles.pulseSectionGap]}>Your listening</Text>
        <View style={[styles.pulseTile, { marginTop: 12 }]}>
          {line(72, true)}
          <View style={[styles.pulseSkelCard, { width: 128, height: 28, marginTop: 12 }]} />
          <View style={[styles.pulseSkelCard, { height: 96, marginTop: 20, borderRadius: 10 }]} />
        </View>
      </View>
    </Animated.View>
  );
}

export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  const styles = useAppStyles();
  return (
    <View style={styles.homeHeading}>
      <Text accessibilityRole="header" style={styles.homeHeadingTitle}>
        {title}
      </Text>
      {hint ? <Text style={styles.homeHeadingHint}>{hint}</Text> : null}
    </View>
  );
}
