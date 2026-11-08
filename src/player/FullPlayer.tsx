import { memo, useCallback, useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  GestureDetector,
  ScrollView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  ReduceMotion,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { MusicTrack, RepeatMode } from '../types';
import { AlbumArtwork } from '../components/AlbumArtwork';
import {
  ControlIcon,
  PlaybackGlyph,
  usePlayButtonColors,
} from '../components/icons';
import { FavoriteButton } from '../components/FavoriteButton';
import { MarqueeText } from '../components/MarqueeText';
import { PressableScale } from '../components/PressableScale';
import { EASE_OUT, project, rubberband } from '../motion/motion';
import { useTrackSwipe } from './useTrackSwipe';
import { ProgressSlider } from './progress';
import { settlePlayer, sheetTravel, type PlayerTransition } from './playerTransition';
import { UpNextList } from './UpNextList';
import { useAppStyles } from '../theme/styles';
import { formatAudioDetails, formatPlayCount, formatSleepTimer } from '../utils/format';
import { getArtworkColor, getAudioDetails, getLyrics } from '../../modules/muse-audio-metadata';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ThemeContext } from '../theme/theme';
import { usePreferences } from '../settings/preferences';
import { groupKeyFor } from '../library/browse';
import { parseLyrics, type Lyrics } from '../library/lyrics';
import { getPlaybackController } from '../playback/PlaybackController';
import type { MoreRoute } from '../screens/MoreTab';
import { VolumeSlider, canShowVolumeSlider } from './VolumeSlider';
import { LyricsSheet } from './LyricsSheet';
import { hapticImpact, hapticSelection } from '../utils/haptics';
import { SPEED_OPTIONS, setTrackSpeed, useTrackSpeed } from '../library/trackSpeeds';
import { SheetRow } from '../components/Sheet';
import { SongMenu } from '../components/SongMenu';
import { useSecondsLeft } from './useSecondsLeft';

// Module scope: layout-animation builders are not rebuilt on every render.
const TINT_CHANGE = FadeIn.duration(500).easing(EASE_OUT);
/** Room the volume slider takes, so the artwork shrinks to fit on short screens. */
const VOLUME_ROW_HEIGHT = 40;
/** Below this a cover is close to grey, so the background stays plain. */
const MIN_TINT_COLORFULNESS = 0.12;
/** Height the player needs for everything except the artwork. */
const PLAYER_CONTROLS_HEIGHT = 430;
const MAX_ARTWORK_SIZE = 520;
/** Songs listed in Up Next. */
const UP_NEXT_SHOWN = 30;
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

