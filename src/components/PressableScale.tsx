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
  withSpring,
} from 'react-native-reanimated';

import { PRESS_IN_SPRING, PRESS_OUT_SPRING } from '../motion/motion';

/**
 * A button with a haptic that sinks while pressed and springs back with a
 * little life (the flow press, components/Pressable). The scale runs on the
 * UI thread. For buttons only: full-width rows should not scale.
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
        scale.set(withSpring(0.92, PRESS_IN_SPRING));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        scale.set(withSpring(1, PRESS_OUT_SPRING));
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
