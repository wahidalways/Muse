import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { EASE_OUT, clamp } from '../motion/motion';
import { getPlaybackController } from '../playback/PlaybackController';
import { usePlaybackProgress } from '../playback/usePlayback';
import { useAppStyles } from '../theme/styles';
import { formatTrackDuration } from '../utils/format';
import { setPreference, usePreferences } from '../settings/preferences';
import { hapticSelection } from '../utils/haptics';

/** How far (in seconds) the glide may drift from the player before resyncing. */
const MAX_DRIFT_SECONDS = 0.35;
/** A thin bar is hard to hit. This widens the touch area, not the visual. */
const HOME_SLIDER_HIT_SLOP = { top: 14, bottom: 14 };
const SCRUB_FEEDBACK = { duration: 120, easing: EASE_OUT };

/**
 * Playback position with the track's scanned length as a fallback until the
 * player reports its own. Re-renders once per status tick, so it is only used
 * for text: time labels and accessibility values.
 */
function useTrackProgress(fallbackDuration: number, live = true) {
  const { currentTime, duration } = usePlaybackProgress(live);
  return {
    currentTime,
    duration: duration > 0 ? duration : fallbackDuration,
  };
}

/**
 * Song position from 0 to 1, as a value the UI thread animates.
 *
 * The player reports its position once a second. Instead of jumping on each
 * report, the bar glides linearly towards the end of the song on the UI
 * thread, so it moves every frame with no JS or React work. Reports only
 * correct the glide when it has drifted, the song changed, or playback
 * paused or resumed.
 */
function useSmoothProgress(
  fallbackDuration: number,
  isScrubbing?: SharedValue<boolean>,
  /** False while hidden (the closed player): the bar steps once a report instead of gliding every frame. */
  live = true,
): { ratio: SharedValue<number>; resync: () => void } {
  const ratio = useSharedValue(0);
  const glideDuration = useRef<number | null>(null);
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const controller = getPlaybackController();
    const sync = () => {
      if (isScrubbing?.get()) {
        return;
      }
      const { currentTime, duration: reported } = controller.getProgress();
      const duration = reported > 0 ? reported : fallbackDuration;
      if (duration <= 0) {
        glideDuration.current = null;
        cancelAnimation(ratio);
        ratio.set(0);
        return;
      }

      const actual = clamp(currentTime / duration, 0, 1);
      if (!live || !controller.getSnapshot().isPlaying) {
        glideDuration.current = null;
        cancelAnimation(ratio);
        ratio.set(actual);
        return;
      }

      // At 1.5x the song ends in two thirds of the time, so the glide must too.
      const speed = controller.getPlaybackSpeed();
      const glideKey = duration / speed;
      const drift = Math.abs(ratio.get() - actual) * duration;
      if (glideDuration.current === glideKey && drift < MAX_DRIFT_SECONDS) {
        return;
      }
      glideDuration.current = glideKey;
      ratio.set(actual);
      ratio.set(
        withTiming(1, {
          duration: Math.max(0, ((duration - currentTime) * 1000) / speed),
          easing: Easing.linear,
          // A progress bar reports state, so it keeps moving with reduced
          // motion on. Jumping to the end would be wrong.
          reduceMotion: ReduceMotion.Never,
        }),
      );
    };

    syncRef.current = sync;
    sync();
    const unsubscribeProgress = controller.subscribeProgress(sync);
    const unsubscribeState = controller.subscribe(sync);
    return () => {
      unsubscribeProgress();
      unsubscribeState();
      cancelAnimation(ratio);
    };
  }, [fallbackDuration, isScrubbing, live, ratio]);

  // A scrub cancels the glide, so it must restart even when nothing drifted.
  const resync = useCallback(() => {
    glideDuration.current = null;
    syncRef.current?.();
  }, []);
  return { ratio, resync };
}

/** Fill translated across a clipped track: transform only, no layout per frame. */
function useFillStyle(ratio: SharedValue<number>, width: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    transform: [{ translateX: (ratio.get() - 1) * width.get() }],
  }));
}

