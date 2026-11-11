import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
} from 'react';
import { isRunningInExpoGo } from 'expo';
import { hideAsync as hideSplash } from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import {
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { sidewaysDragLock } from './motion/gestureLock';
import { setBarMinimized, useBarScroll, useBarScrollAt } from './motion/barScroll';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  Extrapolation,
  FadeOutDown,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useKeyboardLift } from './components/useKeyboardLift';
import { BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import type { LibrarySort, SortDirection } from './library/sortTracks';
import { getPlaybackController, shuffleTracks } from './playback/PlaybackController';
import { settlePlayer, usePlayerTransition } from './player/playerTransition';
import {
  addAudioBecomingNoisyListener,
  addHeadphonesConnectedListener,
  getLibraryVersion,
  setAppIcon,
  takeLastCrash,
} from '../modules/muse-audio-metadata';
import { usePlayback, usePlaybackValue } from './playback/usePlayback';
import type {
  MusicTrack,
  CachedLibrary,
  LibraryView,
  ListeningEvent,
  MusicFolder,
  Screen,
  Tab,
} from './types';
import type { Accent, Appearance, Theme } from './theme/theme';
import {
  getPreferences,
  preferencesReady,
  resetPreferences,
  usePreferences,
} from './settings/preferences';
import { setWeekStart } from './settings/pulse';
import { hapticImpact, hapticSelection } from './utils/haptics';
import { BottomTabs, HideForSelection, HideWhenBarFolded } from './components/BottomTabs';
import { ToastHost, showToast } from './components/Toast';
import { ConfirmSheet, type ConfirmRequest } from './components/ConfirmSheet';
import { PageVisible, TabLayer } from './components/TabLayer';
import { setGlassChoice, useGlassStyle } from './theme/glassStyle';
import { SearchScreen } from './screens/SearchScreen';
import { LaunchScreen } from './components/LaunchScreen';
import { CloseIcon } from './components/icons';
import {
  DEFAULT_LIBRARY_VIEW,
  FOLDER_RULES_KEY,
  LIBRARY_VERSION_KEY,
  LIBRARY_VIEW_KEY,
  LISTENING_GOAL_KEY,
  LISTENING_GOAL_OPTIONS,
  MAX_LISTENING_EVENTS,
} from './constants';
import { EqualizerTab } from './screens/EqualizerTab';
import { useEqualizerLabel } from './equalizer/equalizerStore';
import { FullPlayer } from './player/FullPlayer';
import { Header, MessageScreen } from './components/setup';
import { Onboarding, type AccessResult } from './onboarding/Onboarding';
import { HomeTab } from './screens/HomeTab';
import { StatsScreen } from './screens/StatsScreen';
import { MoreTab, type MoreRoute } from './screens/MoreTab';
import { SongMenu } from './components/SongMenu';
import { CoverHost } from './components/CoverSheets';
import { removeFromAllPlaylists } from './library/playlists';
import { LibraryTab } from './screens/LibraryTab';
import { MiniPlayer } from './player/MiniPlayer';
import { SettingsTab, type SettingsPage } from './screens/SettingsTab';
import {
  BuildRequiredScreen,
  DeniedScreen,
  FoldersScreen,
} from './screens/SetupScreens';
import { SleepTimerModal } from './player/SleepTimerModal';
import {
  canRestoreSavedLibrary,
  canDeleteTrack,
  countIncludedTracks,
  deleteTrackFiles,
  loadMusicLibrary,
  parseCachedLibrary,
  parseFolderRules,
  parseLibraryView,
  readLibraryCache,
  removeLegacyLibraryCaches,
  saveLibraryCache,
  writeLibraryCache,
} from './library/library';
import { useAppStyles } from './theme/styles';
import {
  EASE_OUT,
  POP_IN,
  PUSH_IN,
  SETTLE_SPRING,
  SNAP_BACK_SPRING,
  project,
  rubberband,
  useNavDirection,
} from './motion/motion';
import { loadListeningHistory, saveListeningHistory } from './history/history';
import { withListenedSeconds } from './history/stats';

// Expo Go test songs. Dev bundles only: a release build folds `__DEV__` to
// false and drops this require (an import could not be dropped), so the APK
// carries none of assets/demo.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const demo: typeof import('./library/demoTracks') | null = __DEV__ ? require('./library/demoTracks') : null;

// Muse crashed last time: say so once, and offer the report to send.
// Read at load, outside React, since reading deletes it.
const lastCrash = takeLastCrash();
let pendingCrashNotice: ConfirmRequest | null = lastCrash
  ? {
      eyebrow: 'SORRY',
      title: 'Muse closed by itself',
      message: 'Something went wrong last time and Muse had to close. Sharing the report shows what broke.',
      icon: 'bug-outline',
      confirmLabel: 'Share report',
      cancelLabel: 'Not now',
      onConfirm: () => void Share.share({ message: lastCrash }).catch(() => undefined),
    }
  : null;

/** History is written at most this often while songs change quickly. */
const HISTORY_SAVE_GAP_MS = 3000;
/** Without Android's library fingerprint, rescan on return at most this often. */
const FULL_CHECK_INTERVAL_MS = 5 * 60_000;

// Module scope so the builders are not rebuilt on every render. The notice
// is uninvited, so it is quick, and it leaves faster than it arrived.
/** The dock slides onto the keyboard; nothing else about it animates. */
const DOCK_LIFT = { duration: 200, easing: EASE_OUT };
/** Setup screens fade in instead of popping in. Tabs cross-fade in TabLayer. */
const PAGE_FADE = FadeIn.duration(180).easing(EASE_OUT);
const SEARCH_FADE_OUT = FadeOut.duration(180).easing(EASE_OUT);
/** The tabs in tab-bar order, for swiping between them. */
const SWIPE_TABS: Tab[] = ['home', 'library', 'more', 'settings'];
/** How far a tapped tab's page slides in from, in points. */
const TAP_SLIDE = 28;
/** Gap between hidden tabs mounting after launch, so each gets its own quiet moment. */
const TAB_WARM_GAP_MS = 400;
/** How long a committed swipe waits for its page before sliding back anyway. */
const SWIPE_FALLBACK_MS = 300;
/** The launch screen stays at least this long (about one beat of every bar), so it never just blinks. */
const LAUNCH_MIN_SHOWN_MS = 1200;
const NOTICE_ENTER = FadeInDown.duration(220).easing(EASE_OUT);
const NOTICE_EXIT = FadeOutDown.duration(180).easing(EASE_OUT);

export function MuseApp({
  theme,
  accent,
  isAmoled,
  themeError,
  amoledError,
  appearance,
  onSelectAppearance,
  onSelectAccent,
  onToggleAmoled,
  isFullScreen,
  fullScreenError,
  onToggleFullScreen,
}: {
  theme: Theme;
  accent: Accent;
  isAmoled: boolean;
  themeError: string;
  amoledError: string;
  appearance: Appearance;
  onSelectAppearance: (appearance: Appearance) => void;
  onSelectAccent: (accent: Accent) => void;
  onToggleAmoled: () => void;
  isFullScreen: boolean;
  fullScreenError: string;
  onToggleFullScreen: () => void;
}) {
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  // A returning Android user may already have a library saved. Show nothing
  // until that is known, instead of flashing the Welcome screen.
  const [screen, setScreen] = useState<Screen>(() =>
    canRestoreSavedLibrary() ? 'starting' : 'onboarding',
  );
  /** Setup on a first run, or "Set up Muse again" from Settings › About (choices and tour only). */
  const [onboardingMode, setOnboardingMode] = useState<'first' | 'replay'>('first');
  /** What setup's background scan found; null until it is done. */
  const [scannedLibrary, setScannedLibrary] = useState<CachedLibrary | null>(null);
  const scanJob = useRef<Promise<CachedLibrary | null> | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  /** Search covers the current page; the dock turns into its field. */
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // The launch screen (the Muse bars pulsing) is up from the first frame
  // while the saved library restores. A first launch has nothing to
  // restore, so Welcome shows straight away.
  const [isLaunchShown, setIsLaunchShown] = useState(screen === 'starting');
  const launchShownAt = useRef(0);
  useEffect(() => {
    launchShownAt.current = Date.now();
  }, []);
  const [crashNotice, setCrashNotice] = useState(pendingCrashNotice);
  useEffect(() => {
    if (screen === 'starting' || !isLaunchShown) {
      return;
    }
    const left = LAUNCH_MIN_SHOWN_MS - (Date.now() - launchShownAt.current);
    const timer = setTimeout(() => setIsLaunchShown(false), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [isLaunchShown, screen]);
  /** The launch screen is gone, or never came: Home may play its entrance. */
  const isLaunchTimeUp = screen !== 'starting' && !isLaunchShown;
  // Android's splash looks like our launch screen, so it hands over to it
  // (or to Welcome on a first launch).
  useEffect(() => {
    if (screen !== 'starting' || isLaunchShown) {
      hideSplash().catch(() => undefined);
    }
  }, [isLaunchShown, screen]);
  // After launch the other tabs mount hidden, one at a time, so even a first
  // visit swaps instantly. Leaving the app screens unmounts them, so restart.
  const [warmTabs, setWarmTabs] = useState(0);
  if (screen !== 'app' && warmTabs !== 0) {
    setWarmTabs(0);
  }
  useEffect(() => {
    if (screen !== 'app' || !isLaunchTimeUp || warmTabs >= SWIPE_TABS.length) {
      return;
    }
    const timer = setTimeout(() => setWarmTabs((count) => count + 1), TAB_WARM_GAP_MS);
    return () => clearTimeout(timer);
  }, [isLaunchTimeUp, screen, warmTabs]);
  const [searchQuery, setSearchQuery] = useState('');
  /** The page under the glass dock, which the dock blurs on Android. */
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  /** Solid glass style docks everything flush along the bottom edge. */
  const isSolidBar = useGlassStyle() === 'solid';

  /** Measured, so pages can scroll their last row clear of the dock. */
  const [dockHeight, setDockHeight] = useState(96);
  const dockRef = useRef<ComponentRef<typeof Animated.View>>(null);
  const dockLift = useKeyboardLift(dockRef, isSearchOpen, insets.bottom);
  // Only the lift animates. A layout transition on the whole dock also
  // fired on every tab switch and flashed a gap under the bar.
  const dockLiftStyle = useAnimatedStyle(() => ({ bottom: withTiming(dockLift, DOCK_LIFT) }));
  // Scrolling down shrinks the glass bar (BottomTabs reads it, so the whole
  // app does not redraw on each fold).
  const homeBarScroll = useBarScroll();
  /** Home scrolls on the UI thread and sends a position over now and then. */
  const homeBarScrollAt = useBarScrollAt();
  const settingsBarScroll = useBarScroll();
  // Whether the app is in front, so Home's live numbers and loops stop in the background.
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setIsAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  /** The full stats page, opened from Home. */
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  /** Pages opened inside the More tab. Empty means its menu. */
  const [moreStack, setMoreStack] = useState<MoreRoute[]>([]);
  /** The song whose menu is open, and the playlist it was opened from. */
  const [trackMenu, setTrackMenu] = useState<{ track: MusicTrack; playlistId?: string } | null>(null);
  const [folderReturnTab, setFolderReturnTab] = useState<Tab>('home');
  // "Rock", "Custom" or "Off", shown on the rows that open the Equalizer.
  const equalizerPresetName = useEqualizerLabel();
  const [isLoading, setIsLoading] = useState(false);
  // What the phone's library holds.
  const [folders, setFolders] = useState<MusicFolder[]>([]);
  const [deviceTracks, setTracks] = useState<MusicTrack[]>([]);
  const preferences = usePreferences();
  const { skipShortAudio, shortAudioSeconds, historyPaused } = preferences;
  // Unknown lengths (0) stay: only clearly short files are voice notes or tones.
  const tracks = useMemo(
    () =>
      skipShortAudio
        ? deviceTracks.filter((track) => track.duration <= 0 || track.duration >= shortAudioSeconds)
        : deviceTracks,
    [deviceTracks, shortAudioSeconds, skipShortAudio],
  );
  const [blockedFolderIds, setBlockedFolderIds] = useState<string[]>([]);
  const [hasSavedFolderRules, setHasSavedFolderRules] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  /** A non-blocking problem, shown above the tabs. The library stays usable. */
  const [libraryNotice, setLibraryNotice] = useState('');
  // Library view choices live here, not in the Library tab, so they survive
  // tab switches and opening the player. Sort is also saved across launches.
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySort, setLibrarySort] = useState<LibrarySort>(
    DEFAULT_LIBRARY_VIEW.sortBy,
  );
  const [librarySortDirection, setLibrarySortDirection] = useState<SortDirection>(
    DEFAULT_LIBRARY_VIEW.sortDirection,
  );
  const [isLibraryViewLoaded, setIsLibraryViewLoaded] = useState(false);
  const trackCount = useMemo(
    () => countIncludedTracks(folders, blockedFolderIds),
    [blockedFolderIds, folders],
  );
  const playbackController = getPlaybackController();
  // Field by field: the app re-renders when one of these changes, not on
  // queue edits (reorder, add, shuffle, repeat), which only the player shows.
  const currentTrack = usePlaybackValue((snapshot) => snapshot.currentTrack);
  const isPlaying = usePlaybackValue((snapshot) => snapshot.isPlaying);
  const isBuffering = usePlaybackValue((snapshot) => snapshot.isBuffering);
  const playbackError = usePlaybackValue((snapshot) => snapshot.error);
  const queueSource = usePlaybackValue((snapshot) => snapshot.queueSource);
  const playRequestId = usePlaybackValue((snapshot) => snapshot.playRequestId);
  const sleepTimerEndsAt = usePlaybackValue((snapshot) => snapshot.sleepTimerEndsAt);
  const sleepsAtTrackEnd = usePlaybackValue((snapshot) => snapshot.sleepAtTrackEnd);
  /** Joined: the mini player and the tab pill are one frosted card (not while searching). */
  const isDockJoined = !isSolidBar && preferences.miniDock === 'joined' && Boolean(currentTrack) && !isSearchOpen;
  const {
    togglePlayback,
    skipNext,
    skipPrevious,
    skipToQueueIndex,
    moveQueueItem,
    removeFromQueue,
    toggleShuffle,
    cycleRepeatMode,
    seekToRatio,
  } = playbackController;
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  // The last queued song was removed while the full player showed it.
  if (!currentTrack && isFullPlayerOpen) {
    setIsFullPlayerOpen(false);
  }
  // The mini player <-> full player morph, shared by both (UI thread).
  const playerTransition = usePlayerTransition();
  /**
   * Opens or closes the full player. The morph starts now, on the UI thread,
   * and React redraws behind it at low priority, so the sheet never waits for
   * the app to re-render first. A drag already started its own spring (with
   * the finger's speed), so that one is left running.
   */
  const changePlayerOpen = useCallback(
    (open: boolean) => {
      if (playerTransition.target.get() !== (open ? 1 : 0)) {
        settlePlayer(playerTransition, open);
      }
      startTransition(() => setIsFullPlayerOpen(open));
    },
    [playerTransition],
  );
  /** Set when Equalizer was opened from the full player: the tab to reopen it over. */
  const [playerReturnTab, setPlayerReturnTab] = useState<Tab | null>(null);
  /**
   * Set when an album or artist was opened from the full player: how deep its
   * page sits in Collections. Back from that page returns to `playerReturnTab`
   * with the player open again, as Equalizer does.
   */
  const [playerReturnDepth, setPlayerReturnDepth] = useState<number | null>(null);
  /** The Settings category page that is open, or null for the main list. */
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  /** Settings search scrolls the setting it found into view. */
  const settingsScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  /** Equalizer opens from Settings or the full player; back returns there. */
  const [equalizerBackTab, setEqualizerBackTab] = useState<Tab>('settings');
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false);
  const [listeningHistory, setListeningHistory] = useState<ListeningEvent[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [canSaveHistory, setCanSaveHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  /** Daily listening goal in minutes, 0 for none. */
  const [goalMinutes, setGoalMinutes] = useState(0);
  const recordedPlayRequest = useRef(0);
  const lastHistorySaveAt = useRef(0);
  /** A history save waiting for a burst of changes to settle, if any. */
  const pendingHistorySave = useRef<(() => void) | null>(null);
  /** `playedAt` of the play recorded this session that is still being heard. */
  const currentListenAt = useRef<number | null>(null);
  const hasAttemptedLibraryRestore = useRef(false);
  const tracksById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  // Plays from hidden folders stay out of Home and Stats.
  const visibleHistory = useMemo(() => {
    const blocked = new Set(blockedFolderIds);
    return listeningHistory.filter((event) => {
      const track = tracksById.get(event.trackId);
      return !track || !blocked.has(track.folderId);
    });
  }, [blockedFolderIds, listeningHistory, tracksById]);
  const recentTracks = useMemo(() => {
    const seen = new Set<string>();
    const recent: MusicTrack[] = [];
    // History is newest first.
    for (let index = 0; index < visibleHistory.length && recent.length < 31; index += 1) {
      const track = tracksById.get(visibleHistory[index].trackId);
      if (track && !seen.has(track.id)) {
        seen.add(track.id);
        recent.push(track);
      }
    }
    return recent;
  }, [tracksById, visibleHistory]);
  const playableTracks = useMemo(() => {
    const blocked = new Set(blockedFolderIds);
    return tracks.filter(
      (track) => track.uri !== null && !blocked.has(track.folderId),
    );
  }, [blockedFolderIds, tracks]);
  // Stable between keystrokes, so Search does not regroup the whole library.
  const searchFolders = useMemo(
    () => folders.filter((folder) => !blockedFolderIds.includes(folder.id)),
    [blockedFolderIds, folders],
  );

  useEffect(() => {
    // Keep the player's queue in step with the library, so the full player
    // and mini player show current titles and artwork after any rescan.
    playbackController.syncTracks(tracks);
    // Songs deleted outside Muse leave the queue. An empty list is the
    // moment before the first load, not a library with nothing in it.
    if (tracks.length > 0) {
      const present = new Set(tracks.map((track) => track.id));
      const gone = playbackController.getSnapshot().queue.filter((track) => !present.has(track.id));
      if (gone.length > 0) {
        playbackController.removeTracks(new Set(gone.map((track) => track.id)));
      }
    }
  }, [playbackController, tracks]);

  useEffect(() => {
    const subscription = addAudioBecomingNoisyListener(() => {
      playbackController.handleDisconnect(!getPreferences().pauseOnDisconnect);
    });
    // Settings › Sound › Resume on reconnect.
    const reconnect = addHeadphonesConnectedListener(() => {
      const { pauseOnDisconnect, resumeOnConnect } = getPreferences();
      if (pauseOnDisconnect && resumeOnConnect) {
        playbackController.resumeAfterReconnect();
      }
    });
    return () => {
      subscription.remove();
      reconnect.remove();
    };
  }, [playbackController]);

  useEffect(() => {
    // Set the audio session up front so background play is on no matter
    // which control starts the music. A failure here is retried, and shown,
    // on the next play.
    playbackController.ensureAudioMode().catch(() => undefined);
  }, [playbackController]);

  useEffect(() => {
    const restoreListeningHistory = async () => {
      try {
        setListeningHistory(await loadListeningHistory());
        setCanSaveHistory(true);
      } catch (error) {
        setHistoryError(
          error instanceof Error
            ? error.message
            : 'Could not load your listening history.',
        );
      } finally {
        setIsHistoryLoaded(true);
      }
    };

    void restoreListeningHistory();
  }, []);

  useEffect(() => {
    // An unreadable goal just means no goal.
    AsyncStorage.getItem(LISTENING_GOAL_KEY)
      .then((value) => {
        const minutes = Number(value);
        if (LISTENING_GOAL_OPTIONS.includes(minutes)) {
          setGoalMinutes(minutes);
        }
      })
      .catch(() => undefined);
  }, []);

  const changeGoal = useCallback((minutes: number) => {
    setGoalMinutes(minutes);
    AsyncStorage.setItem(LISTENING_GOAL_KEY, String(minutes)).catch(() => {
      setLibraryNotice('Could not save your daily goal. It will reset next time.');
    });
  }, []);

  // Writing the whole history takes real work, so quick skips are saved once
  // after they settle instead of on every song. In the background (screen off,
  // music on) Android pauses timers, so saves happen at once there.
  useEffect(() => {
    if (!isHistoryLoaded || !canSaveHistory) {
      return;
    }
    const save = () => {
      pendingHistorySave.current = null;
      lastHistorySaveAt.current = Date.now();
      saveListeningHistory(listeningHistory).catch((error: unknown) => {
        setHistoryError(
          error instanceof Error
            ? error.message
            : 'Could not save your listening history.',
        );
      });
    };
    const wait = HISTORY_SAVE_GAP_MS - (Date.now() - lastHistorySaveAt.current);
    if (wait <= 0 || AppState.currentState !== 'active') {
      save();
      return;
    }
    pendingHistorySave.current = save;
    const timer = setTimeout(save, wait);
    return () => {
      clearTimeout(timer);
      pendingHistorySave.current = null;
    };
  }, [canSaveHistory, isHistoryLoaded, listeningHistory]);

  // Fill in the previous play's time the moment a new listen starts, before
  // the player even reports "playing". Waiting for that let two quick skips
  // replace a long listen's time with the skipped song's few seconds. Runs
  // before the effect below, which moves `currentListenAt` to the new play.
  useEffect(() => {
    const playedAt = currentListenAt.current;
    if (playRequestId === 0 || playedAt === null) {
      return;
    }
    const seconds = playbackController.getFinishedListenSeconds();
    setListeningHistory((history) => withListenedSeconds(history, playedAt, seconds));
    if (getPreferences().historyPaused) {
      // The next play is not recorded, so its time must not land on this one.
      currentListenAt.current = null;
    }
  }, [playRequestId, playbackController]);

  useEffect(() => {
    if (
      // Settings › Listening › Pause history: plays are not written down. Turning
      // it back on mid-song records that song from then on.
      historyPaused ||
      !isPlaying ||
      !currentTrack ||
      playRequestId === 0 ||
      recordedPlayRequest.current === playRequestId
    ) {
      return;
    }

    recordedPlayRequest.current = playRequestId;
    const playedAt = Date.now();
    currentListenAt.current = playedAt;
    setListeningHistory((history) =>
      [
        {
          trackId: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist,
          folderTitle: currentTrack.folderTitle,
          playedAt,
          album: currentTrack.album,
          genre: currentTrack.genre,
          duration: currentTrack.duration,
          // Nothing heard yet. Left out, stats would count the whole song the moment it starts.
          listenedSeconds: 0,
        },
        ...history,
      ].slice(0, MAX_LISTENING_EVENTS),
    );
  }, [currentTrack, historyPaused, isPlaying, playRequestId]);

  // Save the time heard so far whenever playback pauses or the app leaves the
  // screen, so a closed app keeps most of the current listen.
  /** Settings › Listening › Clear listening history. The save effect writes the empty list. */
  const clearHistory = useCallback(() => {
    currentListenAt.current = null;
    setListeningHistory([]);
  }, []);

  /**
   * Settings › App & data › Reset settings: look, player, sound, library and
   * listening settings go back to how Muse starts. Music, playlists,
   * favorites, ratings, history and the equalizer stay.
   */
  const resetSettings = useCallback(() => {
    resetPreferences();
    setGlassChoice('blur');
    setWeekStart(6);
    changeGoal(0);
    onSelectAppearance('system');
    onSelectAccent('lime');
    if (isAmoled) {
      onToggleAmoled();
    }
    if (isFullScreen) {
      onToggleFullScreen();
    }
  }, [changeGoal, isAmoled, isFullScreen, onSelectAccent, onSelectAppearance, onToggleAmoled, onToggleFullScreen]);

  const saveCurrentListen = useCallback(() => {
    const playedAt = currentListenAt.current;
    if (playedAt === null) {
      return;
    }
    const seconds = playbackController.getListenSeconds();
    setListeningHistory((history) => withListenedSeconds(history, playedAt, seconds));
  }, [playbackController]);

  useEffect(() => {
    if (!isPlaying) {
      saveCurrentListen();
    }
  }, [isPlaying, saveCurrentListen]);

  // The chosen app icon is switched here, once Muse is in the background:
  // Android closes every screen opened from the launcher entry that gets
  // switched off, so doing it on the tap closed Muse in your hand.
  // shortcut: a share sheet or picker also sends Muse to the background, so a
  // pending icon then closes Muse behind it; check the leave reason natively if that bites.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // After the saved choice loads (the defaults would switch it back to
        // Muse), and only if Muse is still out of sight by then.
        void preferencesReady.then(() => {
          if (AppState.currentState === 'background') {
            setAppIcon(getPreferences().appIcon);
          }
        });
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        // Write any waiting save now; timers stop once the app is hidden.
        pendingHistorySave.current?.();
        saveCurrentListen();
      }
    });
    return () => subscription.remove();
  }, [saveCurrentListen]);

  useEffect(() => {
    AsyncStorage.getItem(LIBRARY_VIEW_KEY)
      .then((value) => {
        const view = parseLibraryView(value);
        setLibrarySort(view.sortBy);
        setLibrarySortDirection(view.sortDirection);
      })
      .catch(() => undefined)
      .finally(() => setIsLibraryViewLoaded(true));
  }, []);

  useEffect(() => {
    // Only save once the app is showing, so the launch restore can read the
    // saved tab before anything overwrites it.
    if (!isLibraryViewLoaded || screen !== 'app') {
      return;
    }
    const view: LibraryView = {
      sortBy: librarySort,
      sortDirection: librarySortDirection,
      tab: activeTab,
    };
    // A failed save only means these choices reset next launch.
    AsyncStorage.setItem(LIBRARY_VIEW_KEY, JSON.stringify(view)).catch(
      () => undefined,
    );
  }, [activeTab, isLibraryViewLoaded, librarySort, librarySortDirection, screen]);

  /** Rescans quietly and swaps in the result only if something changed. */
  const isCheckingMusic = useRef(false);
  const lastFullCheckAt = useRef(0);
  /**
   * Picks up songs added, changed or removed since the last look, quietly, on
   * launch and each time Muse comes back to the screen. Android's library
   * fingerprint is one quick native call, so when nothing changed there is
   * no scan at all. Phones too old to report it rescan at most every few
   * minutes instead.
   */
  const checkForNewMusic = useCallback(async () => {
    if (isCheckingMusic.current) {
      return;
    }
    isCheckingMusic.current = true;
    try {
      // Read before scanning, so a file added mid-scan is caught next time.
      const version = await getLibraryVersion();
      if (version !== null) {
        if (version === (await AsyncStorage.getItem(LIBRARY_VERSION_KEY))) {
          return;
        }
      } else if (Date.now() - lastFullCheckAt.current < FULL_CHECK_INTERVAL_MS) {
        return;
      }
      lastFullCheckAt.current = Date.now();
      const freshLibrary = await loadMusicLibrary();
      const freshValue = JSON.stringify(freshLibrary);
      let isCacheSaved = true;
      if (freshValue !== (await readLibraryCache())) {
        setFolders(freshLibrary.folders);
        setTracks(freshLibrary.tracks);
        // If this fails, the version stays unsaved so the next check rescans.
        isCacheSaved = await writeLibraryCache(freshValue).then(
          () => true,
          () => false,
        );
      }
      if (version !== null && isCacheSaved) {
        await AsyncStorage.setItem(LIBRARY_VERSION_KEY, version).catch(() => undefined);
      }
    } catch {
      setLibraryNotice(
        'Could not check for new music. Your saved songs are still here.',
      );
    } finally {
      isCheckingMusic.current = false;
    }
  }, []);

  useEffect(() => {
    if (screen !== 'app' || !canRestoreSavedLibrary()) {
      return;
    }
    // Back from downloading a song, for example.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkForNewMusic();
      }
    });
    return () => subscription.remove();
  }, [checkForNewMusic, screen]);

  /**
   * Opens straight into the saved library. Only a missing permission goes
   * back to setup. A problem with one saved item never resets the rest.
   */
  const restoreSavedLibrary = useCallback(async () => {
    try {
      const permission = await getPermissionsAsync(false, ['audio']);
      if (!permission.granted) {
        setOnboardingMode('first');
        setScreen('onboarding');
        return;
      }

      removeLegacyLibraryCaches();
      const [cachedValue, savedRules, savedView] = await Promise.all([
        readLibraryCache(),
        AsyncStorage.getItem(FOLDER_RULES_KEY),
        AsyncStorage.getItem(LIBRARY_VIEW_KEY),
        // "Open on launch" decides the first tab, so it must be loaded first.
        preferencesReady,
      ]);

      // Unreadable folder choices just mean asking for them again.
      let blockedIds: string[] = [];
      let hasValidRules = savedRules !== null;
      if (savedRules !== null) {
        try {
          blockedIds = parseFolderRules(savedRules);
        } catch {
          hasValidRules = false;
        }
      }

      const cachedLibrary = cachedValue ? parseCachedLibrary(cachedValue) : null;
      let musicLibrary: CachedLibrary;
      if (cachedLibrary) {
        musicLibrary = cachedLibrary;
      } else {
        musicLibrary = await loadMusicLibrary();
        await saveLibraryCache(musicLibrary).catch(() => undefined);
      }

      setFolders(musicLibrary.folders);
      setTracks(musicLibrary.tracks);
      setBlockedFolderIds(blockedIds);
      setHasSavedFolderRules(hasValidRules);
      const { startTab } = getPreferences();
      setActiveTab(
        !hasValidRules
          ? 'home'
          : startTab === 'last'
            ? parseLibraryView(savedView).tab
            : startTab,
      );
      setFolderReturnTab('home');
      setErrorMessage('');
      setScreen(hasValidRules ? 'app' : 'folders');
      await playbackController.restore(musicLibrary.tracks, blockedIds);
      if (cachedLibrary && cachedValue) {
        void checkForNewMusic();
      }
    } catch (error) {
      playbackController.enablePersistence();
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred.',
      );
      setScreen('error');
    }
  }, [checkForNewMusic, playbackController]);

  useEffect(() => {
    if (!canRestoreSavedLibrary() || hasAttemptedLibraryRestore.current) {
      return;
    }
    hasAttemptedLibraryRestore.current = true;
    void restoreSavedLibrary();
  }, [restoreSavedLibrary]);

  const retryAfterError = () => {
    if (!canRestoreSavedLibrary()) {
      setOnboardingMode('first');
      setScreen('onboarding');
      return;
    }
    launchShownAt.current = Date.now();
    setIsLaunchShown(true);
    setScreen('starting');
    void restoreSavedLibrary();
  };

  /** Tapping the current song in a list opens the full player and resumes it. */
  const openIfCurrent = useCallback(
    (track: MusicTrack) => {
      if (playbackController.getSnapshot().currentTrack?.id === track.id) {
        changePlayerOpen(true);
      }
    },
    [changePlayerOpen, playbackController],
  );

  const playTrack = useCallback(
    (track: MusicTrack) => {
      openIfCurrent(track);
      // These come from Home and Stats, and the queue is the whole library.
      void playbackController.playTrack(track, playableTracks, { source: 'Library' });
    },
    [openIfCurrent, playableTracks, playbackController],
  );

  /** Plays a Home mix from its first song, in random order when it shuffles. */
  const playMix = useCallback(
    (mixTracks: MusicTrack[], shuffleMix: boolean, source?: string) => {
      const ordered = shuffleMix ? shuffleTracks(mixTracks) : mixTracks;
      if (ordered[0]) {
        void playbackController.playTrack(ordered[0], ordered, { freshQueue: true, source });
      }
    },
    [playbackController],
  );

  /**
   * Plays `track` with a list, such as an album or playlist, as the queue.
   * `freshQueue` is for Play and Shuffle buttons, which never just pause.
   */
  const playFromList = useCallback(
    (track: MusicTrack, list: MusicTrack[], freshQueue = false, source?: string) => {
      if (!freshQueue) {
        openIfCurrent(track);
      }
      void playbackController.playTrack(track, list, { freshQueue, source });
    },
    [openIfCurrent, playbackController],
  );
  /** Plays a mix from one of its songs (a song tapped in the mix's sheet on Home). */
  const playMixFrom = useCallback(
    (track: MusicTrack, list: MusicTrack[], source: string) => playFromList(track, list, true, source),
    [playFromList],
  );
  const openTrackMenu = useCallback((track: MusicTrack, playlistId?: string) => {
    hapticImpact();
    setTrackMenu({ track, playlistId });
  }, []);
  /**
   * Deletes a song's file after Android's own confirm dialog, then takes it
   * out of the library, its saved copy, the queue and every playlist. Plays
   * stay in history, so stats do not change.
   */
  const deleteSongs = useCallback(
    async (picked: MusicTrack[]) => {
      const list = picked.filter(canDeleteTrack);
      if (list.length === 0) {
        setLibraryNotice(
          isRunningInExpoGo()
            ? 'This is a sample song. Expo Go cannot read the music on your phone, so install the Muse app to delete your own songs.'
            : 'This is a sample song built into Muse, so it cannot be deleted.',
        );
        return;
      }
      try {
        if (!(await deleteTrackFiles(list))) {
          return;
        }
      } catch {
        setLibraryNotice(
          Platform.OS === 'android' && Number(Platform.Version) < 30
            ? 'Deleting songs needs Android 11 or newer.'
            : list.length === 1
              ? `Could not delete "${list[0].title}". It is still on your phone.`
              : `Could not delete those ${list.length} songs. They are still on your phone.`,
        );
        return;
      }
      const gone = new Set(list.map((track) => track.id));
      playbackController.removeTracks(gone);
      removeFromAllPlaylists(gone);
      const perFolder = new Map<string, number>();
      list.forEach((track) => {
        perFolder.set(track.folderId, (perFolder.get(track.folderId) ?? 0) + 1);
      });
      if (list.length > 1) {
        showToast(`Deleted ${list.length} songs`, { icon: 'delete' });
      }
      // Closing Android's confirm dialog can start a rescan, so this works
      // from the latest state and cache, not the lists from before the dialog.
      const withoutTrack = (library: CachedLibrary): CachedLibrary => ({
        tracks: library.tracks.filter((item) => !gone.has(item.id)),
        folders: library.folders
          .map((folder) =>
            perFolder.has(folder.id)
              ? { ...folder, trackCount: folder.trackCount - (perFolder.get(folder.id) ?? 0) }
              : folder,
          )
          .filter((folder) => folder.trackCount > 0),
      });
      setTracks((current) => current.filter((item) => !gone.has(item.id)));
      setFolders((current) => withoutTrack({ tracks: [], folders: current }).folders);
      // If this fails, the next rescan finds the file gone anyway.
      readLibraryCache()
        .then((cached) => {
          const library = cached ? parseCachedLibrary(cached) : null;
          return library ? saveLibraryCache(withoutTrack(library)) : undefined;
        })
        .catch(() => undefined);
    },
    [playbackController],
  );
  const pushMore = useCallback((route: MoreRoute) => {
    setMoreStack((stack) => [...stack, route]);
  }, []);
  const popMore = useCallback(() => {
    setMoreStack((stack) => stack.slice(0, -1));
  }, []);

  const startSleepTimer = (minutes: number) => {
    playbackController.startSleepTimer(minutes);
    setIsSleepTimerOpen(false);
  };

  const sleepAtTrackEnd = () => {
    playbackController.sleepAtTrackEnd();
    setIsSleepTimerOpen(false);
    showToast('Sleep timer set', { detail: 'Pausing when this song ends', icon: 'moon' });
  };

  const clearSleepTimer = () => {
    playbackController.clearSleepTimer();
    setIsSleepTimerOpen(false);
  };

  const findMusic = async () => {
    if (Platform.OS !== 'android') {
      setScreen('unsupported');
      return;
    }

    if (demo && isRunningInExpoGo()) {
      setFolders([demo.DEMO_FOLDER]);
      setTracks(demo.DEMO_TRACKS);
      // Played from the phone once downloaded, as a real build would.
      void demo.loadLocalDemoTracks().then(setTracks);
      setBlockedFolderIds([]);
      setHasSavedFolderRules(true);
      setScreen('app');
      setActiveTab('home');
      setFolderReturnTab('home');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const permission = await requestPermissionsAsync(false, ['audio']);

      if (!permission.granted) {
        setScreen('denied');
        return;
      }

      const [musicLibrary, savedRules] = await Promise.all([
        loadMusicLibrary(),
        AsyncStorage.getItem(FOLDER_RULES_KEY),
      ]);
      // A cache that fails to save only means the next launch rescans.
      await saveLibraryCache(musicLibrary).catch(() => undefined);
      const blockedIds = savedRules ? parseFolderRules(savedRules) : [];
      setFolders(musicLibrary.folders);
      setTracks(musicLibrary.tracks);
      setBlockedFolderIds(blockedIds);
      await playbackController.restore(musicLibrary.tracks, blockedIds);
      setHasSavedFolderRules(savedRules !== null);
      setScreen(savedRules === null ? 'folders' : 'app');
      setActiveTab('home');
      setFolderReturnTab('home');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred.',
      );
      setScreen('error');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Setup's "Allow access": asks Android once, then scans in the background
   * while setup goes on, so Folders has real counts by the time it shows.
   */
  const requestAccess = useCallback(async (): Promise<AccessResult> => {
    if (Platform.OS !== 'android') {
      setScreen('unsupported');
      return 'unsupported';
    }
    if (demo && isRunningInExpoGo()) {
      const library = { folders: [demo.DEMO_FOLDER], tracks: demo.DEMO_TRACKS };
      setFolders(library.folders);
      setTracks(library.tracks);
      setScannedLibrary(library);
      scanJob.current = Promise.resolve(library);
      // Played from the phone once downloaded, as a real build would.
      void demo.loadLocalDemoTracks().then(setTracks);
      return 'granted';
    }
    try {
      const permission = await requestPermissionsAsync(false, ['audio']);
      if (!permission.granted) {
        return 'denied';
      }
    } catch {
      return 'denied';
    }
    scanJob.current ??= loadMusicLibrary()
      .then(async (library) => {
        // A cache that fails to save only means the next launch rescans.
        await saveLibraryCache(library).catch(() => undefined);
        setFolders(library.folders);
        setTracks(library.tracks);
        setScannedLibrary(library);
        return library;
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
        scanJob.current = null;
        return null;
      });
    return 'granted';
  }, []);

  /** Setup is done: save the folder choices (all on unless changed) and open Home. */
  const finishOnboarding = useCallback(async () => {
    if (onboardingMode === 'replay') {
      setScreen('app');
      return;
    }
    // Quick start can finish before the scan does; wait for it here.
    const library = scannedLibrary ?? (await scanJob.current);
    if (!library) {
      setScreen('error');
      return;
    }
    try {
      await AsyncStorage.setItem(FOLDER_RULES_KEY, JSON.stringify(blockedFolderIds));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save your folder choices.');
      setScreen('error');
      return;
    }
    setHasSavedFolderRules(true);
    if (!(demo && isRunningInExpoGo())) {
      await playbackController.restore(library.tracks, blockedFolderIds);
    }
    setActiveTab('home');
    setFolderReturnTab('home');
    setScreen('app');
  }, [blockedFolderIds, onboardingMode, playbackController, scannedLibrary]);

  const openSetupAgain = useCallback(() => {
    setOnboardingMode('replay');
    setScreen('onboarding');
  }, []);

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not open device settings.',
      );
      setScreen('error');
    }
  };

  const toggleFolder = (folderId: string) => {
    setBlockedFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((id) => id !== folderId)
        : [...current, folderId],
    );
  };

  const saveFolderRules = async () => {
    setIsLoading(true);
    setErrorMessage('');
    const nextBlockedIds = blockedFolderIds;

    try {
      await AsyncStorage.setItem(
        FOLDER_RULES_KEY,
        JSON.stringify(nextBlockedIds),
      );
      setBlockedFolderIds(nextBlockedIds);
      setHasSavedFolderRules(true);
      setScreen('app');
      setActiveTab(folderReturnTab);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save your folder choices.',
      );
      setScreen('error');
    } finally {
      setIsLoading(false);
    }
  };

  const allowAllFolders = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      await AsyncStorage.setItem(
        FOLDER_RULES_KEY,
        JSON.stringify([]),
      );
      setBlockedFolderIds([]);
      setHasSavedFolderRules(true);
      setScreen('app');
      setActiveTab(folderReturnTab);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save your folder choices.',
      );
      setScreen('error');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelFolderChanges = useCallback(async () => {
    try {
      const savedRules = await AsyncStorage.getItem(FOLDER_RULES_KEY);
      const blockedIds = savedRules ? parseFolderRules(savedRules) : [];
      setBlockedFolderIds(blockedIds);
      setScreen('app');
      setActiveTab(folderReturnTab);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not restore your saved folder choices.',
      );
      setScreen('error');
    }
  }, [folderReturnTab]);

  const openFolderSettings = () => {
    setFolderReturnTab(activeTab);
    setScreen('folders');
  };

  const canGoBack =
    !isLoading &&
    (screen === 'app'
      ? isFullPlayerOpen ||
        isSearchOpen ||
        isStatsOpen ||
        activeTab !== 'home'
      : screen !== 'onboarding' && screen !== 'starting');

  const openFullPlayer = useCallback(() => changePlayerOpen(true), [changePlayerOpen]);

  /** Back on a Collections page; from the page the player opened, back to the player. */
  const backInMore = useCallback(() => {
    popMore();
    if (playerReturnTab && playerReturnDepth !== null && moreStack.length === playerReturnDepth) {
      setActiveTab(playerReturnTab);
      setPlayerReturnTab(null);
      setPlayerReturnDepth(null);
      changePlayerOpen(true);
    }
  }, [changePlayerOpen, moreStack.length, playerReturnDepth, playerReturnTab, popMore]);

  const goBack = useCallback(() => {
    if (isLoading) {
      return;
    }

    if (screen === 'app') {
      if (isFullPlayerOpen) {
        // The player morphs back into the mini player.
        changePlayerOpen(false);
        return;
      }
      if (isSearchOpen) {
        setIsSearchOpen(false);
        return;
      }
      if (activeTab === 'more' && moreStack.length > 0) {
        backInMore();
        return;
      }
      if (activeTab === 'settings' && settingsPage) {
        setSettingsPage(null);
        return;
      }
      // Back from Equalizer returns where it was opened: the player or More.
      if (activeTab === 'equalizer') {
        if (playerReturnTab) {
          setActiveTab(playerReturnTab);
          setPlayerReturnTab(null);
          changePlayerOpen(true);
        } else {
          setActiveTab(equalizerBackTab);
        }
        return;
      }
      setIsStatsOpen(false);
      setActiveTab('home');
      return;
    }

    if (screen === 'folders') {
      if (hasSavedFolderRules) {
        void cancelFolderChanges();
      } else {
        setScreen('onboarding');
      }
      return;
    }

    if (screen === 'denied' || screen === 'build-required' || screen === 'unsupported') {
      setScreen(hasSavedFolderRules ? 'app' : 'onboarding');
    } else if (screen === 'error') {
      setScreen(hasSavedFolderRules ? 'folders' : 'onboarding');
    }
  }, [
    cancelFolderChanges,
    changePlayerOpen,
    equalizerBackTab,
    settingsPage,
    hasSavedFolderRules,
    isLoading,
    isFullPlayerOpen,
    isSearchOpen,
    screen,
    activeTab,
    moreStack.length,
    playerReturnTab,
    backInMore,
  ]);

  const selectTab = useCallback(
    (tab: Tab) => {
      hapticSelection();
      setIsStatsOpen(false);
      setIsSearchOpen(false);
      setPlayerReturnTab(null);
      setPlayerReturnDepth(null);
      // Tapping More again goes back to its menu.
      if (tab === 'more' && activeTab === 'more') {
        setMoreStack([]);
      }
      if (tab === 'settings' && activeTab === 'settings') {
        setSettingsPage(null);
      }
      setActiveTab(tab);
    },
    [activeTab],
  );

  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  /** From a search result to its page in More, which search then gives way to. */
  const openSearchResult = useCallback((route: MoreRoute) => {
    setIsSearchOpen(false);
    setIsStatsOpen(false);
    setPlayerReturnTab(null);
    setPlayerReturnDepth(null);
    setMoreStack([route]);
    setActiveTab('more');
  }, []);

  // Android asks the newest Back listener first. This one is added once, so
  // it is always the oldest and runs last: a part that handles Back itself
  // (Library's selection, the player's Lyrics and Up Next) adds its listener
  // later and is asked first. Re-adding it on every change would jump it ahead.
  const handleBackPress = useRef<() => boolean>(() => false);
  useEffect(() => {
    handleBackPress.current = () => {
      if (isLoading) {
        // Keep Muse open mid-scan; only the first-run screens may quit.
        return screen !== 'onboarding' && screen !== 'starting';
      }
      if (!canGoBack) {
        return false;
      }
      goBack();
      return true;
    };
  }, [canGoBack, goBack, isLoading, screen]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => handleBackPress.current());
    return () => subscription.remove();
  }, []);

  const refreshLibrary = useCallback(async () => {
    setIsLoading(true);
    setLibraryNotice('');

    try {
      const permission = await getPermissionsAsync(false, ['audio']);
      if (!permission.granted) {
        setScreen('denied');
        return;
      }

      const musicLibrary = await loadMusicLibrary();
      setFolders(musicLibrary.folders);
      setTracks(musicLibrary.tracks);
      await saveLibraryCache(musicLibrary).catch(() => undefined);
      if (!currentTrack) {
        await playbackController.restore(musicLibrary.tracks, blockedFolderIds);
      }
    } catch {
      // Keep the library on screen. A failed rescan is not a reason to leave.
      setLibraryNotice(
        'Could not check for new music. Your saved songs are still here.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [blockedFolderIds, currentTrack, playbackController]);
  const openStats = useCallback(() => setIsStatsOpen(true), []);

  // The library is a virtualized list, so it cannot sit inside the shared
  // ScrollView. It gets its own scroll container instead.
  // ---------------------------------------------------------------------------
  // Swipe between tabs. The page follows the finger; past 30% of the width (or
  // with a flick) the next tab slides in. On a sub-page, swiping right goes
  // back instead, as on iOS. Charts keep their own sideways drags.
  const { width: windowWidth } = useWindowDimensions();
  const isOnSubPage =
    isStatsOpen ||
    activeTab === 'equalizer' ||
    (activeTab === 'more' && moreStack.length > 0) ||
    (activeTab === 'settings' && settingsPage !== null);
  const tabIndex = SWIPE_TABS.indexOf(activeTab);
  const canSwipePrevious = isOnSubPage || tabIndex > 0;
  const canSwipeNext = !isOnSubPage && tabIndex >= 0 && tabIndex < SWIPE_TABS.length - 1;
  const swipeX = useSharedValue(0);
  const pendingSwipe = useRef(0);
  const swipeFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitSwipe = useCallback(
    (direction: number) => {
      pendingSwipe.current = direction;
      if (direction < 0 && isOnSubPage) {
        hapticSelection();
        goBack();
      } else {
        // selectTab gives its own haptic tap.
        selectTab(SWIPE_TABS[tabIndex + direction]);
      }
      // If nothing changed, slide the page back rather than leave it off screen.
      // Only the latest swipe's check: an earlier one would spring a quick
      // second swipe back mid-slide.
      if (swipeFallback.current) {
        clearTimeout(swipeFallback.current);
      }
      swipeFallback.current = setTimeout(() => {
        swipeFallback.current = null;
        if (pendingSwipe.current !== 0) {
          pendingSwipe.current = 0;
          swipeX.set(withSpring(0, SETTLE_SPRING));
        }
      }, SWIPE_FALLBACK_MS);
    },
    [goBack, isOnSubPage, selectTab, swipeX, tabIndex],
  );
  // Every page change brings the full bar back.
  useEffect(() => {
    setBarMinimized(false);
  }, [activeTab, isStatsOpen, moreStack, settingsPage, isSearchOpen]);
  // The new page comes in from the side the finger went toward. A tapped
  // tab gets a short version from the side of the new tab, so taps and
  // swipes feel like one motion. Transform only, so it never waits on React.
  const lastTab = useRef({ index: tabIndex, screen });
  useEffect(() => {
    const direction = pendingSwipe.current;
    const from = lastTab.current.index;
    // Launch (and setup) restores the last tab: it lands in place, it was not a tap.
    const wasOnApp = lastTab.current.screen === 'app';
    lastTab.current = { index: tabIndex, screen };
    if (direction === 0) {
      if (wasOnApp && from >= 0 && tabIndex >= 0 && from !== tabIndex) {
        swipeX.set(Math.sign(tabIndex - from) * TAP_SLIDE);
        swipeX.set(withSpring(0, SETTLE_SPRING));
      }
      return;
    }
    pendingSwipe.current = 0;
    swipeX.set(direction * windowWidth * 0.25);
    swipeX.set(withSpring(0, SETTLE_SPRING));
  }, [activeTab, isStatsOpen, moreStack, screen, settingsPage, swipeX, tabIndex, windowWidth]);
  const tabSwipe = usePanGesture({
    enabled: screen === 'app' && !isSearchOpen && !isFullPlayerOpen,
    // Clearly sideways only, so vertical scrolling keeps working.
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    // Cancelling the JS responder (the default) stops the row under the
    // finger from counting the swipe as a tap. Charts and sliders scrub with
    // their own gestures, which win sideways before this one starts.
    onUpdate: (event) => {
      'worklet';
      if (sidewaysDragLock.get()) {
        return;
      }
      const x = event.translationX;
      const allowed = x > 0 ? canSwipePrevious : canSwipeNext;
      // Past the first or last tab it resists, like the end of a list.
      swipeX.set(allowed ? x : rubberband(x, windowWidth) * 0.4);
    },
    onDeactivate: (event) => {
      'worklet';
      const x = event.translationX;
      const direction = x < 0 ? 1 : -1;
      const allowed = direction === 1 ? canSwipeNext : canSwipePrevious;
      const projected = x + project(event.velocityX);
      if (
        !event.canceled &&
        !sidewaysDragLock.get() &&
        allowed &&
        Math.abs(projected) > windowWidth * 0.3 &&
        Math.sign(projected) === Math.sign(x)
      ) {
        // The new page starts rendering now, while this one slides away, so
        // there is no empty gap after the slide waiting for it.
        swipeX.set(withTiming(-direction * windowWidth, { duration: 170, easing: EASE_OUT }));
        scheduleOnRN(commitSwipe, direction);
      } else {
        swipeX.set(withSpring(0, { ...SNAP_BACK_SPRING, velocity: event.velocityX }));
      }
    },
  });
  const swipeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(swipeX.get()), [0, windowWidth], [1, 0.4], Extrapolation.CLAMP),
    transform: [{ translateX: swipeX.get() }],
  }));

  // Stats slides over Home like a pushed page; switching tabs just fades.
  const statsDirection = useNavDirection(isStatsOpen ? 1 : 0, activeTab);
  const reduceMotion = useReducedMotion();
  // The app recedes behind the opening player, as behind an iOS sheet.
  const recedeStyle = useAnimatedStyle(() => {
    const open = reduceMotion
      ? 0
      : interpolate(playerTransition.progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP);
    // Scale only. Rounded, clipped corners cost a clip of the whole app every
    // frame and wait behind React (not transform/opacity), and over the same
    // color behind they barely showed.
    return { transform: [{ scale: interpolate(open, [0, 1], [1, 0.94]) }] };
  });
  // Library and More are virtualized lists with their own scrolling; the
  // other tabs share this padding inside a plain scroll view.
  const appPageContent = useMemo(
    () => [styles.content, { paddingTop: 18 + insets.top, paddingBottom: dockHeight + 16 }],
    [dockHeight, insets.top, styles.content],
  );
  // The full player is a sheet over the app. The tabs stay mounted under it,
  // so dragging it down shows them and closing it costs no re-mount. It stays
  // mounted itself too (invisible when closed), so opening starts at once.
  const fullPlayerTrack =
    screen === 'app' && isFullPlayerOpen ? currentTrack : null;
  const playerTrack = screen === 'app' ? currentTrack : null;
  const playerTrackId = playerTrack?.id;
  const playCount = useMemo(
    () =>
      preferences.showPlayCount && playerTrackId
        ? visibleHistory.filter((event) => event.trackId === playerTrackId).length
        : null,
    [playerTrackId, preferences.showPlayCount, visibleHistory],
  );
  // Song info in the player's menu counts plays whether or not the setting shows them.
  const playerTotalPlays = useMemo(
    () => (playerTrackId ? visibleHistory.filter((event) => event.trackId === playerTrackId).length : 0),
    [playerTrackId, visibleHistory],
  );
  const menuTrackId = trackMenu?.track.id;
  const menuPlayCount = useMemo(
    () => (menuTrackId ? visibleHistory.filter((event) => event.trackId === menuTrackId).length : 0),
    [menuTrackId, visibleHistory],
  );

  // Stable, so the memoized full player, mini player and bar skip the re-renders
  // that tab switches, search typing and history updates would otherwise cause.
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);
  const openSleepTimer = useCallback(() => setIsSleepTimerOpen(true), []);
  // The tab state, read when the player's buttons are pressed rather than
  // baked into them, so their callbacks (and the player) stay the same
  // across tab switches.
  const latestTabs = useRef({ activeTab, moreStack, selectTab });
  useEffect(() => {
    latestTabs.current = { activeTab, moreStack, selectTab };
  });
  const openPlayerGroup = useCallback(
    (route: MoreRoute) => {
      const { activeTab: tab, moreStack: openPages } = latestTabs.current;
      // The player morphs closed while the page opens behind it.
      changePlayerOpen(false);
      setIsSearchOpen(false);
      setIsStatsOpen(false);
      // Over Collections the page goes on top, so Back passes through what was open.
      const stack = tab === 'more' ? [...openPages, route] : [route];
      setMoreStack(stack);
      setActiveTab('more');
      setPlayerReturnTab(tab);
      setPlayerReturnDepth(stack.length);
    },
    [changePlayerOpen],
  );
  const openEqualizerFromPlayer = useCallback(() => {
    const { activeTab: tab, selectTab: openTab } = latestTabs.current;
    openTab('equalizer');
    // Back from Equalizer reopens the player over this tab.
    setPlayerReturnTab(tab);
    setPlayerReturnDepth(null);
  }, []);
  const deleteFromPlayer = useCallback((track: MusicTrack) => void deleteSongs([track]), [deleteSongs]);
  const deleteFromLibrary = useCallback((list: MusicTrack[]) => void deleteSongs(list), [deleteSongs]);
  const openCurrentTrackMenu = useCallback(() => {
    if (currentTrack) {
      openTrackMenu(currentTrack);
    }
  }, [currentTrack, openTrackMenu]);
  const nowPlaying = useMemo(
    () =>
      currentTrack
        ? {
            track: currentTrack,
            isPlaying,
            isBuffering,
            onTogglePlayback: togglePlayback,
            onNext: skipNext,
            onPrevious: skipPrevious,
            trackAfterSkip: playbackController.trackAfterSkip,
            onOpenPlayer: openFullPlayer,
            onOpenChange: changePlayerOpen,
            transition: playerTransition,
          }
        : null,
    [
      changePlayerOpen,
      currentTrack,
      openFullPlayer,
      isBuffering,
      isPlaying,
      playbackController,
      playerTransition,
      skipNext,
      skipPrevious,
      togglePlayback,
    ],
  );

  return (
    <View style={styles.screen}>
      <StatusBar
        style={theme === 'light' ? 'dark' : 'light'}
        hidden={isFullScreen}
      />
      {Platform.OS === 'android' && (
        <NavigationBar
          hidden={false}
          style={theme === 'light' ? 'light' : 'dark'}
        />
      )}

      <Animated.View
        style={[styles.mainScroll, recedeStyle]}
        // Hidden from screen readers while the player sheet covers it.
        importantForAccessibility={fullPlayerTrack ? 'no-hide-descendants' : 'auto'}
      >
        <BlurTargetView ref={blurTarget} style={styles.mainScroll}>
        <GestureDetector gesture={tabSwipe}>
        <Animated.View style={[styles.mainScroll, swipeStyle]}>
        {screen === 'app' ? (
          <PageVisible.Provider value={!isFullPlayerOpen}>
            <TabLayer active={!isSearchOpen && activeTab === 'home'} warm={warmTabs > 0} swipe={pendingSwipe}>
              {isStatsOpen ? (
              <ScrollView
                // A new scroll view for Stats, so it opens at the top.
                key="stats"
                style={styles.mainScroll}
                contentContainerStyle={appPageContent}
                showsVerticalScrollIndicator={false}
                onScroll={homeBarScroll}
                scrollEventThrottle={32}
              >
                <View style={styles.screenBody}>
                    <Animated.View entering={statsDirection === 'forward' ? PUSH_IN : undefined}>
                      <StatsScreen
                        history={visibleHistory}
                        historyLoaded={isHistoryLoaded}
                        historyError={historyError}
                        tracks={playableTracks}
                        tracksById={tracksById}
                        goalMinutes={goalMinutes}
                        onChangeGoal={changeGoal}
                        onPlayTrack={playTrack}
                        onBack={() => setIsStatsOpen(false)}
                      />
                    </Animated.View>
                </View>
              </ScrollView>
              ) : (
                    // Home owns its scroll view, so its large title can fold into a bar on the UI thread.
                    <Animated.View entering={statsDirection === 'back' ? POP_IN : undefined} style={styles.mainScroll}>
                      <HomeTab
                        trackCount={trackCount}
                        tracks={playableTracks}
                        folders={folders}
                        blockedFolderIds={blockedFolderIds}
                        tracksById={tracksById}
                        history={visibleHistory}
                        historyLoaded={isHistoryLoaded}
                        historyError={historyError}
                        playbackError={playbackError}
                        currentTrack={currentTrack}
                        isPlaying={isPlaying}
                        queueSource={queueSource}
                        // On screen: the launch screen is gone and Home is the page showing.
                        revealed={isLaunchTimeUp && screen === 'app' && activeTab === 'home' && !isSearchOpen}
                        // Can be seen right now: loops and live numbers only run then.
                        active={isLaunchTimeUp && screen === 'app' && activeTab === 'home' && !isSearchOpen && !isFullPlayerOpen && isAppActive}
                        contentContainerStyle={appPageContent}
                        onBarScroll={homeBarScrollAt}
                        onPlayTrack={playTrack}
                        onPlayMix={playMix}
                        onPlayFromList={playMixFrom}
                        onOpenPlayer={openFullPlayer}
                        onOpenStats={openStats}
                        goalMinutes={goalMinutes}
                        onChangeGoal={changeGoal}
                        onRefresh={refreshLibrary}
                        isLoading={isLoading}
                      />
                    </Animated.View>
              )}
            </TabLayer>

            <TabLayer active={!isSearchOpen && activeTab === 'library'} warm={warmTabs > 1} swipe={pendingSwipe}>
              <LibraryTab
                onSearchEverywhere={(query) => {
                  setSearchQuery(query);
                  setIsSearchOpen(true);
                }}
                folders={folders}
                tracks={tracks}
                blockedFolderIds={blockedFolderIds}
                currentTrackId={currentTrack?.id ?? null}
                isPlaying={isPlaying}
                onPlayTrack={playFromList}
                onPlayAll={playMix}
                onOpenGroup={openSearchResult}
                onOpenTrackMenu={openTrackMenu}
                onDeleteTracks={deleteFromLibrary}
                searchText={librarySearch}
                onChangeSearchText={setLibrarySearch}
                sortBy={librarySort}
                onChangeSortBy={setLibrarySort}
                sortDirection={librarySortDirection}
                onChangeSortDirection={setLibrarySortDirection}
                contentContainerStyle={[
                  styles.libraryListContent,
                  { paddingTop: 18 + insets.top, paddingBottom: dockHeight + 16 },
                ]}
              />
            </TabLayer>

            <TabLayer active={!isSearchOpen && activeTab === 'more'} warm={warmTabs > 2} swipe={pendingSwipe}>
              <MoreTab
                stack={moreStack}
                onPush={pushMore}
                onPop={backInMore}
                tracks={playableTracks}
                history={visibleHistory}
                currentTrackId={currentTrack?.id ?? null}
                isPlaying={isPlaying}
                onPlayFromList={playFromList}
                onOpenTrackMenu={openTrackMenu}
                contentContainerStyle={[
                  styles.libraryListContent,
                  { paddingTop: 18 + insets.top, paddingBottom: dockHeight + 16 },
                ]}
              />
            </TabLayer>

            <TabLayer active={!isSearchOpen && activeTab === 'settings'} warm={warmTabs > 3} swipe={pendingSwipe}>
              <ScrollView
                ref={settingsScrollRef}
                style={styles.mainScroll}
                contentContainerStyle={appPageContent}
                showsVerticalScrollIndicator={false}
                // Settings search: a tap on a result works while the keyboard is up.
                keyboardShouldPersistTaps="handled"
                onScroll={settingsBarScroll}
                scrollEventThrottle={32}
              >
                <View style={styles.screenBody}>
                  <SettingsTab
                    page={settingsPage}
                    onOpenPage={setSettingsPage}
                    onBack={() => setSettingsPage(null)}
                    isLoading={isLoading}
                    theme={theme}
                    accent={accent}
                    isAmoled={isAmoled}
                    themeError={themeError}
                    amoledError={amoledError}
                    appearance={appearance}
                    onSelectAppearance={onSelectAppearance}
                    equalizerPreset={equalizerPresetName}
                    onOpenEqualizer={() => {
                      setEqualizerBackTab('settings');
                      setActiveTab('equalizer');
                    }}
                    onSelectAccent={onSelectAccent}
                    onToggleAmoled={onToggleAmoled}
                    isFullScreen={isFullScreen}
                    fullScreenError={fullScreenError}
                    onToggleFullScreen={onToggleFullScreen}
                    onManageFolders={openFolderSettings}
                    goalMinutes={goalMinutes}
                    onChangeGoal={changeGoal}
                    onRefresh={refreshLibrary}
                    onOpenPermissionSettings={openSettings}
                    onSetUpAgain={openSetupAgain}
                    tracks={tracks}
                    listenCount={listeningHistory.length}
                    onClearHistory={clearHistory}
                    onResetSettings={resetSettings}
                    scrollRef={settingsScrollRef}
                  />
                </View>
              </ScrollView>
            </TabLayer>

            <TabLayer active={!isSearchOpen && activeTab === 'equalizer'} swipe={pendingSwipe}>
              {/* Its own scroll view: the gesture-handler one, so band sliders win drags. */}
              <EqualizerTab accent={accent} onBack={goBack} contentContainerStyle={appPageContent} />
            </TabLayer>

            {/* Search sits over the hidden tabs, so closing it lands where you were.
                Opening, it shows at once under the page dissolving away (TabLayer);
                closing, it dissolves over the page coming back. */}
            {isSearchOpen && (
              <Animated.View exiting={SEARCH_FADE_OUT} style={styles.screen}>
                <SearchScreen
                  query={searchQuery}
                  tracks={playableTracks}
                  folders={searchFolders}
                  history={visibleHistory}
                  currentTrackId={currentTrack?.id ?? null}
                  isPlaying={isPlaying}
                  onPlaySong={playFromList}
                  onOpenRoute={openSearchResult}
                  contentContainerStyle={[
                    styles.libraryListContent,
                    { paddingTop: 18 + insets.top, paddingBottom: dockHeight + dockLift + 16 },
                  ]}
                />
              </Animated.View>
            )}
          </PageVisible.Provider>
        ) : screen === 'onboarding' ? (
          <Onboarding
            mode={onboardingMode}
            theme={theme}
            appearance={appearance}
            accent={accent}
            isAmoled={isAmoled}
            onSelectAppearance={onSelectAppearance}
            onSelectAccent={onSelectAccent}
            onToggleAmoled={onToggleAmoled}
            goalMinutes={goalMinutes}
            onChangeGoal={changeGoal}
            onRequestAccess={requestAccess}
            library={scannedLibrary}
            blockedFolderIds={blockedFolderIds}
            onToggleFolder={toggleFolder}
            onIncludeAllFolders={() => setBlockedFolderIds([])}
            onOpenAppSettings={openSettings}
            onFinish={finishOnboarding}
          />
        ) : (
          <Animated.View key={screen} entering={PAGE_FADE} style={styles.mainScroll}>
          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.content,
              { paddingTop: 18 + insets.top, paddingBottom: 28 + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {screen !== 'starting' && (
              <Header showBack onBack={goBack} />
            )}

            {screen === 'folders' && (
              <FoldersScreen
                folders={folders}
                blockedFolderIds={blockedFolderIds}
                hasSavedFolderRules={hasSavedFolderRules}
                isLoading={isLoading}
                onToggleFolder={toggleFolder}
                onSave={saveFolderRules}
                onIncludeAll={allowAllFolders}
                onCancel={cancelFolderChanges}
              />
            )}

            {screen === 'denied' && (
              <DeniedScreen
                isLoading={isLoading}
                onOpenSettings={openSettings}
                onTryAgain={findMusic}
              />
            )}

            {screen === 'unsupported' && (
              <MessageScreen
                eyebrow="ANDROID ONLY"
                title={'Music is not\navailable here yet.'}
                description="Muse can find music on Android phones for now."
                actionLabel="Back"
                onAction={() => setScreen('onboarding')}
              />
            )}

            {screen === 'build-required' && (
              <BuildRequiredScreen onBack={() => setScreen('onboarding')} />
            )}

            {screen === 'error' && (
              <MessageScreen
                eyebrow="TRY AGAIN"
                title={'We could not find\nyour music.'}
                description={`Please try again. ${errorMessage}`}
                actionLabel="Try again"
                onAction={retryAfterError}
              />
            )}
          </ScrollView>
          </Animated.View>
        )}
        </Animated.View>
        </GestureDetector>
        </BlurTargetView>
        {screen === 'app' && (
        // Floats over the page. While searching it rises onto the keyboard.
        <Animated.View
          ref={dockRef}
          pointerEvents="box-none"
          style={[styles.dock, isSolidBar && styles.dockSolid, dockLiftStyle]}
          onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
        >
        <HideForSelection style={[styles.dockStack, (isSolidBar || isDockJoined) && styles.dockSolid]}>
        {(libraryNotice.length > 0 || currentTrack) && (
        <View
          pointerEvents="box-none"
          style={[styles.dockFloating, isSolidBar && styles.dockFloatingSolid]}
        >
        {libraryNotice.length > 0 && (
          <Animated.View
            entering={NOTICE_ENTER}
            exiting={NOTICE_EXIT}
            style={[styles.appNotice, isSolidBar && styles.appNoticeSolid]}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.appNoticeText}>{libraryNotice}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message"
              hitSlop={10}
              onPress={() => setLibraryNotice('')}
              style={styles.appNoticeDismiss}
            >
              <CloseIcon color="muted" size={12} />
            </Pressable>
          </Animated.View>
        )}
        {currentTrack && (
          <HideWhenBarFolded enabled={!isSolidBar}>
          <MiniPlayer
            track={currentTrack}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            error={playbackError}
            onPrevious={skipPrevious}
            onNext={skipNext}
            trackAfterSkip={playbackController.trackAfterSkip}
            onTogglePlayback={togglePlayback}
            onOpenPlayer={openFullPlayer}
            onOpenChange={changePlayerOpen}
            onOpenMenu={openCurrentTrackMenu}
            isCovered={isFullPlayerOpen}
            transition={playerTransition}
            blurTarget={blurTarget}
            joined={isDockJoined}
          />
          </HideWhenBarFolded>
        )}
        </View>
        )}
        <BottomTabs
          activeTab={activeTab}
          onSelectTab={selectTab}
          onSearch={openSearch}
          blurTarget={blurTarget}
          isSearching={isSearchOpen}
          query={searchQuery}
          onChangeQuery={setSearchQuery}
          onCloseSearch={closeSearch}
          bottomInset={insets.bottom}
          nowPlaying={nowPlaying}
          joined={isDockJoined}
        />
        </HideForSelection>
        </Animated.View>
        )}
      </Animated.View>
      {playerTrack && (
        <FullPlayerHost
          fallbackTrack={playerTrack}
          isOpen={isFullPlayerOpen}
          playCount={playCount}
          onOpenGroup={openPlayerGroup}
          showAudioDetails={preferences.showAudioDetails}
          onOpenChange={changePlayerOpen}
          transition={playerTransition}
          onTogglePlayback={togglePlayback}
          onPrevious={skipPrevious}
          onNext={skipNext}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeatMode}
          onSeek={seekToRatio}
          onSelectQueueTrack={skipToQueueIndex}
          onMoveQueueItem={moveQueueItem}
          onRemoveFromQueue={removeFromQueue}
          onOpenSleepTimer={openSleepTimer}
          onOpenEqualizer={openEqualizerFromPlayer}
          onDeleteTrack={deleteFromPlayer}
          totalPlays={playerTotalPlays}
          trackAfterSkip={playbackController.trackAfterSkip}
          equalizerPreset={equalizerPresetName}
          recentTracks={recentTracks}
        />
      )}
      {/* Above the dock, or under the header while the full player is open. */}
      <ToastHost bottom={dockHeight + 12} top={isFullPlayerOpen ? insets.top + 78 : null} />
      {/* Change cover and the full-size cover view, opened from song menus and the player's cover. */}
      <CoverHost />
      <SongMenu
        track={trackMenu?.track ?? null}
        playlistId={trackMenu?.playlistId}
        playCount={menuPlayCount}
        onDelete={(track) => void deleteSongs([track])}
        onClose={() => setTrackMenu(null)}
      />
      <SleepTimerModal
        visible={isSleepTimerOpen}
        endsAt={sleepTimerEndsAt}
        atTrackEnd={sleepsAtTrackEnd}
        onClose={() => setIsSleepTimerOpen(false)}
        onSelectMinutes={startSleepTimer}
        onSelectTrackEnd={sleepAtTrackEnd}
        onCancelTimer={clearSleepTimer}
      />
      {/* On top of everything while a slow library restore is still running. */}
      {isLaunchShown && <LaunchScreen />}
      <ConfirmSheet
        request={isLaunchShown ? null : crashNotice}
        onClose={() => {
          // Muse can rebuild this screen (after an icon switch); the notice stays gone.
          pendingCrashNotice = null;
          setCrashNotice(null);
        }}
      />
    </View>
  );
}

