import { memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { EASE_OUT } from '../motion/motion';

const FADE_IN = { duration: 180, easing: EASE_OUT };

type Props = {
  active: boolean;
  /** Mount now while hidden, so the first visit is instant too. */
  warm?: boolean;
  children: ReactNode;
};

/**
 * One tab's page. It mounts the first time it shows (or when warm) and then
 * stays mounted while hidden, so coming back costs no rebuild and keeps the
 * scroll spot. The page coming in fades; the one leaving hides at once.
 */
function TabLayerBase({ active, warm = false, children }: Props) {
  const [hasMounted, setHasMounted] = useState(active);
  if ((active || warm) && !hasMounted) {
    setHasMounted(true);
  }
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    opacity.set(active ? withTiming(1, FADE_IN) : 0);
  }, [active, opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  if (!hasMounted) {
    return null;
  }
  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, fadeStyle]}
    >
      {children}
    </Animated.View>
  );
}

// A hidden page skips re-renders until it shows again, so typing in search
// or a song change does not rebuild every tab behind the current one.
export const TabLayer = memo(
  TabLayerBase,
  (prev, next) => !prev.active && !next.active && prev.warm === next.warm,
);
