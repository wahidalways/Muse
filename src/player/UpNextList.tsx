import { useLayoutEffect } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { MusicTrack } from '../types';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { ControlIcon } from '../components/icons';
import { EASE_OUT, SNAP_BACK_SPRING, clamp, project } from '../motion/motion';
import { useAppStyles } from '../theme/styles';
import { hapticImpact, hapticSelection } from '../utils/haptics';

/** Every row is this tall, so a drag can tell which slot it is over. */
export const QUEUE_ROW_HEIGHT = 60;
/** How far a left swipe must be heading, after momentum, to remove a song. */
const REMOVE_DISTANCE = 110;
const SHIFT = { duration: 150, easing: EASE_OUT };

/**
 * Up Next. Drag a row by its handle to change the order; swipe a row left to
 * take it out of the queue; tap it to play it now. Screen readers get the
 * same as actions: move up, move down, remove.
 */
export function UpNextList({
  tracks,
  firstQueueIndex,
  onSelect,
  onMove,
  onRemove,
  removeLabel = 'Remove from Up Next',
}: {
  /** Upcoming songs, in play order. */
  tracks: MusicTrack[];
  /** Queue position of `tracks[0]`. */
  firstQueueIndex: number;
  onSelect: (queueIndex: number) => void;
  onMove: (fromQueueIndex: number, toQueueIndex: number) => void;
  onRemove: (queueIndex: number) => void;
  /** What screen readers call the swipe-away action. */
  removeLabel?: string;
}) {
  const styles = useAppStyles();
  // Drag state lives on the UI thread, shared by every row: which row is
  // lifted, how far it moved, and which slot it is over.
  const dragIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const hoverIndex = useSharedValue(-1);

  // A drop reorders the list; rows land in their new slots on the same
  // render, so the drag offsets clear here, before paint.
  useLayoutEffect(() => {
    dragIndex.set(-1);
    dragY.set(0);
    hoverIndex.set(-1);
  }, [dragIndex, dragY, hoverIndex, tracks]);

  const move = (from: number, to: number) => {
    if (from === to) {
      dragIndex.set(-1);
      dragY.set(0);
      hoverIndex.set(-1);
      return;
    }
    onMove(firstQueueIndex + from, firstQueueIndex + to);
  };

  // A song can be queued twice, so keys count repeats instead of using ids.
  const seen = new Map<string, number>();
  return (
    <View style={styles.playerQueue}>
      {tracks.map((track, index) => {
        const repeat = seen.get(track.id) ?? 0;
        seen.set(track.id, repeat + 1);
        return (
          <QueueRow
            key={`${track.id}#${repeat}`}
            track={track}
            index={index}
            count={tracks.length}
            queueIndex={firstQueueIndex + index}
            dragIndex={dragIndex}
            dragY={dragY}
            hoverIndex={hoverIndex}
            last={index === tracks.length - 1}
            onSelect={onSelect}
            onMove={move}
            onRemove={onRemove}
            removeLabel={removeLabel}
          />
        );
      })}
    </View>
  );
}

