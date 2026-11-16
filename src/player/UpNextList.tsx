import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from 'react';
import { Text, View, useWindowDimensions, type GestureResponderEvent, type ViewProps } from 'react-native';
import { Pressable } from '../components/Pressable';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  makeMutable,
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

/** Every row is this tall, so a drag knows which slot it is over. */
export const QUEUE_ROW_HEIGHT = 60;
/** How far a left swipe must be heading, after momentum, to remove a song. */
const REMOVE_DISTANCE = 110;
const SHIFT = { duration: 150, easing: EASE_OUT };
/** Hold a song this long to pick it up anywhere on the row; the handle picks it up at once. */
const HOLD_MS = 300;
/** Within this far of the list's top or bottom edge, a dragged song scrolls the list. */
const EDGE = 72;
/** Fastest edge scroll, in points per second, reached at the very edge. */
const EDGE_SPEED = 1100;
/** Flow: the lifted song rises, neighbours make way and the drop settles on springs. */
const LIFT_SPRING = { duration: 320, dampingRatio: 0.6, reduceMotion: ReduceMotion.System } as const;
const MAKE_WAY_SPRING = { duration: 300, dampingRatio: 0.82, reduceMotion: ReduceMotion.System } as const;
const DROP_SPRING = { duration: 320, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
/** A soft card under the lifted song (its shadow is never animated). */
const LIFT_LAYER = {
  position: 'absolute',
  top: 2,
  bottom: 2,
  left: 0,
  right: 0,
  borderRadius: 16,
  backgroundColor: 'rgba(128, 128, 128, 0.18)',
  boxShadow: '0px 12px 28px rgba(0, 0, 0, 0.32)',
} as const;
const GHOST = { position: 'absolute', left: 0, right: 0, top: 0, height: QUEUE_ROW_HEIGHT, zIndex: 20 } as const;
const SEE_THROUGH = { backgroundColor: 'transparent' } as const;

/**
 * Off while a finger is on Up Next or a song is dragged: the full player's
 * swipe-down reads it. Android hands touches that start between a row's
 * texts to the swipe area below, which slid the player down mid-sort.
 */
export const playerSwipeEnabled = makeMutable(true);

/** The shared values every row reads while a song is dragged. */
export type QueueDragValues = {
  /** The row being dragged (its slot shows a gap), or -1. */
  dragIndex: SharedValue<number>;
  /** The slot it is over. */
  hoverIndex: SharedValue<number>;
};

/** A list the drag can scroll at its edges (the full player's Up Next). */
export type QueueScroller = {
  offset: () => number;
  /** The furthest it scrolls. */
  max: () => number;
  scrollTo: (offset: number) => void;
};

type Session = {
  index: number;
  /** Finger where it picked the song up, and now (page points). */
  startY: number;
  lastY: number;
  lastAt: number;
  velocity: number;
  /** The row's top inside the list's wrapper. */
  rowTop: number;
  /** The wrapper's top and height on the page: the edge-scroll zones. */
  top: number;
  height: number;
  startOffset: number;
  moved: boolean;
  frame: number;
  frameAt: number;
};

/**
 * Dragging a song to a new place, on React Native's own touch system (gesture
 * handlers lost the touch to Android's scroll view). A row only starts it (a
 * hold, or a finger on its handle). The list's wrapper then takes the finger
 * through `responder` and keeps it: taking it blocks the scroll view natively
 * (onResponderGrant returning true) and `dragging` stops the list scrolling.
 *
 * The song you hold is a floating copy (`ghost`) over the list, so it stays
 * under the finger even as the list scrolls at its edges and recycles rows;
 * its own slot shows a gap that the other rows flow around on springs.
 */
export function useQueueDrag(count: number, onMove: (from: number, to: number) => void, scroller?: QueueScroller) {
  const dragIndex = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const ghostTop = useSharedValue(0);
  const ghostLift = useSharedValue(0);
  const wrapperRef = useRef<ComponentRef<typeof View>>(null);
  const session = useRef<Session | null>(null);
  /** A finger is on the list; a pick-up measured after it lifted is dropped. */
  const fingerDown = useRef(false);
  /** True from pick-up to drop: the list stops scrolling. */
  const [dragging, setDragging] = useState(false);
  /** The song the floating copy shows. */
  const [ghostTrack, setGhostTrack] = useState<MusicTrack | null>(null);
  /** Ends a drag at once, with no drop: the list changed under it, or it closed. */
  const abandon = useCallback(() => {
    const current = session.current;
    if (!current) {
      return;
    }
    session.current = null;
    cancelAnimationFrame(current.frame);
    setDragging(false);
    ghostLift.set(0);
  }, [ghostLift]);
  // Closed mid-drag: the edge scroll stops, and the player's swipe-down must not stay off.
  useEffect(
    () => () => {
      abandon();
      playerSwipeEnabled.set(true);
    },
    [abandon],
  );

  // A drop reorders the list; rows land in their new slots on the same
  // render, so the drag clears here, before paint. A list that changed some
  // other way mid-drag (a song ended) lets the held song go: its slot is stale.
  const reset = useCallback(() => {
    abandon();
    dragIndex.set(-1);
    hoverIndex.set(-1);
  }, [abandon, dragIndex, hoverIndex]);

  /** Moves the floating song to the finger and works out the slot under it. */
  const follow = useCallback(
    (current: Session) => {
      const scrolled = scroller ? scroller.offset() - current.startOffset : 0;
      ghostTop.set(current.rowTop + current.lastY - current.startY);
      const hover = clamp(Math.round(current.index + (current.lastY - current.startY + scrolled) / QUEUE_ROW_HEIGHT), 0, count - 1);
      if (hover !== hoverIndex.get()) {
        // One tick per slot crossed.
        hoverIndex.set(hover);
        hapticSelection();
      }
    },
    [count, ghostTop, hoverIndex, scroller],
  );

  const startDrag = useCallback(
    (index: number, pageY: number, rowPageY: number, track: MusicTrack) => {
      if (session.current) {
        return;
      }
      wrapperRef.current?.measure((_x, _y, _width, height, _pageX, top) => {
        if (session.current || !fingerDown.current) {
          return;
        }
        const current: Session = {
          index,
          startY: pageY,
          lastY: pageY,
          lastAt: Date.now(),
          velocity: 0,
          rowTop: rowPageY - top,
          top,
          height,
          startOffset: scroller ? scroller.offset() : 0,
          moved: false,
          frame: 0,
          frameAt: performance.now(),
        };
        session.current = current;
        hapticImpact();
        playerSwipeEnabled.set(false);
        setGhostTrack(track);
        setDragging(true);
        ghostTop.set(current.rowTop);
        ghostLift.set(0);
        ghostLift.set(withSpring(1, LIFT_SPRING));
        hoverIndex.set(index);
        dragIndex.set(index);
        // Near the top or bottom edge, the list scrolls under the held song; faster the closer it gets.
        const edgeScroll = (now: number) => {
          if (session.current !== current || !scroller) {
            return;
          }
          const dt = Math.min(0.05, (now - current.frameAt) / 1000);
          current.frameAt = now;
          const fromTop = current.lastY - current.top;
          const fromBottom = current.top + current.height - current.lastY;
          const speed =
            fromTop < EDGE
              ? -EDGE_SPEED * Math.min(1, (EDGE - fromTop) / EDGE)
              : fromBottom < EDGE
                ? EDGE_SPEED * Math.min(1, (EDGE - fromBottom) / EDGE)
                : 0;
          if (speed !== 0) {
            const next = clamp(scroller.offset() + speed * dt, 0, Math.max(0, scroller.max()));
            if (next !== scroller.offset()) {
              scroller.scrollTo(next);
              follow(current);
            }
          }
          current.frame = requestAnimationFrame(edgeScroll);
        };
        if (scroller) {
          current.frame = requestAnimationFrame(edgeScroll);
        }
      });
    },
    [dragIndex, follow, ghostLift, ghostTop, hoverIndex, scroller],
  );

  /** Reorders; `reset` clears the drag when the list re-renders. A move that changed nothing (the same song twice) clears it here. */
  const drop = useCallback(
    (from: number, to: number) => {
      onMove(from, to);
      setTimeout(() => {
        if (!session.current) {
          dragIndex.set(-1);
          hoverIndex.set(-1);
        }
      }, 400);
    },
    [dragIndex, hoverIndex, onMove],
  );

  /** Settles the song into slot `to`, then reorders for real (`onMove` only for a real move). */
  const settle = useCallback(
    (to: number) => {
      const current = session.current;
      if (!current) {
        return;
      }
      session.current = null;
      cancelAnimationFrame(current.frame);
      setDragging(false);
      playerSwipeEnabled.set(true);
      const from = current.index;
      const scrolled = scroller ? scroller.offset() - current.startOffset : 0;
      ghostLift.set(withSpring(0, DROP_SPRING));
      ghostTop.set(
        withSpring(current.rowTop + (to - from) * QUEUE_ROW_HEIGHT - scrolled, { ...DROP_SPRING, velocity: current.velocity }, (finished) => {
          'worklet';
          if (!finished) {
            return;
          }
          if (to === from || to < 0) {
            // Back in its own slot: nothing to reorder.
            dragIndex.set(-1);
            hoverIndex.set(-1);
          } else {
            scheduleOnRN(drop, from, to);
          }
        }),
      );
    },
    [dragIndex, drop, ghostLift, ghostTop, hoverIndex, scroller],
  );

  const fingerUp = () => {
    fingerDown.current = false;
    const current = session.current;
    // Picked up but never moved (a hold, or a press on the handle): put it back.
    if (current && !current.moved) {
      settle(current.index);
    } else if (!current) {
      playerSwipeEnabled.set(true);
    }
  };
  const responder: ViewProps = {
    // A finger anywhere on Up Next keeps the player's swipe-down out of it.
    onTouchStart: () => {
      fingerDown.current = true;
      playerSwipeEnabled.set(false);
    },
    onTouchEnd: fingerUp,
    onTouchCancel: fingerUp,
    // While a song is picked up, the first move hands the finger to the list.
    onMoveShouldSetResponderCapture: () => {
      if (!session.current) {
        return false;
      }
      session.current.moved = true;
      return true;
    },
    // Returning true keeps Android's scroll view from intercepting this touch.
    onResponderGrant: () => true,
    onResponderTerminationRequest: () => false,
    onResponderMove: (event: GestureResponderEvent) => {
      const current = session.current;
      if (!current) {
        return;
      }
      const y = event.nativeEvent.pageY;
      const now = Date.now();
      // Points per second, for a drop that keeps the finger's speed.
      current.velocity = ((y - current.lastY) / Math.max(1, now - current.lastAt)) * 1000;
      current.lastY = y;
      current.lastAt = now;
      follow(current);
    },
    onResponderRelease: () => settle(hoverIndex.get()),
    // Taken away anyway (the system, a dialog): back to where it was.
    onResponderTerminate: () => {
      if (session.current) {
        settle(session.current.index);
      }
    },
  };

  return {
    values: { dragIndex, hoverIndex },
    ghost: { track: ghostTrack, top: ghostTop, lift: ghostLift, dragIndex },
    wrapperRef,
    startDrag,
    responder,
    dragging,
    reset,
  };
}

/**
 * The song being dragged, floating over the list under the finger. Drawn by
 * the list's wrapper, so the list's own scrolling and recycling never touch it.
 */
export function QueueDragGhost({ ghost, plain = false }: { ghost: ReturnType<typeof useQueueDrag>['ghost']; plain?: boolean }) {
  const styles = useAppStyles();
  const { top, lift, dragIndex } = ghost;
  const style = useAnimatedStyle(() => ({
    opacity: dragIndex.get() >= 0 ? 1 : 0,
    transform: [{ translateY: top.get() }, { scale: 1 + 0.04 * lift.get() }],
  }));
  const layerStyle = useAnimatedStyle(() => ({ opacity: lift.get() }));
  if (!ghost.track) {
    return null;
  }
  return (
    <Animated.View pointerEvents="none" style={[GHOST, style]}>
      <Animated.View style={[LIFT_LAYER, layerStyle]} />
      <View style={[styles.queueRowContent, plain ? styles.queueRowContentPlain : SEE_THROUGH]}>
        <RowFace track={ghost.track} />
        <View style={styles.queueRowHandle}>
          <ControlIcon name="drag" size={18} tone="muted" />
        </View>
      </View>
    </Animated.View>
  );
}

/** Artwork, title and artist: the same in a row and in the floating copy. */
function RowFace({ track }: { track: MusicTrack }) {
  const styles = useAppStyles();
  return (
    <View style={styles.queueRowMain}>
      <AlbumArtwork track={track} size={40} />
      <View style={styles.playerQueueCopy}>
        <Text numberOfLines={1} style={styles.playerQueueTitle}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.playerQueueArtist}>
          {track.artist || track.folderTitle}
        </Text>
      </View>
    </View>
  );
}