export function MiniPlayerProgress({ fallbackDuration }: { fallbackDuration: number }) {
  const styles = useAppStyles();
  const { ratio } = useSmoothProgress(fallbackDuration);
  const width = useSharedValue(0);
  const fillStyle = useFillStyle(ratio, width);
  return (
    <View
      style={styles.miniPlayerTrack}
      onLayout={(event: LayoutChangeEvent) => width.set(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[styles.miniPlayerProgress, progressStyles.fill, fillStyle]}
      />
    </View>
  );
}

/**
 * Size of each slider. The full player gets a taller wave and a time bubble;
 * the Home card keeps it compact so the card stays calm.
 */
const SLIDER = {
  full: { height: 44, stroke: 4, amplitude: 3.2, wavelength: 30, handleHeight: 28, handleWidth: 4, gap: 8 },
  home: { height: 22, stroke: 3, amplitude: 2.2, wavelength: 22, handleHeight: 16, handleWidth: 3, gap: 6 },
} as const;
/** One full wave cycle. Slow enough to feel like a current, not a buzz. */
const FLOW_CYCLE_MS = 1800;
const SETTLE = { duration: 420, easing: EASE_OUT };
const TWO_PI = Math.PI * 2;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The played part of the track as a sine wave, sampled every 2px. It eases
 * to flat at both ends, so it starts on the line and meets the handle level.
 * Runs on the UI thread every frame.
 */
function wavePath(end: number, middle: number, amplitude: number, phase: number, wavelength: number): string {
  'worklet';
  if (end <= 0) {
    return `M0 ${middle}`;
  }
  if (amplitude < 0.05) {
    return `M0 ${middle} L${end} ${middle}`;
  }
  let path = `M0 ${middle}`;
  for (let x = 2; x < end; x += 2) {
    const taper = Math.min(1, x / 10, (end - x) / 14);
    path += ` L${x} ${middle + amplitude * taper * Math.sin(phase + (x / wavelength) * TWO_PI)}`;
  }
  return `${path} L${end} ${middle}`;
}

/**
 * A Material 3 style seek bar. While music plays, the played part flows as a
 * gentle wave; it settles flat when paused, while dragging, and with reduced
 * motion on. A tall handle sits in a gap in the track, a dot marks the end,
 * and dragging shows the time in a bubble over the handle.
 */
export function ProgressSlider({
  fallbackDuration,
  onSeek,
  variant,
  animate = true,
  flat = false,
}: {
  fallbackDuration: number;
  onSeek: (ratio: number) => void;
  variant: 'full' | 'home';
  /** Off while the slider is hidden, for example under the full player. */
  animate?: boolean;
  /** A still, straight line (the Minimal type skin): no wave, no per-frame work. */
  flat?: boolean;
}) {
  const styles = useAppStyles();
  const size = SLIDER[variant];
  const middle = size.height / 2;
  const controller = getPlaybackController();
  // Re-renders on play and pause only. Position ticks never re-render this,
  // so the drawing below is not rebuilt every second.
  const isPlaying = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().isPlaying,
  );
  const reduceMotion = useReducedMotion();
  const activeColor = String(styles.sliderActive.backgroundColor);
  const inactiveColor = String(styles.sliderInactive.backgroundColor);

  const [layoutWidth, setLayoutWidth] = useState(0);
  const width = useSharedValue(0);
  const isScrubbing = useSharedValue(false);
  const { ratio, resync } = useSmoothProgress(fallbackDuration, isScrubbing, animate);
  const durationValue = useSharedValue(fallbackDuration);
  const shownSecond = useSharedValue(-1);
  /** The time under the finger while dragging, or null. */
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);

  // The bubble needs the length on the UI thread, without a re-render.
  useEffect(() => {
    const sync = () => {
      const { duration } = controller.getProgress();
      durationValue.set(duration > 0 ? duration : fallbackDuration);
    };
    sync();
    return controller.subscribeProgress(sync);
  }, [controller, durationValue, fallbackDuration]);

  // The wave's phase turns forever while music flows, and holds when it stops.
  const flowing = isPlaying && animate && !reduceMotion && !flat;
  const phase = useSharedValue(0);
  const isFlowing = useSharedValue(flowing);
  useEffect(() => {
    isFlowing.set(flowing);
    if (flowing) {
      phase.set(
        withRepeat(
          withTiming(phase.get() + TWO_PI, {
            duration: FLOW_CYCLE_MS,
            easing: Easing.linear,
            reduceMotion: ReduceMotion.Never,
          }),
          -1,
        ),
      );
    } else {
      cancelAnimation(phase);
    }
    return () => cancelAnimation(phase);
  }, [flowing, isFlowing, phase]);

  // Height of the wave: grows in when music flows, flattens when it stops.
  const amplitude = useDerivedValue(() =>
    withTiming(isFlowing.get() && !isScrubbing.get() ? size.amplitude : 0, SETTLE),
  );

  const waveProps = useAnimatedProps(() => ({
    d: wavePath(
      Math.max(0, ratio.get() * width.get() - size.gap),
      middle,
      amplitude.get(),
      phase.get(),
      size.wavelength,
    ),
  }));
  const restProps = useAnimatedProps(() => {
    const start = Math.min(width.get(), ratio.get() * width.get() + size.gap);
    const end = width.get() - size.stroke / 2;
    return { x1: start, x2: Math.max(start, end), strokeOpacity: start < end ? 1 : 0 };
  });
  // The end dot hides once the handle reaches it.
  const stopProps = useAnimatedProps(() => ({
    opacity: ratio.get() * width.get() < width.get() - size.gap * 2 ? 1 : 0,
  }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ratio.get() * width.get() - size.handleWidth / 2 },
      // Material's handle gets thinner while held, so the time beneath shows.
      { scaleX: withTiming(isScrubbing.get() ? 0.5 : 1, SCRUB_FEEDBACK) },
      { scaleY: withTiming(isScrubbing.get() ? 1.12 : 1, SCRUB_FEEDBACK) },
    ],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isScrubbing.get() ? 1 : 0, SCRUB_FEEDBACK),
    transform: [
      { translateX: clamp(ratio.get() * width.get(), 24, Math.max(24, width.get() - 24)) - 28 },
      { translateY: withTiming(isScrubbing.get() ? 0 : 6, SCRUB_FEEDBACK) },
      { scale: withTiming(isScrubbing.get() ? 1 : 0.85, SCRUB_FEEDBACK) },
    ],
  }));

  /** Shows the time under the finger, re-rendering only when the second changes. */
  const reportScrub = (value: number) => {
    'worklet';
    const second = Math.floor(value * durationValue.get());
    if (second !== shownSecond.get()) {
      shownSecond.set(second);
      scheduleOnRN(setScrubSeconds, second);
    }
  };

  // The handle follows the finger on the UI thread. The player seeks once, on
  // release, instead of on every move.
  const commitSeek = useCallback(
    (value: number) => {
      isScrubbing.set(false);
      shownSecond.set(-1);
      setScrubSeconds(null);
      onSeek(value);
      resync();
    },
    [isScrubbing, onSeek, resync, shownSecond],
  );
  const cancelScrub = useCallback(() => {
    isScrubbing.set(false);
    shownSecond.set(-1);
    setScrubSeconds(null);
    resync();
  }, [isScrubbing, resync, shownSecond]);

  // Always on: seeking a song with no known length does nothing anyway.
  const hitSlop = variant === 'home' ? HOME_SLIDER_HIT_SLOP : undefined;
  const pan = usePanGesture({
    hitSlop,
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onActivate: (event) => {
      'worklet';
      if (width.get() <= 0) {
        return;
      }
      isScrubbing.set(true);
      cancelAnimation(ratio);
      ratio.set(clamp(event.x / width.get(), 0, 1));
      reportScrub(ratio.get());
    },
    onUpdate: (event) => {
      'worklet';
      if (isScrubbing.get()) {
        ratio.set(clamp(event.x / width.get(), 0, 1));
        reportScrub(ratio.get());
      }
    },
    onDeactivate: (event) => {
      'worklet';
      if (!isScrubbing.get()) {
        return;
      }
      if (event.canceled) {
        scheduleOnRN(cancelScrub);
      } else {
        scheduleOnRN(commitSeek, ratio.get());
      }
    },
  });
  const tap = useTapGesture({
    hitSlop,
    onDeactivate: (event) => {
      'worklet';
      if (event.canceled || width.get() <= 0) {
        return;
      }
      const value = clamp(event.x / width.get(), 0, 1);
      isScrubbing.set(true);
      cancelAnimation(ratio);
      ratio.set(value);
      scheduleOnRN(commitSeek, value);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  return (
    <View
      style={[
        styles.playerProgressWrap,
        variant === 'home' && styles.homeNowPlayingSliderWrap,
      ]}
    >
      {variant === 'full' && (
        <Animated.View pointerEvents="none" style={[styles.sliderBubble, bubbleStyle]}>
          <Text style={styles.sliderBubbleText}>{formatTrackDuration(scrubSeconds ?? 0)}</Text>
        </Animated.View>
      )}
      <SeekArea
        gesture={gesture}
        height={size.height}
        fallbackDuration={fallbackDuration}
        onSeek={onSeek}
        onWidth={(next) => {
          width.set(next);
          setLayoutWidth(next);
        }}
        live={animate}
      >
        {layoutWidth > 0 && (
          <Svg width={layoutWidth} height={size.height} pointerEvents="none">
            <AnimatedLine
              y1={middle}
              y2={middle}
              stroke={inactiveColor}
              strokeWidth={size.stroke}
              strokeLinecap="round"
              animatedProps={restProps}
            />
            <AnimatedCircle
              cx={layoutWidth - size.stroke / 2}
              cy={middle}
              r={size.stroke / 2}
              fill={activeColor}
              animatedProps={stopProps}
            />
            <AnimatedPath
              stroke={activeColor}
              strokeWidth={size.stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              animatedProps={waveProps}
            />
          </Svg>
        )}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sliderHandle,
            {
              width: size.handleWidth,
              height: size.handleHeight,
              top: middle - size.handleHeight / 2,
              borderRadius: size.handleWidth / 2,
            },
            handleStyle,
          ]}
        />
      </SeekArea>
      {variant === 'full' && (
        <SliderTimes fallbackDuration={fallbackDuration} scrubSeconds={scrubSeconds} live={animate} />
      )}
    </View>
  );
}

/**
 * The touch area. It re-renders every second so screen readers hear the
 * position, but the drawing passed in as `children` is the same element each
 * time, so React leaves it alone.
 */
function SeekArea({
  gesture,
  height,
  fallbackDuration,
  onSeek,
  onWidth,
  live,
  children,
}: {
  gesture: ReturnType<typeof useCompetingGestures>;
  height: number;
  fallbackDuration: number;
  onSeek: (ratio: number) => void;
  onWidth: (width: number) => void;
  /** False while hidden: position ticks do not re-render it. */
  live: boolean;
  children: ReactNode;
}) {
  const { currentTime, duration } = useTrackProgress(fallbackDuration, live);
  const seekBy = (seconds: number) => {
    if (duration > 0) {
      onSeek(clamp((currentTime + seconds) / duration, 0, 1));
    }
  };
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Song position"
        accessibilityValue={{
          min: 0,
          max: Math.floor(duration),
          now: Math.floor(currentTime),
          text: `${formatTrackDuration(currentTime)} of ${formatTrackDuration(duration)}`,
        }}
        accessibilityActions={[
          { name: 'increment', label: 'Forward 10 seconds' },
          { name: 'decrement', label: 'Back 10 seconds' },
        ]}
        onAccessibilityAction={(event) =>
          seekBy(event.nativeEvent.actionName === 'increment' ? 10 : -10)
        }
        onLayout={(event: LayoutChangeEvent) => onWidth(event.nativeEvent.layout.width)}
        style={{ height, justifyContent: 'center' }}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

/** Elapsed and total time under the full player's slider. */
function SliderTimes({
  fallbackDuration,
  scrubSeconds,
  live,
}: {
  fallbackDuration: number;
  scrubSeconds: number | null;
  /** False while hidden: position ticks do not re-render it. */
  live: boolean;
}) {
  const styles = useAppStyles();
  const { currentTime, duration } = useTrackProgress(fallbackDuration, live);
  const { showTimeRemaining } = usePreferences();
  const shown = scrubSeconds ?? currentTime;
  const left = Math.max(0, duration - shown);
  return (
    <View style={styles.playerTimeRow}>
      <Text style={[styles.playerTimeText, scrubSeconds !== null && styles.playerTimeTextActive]}>
        {formatTrackDuration(shown)}
      </Text>
      {/* Tap to switch between the song's length and the time left. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          showTimeRemaining ? `${formatTrackDuration(left)} left` : `Length ${formatTrackDuration(duration)}`
        }
        accessibilityHint={showTimeRemaining ? 'Shows the song length' : 'Shows the time left'}
        hitSlop={12}
        onPress={() => {
          hapticSelection();
          setPreference('showTimeRemaining', !showTimeRemaining);
        }}
      >
        <Text style={styles.playerTimeText}>
          {showTimeRemaining ? `-${formatTrackDuration(left)}` : formatTrackDuration(duration)}
        </Text>
      </Pressable>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
  },
});
