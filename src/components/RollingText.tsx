import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { EASE_OUT } from '../motion/motion';

const ROLL = { duration: 520, easing: EASE_OUT, reduceMotion: ReduceMotion.System };

/**
 * Text whose digits roll like a tape counter when it changes: the old digit
 * slides up and out, the new one comes up from below, right to left. Other
 * characters stay still. Only a digit that changes animates, and only then,
 * so a still number costs nothing. With `fromZero`, digits first roll up
 * from 0 (a tile's entrance) once `start` is true.
 */
export function RollingText({
  text,
  style,
  fromZero = false,
  start = true,
  accessibilityLabel,
}: {
  text: string;
  style: StyleProp<TextStyle>;
  fromZero?: boolean;
  /** When to begin the from-zero roll, such as a tile coming into view. */
  start?: boolean;
  accessibilityLabel?: string;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const height = flat.lineHeight ?? Math.round((flat.fontSize ?? 14) * 1.2);
  const chars = [...text];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? text}
      style={[styles.row, { height }]}
    >
      {chars.map((char, index) => {
        // Keyed from the right, so "9m" to "10m" keeps the minutes column.
        const fromRight = chars.length - 1 - index;
        const isDigit = char >= '0' && char <= '9';
        return isDigit ? (
          <Digit
            key={`d${fromRight}`}
            value={char}
            style={style}
            height={height}
            delay={fromRight * 30}
            fromZero={fromZero}
            start={start}
          />
        ) : (
          <Animated.Text key={`c${fromRight}-${char}`} style={[style, styles.tabular]}>
            {char}
          </Animated.Text>
        );
      })}
    </View>
  );
}

function Digit({
  value,
  style,
  height,
  delay,
  fromZero,
  start,
}: {
  value: string;
  style: StyleProp<TextStyle>;
  height: number;
  delay: number;
  fromZero: boolean;
  start: boolean;
}) {
  // What rolls out and what rolls in. They match once nothing is moving.
  const [shown, setShown] = useState({ from: fromZero ? '0' : value, to: value });
  if (shown.to !== value) {
    setShown({ from: shown.to, to: value });
  }
  const progress = useSharedValue(shown.from === shown.to ? 1 : 0);
  useEffect(() => {
    if (shown.from === shown.to || !start) {
      return;
    }
    progress.set(0);
    progress.set(withDelay(delay, withTiming(1, ROLL)));
  }, [delay, progress, shown, start]);

  const incoming = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * height }],
  }));
  const outgoing = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateY: -progress.get() * height }],
  }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.Text style={[style, styles.tabular, incoming]}>{shown.to}</Animated.Text>
      {shown.from !== shown.to && (
        <Animated.Text style={[style, styles.tabular, styles.overlay, outgoing]}>{shown.from}</Animated.Text>
      )}
    </View>
  );
}

/**
 * A whole line that rolls when its text changes (the greeting at 5 PM,
 * "Best 9" turning into "New best"). Same motion as the digits.
 */
export function RollingLine({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const height = flat.lineHeight ?? Math.round((flat.fontSize ?? 14) * 1.2);
  const [shown, setShown] = useState({ from: text, to: text });
  if (shown.to !== text) {
    setShown({ from: shown.to, to: text });
  }
  const progress = useSharedValue(1);
  useEffect(() => {
    if (shown.from === shown.to) {
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, ROLL));
  }, [progress, shown]);
  const incoming = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * height }],
  }));
  const outgoing = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateY: -progress.get() * height }],
  }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.Text numberOfLines={1} style={[style, incoming]}>
        {shown.to}
      </Animated.Text>
      {shown.from !== shown.to && (
        <Animated.Text numberOfLines={1} style={[style, styles.overlay, outgoing]}>
          {shown.from}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