/**
 * Up Next. Hold a song, or press its handle, and drag it to a new place; swipe
 * a row left to take it out of the queue; tap it to play it now. Screen
 * readers get the same as actions: move up, move down, remove.
 */
export function UpNextList({
  tracks,
  firstQueueIndex,
  onSelect,
  onMove,
  onRemove,
  onDraggingChange,
  removeLabel = 'Remove from Up Next',
}: {
  /** Upcoming songs, in play order. */
  tracks: MusicTrack[];
  /** Queue position of `tracks[0]`. */
  firstQueueIndex: number;
  onSelect: (queueIndex: number) => void;
  onMove: (fromQueueIndex: number, toQueueIndex: number) => void;
  onRemove: (queueIndex: number) => void;
  /** A song is being dragged: the scroll view around this list should stop scrolling. */
  onDraggingChange?: (dragging: boolean) => void;
  /** What screen readers call the swipe-away action. */
  removeLabel?: string;
}) {
  const styles = useAppStyles();
  const move = useCallback(
    (from: number, to: number) => onMove(firstQueueIndex + from, firstQueueIndex + to),
    [firstQueueIndex, onMove],
  );
  const { values, ghost, wrapperRef, startDrag, responder, dragging, reset } = useQueueDrag(tracks.length, move);
  useLayoutEffect(reset, [reset, tracks]);
  useLayoutEffect(() => onDraggingChange?.(dragging), [dragging, onDraggingChange]);

  // A song can be queued twice, so keys count repeats instead of using ids.
  const seen = new Map<string, number>();
  return (
    <View ref={wrapperRef} collapsable={false} style={styles.playerQueue} {...responder}>
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
            drag={values}
            last={index === tracks.length - 1}
            onStartDrag={startDrag}
            onSelect={onSelect}
            onMove={move}
            onRemove={onRemove}
            removeLabel={removeLabel}
          />
        );
      })}
      <QueueDragGhost ghost={ghost} />
    </View>
  );
}

