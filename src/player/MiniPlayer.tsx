import { memo, useCallback, useEffect, useRef, type ComponentProps, type ComponentRef, type RefObject } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Glass } from '../components/Glass';
import { useGlassStyle } from '../theme/glassStyle';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { NO_RECT, type PlayerTransition } from './playerTransition';
import type { MusicTrack } from '../types';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { MiniPlayerProgress } from './progress';
import { PlaybackGlyph } from '../components/icons';
import { MarqueeText } from '../components/MarqueeText';
import { PressableScale } from '../components/PressableScale';
import { useTrackSwipe } from './useTrackSwipe';
import { useAppStyles } from '../theme/styles';
import { useBarMinimized } from '../motion/barScroll';
import { usePlaybackProgress } from '../playback/usePlayback';
import { formatTrackDuration } from '../utils/format';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
/** The cover's size and corners; the full player's morph starts from these. */
export const MINI_ART_SIZE = 48;
export const MINI_ART_RADIUS = 12;
/** The joined card's outer corners: the tab pill's own, so the two read as one piece. */
export const JOINED_RADIUS = 28;
/** Long enough for a card or pill to finish sliding in before it is measured. */
export const SETTLED_MS = 320;

export const MiniPlayer = memo(function MiniPlayer({
  track,
  isPlaying,
  isBuffering,
  error,
  onPrevious,
  onNext,
  trackAfterSkip,
  onTogglePlayback,
  onOpenPlayer,
  onOpenChange,
  onOpenMenu,
  isCovered,
  transition,
  blurTarget,
  joined = false,
}: {
  blurTarget: RefObject<ComponentRef<typeof View> | null>;
  /** Joined: the top half of one glass card with the tabs (Settings › Appearance › Mini player). */
  joined?: boolean;
  track: MusicTrack;
  isPlaying: boolean;
  /** Loading the song: the play button spins, so a tap never looks ignored. */
  isBuffering: boolean;
  /** Why the song cannot play, shown in place of the artist. Empty when fine. */
  error: string;
  onPrevious: () => void;
  onNext: () => void;
  /** The song a skip would land on, or null when Previous would restart. */
  trackAfterSkip: (direction: 1 | -1) => MusicTrack | null;
  onTogglePlayback: () => void;
  onOpenPlayer: () => void;
  /** A swipe up pulled the full player open. */
  onOpenChange: (open: boolean) => void;
  /** Long press: the song menu (add to playlist, go to album). */
  onOpenMenu: () => void;
  /** The full player is over it, so the title stops scrolling unseen. */
  isCovered: boolean;
  transition: PlayerTransition;
}) {
  const styles = useAppStyles();
  const swipe = useTrackSwipe({
    track,
    onNext,
    onPrevious,
    trackAfterSkip,
    openDrag: { transition, onOpenChange },
  });
  // Where the card and cover sit on screen, for the full player to grow out of.
  const cardRef = useRef<ComponentRef<typeof Animated.View>>(null);
  const artRef = useRef<ComponentRef<typeof Animated.View>>(null);
  // Only while fully closed: with the player open, the app behind is shrunk,
  // and a position read then would send the closing morph to the wrong spot.
  const measure = useCallback(() => {
    if (transition.progress.get() !== 0) {
      return;
    }
    cardRef.current?.measureInWindow((x, y, width, height) =>
      transition.miniCard.set({ x, y, width, height }),
    );
    artRef.current?.measureInWindow((x, y, width, height) =>
      transition.miniArt.set({ x, y, width, height }),
    );
  }, [transition]);
  // It hands over to the morphing sheet as soon as the player starts to open.
  const handOffStyle = useAnimatedStyle(() => ({
    opacity: interpolate(transition.progress.get(), [0, 0.15], [1, 0], Extrapolation.CLAMP),
  }));
  // Gone from the screen: the next open rises from the bottom edge instead.
  useEffect(
    () => () => {
      transition.miniCard.set(NO_RECT);
      transition.miniArt.set(NO_RECT);
    },
    [transition],
  );
  // The flying cover stands in for this one while the player is not closed,
  // so there is never a second cover on screen.
  const artStyle = useAnimatedStyle(() => ({
    opacity: transition.progress.get() > 0.001 ? 0 : 1,
  }));
  // Trails `track` during a song change, so the swap happens out of sight.
  const shown = swipe.shownTrack;
  const openPlayer = () => {
    measure();
    onOpenPlayer();
  };
  // Back from the shrunk bar, where the song sat in the bar itself: the
  // player must grow from (and close into) this card again.
  const isBarFolded = useBarMinimized();
  useEffect(() => {
    if (isBarFolded) {
      return;
    }
    // After it has slid back into place, so the spot is exact.
    const timer = setTimeout(measure, SETTLED_MS);
    return () => clearTimeout(timer);
  }, [isBarFolded, measure]);
  // Solid sits flush on the bar as one block; glass styles float as a card.
  const Shell = useGlassStyle() === 'solid' ? SolidShell : Glass;

  return (
    <Animated.View ref={cardRef} onLayout={measure} collapsable={false} style={handOffStyle}>
    <Shell blurTarget={blurTarget} radius={joined ? JOINED_RADIUS : 22} seam={joined ? 'bottom' : undefined} style={styles.miniPlayer}>
      <View style={styles.miniPlayerTop}>
        <GestureDetector gesture={swipe.gesture}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`Open full music player for ${shown.title}${shown.artist ? ` by ${shown.artist}` : ''}`}
            onPress={openPlayer}
            onLongPress={onOpenMenu}
            style={[styles.miniPlayerInfo, swipe.style]}
          >
            <Animated.View ref={artRef} collapsable={false} style={artStyle}>
              <AlbumArtwork track={shown} size={MINI_ART_SIZE} radius={MINI_ART_RADIUS} />
            </Animated.View>
            <View style={styles.miniPlayerCopy}>
              {/* Long titles scroll instead of cutting off, which matters on
                  narrow phones with three buttons. The card's label reads it. */}
              <View importantForAccessibility="no-hide-descendants">
                <MarqueeText
                  text={shown.title}
                  style={styles.miniPlayerTitle}
                  paused={!isPlaying || isCovered}
                />
              </View>
              {error.length > 0 ? (
                <Text
                  numberOfLines={1}
                  accessibilityLiveRegion="polite"
                  style={[styles.miniPlayerHint, styles.miniPlayerError]}
                >
                  {error}
                </Text>
              ) : (
                <Text numberOfLines={1} style={styles.miniPlayerHint}>
                  {/* Local files often lack an artist; the album or folder says more than "Unknown". */}
                  {shown.artist || shown.albumArtist || shown.album || shown.folderTitle || 'Unknown artist'}
                </Text>
              )}
            </View>
          </AnimatedPressable>
        </GestureDetector>
        <View style={styles.miniPlayerControls}>
          {/* A plain glyph: the filled button belongs to the full player, so
              this card does not outshout the page under it. */}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Previous song"
            onPress={() => swipe.skip(-1)}
            style={styles.miniPlayerSkipButton}
          >
            <PlaybackGlyph mode="previous" color="text" size={16} />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause song' : 'Play song'}
            accessibilityState={{ busy: isBuffering }}
            onPress={onTogglePlayback}
            style={styles.miniPlayerButton}
          >
            {isBuffering ? (
              <ActivityIndicator color={styles.miniPlayerTitle.color} size="small" />
            ) : (
              <PlaybackGlyph mode={isPlaying ? 'pause' : 'play'} color="text" size={20} />
            )}
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Next song"
            onPress={() => swipe.skip(1)}
            style={styles.miniPlayerSkipButton}
          >
            <PlaybackGlyph mode="next" color="text" size={16} />
          </PressableScale>
        </View>
      </View>
      <MiniProgressLine fallbackDuration={track.duration} isPlaying={isPlaying} />
    </Shell>
    </Animated.View>
  );
});