/**
 * The full player, as a sheet over the app. It stays mounted (invisible
 * while closed) so opening never waits for it to build.
 *
 * It morphs out of the mini player, as in Apple Music: the sheet grows from
 * the mini card and the cover flies up into place, all driven by one shared
 * progress value (see playerTransition.ts). Drags move it with the finger
 * and hand the release velocity to the spring, so a flick finishes and a
 * slow drag settles back. Sideways drags on the artwork change the song.
 * All motion runs on the UI thread.
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
}) {
  const styles = useAppStyles();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const playButton = usePlayButtonColors();
  const preferences = usePreferences();
  // Song changes (swipes on the cover, the skip buttons, a song ending) run
  // through the same hook as the mini player: the old song slides out on
  // the UI thread, the new one swaps in out of sight and slides in. The
  // cover, title and everything about the song follow `shown`.
  const swipe = useTrackSwipe({ track, onNext, onPrevious, trackAfterSkip, follow: 'finger' });
  const shown = swipe.shownTrack;
  // One menu for the song and the player: 'actions', or straight on 'info'.
  const [menu, setMenu] = useState<'actions' | 'info' | null>(null);
  if (!isOpen && menu) {
    setMenu(null);
  }
  // Only when it can really appear, so the cover never leaves an empty gap for it.
  const showVolume = preferences.showVolumeSlider && canShowVolumeSlider();
  const { theme } = useContext(ThemeContext);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);
  // A long queue stays closed while the player is hidden.
  if (!isOpen && isQueueExpanded) {
    setIsQueueExpanded(false);
  }
  // The artwork fills the content width (24pt padding each side), up to a
  // cap for tablets, and only shrinks when the screen is too short to fit it
  // with the header, title, progress, controls and Up Next row.
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
  // Enough to reorder by hand; the count below still covers the whole queue.
  const upcomingTracks = queue.slice(currentIndex + 1, currentIndex + 1 + UP_NEXT_SHOWN);
  const upcomingCount = Math.max(0, queue.length - currentIndex - 1);

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

  // Where the big cover rests on screen when open. Measured against the
  // player body, which never moves: the sliding layer around it would add
  // its own offset, and the cover would fly from below the screen.
  const bodyRef = useRef<ComponentRef<typeof View>>(null);
  const heroArtRef = useRef<ComponentRef<typeof View>>(null);
  const heroArt = useSharedValue({ x: 0, y: 0, size: 0 });
  const bodyTop = 18 + insets.top;
  const measureHeroArt = useCallback(() => {
    const body = bodyRef.current;
    if (body) {
      heroArtRef.current?.measureLayout(body, (x, y, width) => {
        heroArt.set({ x: SHEET_PADDING + x, y: bodyTop + y, size: width });
      });
    }
  }, [bodyTop, heroArt]);

  // ---------------------------------------------------------------------------
  // Audio details and play count, under the artist (both from Settings).
  // Details are read from the file only while the player is open.

  const [audioDetails, setAudioDetails] = useState<{ trackId: string; text: string } | null>(null);
  useEffect(() => {
    if (!showAudioDetails || !isOpen) {
      return;
    }
    let isActive = true;
    void getAudioDetails(shown.id).then((details) => {
      if (isActive) {
        setAudioDetails({ trackId: shown.id, text: formatAudioDetails(details, shown.filename) });
      }
    });
    return () => {
      isActive = false;
    };
  }, [isOpen, showAudioDetails, shown.filename, shown.id]);
  // Lyrics saved in the file, read only while the player is open.
  const [lyrics, setLyrics] = useState<{ trackId: string; lyrics: Lyrics | null } | null>(null);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
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
  const trackLyrics = lyrics?.trackId === shown.id ? lyrics.lyrics : null;
  const seekToSeconds = (seconds: number) => {
    const { duration } = getPlaybackController().getProgress();
    if (duration > 0) {
      onSeek(Math.min(1, seconds / duration));
    }
  };

  // The cover's main hue, for a soft gradient behind the player.
  const [coverHue, setCoverHue] = useState<{ trackId: string; hue: number | null } | null>(null);
  useEffect(() => {
    if (!isOpen || !preferences.coverBackground) {
      return;
    }
    let isActive = true;
    void getArtworkColor(shown.id).then((color) => {
      if (isActive) {
        setCoverHue({
          trackId: shown.id,
          hue: color && color.colorfulness >= MIN_TINT_COLORFULNESS ? color.hue : null,
        });
      }
    });
    return () => {
      isActive = false;
    };
  }, [isOpen, preferences.coverBackground, shown.id]);
  const tintHue = preferences.coverBackground && coverHue?.trackId === shown.id ? coverHue.hue : null;
  const tintColor =
    tintHue === null
      ? null
      : theme === 'dark'
        ? `hsl(${Math.round(tintHue)}, 42%, 24%)`
        : `hsl(${Math.round(tintHue)}, 60%, 86%)`;

  const openGroup = (group: 'artist' | 'album') => {
    hapticSelection();
    onOpenGroup({ kind: 'group', group, key: groupKeyFor(shown, group) });
  };

  const trackMeta = [
    showAudioDetails && audioDetails?.trackId === shown.id ? audioDetails.text : '',
    playCount !== null ? formatPlayCount(playCount) : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  // Starts at its resting size, so opening the player does not animate it.
  // Settings › Now Playing can keep it full size while paused.
  const shrinks = preferences.shrinkArtworkOnPause && !isPlaying;
  const artworkScale = useSharedValue(shrinks ? PAUSED_ARTWORK_SCALE : 1);
  useEffect(() => {
    artworkScale.set(withSpring(shrinks ? PAUSED_ARTWORK_SCALE : 1, ARTWORK_SPRING));
  }, [artworkScale, shrinks]);
  const artworkStyle = useAnimatedStyle(() => ({
    opacity: heroArt.get().size === 0 || progress.get() >= 0.999 ? 1 : 0,
    transform: [{ scale: artworkScale.get() }],
  }));

  // The cover in flight: from the mini player's cover to the big one, along
  // with the sheet. Drawn once at full size and scaled, so it stays sharp.
  // Its corners are the big cover's, fixed: an animated radius would pull this
  // view's transform off the fast path too, and the cover would hitch.
  const heroRadius = Math.min(24, Math.max(10, artworkSize * 0.085));
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
    // Without a mini player on screen, it simply rides up with the sheet.
    const fromCx = hasMini ? mini.x - origin.x + mini.width / 2 : heroCx;
    const fromCy = hasMini ? mini.y - origin.y + mini.height / 2 : heroCy;
    const fromScale = hasMini ? mini.width / artworkSize : artworkScale.get();
    const scale = interpolate(open, [0, 1], [fromScale, artworkScale.get()]);
    return {
      opacity: 1,
      transform: [
        { translateX: interpolate(open, [0, 1], [fromCx, heroCx]) - artworkSize / 2 },
        { translateY: interpolate(open, [0, 1], [fromCy, heroCy]) - artworkSize / 2 },
        { scale },
      ],
    };
  });

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
        {tintColor && (
          // A soft wash of the cover's color, fading out by the middle.
          <Animated.View key={tintColor} entering={TINT_CHANGE} style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="coverTint" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={tintColor} stopOpacity={1} />
                  <Stop offset="0.62" stopColor={tintColor} stopOpacity={0} />
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
          <GestureDetector gesture={dismissPan}>
            <View>
              <View style={styles.fullPlayerHeader}>
                <View style={styles.fullPlayerHeaderSide}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Collapse full player"
                    onPress={close}
                    hitSlop={8}
                    style={styles.fullPlayerClose}
                  >
                    <ControlIcon name="chevron-down" size={22} />
                  </Pressable>
                </View>
                {/* Where the next songs come from, as music apps do. */}
                <View
                  accessible
                  accessibilityLabel={queueSource ? `Playing from ${queueSource}` : 'Now playing'}
                  style={styles.fullPlayerHeaderCopy}
                >
                  <Text style={styles.fullPlayerHeaderTitle}>
                    {queueSource ? 'PLAYING FROM' : 'NOW PLAYING'}
                  </Text>
                  {queueSource && (
                    <Text numberOfLines={1} style={styles.fullPlayerHeaderSource}>
                      {queueSource}
                    </Text>
                  )}
                  {/* Speed and the sleep timer show here only while they are on. */}
                  <PlayerStatusLine
                    trackId={track.id}
                    endsAt={sleepTimerEndsAt}
                    onPress={() => setMenu('actions')}
                  />
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
                    style={styles.fullPlayerClose}
                  >
                    <ControlIcon name="more" size={20} />
                  </Pressable>
                </View>
              </View>

              <GestureDetector gesture={swipe.gesture}>
                <Animated.View style={[styles.fullPlayerHero, swipe.style]}>
                  <View ref={heroArtRef} onLayout={measureHeroArt} collapsable={false}>
                  <Animated.View
                    // A soft, deep shadow lifts the cover off the backdrop.
                    style={[
                      {
                        borderRadius: Math.min(24, Math.max(10, artworkSize * 0.085)),
                        boxShadow: '0px 14px 30px rgba(0, 0, 0, 0.25)',
                      },
                      artworkStyle,
                    ]}
                  >
                    <AlbumArtwork track={shown} size={artworkSize} />
                  </Animated.View>
                  </View>
                  <View style={styles.fullPlayerTrackInfo}>
                    <View style={styles.fullPlayerTrackCopy}>
                      <MarqueeText text={shown.title} style={styles.fullPlayerTrackTitle} paused={!isOpen} />
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
                      {/* Details and plays on one quiet line; tap it for the full Song info. */}
                      {trackMeta.length > 0 && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityHint="Opens song info"
                          hitSlop={{ top: 8, bottom: 8 }}
                          onPress={() => {
                            hapticSelection();
                            setMenu('info');
                          }}
                        >
                          <Text numberOfLines={1} style={styles.fullPlayerTrackMeta}>
                            {trackMeta}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    <FavoriteButton trackId={shown.id} title={shown.title} size={22} />
                  </View>
                </Animated.View>
              </GestureDetector>
            </View>
          </GestureDetector>

          <View style={styles.fullPlayerPlayback}>
            <ProgressSlider
              fallbackDuration={track.duration}
              onSeek={onSeek}
              variant="full"
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
                <ControlIcon
                  name="shuffle"
                  size={18}
                  tone={shuffle ? 'accent' : 'muted'}
                />
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
                style={[
                  styles.fullPlayerPlayButton,
                  { backgroundColor: playButton.background },
                ]}
              >
                {isBuffering ? (
                  <ActivityIndicator color={playButton.glyph} size="small" />
                ) : (
                  <PlaybackGlyph
                    mode={isPlaying ? 'pause' : 'play'}
                    color="inverse"
                    size={24}
                  />
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
                  repeatMode === 'none'
                    ? 'Repeat off'
                    : repeatMode === 'all'
                      ? 'Repeat all'
                      : 'Repeat one'
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
          </View>

          <View style={[styles.fullPlayerQueue, sheetLayout.queue]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isQueueExpanded }}
              accessibilityLabel={`${isQueueExpanded ? 'Hide' : 'Show'} Up Next queue, ${upcomingCount} ${upcomingCount === 1 ? 'song' : 'songs'}`}
              onPress={() => setIsQueueExpanded((expanded) => !expanded)}
              style={styles.fullPlayerQueueToggle}
            >
              <View style={styles.fullPlayerQueueToggleCopy}>
                <Text style={styles.fullPlayerQueueToggleTitle}>UP NEXT</Text>
                <Text style={styles.fullPlayerQueueToggleCount}>
                  {upcomingCount} {upcomingCount === 1 ? 'song' : 'songs'}
                </Text>
              </View>
              <View style={styles.fullPlayerQueueToggleIcon}>
                <ControlIcon
                  name={isQueueExpanded ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  tone="muted"
                />
              </View>
            </Pressable>
            {isQueueExpanded &&
              (upcomingTracks.length === 0 ? (
                <View style={styles.playerQueueEmpty}>
                  <Text style={styles.playerQueueEmptyText}>
                    You are at the end of the queue.
                  </Text>
                </View>
              ) : (
                // The player itself never scrolls, so dragging it down is
                // never confused with scrolling. Only the queue scrolls when
                // the screen is short.
                <ScrollView
                  style={sheetLayout.queueScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <UpNextList
                    tracks={upcomingTracks}
                    firstQueueIndex={currentIndex + 1}
                    onSelect={onSelectQueueTrack}
                    onMove={onMoveQueueItem}
                    onRemove={onRemoveFromQueue}
                  />
                </ScrollView>
              ))}
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
            trackId={track.id}
            sleepTimerEndsAt={sleepTimerEndsAt}
            hasLyrics={trackLyrics !== null}
            equalizerPreset={equalizerPreset}
            onCloseMenu={() => setMenu(null)}
            onOpenSleepTimer={onOpenSleepTimer}
            onOpenLyrics={() => setIsLyricsOpen(true)}
            onOpenEqualizer={() => {
              onOpenEqualizer();
              close();
            }}
          />
        }
      />
      {trackLyrics && (
        <LyricsSheet
          visible={isLyricsOpen && isOpen}
          title={shown.title}
          lyrics={trackLyrics}
          onClose={() => setIsLyricsOpen(false)}
          onSeekTo={seekToSeconds}
        />
      )}
      <Animated.View
        pointerEvents="none"
        style={[sheetLayout.flyingArt, { width: artworkSize, height: artworkSize, borderRadius: heroRadius }, flyStyle]}
      >
        <AlbumArtwork track={shown} size={artworkSize} radius={0} />
      </Animated.View>
    </Animated.View>
  );
});

