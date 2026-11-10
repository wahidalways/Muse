import { memo, useCallback, useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { MusicTrack, RepeatMode } from '../types';
import { AlbumArtwork, generatedArtHue } from '../components/AlbumArtwork';
import {
  ControlIcon,
  PlaybackGlyph,
  usePlayButtonColors,
} from '../components/icons';
import { FavoriteButton } from '../components/FavoriteButton';
import { MarqueeText } from '../components/MarqueeText';
import { PressableScale } from '../components/PressableScale';
import { showToast } from '../components/Toast';
import { EASE_OUT, project, rubberband } from '../motion/motion';
import { useTrackSwipe } from './useTrackSwipe';
import { ProgressSlider } from './progress';
import { settlePlayer, sheetTravel, type PlayerTransition } from './playerTransition';
import { useAppStyles } from '../theme/styles';
import { formatPlayCount, formatSleepTimer, summarizeAudio } from '../utils/format';
import { getAudioDetails, getLyrics } from '../../modules/muse-audio-metadata';
import { coverColor, useSongCover } from '../library/covers';
import { HoldToView } from '../components/HoldToView';
import { openCoverViewer } from '../components/CoverSheets';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ThemeContext } from '../theme/theme';
import { usePreferences, type PlayerSkin } from '../settings/preferences';
import { groupKeyFor } from '../library/browse';
import { parseLyrics, type Lyrics } from '../library/lyrics';
import { getPlaybackController } from '../playback/PlaybackController';
import type { MoreRoute } from '../screens/MoreTab';
import { VolumeSlider, canShowVolumeSlider } from './VolumeSlider';
import { hapticImpact, hapticSelection } from '../utils/haptics';
import { SPEED_OPTIONS, setTrackSpeed, useTrackSpeed } from '../library/trackSpeeds';
import { MINIMAL_TITLE_LINES, minimalLabels, minimalTitleSize, minimalTitleStyle } from './minimalType';
import { Sheet, SheetRow } from '../components/Sheet';
import { SongMenu } from '../components/SongMenu';
import { useSecondsLeft } from './useSecondsLeft';
import { LyricsView } from './LyricsView';
import { QueuePane } from './QueuePane';
import { VinylDisc } from './VinylDisc';
import { PlayerSkinSheet, skinLabel } from './PlayerSkinSheet';

// Module scope: layout-animation builders are not rebuilt on every render.
const TINT_CHANGE = FadeIn.duration(500).easing(EASE_OUT);
/** Room the volume slider takes, so the artwork shrinks to fit on short screens. */
const VOLUME_ROW_HEIGHT = 40;
/** Below this a cover is close to grey, so the background stays plain. */
export const MIN_TINT_COLORFULNESS = 0.12;
/** Height the player needs for everything except the artwork. */
const PLAYER_CONTROLS_HEIGHT = 450;
const MAX_ARTWORK_SIZE = 520;
// shortcut: one sheet closing and the next opening can clash on Android, so the next waits this long; switch to a single sheet with pages if it ever flickers.
const SHEET_HANDOFF_MS = 260;
/** Side padding of the player; the big cover's position is measured inside it. */
const SHEET_PADDING = 24;
/** Corner radius of the mini player card, which the sheet grows out of. */
const MINI_CARD_RADIUS = 22;
/** Artwork size while paused, as in Apple Music: it settles back on play. */
const PAUSED_ARTWORK_SCALE = 0.86;
/** A soft spring with a little give, for the artwork growing and shrinking. */
const ARTWORK_SPRING = { duration: 500, dampingRatio: 0.72, reduceMotion: ReduceMotion.System } as const;
/** Cover to Lyrics / Up Next and back: the cover flies to (or from) the top row. */
const MODE_TIMING = { duration: 340, easing: Easing.bezier(0.3, 0.9, 0.25, 1), reduceMotion: ReduceMotion.System } as const;
/** The record turns once in this long: slow, like a calm 33. */
const VINYL_TURN_MS = 7200;
/** Minimal type's cover. */
const MINIMAL_ART = 116;
/** Minimal type's title is already display size, so the phone's text size grows it at most this much. */
const MINIMAL_FONT_SCALE = 1.3;
/** The record fills this share of the space a cover would. */
const VINYL_SHARE = 0.92;
/** The top row's cover in Lyrics and Up Next. */
const THUMB = 56;

type PlayerMode = 'cover' | 'lyrics' | 'queue';

/** The player's two background tones: lighter and a little shifted on top, deep at the bottom. */
export function tintTones(hue: number, theme: 'light' | 'dark'): [string, string] {
  const h = Math.round(hue);
  return theme === 'dark'
    ? [`hsl(${(h + 14) % 360}, 36%, 27%)`, `hsl(${h}, 30%, 8%)`]
    : [`hsl(${(h + 14) % 360}, 52%, 88%)`, `hsl(${h}, 30%, 79%)`];
}

/**
 * The full player, as a sheet over the app. It stays mounted (invisible
 * while closed) so opening never waits for it to build.
 *
 * It morphs out of the mini player, as in Apple Music: the sheet grows from
 * the mini card and the cover flies up into place, all driven by one shared
 * progress value (see playerTransition.ts). Drags move it with the finger
 * and hand the release velocity to the spring, so a flick finishes and a
 * slow drag settles back. Sideways drags on the artwork change the song.
 *
 * The bar at the bottom turns the player into Lyrics or Up Next in place:
 * the cover flies to a small top row and the words or the queue fill the
 * rest. Four skins (Settings › Appearance › Player skin) lay out the same
 * parts differently. All motion runs on the UI thread, transform and
 * opacity only, and nothing animates while the player is closed.
 */