/**
 * A thin progress line along the card's bottom edge. The times live in the
 * full player; here they are only read out to screen readers. Its own
 * component: it re-renders every second, so the rest of the card does not.
 */
export function MiniProgressLine({
  fallbackDuration,
  isPlaying,
}: {
  fallbackDuration: number;
  isPlaying: boolean;
}) {
  const styles = useAppStyles();
  const { currentTime, duration } = usePlaybackProgress();
  const length = duration > 0 ? duration : fallbackDuration;
  const elapsed = Math.min(currentTime, length);
  const left = Math.max(0, length - elapsed);
  return (
    <View
      accessible
      accessibilityLabel={
        length > 0 ? `${formatTrackDuration(elapsed)} played, ${formatTrackDuration(left)} left` : 'Song position'
      }
      // Dimmed while paused, so paused reads at a glance, not only from the glyph.
      style={[styles.miniPlayerLine, !isPlaying && styles.miniPlayerLinePaused]}
    >
      <MiniPlayerProgress fallbackDuration={fallbackDuration} />
    </View>
  );
}

function SolidShell({ style, children }: Pick<ComponentProps<typeof Glass>, 'style' | 'children' | 'seam'>) {
  const styles = useAppStyles();
  return <View style={[style, styles.miniPlayerSolid]}>{children}</View>;
}
