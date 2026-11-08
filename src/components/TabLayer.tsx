import { memo, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT } from '../motion/motion';

const FADE_OUT = { duration: 180, easing: EASE_OUT };

type Props = {
  active: boolean;
  /** Mount now while hidden, so the first visit is instant too. */
  warm?: boolean;
  /**
   * Non-zero while a page swipe commits. A swiped page already slid away, so
   * it vanishes at once; after a tap it dissolves over the new page. Read in
   * the effect, which runs before the parent's effect clears it.
   */
  swipe?: RefObject<number>;
  children: ReactNode;
};

/**
 * One tab's page. It mounts the first time it shows (or when warm) and then
 * stays mounted while hidden, so coming back costs no rebuild and keeps the
 * scroll spot.
 *
 * A switch never dips through the empty background: the new page shows at
 * once underneath, and the old one, lifted above it, dissolves away. Pages
 * are opaque so the two never show through each other.
 */
function TabLayerBase({ active, warm = false, swipe, children }: Props) {
  const styles = useAppStyles();
  const reduceMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(active);
  if ((active || warm) && !hasMounted) {
    setHasMounted(true);
  }
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    const instant = reduceMotion || (swipe?.current ?? 0) !== 0;
    opacity.set(active ? 1 : instant ? 0 : withTiming(0, FADE_OUT));
    // Only the moment of leaving matters, not later changes to reduceMotion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Leaving pages sit above the new one while they dissolve.
      style={[StyleSheet.absoluteFill, styles.screen, { zIndex: active ? 0 : 1 }, fadeStyle]}
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
