import {
  ReduceMotion,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated';

import { PUSH_IN } from './motion';

/** Where the finger last landed on a Muse Pressable, in window points; null before the first touch. */
let lastTouch: { x: number; y: number } | null = null;

/** Called by components/Pressable on every press-in. */
export function noteTouch(x: number, y: number) {
  lastTouch = { x, y };
}

/** How small a page starts when it grows out of a touch. */
const START_SCALE = 0.86;
const OPEN_SPRING = { duration: 460, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;

/**
 * Entering animation for a pushed page: it grows out of where the finger
 * last touched (the tile, row or button that opened it), the way ColorOS
 * opens things from their origin. Scaling about that point is a translate
 * of (point - centre) * (1 - scale), then the scale. Before any touch it
 * slides in like PUSH_IN.
 */
export function openFromTouch() {
  const touch = lastTouch;
  if (!touch) {
    return PUSH_IN;
  }
  return (values: EntryAnimationsValues): LayoutAnimation => {
    'worklet';
    const centerX = values.targetGlobalOriginX + values.targetWidth / 2;
    const centerY = values.targetGlobalOriginY + values.targetHeight / 2;
    return {
      initialValues: {
        opacity: 0,
        transform: [
          { translateX: (touch.x - centerX) * (1 - START_SCALE) },
          { translateY: (touch.y - centerY) * (1 - START_SCALE) },
          { scale: START_SCALE },
        ],
      },
      animations: {
        opacity: withTiming(1, { duration: 180, reduceMotion: ReduceMotion.System }),
        transform: [
          { translateX: withSpring(0, OPEN_SPRING) },
          { translateY: withSpring(0, OPEN_SPRING) },
          { scale: withSpring(1, OPEN_SPRING) },
        ],
      },
    };
  };
}
