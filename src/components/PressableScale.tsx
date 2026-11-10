import type { ReactNode } from 'react';
import { hapticImpact } from '../utils/haptics';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE_OUT } from '../motion/motion';

const PRESS_IN = { duration: 100, easing: EASE_OUT };
const PRESS_OUT = { duration: 150, easing: EASE_OUT };

/**
 * A button that scales to 97% while pressed. The scale runs on the UI thread
 * and starts on press-in, so the response is immediate even when JS is busy.
 * For buttons only: full-width rows should not scale.
 */
export function PressableScale({
  style,
  containerStyle,
  children,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Layout for the touch area around the scaled view, such as flexGrow to fill a row. */
  containerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Pressable
      {...props}
      style={containerStyle}
      pressRetentionOffset={16}
      onPressIn={(event: GestureResponderEvent) => {
        hapticImpact();
        scale.set(withTiming(0.97, PRESS_IN));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        scale.set(withTiming(1, PRESS_OUT));
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
