import type { ReactNode } from 'react';
import { GestureDetector, useLongPressGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { EASE_OUT } from '../motion/motion';
import { useAppStyles } from '../theme/styles';
import { hapticImpact } from '../utils/haptics';
import { ringPath } from './ringPath';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** How long a cover is held to open it full size. */
const HOLD_MS = 1000;
/** A quick tap shows nothing: the ring waits this long, then fills over the rest of the hold. */
const RING_DELAY_MS = 120;
const RING_FILL = { duration: HOLD_MS - RING_DELAY_MS, easing: Easing.bezier(0.4, 0.1, 0.3, 1) };
const RING_BACK = { duration: 240, easing: EASE_OUT };
/** A thin line, a few points outside the cover. */
const STROKE = 3;
const OUTSIDE = 5;

/**
 * A cover you hold for a second to see full size; a tap does nothing. While
 * held, a thin ring fills around it, over a faint full track; let go early
 * and it slides back. Screen readers get the same as an action. Transform,
 * opacity and the ring's dash only, all on the UI thread.
 */
export function HoldToView({
  size,
  radius,
  inside = false,
  label,
  onOpen,
  children,
}: {
  /** The cover's size and corner radius, so the ring follows its shape. */
  size: number;
  radius: number;
  /** Draw the ring inside the edge, for a cover that runs off the screen. */
  inside?: boolean;
  /** What the cover is, for screen readers. */
  label: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  const styles = useAppStyles();
  const accent = String(styles.sliderActive.backgroundColor);
  const faint = String(styles.fullPlayerLink.color);
  const ring = ringPath(size, radius, inside ? -2 * OUTSIDE : OUTSIDE, STROKE);
  const progress = useSharedValue(0);

  const open = () => {
    hapticImpact();
    onOpen();
  };
  const hold = useLongPressGesture({
    minDuration: HOLD_MS,
    onBegin: () => {
      'worklet';
      progress.set(withDelay(RING_DELAY_MS, withTiming(1, RING_FILL)));
    },
    onActivate: () => {
      'worklet';
      scheduleOnRN(open);
    },
    onFinalize: () => {
      'worklet';
      progress.set(withTiming(0, RING_BACK));
    },
  });

  const fillProps = useAnimatedProps(() => ({ strokeDashoffset: ring.length * (1 - progress.get()) }));
  // Fades in with the first bit of the fill, and out as it slides back.
  const ringStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.get() * 6) }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - progress.get() * 0.015 }] }));

  return (
    <GestureDetector gesture={hold}>
      <Animated.View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityHint="Hold to see it full size"
        accessibilityActions={[{ name: 'activate', label: 'See full size' }, { name: 'longpress', label: 'See full size' }]}
        onAccessibilityAction={open}
        style={pressStyle}
      >
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: -ring.extent, top: -ring.extent, width: ring.box, height: ring.box },
            ringStyle,
          ]}
        >
          <Svg width={ring.box} height={ring.box}>
            <Path d={ring.d} stroke={faint} strokeOpacity={0.12} strokeWidth={STROKE} fill="none" />
            <AnimatedPath
              d={ring.d}
              stroke={accent}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={[ring.length, ring.length]}
              animatedProps={fillProps}
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