/** One Up Next row; the full player's Up Next lists these in a recycling list. */
export function QueueRow({
  track,
  index,
  count,
  queueIndex,
  drag,
  last,
  onStartDrag,
  onSelect,
  onMove,
  onRemove,
  removeLabel,
  plain = false,
}: {
  track: MusicTrack;
  index: number;
  count: number;
  queueIndex: number;
  drag: QueueDragValues;
  last: boolean;
  /** Picks the song up; the list's wrapper (useQueueDrag's responder) takes the finger from here. */
  onStartDrag: (index: number, pageY: number, rowPageY: number, track: MusicTrack) => void;
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
}) {
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const { dragIndex, hoverIndex } = drag;
  const rowRef = useRef<ComponentRef<typeof Animated.View>>(null);
  const swipeX = useSharedValue(0);
  /** Row height: it folds to 0 after a swipe, so the rows below glide up. */
  const rowHeight = useSharedValue(QUEUE_ROW_HEIGHT);
  // A recycled row (or the next song sliding into a removed one's slot) starts whole.
  useLayoutEffect(() => {
    swipeX.set(0);
    rowHeight.set(QUEUE_ROW_HEIGHT);
  }, [queueIndex, rowHeight, swipeX, track.id]);

  /** Where the row sits on the page decides where the floating copy starts. */
  const pickUp = (pageY: number) => {
    rowRef.current?.measure((_x, _y, _width, _height, _pageX, rowPageY) => onStartDrag(index, pageY, rowPageY, track));
  };

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
        // Carries the flick's speed off the screen, then the gap closes.
        swipeX.set(
          withSpring(-width, { ...DROP_SPRING, velocity: event.velocityX }, (finished) => {
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
    // The dragged song floats above the list; its slot is a gap.
    if (active === index) {
      return { opacity: 0, transform: [{ translateY: 0 }] };
    }
    // At rest there is no shift and no animation, so a drop lands cleanly.
    if (active < 0) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    // Rows between the dragged song's slot and the one it is over step aside.
    const hover = hoverIndex.get();
    const shift =
      index > active && index <= hover
        ? -QUEUE_ROW_HEIGHT
        : index < active && index >= hover
          ? QUEUE_ROW_HEIGHT
          : 0;
    return { opacity: 1, transform: [{ translateY: withSpring(shift, MAKE_WAY_SPRING) }] };
  });
  const heightStyle = useAnimatedStyle(() => {
    const height = rowHeight.get();
    return { height, overflow: height < QUEUE_ROW_HEIGHT ? 'hidden' : 'visible' };
  });
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.get() }],
  }));

  return (
    <Animated.View ref={rowRef} collapsable={false} style={[styles.queueRow, rowStyle, heightStyle]}>
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
            accessibilityHint="Hold and drag to move it"
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
            delayLongPress={HOLD_MS}
            onLongPress={(event) => pickUp(event.nativeEvent.pageY)}
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
          {/* Picks the song up as the finger lands; dragging on moves it. */}
          <Pressable
            accessible={false}
            feedback="none"
            onPressIn={(event) => pickUp(event.nativeEvent.pageY)}
            style={styles.queueRowHandle}
          >
            <ControlIcon name="drag" size={18} tone="muted" />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
