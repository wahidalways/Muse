import { useRef, useState } from 'react';
import {
  Pressable as NativePressable,
  StyleSheet,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PRESS_IN_SPRING, PRESS_OUT_SPRING } from '../motion/motion';
import { noteTouch } from '../motion/origin';

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

/** A row's pressed background fades in instead of cutting. */
const HIGHLIGHT_FADE = { transitionProperty: 'backgroundColor', transitionDuration: 120 } as const;

type Feedback = 'auto' | 'scale' | 'highlight' | 'none';

export type MusePressableProps = PressableProps & {
  /**
   * auto (default): a row whose pressed style changes its background fades
   * that in; anything else springs by its size. highlight / scale / none force one.
   */
  feedback?: Feedback;
};

const backgroundOf = (style: StyleProp<ViewStyle>) => StyleSheet.flatten(style)?.backgroundColor;

/**
 * Muse's Pressable: React Native's, with flow press feedback on the UI
 * thread. It sinks as the finger lands and springs back with a little life
 * when it lifts; how far depends on its size, so a chip dips more than a
 * full-width button and a full-screen backdrop not at all. Rows that light
 * up when pressed fade the light in instead of shrinking.
 */
export function Pressable({ feedback = 'auto', style, children, onPressIn, onPressOut, onLayout, ...props }: MusePressableProps) {
  const screen = useWindowDimensions();
  const scale = useSharedValue(1);
  const box = useRef({ width: 0, height: 0 });
  const [pressed, setPressed] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const state = (isPressed: boolean) => ({ pressed: isPressed, hovered: false }) as PressableStateCallbackType;
  const resolve = (isPressed: boolean) => (typeof style === 'function' ? style(state(isPressed)) : style);
  const highlight =
    feedback === 'highlight' ||
    (feedback === 'auto' && typeof style === 'function' && backgroundOf(resolve(true)) !== backgroundOf(resolve(false)));
  const springs = !highlight && feedback !== 'none';

  /** How far it sinks: small things more, wide things less, screen-sized things not at all. */
  const sinkTo = () => {
    const { width, height } = box.current;
    if (width === 0) return 0.96;
    if (height > screen.height * 0.4) return 1;
    if (width > screen.width * 0.7) return 0.98;
    return Math.min(width, height) < 56 ? 0.92 : 0.96;
  };

  return (
    <AnimatedPressable
      {...props}
      onLayout={(event: LayoutChangeEvent) => {
        box.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
        onLayout?.(event);
      }}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        // Where a page this opens grows from (motion/origin.ts).
        noteTouch(event.nativeEvent.pageX, event.nativeEvent.pageY);
        if (springs) {
          scale.set(withSpring(sinkTo(), PRESS_IN_SPRING));
        }
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        if (springs) {
          scale.set(withSpring(1, PRESS_OUT_SPRING));
        }
        onPressOut?.(event);
      }}
      style={[resolve(pressed), highlight ? HIGHLIGHT_FADE : springs ? animatedStyle : null]}
    >
      {typeof children === 'function' ? children(state(pressed)) : children}
    </AnimatedPressable>
  );
}