type PlaybackProp =
  | 'track'
  | 'queue'
  | 'currentIndex'
  | 'isPlaying'
  | 'isBuffering'
  | 'shuffle'
  | 'repeatMode'
  | 'error'
  | 'queueSource'
  | 'sleepTimerEndsAt'
  | 'sleepAtTrackEnd';

/**
 * The full player with the whole playback snapshot. It subscribes here, not
 * in MuseApp, so a queue edit re-renders the player alone. Closed, it
 * catches up at low priority, so a song change paints the list and the mini
 * player first. Open, it follows live.
 */
function FullPlayerHost({
  fallbackTrack,
  ...props
}: Omit<ComponentProps<typeof FullPlayer>, PlaybackProp> & { fallbackTrack: MusicTrack }) {
  const live = usePlayback();
  const deferred = useDeferredValue(live);
  const playback = props.isOpen ? live : deferred;
  return (
    <FullPlayer
      {...props}
      track={playback.currentTrack ?? fallbackTrack}
      queue={playback.queue}
      currentIndex={playback.queueIndex}
      isPlaying={playback.isPlaying}
      isBuffering={playback.isBuffering}
      shuffle={playback.shuffle}
      repeatMode={playback.repeatMode}
      error={playback.error}
      queueSource={playback.queueSource}
      sleepTimerEndsAt={playback.sleepTimerEndsAt}
      sleepAtTrackEnd={playback.sleepAtTrackEnd}
    />
  );
}
