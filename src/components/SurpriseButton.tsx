import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { hapticSelection, hapticSuccess } from '../utils/haptics';

/** The shuffle: a few quick picks while the dice tumbles, then the one that stays. */
const SHUFFLE_MS = [0, 110, 230, 380];
const ROLL_MS = 620;

/**
 * "Surprise me": the dice tumbles two turns and hops while `onRoll` is called
 * a few times like a slot machine (`final` on the last), so the name and
 * picture visibly shuffle before they settle. Reduce motion: one pick, no roll.
 */
export function SurpriseButton({
  onRoll,
  color,
  label,
  labelColor,
  style,
}: {
  onRoll: (final: boolean) => void;
  /** The dice's color. */
  color: string;
  /** Shown beside the dice; left out for an icon-only button inside a field. */
  label?: string;
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const still = useReducedMotion();
  const spin = useSharedValue(0);
  const hop = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const roll = () => {
    timers.current.forEach(clearTimeout);
    if (still) {
      onRoll(true);
      hapticSuccess();
      return;
    }
    spin.set(withTiming(spin.get() + 720, { duration: ROLL_MS, easing: Easing.out(Easing.cubic) }));
    hop.set(withSequence(withTiming(-7, { duration: 150, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 260 })));
    timers.current = SHUFFLE_MS.map((delay, index) =>
      setTimeout(() => {
        const final = index === SHUFFLE_MS.length - 1;
        onRoll(final);
        if (final) {
          hapticSuccess();
        } else {
          hapticSelection();
        }
      }, delay),
    );
  };
  // Transform only, so the tumble never waits on React re-rendering the shuffled name.
  const diceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.get() }, { rotate: `${spin.get()}deg` }],
  }));

  const dice: ReactNode = (
    <Animated.View style={diceStyle}>
      <Ionicons accessible={false} name="dice" size={label ? 18 : 20} color={color} />
    </Animated.View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Surprise me"
      accessibilityHint="Picks a random funky name and picture"
      hitSlop={label ? 4 : 10}
      onPress={roll}
      style={({ pressed }) => [local.button, style, pressed && local.pressed]}
    >
      {dice}
      {label ? <Text style={[local.label, { color: labelColor ?? color }]}>{label}</Text> : null}
    </Pressable>
  );
}

const local = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