export const FullPlayer = memo(function FullPlayer({
  track,
  queue,
  currentIndex,
  isPlaying,
  isBuffering,
  shuffle,
  repeatMode,
  error,
  isOpen,
  onOpenChange,
  transition,
  playCount,
  showAudioDetails,
  onOpenGroup,
  onTogglePlayback,
  onPrevious,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
  onSeek,
  onSelectQueueTrack,
  onMoveQueueItem,
  onRemoveFromQueue,
  onOpenSleepTimer,
  onOpenEqualizer,
  onDeleteTrack,
  totalPlays,
  trackAfterSkip,
  queueSource,
  equalizerPreset,
  sleepTimerEndsAt,
  sleepAtTrackEnd,
  recentTracks,
}: {
  track: MusicTrack;
  queue: MusicTrack[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  error: string;
  /** Open or closed as the app sees it; the morph animates to match. */
  isOpen: boolean;
  /** A drag or the close button asks to open or close. */
  onOpenChange: (open: boolean) => void;
  transition: PlayerTransition;
  /** Shown under the artist when the setting is on; null when off. */
  playCount: number | null;
  /** Format, bitrate and sample rate under the artist (Settings). */
  showAudioDetails: boolean;
  /** Opens the artist's or album's page (the player closes first). */
  onOpenGroup: (route: MoreRoute) => void;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSeek: (ratio: number) => void;
  onSelectQueueTrack: (index: number) => void;
  onMoveQueueItem: (from: number, to: number) => void;
  onRemoveFromQueue: (index: number) => void;
  onOpenSleepTimer: () => void;
  /** Shows the Equalizer page, which the player reveals as it closes. */
  onOpenEqualizer: () => void;
  /** Deletes the song's file, from the menu. */
  onDeleteTrack: (track: MusicTrack) => void;
  /** How often this song was played, for Song info (not the setting-gated count). */
  totalPlays: number;
  /** The song a skip would land on, or null when Previous would restart. */
  trackAfterSkip: (direction: 1 | -1) => MusicTrack | null;
  /** Where the queue came from, for "Playing from". Null when unknown. */
  queueSource: string | null;
  /** The equalizer preset's name, shown in the player options. */
  equalizerPreset: string;
  sleepTimerEndsAt: number | null;
  /** The sleep timer pauses at the end of this song. */
  sleepAtTrackEnd: boolean;
  /** Recently played songs, newest first, for Up Next's history. */
  recentTracks: MusicTrack[];
}) {
  const styles = useAppStyles();
  const { width: windowWidth, height: windowHeight, fontScale: windowFontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const playButton = usePlayButtonColors();
  const preferences = usePreferences();
  const skin: PlayerSkin = preferences.playerSkin;
  const reduceMotion = useReducedMotion();
  // Song changes (swipes on the cover, the skip buttons, a song ending) run
  // through the same hook as the mini player: the old song slides out on
  // the UI thread, the new one swaps in out of sight and slides in. The
  // cover, title and everything about the song follow `shown`.
  const swipe = useTrackSwipe({ track, onNext, onPrevious, trackAfterSkip, follow: 'finger' });
  const shown = swipe.shownTrack;
  // One menu for the song and the player: 'actions', or straight on 'info'.
  const [menu, setMenu] = useState<'actions' | 'info' | null>(null);
  const [sheet, setSheet] = useState<'speed' | 'skin' | null>(null);
  // Lyrics or Up Next in place of the cover. Closing the player goes back to the cover.
  const [mode, setMode] = useState<PlayerMode>('cover');
  /** The pane on screen: stays set while it fades out, so it does not go blank. */
  const [pane, setPane] = useState<Exclude<PlayerMode, 'cover'> | null>(null);
  if (!isOpen && (menu || sheet || mode !== 'cover' || pane)) {
    setMenu(null);
    setSheet(null);
    setMode('cover');
    setPane(null);
  }
  if (mode !== 'cover' && pane !== mode) {
    setPane(mode);
  }
  // Only when it can really appear, so the cover never leaves an empty gap for it.
  const showVolume = preferences.showVolumeSlider && canShowVolumeSlider();
  const { theme } = useContext(ThemeContext);
  // The artwork fills the content width (24pt padding each side), up to a
  // cap for tablets, and only shrinks when the screen is too short to fit it
  // with the header, title, progress, controls and bar.
  const artworkSize = Math.round(
    Math.max(
      160,
      Math.min(
        windowWidth - 48,
        MAX_ARTWORK_SIZE,
        windowHeight -
          insets.top -
          insets.bottom -
          PLAYER_CONTROLS_HEIGHT -
          (showVolume ? VOLUME_ROW_HEIGHT : 0),
      ),
    ),
  );
  const bodyTop = 18 + insets.top;
  // Each skin's main picture, and its size: the cover, the whole width, the record or a small cover.
  /** Where the header ends, its margins included: Lyrics and Up Next start there, and Full-bleed reaches above it. */
  const [headerBottom, setHeaderBottom] = useState(68);
  const bleedSize = Math.round(Math.min(windowWidth, artworkSize + bodyTop + headerBottom));
  const visualSize =
    skin === 'bleed' ? bleedSize : skin === 'vinyl' ? Math.round(artworkSize * VINYL_SHARE) : skin === 'minimal' ? MINIMAL_ART : artworkSize;
  const heroRadius = Math.min(24, Math.max(10, artworkSize * 0.085));
  /** The flying cover's corners at its drawn size, so it lands with the skin's own corners. */
  const flyRadius =
    skin === 'bleed' ? 0 : skin === 'vinyl' ? artworkSize / 2 : skin === 'minimal' ? (16 * artworkSize) / MINIMAL_ART : heroRadius;

  // ---------------------------------------------------------------------------
  // Morph from the mini player. `progress`: 0 mini, 1 full, a little over 1
  // while rubber-banding up.

  const { progress } = transition;

  // Taps, back and the Equalizer button. Drags settle the spring themselves
  // (with their velocity) and set `target` first, so this does not restart it.
  useEffect(() => {
    if (transition.target.get() !== (isOpen ? 1 : 0)) {
      settlePlayer(transition, isOpen);
    }
  }, [isOpen, transition]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Where this player sits in the window, to place the mini player's
  // window-measured rects in its own coordinates.
  const rootRef = useRef<ComponentRef<typeof Animated.View>>(null);
  const measureOrigin = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => transition.origin.set({ x, y }));
  }, [transition]);

  // Unmounted while open (its last song removed): the app must not stay receded.
  useEffect(
    () => () => {
      transition.target.set(0);
      transition.progress.set(0);
    },
    [transition],
  );

  const dragStart = useSharedValue(1);
  const dismissPan = usePanGesture({
    // Downward drags only, and only once clearly vertical.
    activeOffsetY: 12,
    failOffsetX: [-14, 14],
    onActivate: () => {
      'worklet';
      dragStart.set(progress.get());
    },
    onUpdate: (event) => {
      'worklet';
      const travel = sheetTravel(transition, windowHeight);
      const next = dragStart.get() - event.translationY / travel;
      // Past fully open it resists, like the edge of a scroll view.
      progress.set(
        next <= 1
          ? Math.max(0, next)
          : 1 + rubberband((next - 1) * travel, windowHeight) / travel,
      );
    },
    onDeactivate: (event) => {
      'worklet';
      const travel = sheetTravel(transition, windowHeight);
      const projected = event.translationY + project(event.velocityY);
      const shouldClose = !event.canceled && projected > travel * 0.3;
      settlePlayer(transition, !shouldClose, -event.velocityY / travel);
      if (shouldClose) {
        scheduleOnRN(hapticImpact);
        scheduleOnRN(onOpenChange, false);
      }
    },
  });

  /** The sheet's top edge: the mini card's top at 0, the screen top at 1. */
  const sheetTop = (open: number) => {
    'worklet';
    return interpolate(
      open,
      [0, 1],
      [sheetTravel(transition, windowHeight), 0],
      Extrapolation.EXTEND,
    );
  };

  const rootStyle = useAnimatedStyle(() => ({
    // Fully closed draws nothing, so the hidden player costs no frames.
    opacity: progress.get() > 0.001 ? 1 : 0,
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 0.45], Extrapolation.CLAMP),
  }));
  // The card grows out of the mini player: its width, corners and top edge at
  // 0, the full screen at 1. Scaled, not resized, so nothing relays out.
  const cardStyle = useAnimatedStyle(() => {
    const open = progress.get();
    const card = transition.miniCard.get();
    const hasCard = card.width > 0;
    const startScale = hasCard ? card.width / windowWidth : 1;
    const startShift = hasCard
      ? card.x - transition.origin.get().x + card.width / 2 - windowWidth / 2
      : 0;
    const scaleX = interpolate(open, [0, 1], [startScale, 1], Extrapolation.CLAMP);
    // Transform and opacity only: corners stay fixed (sheetLayout.card), as an
    // animated radius waits behind React and stutters while the player opens.
    return {
      opacity: interpolate(open, [0, 0.25], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: sheetTop(open) },
        { translateX: interpolate(open, [0, 1], [startShift, 0], Extrapolation.CLAMP) },
        { scaleX },
      ],
    };
  });
  // The controls ride the sheet and fade in once it is mostly open.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.45, 0.95], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: sheetTop(progress.get()) }],
  }));

  // Where the big picture and the top row's cover rest, measured against the
  // player body, which never moves: the sliding layer around it would add
  // its own offset.
  const bodyRef = useRef<ComponentRef<typeof View>>(null);
  const heroArtRef = useRef<ComponentRef<typeof View>>(null);
  const thumbRef = useRef<ComponentRef<typeof View>>(null);
  const heroArt = useSharedValue({ x: 0, y: 0, size: 0 });
  const thumb = useSharedValue({ x: 0, y: 0, size: 0 });
  const measureHeroArt = useCallback(() => {
    const body = bodyRef.current;
    if (body) {
      heroArtRef.current?.measureLayout(body, (x, y, width) => {
        heroArt.set({ x: SHEET_PADDING + x, y: bodyTop + y, size: width });
      });
    }
  }, [bodyTop, heroArt]);
  const measureThumb = useCallback(() => {
    const body = bodyRef.current;
    if (body) {
      thumbRef.current?.measureLayout(body, (x, y, width) => {
        thumb.set({ x: SHEET_PADDING + x, y: bodyTop + y, size: width });
      });
    }
  }, [bodyTop, thumb]);

  // ---------------------------------------------------------------------------
  // Audio details and play count, under the artist (both from Settings).
  // Details are read from the file only while the player is open.

  const [audioDetails, setAudioDetails] = useState<{ trackId: string; summary: ReturnType<typeof summarizeAudio> } | null>(
    null,
  );
  useEffect(() => {
    if (!showAudioDetails || !isOpen) {
      return;
    }
    let isActive = true;
    void getAudioDetails(shown.id).then((details) => {
      if (isActive) {
        setAudioDetails({ trackId: shown.id, summary: summarizeAudio(details, shown.filename) });
      }
    });
    return () => {
      isActive = false;
    };
  }, [isOpen, showAudioDetails, shown.filename, shown.id]);
  // Lyrics saved in the file, read only while the player is open.
  const [lyrics, setLyrics] = useState<{ trackId: string; lyrics: Lyrics | null } | null>(null);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let isActive = true;
    void getLyrics(shown.id).then((text) => {
      if (isActive) {
        const parsed = text ? parseLyrics(text) : null;
        setLyrics({ trackId: shown.id, lyrics: parsed && parsed.lines.length > 0 ? parsed : null });
      }
    });
    return () => {
      isActive = false;
    };
  }, [isOpen, shown.id]);
  const lyricsKnown = lyrics?.trackId === shown.id;
  const trackLyrics = lyricsKnown ? lyrics.lyrics : null;
  const hasNoLyrics = lyricsKnown && trackLyrics === null;
  const seekToSeconds = useCallback(
    (seconds: number) => {
      const { duration } = getPlaybackController().getProgress();
      if (duration > 0) {
        onSeek(Math.min(1, seconds / duration));
      }
    },
    [onSeek],
  );

  // The cover's main hue, for the two-tone background behind the player. It
  // follows the cover the song shows: one chosen in Change cover, or the file's.
  const ownCover = useSongCover(shown.id);
  // Muse art (everywhere, or chosen for this song) has a known colour, so no cover is read for it.
  const showsMuseArt = preferences.artworkStyle === 'generated' || ownCover?.kind === 'muse';
  const coverKey = `${shown.id}|${ownCover?.kind === 'image' ? ownCover.uri : ''}|${preferences.bestFileCover}`;
  const [coverHue, setCoverHue] = useState<{ key: string; hue: number | null } | null>(null);
  useEffect(() => {
    if (!isOpen || !preferences.coverBackground || showsMuseArt) {
      return;
    }
    let isActive = true;
    void coverColor(shown.id).then((color) => {
      if (isActive) {
        setCoverHue({
          key: coverKey,
          hue: color && color.colorfulness >= MIN_TINT_COLORFULNESS ? color.hue : null,
        });
      }
    });
    return () => {
      isActive = false;
    };
  }, [coverKey, isOpen, preferences.coverBackground, showsMuseArt, shown.id]);
  const tintHue = !preferences.coverBackground
    ? null
    : showsMuseArt
      ? generatedArtHue(shown, preferences.artSet)
      : coverHue?.key === coverKey
        ? coverHue.hue
        : null;
  const tint = tintHue === null ? null : tintTones(tintHue, theme);
  // See-through chips and lines that read on the tinted background.
  const chip = theme === 'light' ? 'rgba(25, 34, 24, 0.08)' : 'rgba(255, 255, 255, 0.12)';

  const openGroup = (group: 'artist' | 'album') => {
    hapticSelection();
    onOpenGroup({ kind: 'group', group, key: groupKeyFor(shown, group) });
  };

  const audio = showAudioDetails && audioDetails?.trackId === shown.id ? audioDetails.summary : null;

  // Starts at its resting size, so opening the player does not animate it.
  // Settings › Now Playing can keep it full size while paused.
  const shrinks = preferences.shrinkArtworkOnPause && !isPlaying;
  const artworkScale = useSharedValue(shrinks ? PAUSED_ARTWORK_SCALE : 1);
  useEffect(() => {
    artworkScale.set(withSpring(shrinks ? PAUSED_ARTWORK_SCALE : 1, ARTWORK_SPRING));
  }, [artworkScale, shrinks]);

  // 0: the cover; 1: Lyrics or Up Next. The pane's content unmounts once it has faded out.
  const modeProgress = useSharedValue(0);
  useEffect(() => {
    if (!isOpen) {
      modeProgress.set(0);
      return;
    }
    const toPane = mode !== 'cover';
    modeProgress.set(
      withTiming(toPane ? 1 : 0, MODE_TIMING, (finished) => {
        if (finished && !toPane) {
          scheduleOnRN(setPane, null);
        }
      }),
    );
  }, [isOpen, mode, modeProgress]);
  // Back from Lyrics or Up Next shows the cover; Back again closes the player
  // (MuseApp). Added after MuseApp's listener, so it is asked first.
  useEffect(() => {
    if (!isOpen || mode === 'cover') {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMode('cover');
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, mode]);
  const chooseMode = (next: Exclude<PlayerMode, 'cover'>) => {
    if (next === 'lyrics' && hasNoLyrics && mode !== 'lyrics') {
      showToast('No lyrics in this file', { detail: 'Lyrics in a song’s tags show up here', icon: 'lyrics' });
      return;
    }
    hapticSelection();
    setMode((current) => (current === next ? 'cover' : next));
  };

  // The record turns while music plays and the player shows it; it holds its angle otherwise.
  const spin = useSharedValue(0);
  const spins = skin === 'vinyl' && isOpen && isPlaying && mode === 'cover' && !reduceMotion;
  useEffect(() => {
    if (spins) {
      const from = spin.get() % 360;
      spin.set(from);
      spin.set(withRepeat(withTiming(from + 360, { duration: VINYL_TURN_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1));
    } else {
      cancelAnimation(spin);
    }
    return () => cancelAnimation(spin);
  }, [spin, spins]);

  // The big picture: hidden while the opening flight shows it, and flying to
  // the top row (move and scale only) as Lyrics or Up Next comes in.
  const visualStyle = useAnimatedStyle(() => {
    const p = modeProgress.get();
    const hero = heroArt.get();
    const top = thumb.get();
    const canFly = hero.size > 0 && top.size > 0;
    const dx = canFly ? top.x + top.size / 2 - (hero.x + hero.size / 2) : 0;
    const dy = canFly ? top.y + top.size / 2 - (hero.y + hero.size / 2) : 0;
    const ratio = canFly ? top.size / hero.size : 1;
    const opening = hero.size !== 0 && progress.get() < 0.999;
    return {
      opacity: opening || p >= 0.999 ? 0 : 1,
      transform: [
        { translateX: dx * p },
        { translateY: dy * p },
        { scale: artworkScale.get() * (1 + (ratio - 1) * p) },
      ],
    };
  });
  // Everything else about the cover view fades as the pane comes in.
  const heroRestStyle = useAnimatedStyle(() => ({
    opacity: 1 - modeProgress.get(),
    transform: [{ translateY: modeProgress.get() * 10 }],
  }));
  const paneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(modeProgress.get(), [0.2, 1], [0, 1], Extrapolation.CLAMP),
  }));
  const paneBodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - modeProgress.get()) * 14 }],
  }));
  const thumbStyle = useAnimatedStyle(() => ({ opacity: modeProgress.get() >= 0.999 ? 1 : 0 }));

  // The cover in flight: from the mini player's cover to the big one, along
  // with the sheet. Drawn once at full size and scaled, so it stays sharp.
  // Its corners are fixed: an animated radius would pull this view's
  // transform off the fast path too, and the cover would hitch.
  const flyStyle = useAnimatedStyle(() => {
    const open = progress.get();
    const hero = heroArt.get();
    if (hero.size === 0 || open <= 0.001 || open >= 0.999) {
      return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    }
    const mini = transition.miniArt.get();
    const origin = transition.origin.get();
    const hasMini = mini.width > 0;
    const heroCx = hero.x + hero.size / 2;
    const heroCy = hero.y + hero.size / 2 + sheetTop(open);
    const landScale = (hero.size / artworkSize) * artworkScale.get();
    // Without a mini player on screen, it simply rides up with the sheet.
    const fromCx = hasMini ? mini.x - origin.x + mini.width / 2 : heroCx;
    const fromCy = hasMini ? mini.y - origin.y + mini.height / 2 : heroCy;
    const fromScale = hasMini ? mini.width / artworkSize : landScale;
    const scale = interpolate(open, [0, 1], [fromScale, landScale]);
    return {
      opacity: 1,
      transform: [
        { translateX: interpolate(open, [0, 1], [fromCx, heroCx]) - artworkSize / 2 },
        { translateY: interpolate(open, [0, 1], [fromCy, heroCy]) - artworkSize / 2 },
        { scale },
      ],
    };
  });

  const isCover = mode === 'cover';
  const overCover = skin === 'bleed' && isCover;
  // ---------------------------------------------------------------------------
  // The skin's picture and words.

  const heart = <FavoriteButton trackId={shown.id} title={shown.title} size={22} />;
  const artistLine = (
    <Text
      numberOfLines={1}
      style={styles.fullPlayerTrackArtist}
      accessibilityActions={[
        ...(shown.artist ? [{ name: 'artist', label: `Go to ${shown.artist}` }] : []),
        ...(shown.album ? [{ name: 'album', label: `Go to ${shown.album}` }] : []),
      ]}
      onAccessibilityAction={(event) =>
        openGroup(event.nativeEvent.actionName === 'album' ? 'album' : 'artist')
      }
    >
      {shown.artist ? (
        <Text style={styles.fullPlayerLink} onPress={() => openGroup('artist')}>
          {shown.artist}
        </Text>
      ) : (
        'Unknown artist'
      )}
      {shown.album ? (
        <>
          {'  ·  '}
          <Text style={styles.fullPlayerLink} onPress={() => openGroup('album')}>
            {shown.album}
          </Text>
        </>
      ) : null}
    </Text>
  );
  const metaColor = String(styles.fullPlayerTrackMeta.color);
  const metaLine =
    audio || playCount !== null ? (
      // A format badge, the quality, quiet specs, then plays right after them;
      // tap the row for the full Song info.
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          audio && [audio.format, audio.quality, ...audio.specs].filter(Boolean).join(', '),
          playCount !== null && formatPlayCount(playCount),
        ]
          .filter(Boolean)
          .join('. ')}
        accessibilityHint="Opens song info"
        hitSlop={{ top: 8, bottom: 8 }}
        onPress={() => {
          hapticSelection();
          setMenu('info');
        }}
        style={styles.playerMetaRow}
      >
        {audio ? (
          <View style={styles.playerMetaAudio}>
            {audio.format ? (
              <View style={[styles.playerMetaBadge, { borderColor: metaColor }]}>
                <Text style={styles.playerMetaBadgeText}>{audio.format}</Text>
              </View>
            ) : null}
            {audio.quality ? <Text style={styles.playerMetaQuality}>{audio.quality}</Text> : null}
            {audio.specs.length > 0 ? (
              <Text numberOfLines={1} style={[styles.fullPlayerTrackMeta, styles.playerMetaSpecs]}>
                {audio.specs.join(' · ')}
              </Text>
            ) : null}
          </View>
        ) : null}
        {audio && playCount !== null ? <Text style={[styles.fullPlayerTrackMeta, styles.playerMetaPlaysText]}>·</Text> : null}
        {playCount !== null ? (
          <View style={styles.playerMetaPlays}>
            <ControlIcon name="play" size={10} color={metaColor} />
            <Text style={[styles.fullPlayerTrackMeta, styles.playerMetaPlaysText]}>
              {playCount.toLocaleString('en-US')}
            </Text>
          </View>
        ) : null}
      </Pressable>
    ) : null;
  const titleRow = (
    <View style={[styles.fullPlayerTrackInfo, skin === 'bleed' && styles.playerBleedInfo]}>
      <View style={styles.fullPlayerTrackCopy}>
        <MarqueeText
          text={shown.title}
          style={[styles.fullPlayerTrackTitle, skin === 'bleed' && styles.playerBleedTitle]}
          paused={!isOpen || !isCover}
        />
        {artistLine}
        {metaLine}
      </View>
      {heart}
    </View>
  );
  // The cover exactly as stored (never the small list copy), and held for a second to see it full size.
  const visualRadius = skin === 'bleed' ? 0 : skin === 'minimal' ? 16 : skin === 'vinyl' ? visualSize / 2 : heroRadius;
  const visual = (
    <HoldToView
      size={visualSize}
      radius={visualRadius}
      // Full-bleed runs off the screen's edges, so its ring sits just inside.
      inside={skin === 'bleed'}
      label={`Cover of ${shown.title}`}
      onOpen={() => openCoverViewer(shown)}
    >
      {skin === 'vinyl' ? (
        <VinylDisc track={shown} size={visualSize} spin={spin} />
      ) : (
        <AlbumArtwork track={shown} size={visualSize} radius={skin === 'bleed' || skin === 'minimal' ? visualRadius : undefined} full />
      )}
    </HoldToView>
  );
  const visualBlock = (
    <View
      ref={heroArtRef}
      onLayout={measureHeroArt}
      collapsable={false}
      style={skin === 'bleed' ? [styles.playerBleedArt, { marginTop: -(bodyTop + headerBottom) }] : undefined}
    >
      <Animated.View
        style={[
          skin === 'classic' && {
            borderRadius: heroRadius,
            // A soft, deep shadow lifts the cover off the backdrop.
            boxShadow: '0px 14px 30px rgba(0, 0, 0, 0.25)',
          },
          skin === 'vinyl' && {
            borderRadius: visualSize / 2,
            boxShadow: '0px 22px 40px rgba(0, 0, 0, 0.35)',
          },
          visualStyle,
        ]}
      >
        {visual}
      </Animated.View>
    </View>
  );
  let hero;
  if (skin === 'minimal') {
    // A Swiss poster: the small cover and its labels on top, the title as big as it fits right above the controls.
    const fontScale = Math.min(windowFontScale, MINIMAL_FONT_SCALE);
    // shortcut: a fixed height cut-off, not a measured fit; measure the free space if short phones still crowd.
    const titleSize = minimalTitleSize(shown.title, (windowWidth - 2 * SHEET_PADDING) / fontScale, windowHeight < 720 ? 56 : 72);
    const [placeLabel, tagLabel] = minimalLabels(shown, currentIndex, queue.length);
    hero = (
      <>
        <View style={styles.playerMinimalTop}>
          {visualBlock}
          <Animated.View style={[styles.playerMinimalSide, heroRestStyle]}>
            <Text numberOfLines={2} style={styles.playerMinimalLabel}>
              {placeLabel}
            </Text>
            <Text numberOfLines={2} style={styles.playerMinimalLabel}>
              {tagLabel}
            </Text>
          </Animated.View>
          <Animated.View style={heroRestStyle}>{heart}</Animated.View>
        </View>
        <Animated.View style={[styles.playerMinimalWords, heroRestStyle]}>
          {/* Too long for three lines: it ends in "…", and a tap shows it whole in Song info. */}
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens song info"
            onPress={() => {
              hapticSelection();
              setMenu('info');
            }}
            style={({ pressed }) => pressed && styles.playerMinimalPressed}
          >
            <Text
              numberOfLines={MINIMAL_TITLE_LINES}
              textBreakStrategy="balanced"
              maxFontSizeMultiplier={MINIMAL_FONT_SCALE}
              style={[styles.playerMinimalTitle, minimalTitleStyle(titleSize)]}
            >
              {shown.title}
            </Text>
          </Pressable>
          {/* Links to the artist and album. The slop makes each tap area about 48 dp tall without spacing the lines apart. */}
          <Pressable
            accessibilityRole={shown.artist ? 'link' : 'text'}
            disabled={!shown.artist}
            hitSlop={{ top: 4, bottom: 8 }}
            onPress={() => openGroup('artist')}
            style={({ pressed }) => [styles.playerMinimalLink, pressed && styles.playerMinimalPressed]}
          >
            <Text numberOfLines={1} style={styles.playerMinimalArtist}>
              {shown.artist ?? 'Unknown artist'}
            </Text>
          </Pressable>
          {shown.album ? (
            <Pressable
              accessibilityRole="link"
              hitSlop={{ top: 4, bottom: 12 }}
              onPress={() => openGroup('album')}
              style={({ pressed }) => [styles.playerMinimalLink, pressed && styles.playerMinimalPressed]}
            >
              <Text numberOfLines={1} style={styles.playerMinimalAlbum}>
                {shown.album}
              </Text>
            </Pressable>
          ) : null}
          {metaLine}
        </Animated.View>
      </>
    );
  } else {
    hero = (
      <>
        {visualBlock}
        <Animated.View style={[styles.playerTitleSpacer, heroRestStyle]}>
          {skin === 'bleed' && (
            <Text numberOfLines={1} style={styles.playerBleedFrom}>
              {queueSource ? `PLAYING FROM ${queueSource.toUpperCase()}` : 'NOW PLAYING'}
            </Text>
          )}
          {titleRow}
        </Animated.View>
      </>
    );
  }

  return (
    <Animated.View
      ref={rootRef}
      onLayout={measureOrigin}
      style={[StyleSheet.absoluteFill, rootStyle]}
      // Closed, it is invisible: taps go to the app, screen readers skip it.
      pointerEvents={isOpen ? 'box-none' : 'none'}
      importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!isOpen}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, sheetLayout.scrim, scrimStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.screen, sheetLayout.card, cardStyle]}
      >
        {tint && (
          // Two tones from the cover's colour, drawn once per song.
          <Animated.View key={`${tint[0]}${tint[1]}`} entering={TINT_CHANGE} style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="coverTint" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={tint[0]} />
                  <Stop offset="1" stopColor={tint[1]} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#coverTint)" />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          sheetLayout.sheet,
          {
            paddingTop: bodyTop,
            paddingBottom: insets.bottom,
          },
          contentStyle,
        ]}
      >
        <View ref={bodyRef} collapsable={false} style={[styles.fullPlayer, sheetLayout.content]}>
          <View style={sheetLayout.stage}>
            <GestureDetector gesture={dismissPan}>
              <View style={sheetLayout.stage}>
                <View
                  onLayout={(event) => {
                    const { y, height } = event.nativeEvent.layout;
                    setHeaderBottom(Math.round(y + height + Number(styles.fullPlayerHeader.marginBottom ?? 0)));
                  }}
                  style={[styles.fullPlayerHeader, overCover && styles.playerHeaderOver]}
                >
                  <View style={styles.fullPlayerHeaderSide}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Collapse full player"
                      onPress={close}
                      hitSlop={8}
                      style={[styles.fullPlayerClose, overCover && styles.playerBleedButton]}
                    >
                      <ControlIcon name="chevron-down" size={22} color={overCover ? '#FFFFFF' : undefined} />
                    </Pressable>
                  </View>
                  {/* Where the next songs come from, as music apps do. Full-bleed shows it over the title. */}
                  <View
                    accessible
                    accessibilityLabel={queueSource ? `Playing from ${queueSource}` : 'Now playing'}
                    style={[styles.fullPlayerHeaderCopy, overCover && styles.playerHidden]}
                  >
                    <Text style={styles.fullPlayerHeaderTitle}>
                      {queueSource ? 'PLAYING FROM' : 'NOW PLAYING'}
                    </Text>
                    {queueSource && (
                      <Text numberOfLines={1} style={styles.fullPlayerHeaderSource}>
                        {queueSource}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.fullPlayerHeaderSide, styles.fullPlayerHeaderSideEnd]}>
                    <Pressable
                      accessibilityRole="button"
                      // The one menu: song actions, Song info and player settings.
                      accessibilityLabel="Song and player options"
                      onPress={() => {
                        hapticSelection();
                        setMenu('actions');
                      }}
                      hitSlop={8}
                      style={[styles.fullPlayerClose, overCover && styles.playerBleedButton]}
                    >
                      <ControlIcon name="more" size={20} color={overCover ? '#FFFFFF' : undefined} />
                    </Pressable>
                  </View>
                </View>

                <GestureDetector gesture={swipe.gesture}>
                  <Animated.View
                    pointerEvents={isCover ? 'auto' : 'none'}
                    importantForAccessibility={isCover ? 'auto' : 'no-hide-descendants'}
                    style={[styles.playerHeroArea, skin === 'minimal' && styles.playerHeroAreaMinimal, swipe.style]}
                  >
                    {hero}
                  </Animated.View>
                </GestureDetector>

                <Animated.View
                  pointerEvents={isCover ? 'auto' : 'none'}
                  importantForAccessibility={isCover ? 'auto' : 'no-hide-descendants'}
                  style={[styles.fullPlayerPlayback, heroRestStyle]}
                >
                  <ProgressSlider
                    fallbackDuration={track.duration}
                    onSeek={onSeek}
                    variant="full"
                    // Still while the player is closed or the cover is away: no frames spent unseen.
                    animate={isOpen && isCover}
                    flat={skin === 'minimal'}
                  />

                  <View style={styles.fullPlayerControls}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
                      accessibilityState={{ selected: shuffle }}
                      hitSlop={12}
                      onPress={onToggleShuffle}
                      style={styles.fullPlayerModeButton}
                    >
                      <ControlIcon name="shuffle" size={18} tone={shuffle ? 'accent' : 'muted'} />
                      {shuffle && <View style={styles.fullPlayerModeDot} />}
                    </PressableScale>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="Previous song"
                      onPress={() => swipe.skip(-1)}
                      style={styles.playerControlSkip}
                    >
                      <PlaybackGlyph mode="previous" color="text" size={22} />
                    </PressableScale>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={isPlaying ? 'Pause song' : 'Play song'}
                      onPress={onTogglePlayback}
                      style={[styles.fullPlayerPlayButton, { backgroundColor: playButton.background }]}
                    >
                      {isBuffering ? (
                        <ActivityIndicator color={playButton.glyph} size="small" />
                      ) : (
                        <PlaybackGlyph mode={isPlaying ? 'pause' : 'play'} color="inverse" size={24} />
                      )}
                    </PressableScale>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="Next song"
                      onPress={() => swipe.skip(1)}
                      style={styles.playerControlSkip}
                    >
                      <PlaybackGlyph mode="next" color="text" size={22} />
                    </PressableScale>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={
                        repeatMode === 'none' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'
                      }
                      accessibilityState={{ selected: repeatMode !== 'none' }}
                      hitSlop={12}
                      onPress={onCycleRepeat}
                      style={styles.fullPlayerModeButton}
                    >
                      <ControlIcon
                        name="repeat"
                        size={18}
                        tone={repeatMode !== 'none' ? 'accent' : 'muted'}
                        showOne={repeatMode === 'single'}
                      />
                      {repeatMode !== 'none' && <View style={styles.fullPlayerModeDot} />}
                    </PressableScale>
                  </View>

                  {showVolume && <VolumeSlider />}

                  {error.length > 0 && (
                    <View style={styles.fullPlayerErrorRow}>
                      <Text accessibilityLiveRegion="polite" style={styles.fullPlayerStatus}>
                        {error}
                      </Text>
                      {trackAfterSkip(1) && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Skip to the next song"
                          onPress={() => swipe.skip(1)}
                          style={({ pressed }) => [
                            styles.homeChip,
                            styles.homeChipAction,
                            styles.fullPlayerErrorSkip,
                            pressed && styles.librarySortChipPressed,
                          ]}
                        >
                          <Text style={styles.homeChipActionText}>Skip</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </Animated.View>
              </View>
            </GestureDetector>

            {/* Lyrics or Up Next, in place: a small top row, then the words or the queue. */}
            <Animated.View
              pointerEvents={isCover ? 'none' : 'box-none'}
              importantForAccessibility={isCover ? 'no-hide-descendants' : 'auto'}
              // The pane moves when the header is measured; the top row's cover moves with it.
              onLayout={measureThumb}
              style={[sheetLayout.pane, { top: headerBottom }, paneStyle]}
            >
              <View style={styles.playerTopRow}>
                <Animated.View
                  ref={thumbRef}
                  onLayout={measureThumb}
                  collapsable={false}
                  style={[styles.playerTopRowArt, skin === 'vinyl' && { borderRadius: THUMB / 2 }, thumbStyle]}
                >
                  {skin === 'vinyl' ? (
                    <VinylDisc track={shown} size={THUMB} />
                  ) : (
                    <AlbumArtwork track={shown} size={THUMB} radius={10} />
                  )}
                </Animated.View>
                <View style={styles.flexSpacer}>
                  <Text numberOfLines={1} style={styles.playerTopRowTitle}>
                    {shown.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.playerTopRowArtist}>
                    {shown.artist ?? 'Unknown artist'}
                  </Text>
                </View>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Pause song' : 'Play song'}
                  onPress={onTogglePlayback}
                  style={[styles.playerTopRowPlay, { backgroundColor: playButton.background }]}
                >
                  <PlaybackGlyph mode={isPlaying ? 'pause' : 'play'} color="inverse" size={17} />
                </PressableScale>
              </View>
              {pane && isOpen && <PaneProgress track={track} color={chip} />}
              <Animated.View style={[sheetLayout.paneBody, paneBodyStyle]}>
                {pane === 'lyrics' && isOpen && lyricsKnown && (
                  <LyricsView lyrics={trackLyrics} onSeekTo={seekToSeconds} />
                )}
                {pane === 'queue' && isOpen && (
                  <QueuePane
                    queue={queue}
                    currentIndex={currentIndex}
                    recent={recentTracks}
                    isPlaying={isPlaying}
                    shuffle={shuffle}
                    repeatMode={repeatMode}
                    onSelect={onSelectQueueTrack}
                    onMove={onMoveQueueItem}
                    onRemove={onRemoveFromQueue}
                    onToggleShuffle={onToggleShuffle}
                    onCycleRepeat={onCycleRepeat}
                  />
                )}
              </Animated.View>
            </Animated.View>
          </View>

          {/* Lyrics, this song's speed, the sleep timer and Up Next. */}
          <View accessibilityRole="toolbar" style={styles.playerBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasNoLyrics ? 'Lyrics, none in this song' : 'Lyrics'}
              accessibilityState={{ selected: mode === 'lyrics' }}
              onPress={() => chooseMode('lyrics')}
              style={({ pressed }) => [
                styles.playerBarButton,
                (mode === 'lyrics' || pressed) && { backgroundColor: chip },
                hasNoLyrics && styles.playerBarDim,
              ]}
            >
              <ControlIcon name="lyrics" size={18} tone={mode === 'lyrics' ? 'text' : 'muted'} />
              <Text style={[styles.playerBarLabel, mode === 'lyrics' && styles.playerBarLabelOn]}>Lyrics</Text>
            </Pressable>
            <SpeedChip trackId={shown.id} chip={chip} onPress={() => setSheet('speed')} />
            <SleepButton
              endsAt={sleepTimerEndsAt}
              atTrackEnd={sleepAtTrackEnd}
              chip={chip}
              onPress={onOpenSleepTimer}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Up Next, ${Math.max(0, queue.length - currentIndex - 1)} songs`}
              accessibilityState={{ selected: mode === 'queue' }}
              onPress={() => chooseMode('queue')}
              style={({ pressed }) => [styles.playerBarButton, (mode === 'queue' || pressed) && { backgroundColor: chip }]}
            >
              <ControlIcon name="queue" size={18} tone={mode === 'queue' ? 'text' : 'muted'} />
              <Text style={[styles.playerBarLabel, mode === 'queue' && styles.playerBarLabelOn]}>Up Next</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
      <SongMenu
        track={menu ? track : null}
        playCount={totalPlays}
        initialView={menu === 'info' ? 'info' : undefined}
        onDelete={onDeleteTrack}
        onClose={() => setMenu(null)}
        extra={
          <PlayerMenuSection
            skin={skin}
            equalizerPreset={equalizerPreset}
            onOpenSkins={() => {
              setMenu(null);
              setTimeout(() => setSheet('skin'), SHEET_HANDOFF_MS);
            }}
            onOpenEqualizer={() => {
              setMenu(null);
              onOpenEqualizer();
              close();
            }}
          />
        }
      />
      <SpeedSheet trackId={shown.id} title={shown.title} visible={sheet === 'speed'} onClose={() => setSheet(null)} />
      <PlayerSkinSheet visible={sheet === 'skin'} track={shown} tint={tint} onClose={() => setSheet(null)} />
      <Animated.View
        pointerEvents="none"
        style={[sheetLayout.flyingArt, { width: artworkSize, height: artworkSize, borderRadius: flyRadius }, flyStyle]}
      >
        {skin === 'vinyl' ? (
          <VinylDisc track={shown} size={artworkSize} />
        ) : (
          <AlbumArtwork track={shown} size={artworkSize} radius={0} full />
        )}
      </Animated.View>
    </Animated.View>
  );
});

/** A thin line under the top row: where the song is. Its own component, as it re-renders each second. */
function PaneProgress({ track, color }: { track: MusicTrack; color: string }) {
  const styles = useAppStyles();
  const controller = getPlaybackController();
  const [ratio, setRatio] = useState(0);
  useEffect(() => {
    const read = () => {
      const { currentTime, duration } = controller.getProgress();
      const length = duration > 0 ? duration : track.duration;
      setRatio(length > 0 ? Math.min(1, currentTime / length) : 0);
    };
    read();
    return controller.subscribeProgress(read);
  }, [controller, track.duration]);
  return (
    <View style={[styles.playerTopLine, { backgroundColor: color }]}>
      <View style={[styles.playerTopLineFill, { transform: [{ scaleX: ratio }] }]} />
    </View>
  );
}

/** "1×" in the bar; accent when this song plays at another speed. */
function SpeedChip({ trackId, chip, onPress }: { trackId: string; chip: string; onPress: () => void }) {
  const styles = useAppStyles();
  const speed = useTrackSpeed(trackId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Speed for this song, ${speed} times`}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.playerBarButton, styles.playerBarSpeed, pressed && { backgroundColor: chip }]}
    >
      <Text style={[styles.playerBarLabel, speed !== 1 && styles.playerBarLabelSet]}>{speed}×</Text>
    </Pressable>
  );
}

