import { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppStyles } from '../../theme/styles';
import { sidewaysDragLock } from '../../motion/gestureLock';
import { hapticSelection } from '../../utils/haptics';
import { shortFreq } from '../sound';

/**
 * Sliders move by how far the finger travels, not to where it lands, as on
 * iOS: a touch never makes the sound jump. Values snap to `step`; each drag
 * is heard live and saved once when let go (`onChange(value, live)`).
 */

type Scale = { min: number; max: number; step: number; log?: boolean };

function clamp01(value: number) {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

function toPosition(value: number, { min, max, log }: Scale) {
  return clamp01(log ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min));
}

function fromPosition(position: number, { min, max, step, log }: Scale) {
  const raw = log ? min * (max / min) ** position : min + position * (max - min);
  // Log scales (frequency) snap to 3 significant digits: 1.25 kHz, 87.5 Hz.
  const snapped = log
    ? Number(raw.toPrecision(3))
    : Math.round(raw / step) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
}

/** A labelled horizontal slider row, iOS Settings style. */
export function EqSlider({
  title,
  value,
  min,
  max,
  step,
  log = false,
  center,
  format,
  onChange,
  disabled = false,
  hint,
}: Scale & {
  title: string;
  value: number;
  /** The fill grows from here; for ± values use 0. Defaults to `min`. */
  center?: number;
  format: (value: number) => string;
  onChange: (value: number, live: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const styles = useAppStyles();
  const scale = { min, max, step, log };
  const position = useSharedValue(toPosition(value, scale));
  const origin = toPosition(center ?? min, scale);
  const width = useSharedValue(0);
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (!dragging.get()) {
      position.set(toPosition(value, { min, max, step, log }));
    }
  }, [dragging, position, value, min, max, step, log]);

  const live = (next: number) => {
    const snapped = fromPosition(next, scale);
    if (snapped !== (shown ?? value)) {
      setShown(snapped);
      onChange(snapped, true);
    }
  };
  const done = (next: number) => {
    setShown(null);
    onChange(fromPosition(next, scale), false);
  };

  const drag = usePanGesture({
    enabled: !disabled,
    activeOffsetX: [-4, 4],
    failOffsetY: [-12, 12],
    hitSlop: { top: 6, bottom: 6 },
    onActivate: () => {
      'worklet';
      dragging.set(true);
      start.set(position.get());
      // This drag is the slider's, not a swipe back.
      sidewaysDragLock.set(true);
    },
    onUpdate: (event) => {
      'worklet';
      const total = width.get();
      if (!dragging.get() || total <= 0) {
        return;
      }
      const next = clamp01(start.get() + event.translationX / total);
      position.set(next);
      scheduleOnRN(live, next);
    },
    onFinalize: () => {
      'worklet';
      sidewaysDragLock.set(false);
      if (dragging.get()) {
        dragging.set(false);
        scheduleOnRN(done, position.get());
      }
    },
  });

  const fillStyle = useAnimatedStyle(() => ({
    left: `${origin * 100}%`,
    transform: [{ scaleX: position.get() - origin }],
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.get() * width.get() - 14 }],
  }));

  const current = shown ?? value;
  const nudge = (direction: 1 | -1) => {
    const next = log
      ? fromPosition(clamp01(toPosition(current, scale) + direction * 0.05), scale)
      : Math.min(max, Math.max(min, current + direction * step * Math.max(1, Math.round((max - min) / step / 20))));
    hapticSelection();
    onChange(next, false);
  };

  return (
    <View style={[styles.eqSlider, disabled && styles.prefRowDisabled]}>
      <View style={styles.eqSliderTop}>
        <Text style={styles.eqSliderTitle}>{title}</Text>
        <Text style={styles.eqSliderValue}>{format(current)}</Text>
      </View>
      {hint ? <Text style={styles.prefRowSubtitle}>{hint}</Text> : null}
      <GestureDetector gesture={drag}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={title}
          accessibilityHint={hint}
          accessibilityState={{ disabled }}
          accessibilityValue={{ text: format(current) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (!disabled) {
              nudge(event.nativeEvent.actionName === 'increment' ? 1 : -1);
            }
          }}
          onLayout={(event: LayoutChangeEvent) => width.set(event.nativeEvent.layout.width)}
          style={styles.eqSliderTouch}
        >
          <View style={styles.eqSliderTrack}>
            <Animated.View style={[styles.eqSliderFill, fillStyle]} />
          </View>
          <Animated.View style={[styles.eqSliderThumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

/** Vertical graphic-EQ sliders. With many bands they scroll sideways. */
export function BandSliders({
  freqs,
  gains,
  range,
  height,
  onChange,
}: {
  freqs: number[];
  gains: number[];
  range: number;
  height: number;
  onChange: (index: number, gain: number, live: boolean) => void;
}) {
  const styles = useAppStyles();
  const wide = freqs.length > 12;
  const columns = freqs.map((freq, index) => (
    <BandSlider
      key={freq}
      freq={freq}
      gain={gains[index]}
      range={range}
      height={height}
      wide={wide}
      onChange={(gain, live) => onChange(index, gain, live)}
    />
  ));
  if (!wide) {
    return <View style={styles.eqBandRow}>{columns}</View>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eqBandRow}>
      {columns}
    </ScrollView>
  );
}

const BAND_STEP = 0.5;
const THUMB = 22;

function BandSlider({
  freq,
  gain,
  range,
  height,
  wide,
  onChange,
}: {
  freq: number;
  gain: number;
  range: number;
  height: number;
  wide: boolean;
  onChange: (gain: number, live: boolean) => void;
}) {
  const styles = useAppStyles();
  // 0 at the top (+range), 1 at the bottom (-range).
  const toY = (value: number) => clamp01((range - value) / (2 * range));
  const fromY = (y: number) => Math.round(((1 - 2 * y) * range) / BAND_STEP) * BAND_STEP;
  const position = useSharedValue(toY(gain));
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);
  const [shown, setShown] = useState<number | null>(null);
  const travel = height - THUMB;

  useEffect(() => {
    if (!dragging.get()) {
      position.set(clamp01((range - gain) / (2 * range)));
    }
  }, [dragging, gain, position, range]);

  const live = (y: number) => {
    const next = fromY(y);
    if (next !== (shown ?? gain)) {
      setShown(next);
      onChange(next, true);
    }
  };
  const done = (y: number) => {
    setShown(null);
    onChange(fromY(y), false);
  };

  const drag = usePanGesture({
    // Up and down only: sideways belongs to the band list's scroll.
    activeOffsetY: [-4, 4],
    failOffsetX: [-10, 10],
    onActivate: () => {
      'worklet';
      dragging.set(true);
      start.set(position.get());
    },
    onUpdate: (event) => {
      'worklet';
      if (!dragging.get()) {
        return;
      }
      const next = clamp01(start.get() + event.translationY / travel);
      position.set(next);
      scheduleOnRN(live, next);
    },
    onFinalize: () => {
      'worklet';
      if (dragging.get()) {
        dragging.set(false);
        scheduleOnRN(done, position.get());
      }
    },
  });

  const fillStyle = useAnimatedStyle(() => ({
    // From the 0 dB middle to the thumb; a negative scale grows upward.
    top: '50%',
    transform: [{ scaleY: position.get() - 0.5 }],
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: position.get() * travel }],
  }));

  const current = shown ?? gain;
  const label = current === 0 ? '0' : `${current > 0 ? '+' : '−'}${Math.abs(current)}`;
  const freqLabel = freq >= 1000 ? `${freq / 1000} kilohertz` : `${freq} hertz`;
  return (
    <View style={wide ? styles.eqBandColumnWide : styles.eqBandColumn}>
      <Text style={styles.eqBandValue}>{label}</Text>
      <GestureDetector gesture={drag}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${freqLabel} band`}
          accessibilityValue={{ text: `${label} decibels` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const next = current + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
            onChange(Math.min(range, Math.max(-range, next)), false);
          }}
          style={[styles.eqBandTouch, { height }]}
        >
          <View style={[styles.eqBandTrack, { height: travel, marginTop: THUMB / 2 }]}>
            <Animated.View style={[styles.eqBandFill, fillStyle]} />
          </View>
          <Animated.View style={[styles.eqBandThumb, thumbStyle]} />
        </View>
      </GestureDetector>
      <Text style={styles.eqBandLabel}>{shortFreq(freq)}</Text>
    </View>
  );
}
