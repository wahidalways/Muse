import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { scheduleOnRN } from 'react-native-worklets';
import { EASE_OUT } from '../motion/motion';
import { sidewaysDragLock } from '../motion/gestureLock';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';

/** Past this, letting go commits the action (the strip fills with the accent). */
const ARM = 84;
/** The row follows the finger this far, then resists. */
const FREE = 116;
const BACK = { duration: 260, easing: EASE_OUT };
const FILL = { duration: 120 };

/**
 * A song row you can drag sideways: right for Play next, left for Add to
 * queue. The action shows in the strip uncovered under the row. Starts
 * after 14 points sideways, before the page-wide tab swipe (24), and holds
 * the tab swipe off while it runs. Transform and opacity only.
 */
export function SwipeQueue({
  enabled,
  onPlayNext,
  onAddToQueue,
  children,
}: {
  enabled: boolean;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  children: ReactNode;
}) {
  const styles = useAppStyles();
  const x = useSharedValue(0);
  /** -1 Add to queue armed, 1 Play next armed, 0 neither. */
  const armed = useSharedValue(0);
  const pan = usePanGesture({
    enabled,
    activeOffsetX: [-14, 14],
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      sidewaysDragLock.set(true);
    },
    onUpdate: (event) => {
      'worklet';
      const far = Math.abs(event.translationX);
      const shown = Math.sign(event.translationX) * (far <= FREE ? far : FREE + (far - FREE) * 0.22);
      x.set(shown);
      const next = far >= ARM ? Math.sign(shown) : 0;
      if (next !== armed.get()) {
        armed.set(next);
        if (next !== 0) {
          scheduleOnRN(hapticSelection);
        }
      }
    },
    onDeactivate: (event) => {
      'worklet';
      const side = armed.get();
      armed.set(0);
      x.set(withTiming(0, BACK));
      if (!event.canceled && side !== 0) {
        scheduleOnRN(side > 0 ? onPlayNext : onAddToQueue);
      }
    },
    onFinalize: () => {
      'worklet';
      sidewaysDragLock.set(false);
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const stripStyle = useAnimatedStyle(() => ({ opacity: x.get() === 0 ? 0 : 1 }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: withTiming(armed.get() === 0 ? 0 : 1, FILL) }));
  const nextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [8, ARM * 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(x.get(), [8, ARM], [0.85, 1], Extrapolation.CLAMP) }],
  }));
  const queueStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-x.get(), [8, ARM * 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(-x.get(), [8, ARM], [0.85, 1], Extrapolation.CLAMP) }],
  }));

  // Same tree whether or not it is enabled, so a selection starting never remounts the rows.
  return (
    <View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.swipeStrip, stripStyle]} importantForAccessibility="no-hide-descendants">
        <Animated.View style={[StyleSheet.absoluteFill, styles.swipeStripArmed, fillStyle]} />
        <Animated.View style={[styles.swipeAction, nextStyle]}>
          <Labels icon="return-down-forward-outline" label="Play next" armed={armed} side={1} />
        </Animated.View>
        <Animated.View style={[styles.swipeAction, queueStyle]}>
          <Labels icon="add-outline" label="Add to queue" armed={armed} side={-1} trailing />
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.swipeRow, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/** The action's words: accent on the strip, then the on-accent color once it is armed. */
function Labels({
  icon,
  label,
  armed,
  side,
  trailing = false,
}: {
  icon: 'return-down-forward-outline' | 'add-outline';
  label: string;
  armed: SharedValue<number>;
  side: number;
  trailing?: boolean;
}) {
  const styles = useAppStyles();
  const restStyle = useAnimatedStyle(() => ({ opacity: withTiming(armed.get() === side ? 0 : 1, FILL) }));
  const onStyle = useAnimatedStyle(() => ({ opacity: withTiming(armed.get() === side ? 1 : 0, FILL) }));
  const row = (color: string) => (
    <View style={[styles.swipeActionRow, trailing && styles.swipeActionRowTrailing]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.swipeActionText, { color }]}>{label}</Text>
    </View>
  );
  return (
    <View>
      <Animated.View style={restStyle}>{row(String(styles.swipeActionText.color))}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, onStyle]}>{row(String(styles.primaryButtonLabel.color))}</Animated.View>
    </View>
  );
}