/**
 * "1.5× · Sleep 12:30" under the header title, only while the speed is
 * changed or a sleep timer runs; tap it for the options. The countdown
 * re-renders once a second, so it lives in its own small component.
 */
function PlayerStatusLine({
  trackId,
  endsAt,
  onPress,
}: {
  trackId: string;
  endsAt: number | null;
  onPress: () => void;
}) {
  const styles = useAppStyles();
  const speed = useTrackSpeed(trackId);
  const secondsLeft = useSecondsLeft(endsAt);
  const parts = [
    speed !== 1 ? `${speed}×` : '',
    secondsLeft > 0 ? `Sleep ${formatSleepTimer(secondsLeft)}` : '',
  ].filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${speed !== 1 ? `Speed ${speed} times. ` : ''}${secondsLeft > 0 ? `Sleep timer, ${formatSleepTimer(secondsLeft)} left. ` : ''}Song and player options`}
      hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
      onPress={onPress}
    >
      <Text numberOfLines={1} style={styles.fullPlayerHeaderStatus}>
        {parts.join('  ·  ')}
      </Text>
    </Pressable>
  );
}

/**
 * The player's part of the song menu: sleep timer, lyrics, equalizer and
 * this song's speed. Inside the one menu, so the player has a single ⋯ and
 * the cover row never shifts when a song has lyrics.
 */
function PlayerMenuSection({
  trackId,
  sleepTimerEndsAt,
  hasLyrics,
  equalizerPreset,
  onCloseMenu: onClose,
  onOpenSleepTimer,
  onOpenLyrics,
  onOpenEqualizer,
}: {
  trackId: string;
  sleepTimerEndsAt: number | null;
  hasLyrics: boolean;
  equalizerPreset: string;
  onCloseMenu: () => void;
  onOpenSleepTimer: () => void;
  onOpenLyrics: () => void;
  onOpenEqualizer: () => void;
}) {
  const styles = useAppStyles();
  const speed = useTrackSpeed(trackId);
  const secondsLeft = useSecondsLeft(sleepTimerEndsAt);
  /** Closes this sheet first, then opens the next one. */
  const handOff = (open: () => void) => {
    onClose();
    setTimeout(open, SHEET_HANDOFF_MS);
  };
  return (
    <>
      <Text style={[styles.sortSheetSectionTitle, styles.songMenuSectionGap]}>PLAYER</Text>
      <SheetRow
        icon={<ControlIcon name="timer" size={18} tone="accent" />}
        label="Sleep timer"
        detail={secondsLeft > 0 ? `${formatSleepTimer(secondsLeft)} left` : 'Off'}
        onPress={() => handOff(onOpenSleepTimer)}
      />
      <SheetRow
        icon={<ControlIcon name="lyrics" size={18} tone="accent" />}
        label="Lyrics"
        detail={hasLyrics ? 'In this song' : 'None in this file'}
        disabled={!hasLyrics}
        onPress={() => handOff(onOpenLyrics)}
      />
      <SheetRow
        icon={<ControlIcon name="equalizer" size={18} tone="accent" />}
        label="Equalizer"
        detail={equalizerPreset}
        onPress={() => {
          onClose();
          onOpenEqualizer();
        }}
      />
      <Text style={[styles.sortSheetSectionTitle, styles.songMenuSectionGap]}>SPEED FOR THIS SONG</Text>
      <View accessibilityRole="radiogroup" style={styles.playerSpeedRow}>
        {SPEED_OPTIONS.map((option) => {
          const selected = option === speed;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option === 1 ? '1 times, normal' : `${option} times`}
              onPress={() => {
                hapticSelection();
                setTrackSpeed(trackId, option);
              }}
              style={[styles.homeChip, styles.playerSpeedChip, selected && styles.homeChipAction]}
            >
              <Text style={selected ? styles.homeChipActionText : styles.homeChipText}>{option}×</Text>
            </Pressable>
          );
        })}
      </View>
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
  // The queue gives up space first when the screen is short.
  queue: {
    flexShrink: 1,
    minHeight: 0,
  },
  queueScroll: {
    flexGrow: 0,
  },
});