/** One Up Next row; the full player's Up Next lists these in a recycling list. */
export function QueueRow({
  track,
  index,
  count,
  queueIndex,
  dragIndex,
  dragY,
  hoverIndex,
  last,
  onSelect,
  onMove,
  onRemove,
  removeLabel,
  plain = false,
  onLift,
}: {
  track: MusicTrack;
  index: number;
  count: number;
  queueIndex: number;
  dragIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  hoverIndex: SharedValue<number>;
  last: boolean;
  onSelect: (queueIndex: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (queueIndex: number) => void;
  removeLabel: string;
  /**
   * The full player's Up Next: no card behind the rows (they sit on the
   * player's tinted background), and the Remove strip rides in from the
   * right edge as the row slides, instead of waiting under it.
   */
  plain?: boolean;
  /** Told which row is lifted (or -1), for a list that must raise the row's cell. */
  onLift?: (index: number) => void;
}) {
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const swipeX = useSharedValue(0);
  /** Row height: it folds to 0 after a swipe, so the rows below glide up. */
  const rowHeight = useSharedValue(QUEUE_ROW_HEIGHT);
  // A recycled row (or the next song sliding into a removed one's slot) starts whole.
  useLayoutEffect(() => {
    swipeX.set(0);
    rowHeight.set(QUEUE_ROW_HEIGHT);
  }, [queueIndex, rowHeight, swipeX, track.id]);

  const drag = usePanGesture({
    // The handle is only for dragging, so it starts at once.
    minDistance: 0,
    onActivate: () => {
      'worklet';
      scheduleOnRN(hapticSelection);
      if (onLift) {
        scheduleOnRN(onLift, index);
      }
      dragIndex.set(index);
      hoverIndex.set(index);
      dragY.set(0);
    },
    onUpdate: (event) => {
      'worklet';
      dragY.set(event.translationY);
      hoverIndex.set(clamp(Math.round(index + event.translationY / QUEUE_ROW_HEIGHT), 0, count - 1));
    },
    onDeactivate: () => {
      'worklet';
      const to = hoverIndex.get();
      // Settle into the slot, then reorder for real.
      dragY.set(
        withTiming((to - index) * QUEUE_ROW_HEIGHT, SHIFT, (finished) => {
          if (finished) {
            scheduleOnRN(onMove, index, to);
          }
        }),
      );
    },
  });

  const swipe = usePanGesture({
    // Clearly sideways only, so the list still scrolls.
    activeOffsetX: [-14, 14],
    failOffsetY: [-10, 10],
    onUpdate: (event) => {
      'worklet';
      swipeX.set(Math.min(0, event.translationX));
    },
    onDeactivate: (event) => {
      'worklet';
      const projected = event.translationX + project(event.velocityX);
      if (!event.canceled && projected < -REMOVE_DISTANCE) {
        swipeX.set(
          withTiming(-width, SHIFT, (finished) => {
            if (finished) {
              scheduleOnRN(hapticImpact);
              rowHeight.set(
                withTiming(0, SHIFT, (folded) => {
                  if (folded) {
                    scheduleOnRN(onRemove, queueIndex);
                  }
                }),
              );
            }
          }),
        );
      } else {
        swipeX.set(withSpring(0, { ...SNAP_BACK_SPRING, velocity: event.velocityX }));
      }
    },
  });

  const rowStyle = useAnimatedStyle(() => {
    const active = dragIndex.get();
    if (active === index) {
      return { zIndex: 10, transform: [{ translateY: dragY.get() }, { scale: 1.03 }] };
    }
    // Rows between the lifted one and its slot step aside while dragging.
    // At rest there is no shift and no animation, so a drop lands cleanly.
    if (active < 0) {
      return { zIndex: 0, transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const hover = hoverIndex.get();
    const shift =
      index > active && index <= hover
        ? -QUEUE_ROW_HEIGHT
        : index < active && index >= hover
          ? QUEUE_ROW_HEIGHT
          : 0;
    return { zIndex: 0, transform: [{ translateY: withTiming(shift, SHIFT) }, { scale: 1 }] };
  });
  const heightStyle = useAnimatedStyle(() => {
    const height = rowHeight.get();
    return { height, overflow: height < QUEUE_ROW_HEIGHT ? 'hidden' : 'visible' };
  });
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.get() }],
  }));

  return (
    <Animated.View style={[styles.queueRow, rowStyle, heightStyle]}>
      {/* Shows through as the row slides left. */}
      {!plain && (
        <View style={styles.queueRowRemove} accessible={false}>
          <ControlIcon name="delete" size={18} tone="muted" />
          <Text style={styles.queueRowRemoveText}>Remove</Text>
        </View>
      )}
      <GestureDetector gesture={swipe}>
        <Animated.View
          style={[
            styles.queueRowContent,
            plain ? styles.queueRowContentPlain : !last && styles.queueRowDivider,
            contentStyle,
          ]}
        >
          {plain && (
            // Glued to the row's right edge, so it fills exactly the space the row slides out of.
            <View style={styles.queueRowRemoveTrailing} accessible={false}>
              <ControlIcon name="delete" size={18} tone="muted" />
              <Text style={styles.queueRowRemoveText}>Remove</Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play now: ${track.title}${track.artist ? ` by ${track.artist}` : ''}`}
            accessibilityActions={[
              ...(index > 0 ? [{ name: 'moveUp', label: 'Move up' }] : []),
              ...(index < count - 1 ? [{ name: 'moveDown', label: 'Move down' }] : []),
              { name: 'remove', label: removeLabel },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'moveUp') onMove(index, index - 1);
              else if (event.nativeEvent.actionName === 'moveDown') onMove(index, index + 1);
              else if (event.nativeEvent.actionName === 'remove') onRemove(queueIndex);
            }}
            onPress={() => onSelect(queueIndex)}
            style={styles.queueRowMain}
          >
            <AlbumArtwork track={track} size={40} />
            <View style={styles.playerQueueCopy}>
              <Text numberOfLines={1} style={styles.playerQueueTitle}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={styles.playerQueueArtist}>
                {track.artist || track.folderTitle}
              </Text>
            </View>
          </Pressable>
          <GestureDetector gesture={drag}>
            <View style={styles.queueRowHandle} accessible={false}>
              <ControlIcon name="drag" size={18} tone="muted" />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
