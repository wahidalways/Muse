import { createContext, useContext, useState, type ReactNode } from 'react';
import { scheduleOnRN } from 'react-native-worklets';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Home's entrances. Each tile has its own clock that runs once, the first
 * time the tile is on screen after the launch screen has gone, so tiles
 * further down play when you scroll to them instead of unseen at mount.
 * The parts of a tile (bars, ring, numbers) play at set times on that clock.
 * Everything here is transform and opacity on the UI thread, and nothing
 * runs once a tile has played.
 */

/** How long a tile's clock runs, in ms. Every part fits inside it. */
const TIMELINE_MS = 1300;
/** A tile counts as on screen once its top is this far above the bottom (the dock covers the rest). */
const BOTTOM_MARGIN = 90;
/** Tiles not yet shown re-check where they are once per this much scroll, not every frame. */
const CHECK_EVERY = 24;

type Reveal = {
  scrollY: SharedValue<number>;
  revealed: SharedValue<boolean>;
  /** False on later visits in the same launch: everything starts finished. */
  playIntro: boolean;
};

export const RevealContext = createContext<Reveal | null>(null);
const ClockContext = createContext<SharedValue<number> | null>(null);

/** The clock of the tile around this part, in ms. */
export function useTileClock(): SharedValue<number> | null {
  return useContext(ClockContext);
}

/** Whether entrances play in this Home (the first visit of a launch). */
export function useIntro(): boolean {
  return useContext(RevealContext)?.playIntro ?? false;
}

/** Progress 0 to 1 of a part that starts `delay` ms into the clock and lasts `duration`, eased out. */
export function part(clock: number, delay: number, duration: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, (clock - delay) / duration));
  return 1 - (1 - t) ** 3;
}

/** Whether the tile's clock has started (true at once when entrances do not play). */
export function useTileStarted(): boolean {
  const clock = useTileClock();
  const intro = useIntro();
  const [started, setStarted] = useState(!intro || !clock);
  useAnimatedReaction(
    () => (clock ? clock.get() > 0 : true),
    (now, before) => {
      if (now && !before) {
        scheduleOnRN(setStarted, true);
      }
    },
  );
  return started;
}

/**
 * A tile (or the greeting) whose clock starts when it first comes into view.
 * Tiles in view at the start step in one after another by `order`; later ones
 * play at once. With `frame`, the whole view fades up; without it, only its
 * parts move.
 */
export function RevealView({
  order,
  style,
  frame = true,
  children,
}: {
  order: number;
  style?: StyleProp<ViewStyle>;
  frame?: boolean;
  children: ReactNode;
}) {
  const reveal = useContext(RevealContext);
  const { height } = useWindowDimensions();
  const ref = useAnimatedRef<View>();
  const playIntro = reveal?.playIntro ?? false;
  const clock = useSharedValue(playIntro ? 0 : TIMELINE_MS);
  const started = useSharedValue(!playIntro);
  const laidOut = useSharedValue(false);

  useAnimatedReaction(
    () =>
      reveal && reveal.revealed.get() && laidOut.get() && !started.get()
        ? Math.floor(reveal.scrollY.get() / CHECK_EVERY)
        : null,
    (step) => {
      if (step === null) {
        return;
      }
      const scrollY = step * CHECK_EVERY;
      const box = measure(ref);
      if (!box || box.pageY > height - BOTTOM_MARGIN) {
        return;
      }
      started.set(true);
      clock.set(
        withDelay(
          scrollY < 8 ? Math.min(order, 5) * 70 : 0,
          withTiming(TIMELINE_MS, { duration: TIMELINE_MS, easing: Easing.linear }),
        ),
      );
    },
  );

  const frameStyle = useAnimatedStyle(() => {
    if (!frame) {
      return {};
    }
    const progress = part(clock.get(), 0, 380);
    return { opacity: progress, transform: [{ translateY: (1 - progress) * 14 }] };
  });

  return (
    <Animated.View ref={ref} onLayout={() => laidOut.set(true)} style={[style, frameStyle]}>
      <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>
    </Animated.View>
  );
}

/** Rises in (12 dp, fading) at `delay` ms on the tile's clock. */
export function RiseIn({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const clock = useTileClock();
  const rise = useAnimatedStyle(() => {
    const progress = clock ? part(clock.get(), delay, 420) : 1;
    return { opacity: progress, transform: [{ translateY: (1 - progress) * 12 }] };
  });
  return <Animated.View style={[style, rise]}>{children}</Animated.View>;
}

/** A bar that rises from its baseline at `delay` ms on the tile's clock. Transform only. */
export function GrowBar({
  delay,
  style,
  children,
}: {
  delay: number;
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const clock = useTileClock();
  const growStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: clock ? part(clock.get(), delay, 700) : 1 }] }));
  return <Animated.View style={[style, growStyle]}>{children}</Animated.View>;
}