/** The moon, with the time left (or "Song end") while a timer runs. Re-renders each second only then. */
function SleepButton({
  endsAt,
  atTrackEnd,
  chip,
  onPress,
}: {
  endsAt: number | null;
  atTrackEnd: boolean;
  chip: string;
  onPress: () => void;
}) {
  const styles = useAppStyles();
  const secondsLeft = useSecondsLeft(endsAt);
  const text = atTrackEnd ? 'Song end' : secondsLeft > 0 ? formatSleepTimer(secondsLeft) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text ? `Sleep timer, ${atTrackEnd ? 'pauses when this song ends' : `${text} left`}` : 'Sleep timer, off'}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.playerBarButton, pressed && { backgroundColor: chip }]}
    >
      <ControlIcon name="moon" size={18} tone={text ? 'accent' : 'muted'} />
      {text.length > 0 && <Text style={[styles.playerBarLabel, styles.playerBarLabelSet]}>{text}</Text>}
    </Pressable>
  );
}

function SpeedSheet({
  trackId,
  title,
  visible,
  onClose,
}: {
  trackId: string;
  title: string;
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useAppStyles();
  const speed = useTrackSpeed(trackId);
  return (
    <Sheet visible={visible} eyebrow="PLAYBACK" title="Speed" onClose={onClose}>
      <Text numberOfLines={1} style={styles.speedSong}>
        For {title}
      </Text>
      {/*
        The same rows as the sort sheet, slowest first. A tap plays the song at
        that speed right away and the sheet stays open, so you can try a few.
        The list bleeds into the sheet's padding so the speeds line up with the title.
      */}
      <View accessibilityRole="radiogroup" style={styles.speedList}>
        {SPEED_OPTIONS.map((option) => {
          const selected = option === speed;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option} times, ${speedWord(option)}`}
              onPress={() => {
                if (!selected) {
                  hapticSelection();
                  setTrackSpeed(trackId, option);
                }
              }}
              style={({ pressed }) => [
                styles.sortSheetOption,
                selected && styles.sortSheetOptionSelected,
                pressed && !selected && styles.sortSheetOptionPressed,
              ]}
            >
              <Text style={[styles.sortSheetOptionLabel, styles.speedValue, selected && styles.sortSheetOptionLabelSelected]}>
                {option}×
              </Text>
              <Text style={[styles.speedWord, selected && styles.speedWordSelected]}>
                {speedWord(option)}
              </Text>
              {selected ? <ControlIcon name="check" size={18} tone="accent" /> : <View style={styles.sortSheetRadio} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.speedHint}>Saved for this song only. Voices keep their normal pitch.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.primaryButton, styles.speedDone, pressed && styles.primaryButtonPressed]}
      >
        <Text style={styles.primaryButtonLabel}>Done</Text>
      </Pressable>
    </Sheet>
  );
}

/** Each speed in plain words. */
function speedWord(speed: number): string {
  if (speed === 1) return 'Normal';
  if (speed === 0.5) return 'Half speed';
  if (speed === 2) return 'Twice as fast';
  if (speed < 1) return 'A little slower';
  return speed <= 1.25 ? 'A little faster' : 'Faster';
}

/**
 * The player's part of the song menu: the equalizer and the player skin.
 * Lyrics, speed and the sleep timer have their own buttons in the bar.
 */
function PlayerMenuSection({
  skin,
  equalizerPreset,
  onOpenSkins,
  onOpenEqualizer,
}: {
  skin: PlayerSkin;
  equalizerPreset: string;
  onOpenSkins: () => void;
  onOpenEqualizer: () => void;
}) {
  const styles = useAppStyles();
  return (
    <>
      <Text style={[styles.sortSheetSectionTitle, styles.songMenuSectionGap]}>PLAYER</Text>
      <SheetRow
        icon={<ControlIcon name="equalizer" size={18} tone="accent" />}
        label="Equalizer"
        detail={equalizerPreset}
        onPress={onOpenEqualizer}
      />
      <SheetRow
        icon={<ControlIcon name="skin" size={18} tone="accent" />}
        label="Player skin"
        detail={skinLabel(skin)}
        onPress={onOpenSkins}
      />
    </>
  );
}

const sheetLayout = StyleSheet.create({
  scrim: {
    backgroundColor: '#000000',
  },
  card: {
    overflow: 'hidden',
    // Fixed, like a sheet's: animating it would make the morph stutter.
    borderRadius: MINI_CARD_RADIUS,
  },
  flyingArt: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  sheet: {
    paddingHorizontal: SHEET_PADDING,
  },
  content: {
    flex: 1,
  },
  stage: {
    flex: 1,
  },
  pane: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  paneBody: {
    flex: 1,
    marginTop: 4,
  },
});
