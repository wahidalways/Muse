import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { opticalSize } from './icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppStyles } from '../theme/styles';

export const CREDIT_NAME = 'wahidalways';
export const CREDIT_URL = 'https://github.com/wahidalways';
export const MUSE_MOTTO = 'All your music. Right on your phone.';
/** Shown in Settings. Keep in step with "version" in app.json. */
export const APP_VERSION = '1.0';

/**
 * Bar heights of the Muse mark at its base size of 22: a level-meter rhythm,
 * the tallest as high as the wordmark's ascenders. The splash images in
 * assets/splash-bars-*.png draw the same bars at size 44; redraw them if these change,
 * and the app icons with: node scripts/make-icons.mjs
 */
const BAR_HEIGHTS = [8, 13, 18, 11];
const BASE_SIZE = 22;

/**
 * The Muse mark: four sound bars and the name. `size` is the bar height
 * box; everything scales from it. With `animated`, the bars pulse like a
 * level meter, used while the app starts. `withName={false}` draws the bars alone.
 */
export function BrandMark({
  size = BASE_SIZE,
  animated = false,
  withName = true,
}: {
  size?: number;
  animated?: boolean;
  withName?: boolean;
}) {
  const styles = useAppStyles();
  const scale = size / BASE_SIZE;
  return (
    // The bars stand on the wordmark's baseline.
    <View style={[styles.brand, { gap: 8 * scale }]} accessibilityRole="header" accessibilityLabel="Muse">
      <View style={[styles.logo, { height: size, gap: 3 * scale }]}>
        {BAR_HEIGHTS.map((height, index) => (
          <LogoBar
            key={index}
            index={index}
            width={3.5 * scale}
            height={height * scale}
            animated={animated}
          />
        ))}
      </View>
      {withName && (
        <Text style={[styles.brandName, { fontSize: 24 * scale, letterSpacing: -1.1 * scale }]}>
          muse
        </Text>
      )}
    </View>
  );
}

function LogoBar({
  index,
  width,
  height,
  animated,
}: {
  index: number;
  width: number;
  height: number;
  animated: boolean;
}) {
  const styles = useAppStyles();
  const level = useSharedValue(1);
  useEffect(() => {
    if (!animated) {
      return;
    }
    const ease = Easing.inOut(Easing.quad);
    // Each bar on its own beat, so they never move as one block.
    const speed = 380 + index * 90;
    level.set(
      withDelay(
        index * 80,
        withRepeat(
          withSequence(withTiming(0.45, { duration: speed, easing: ease }), withTiming(1, { duration: speed, easing: ease })),
          -1,
        ),
      ),
    );
  }, [animated, index, level]);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: level.get() }] }));
  return (
    <Animated.View
      style={[styles.logoBar, { width, height, borderRadius: width }, barStyle]}
    />
  );
}

/** "wahidalways" as a link to their GitHub profile. */
export function CreditLink({ withIcon = false }: { withIcon?: boolean }) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${CREDIT_NAME} on GitHub`}
      accessibilityHint="Opens in your browser"
      hitSlop={10}
      onPress={() => {
        // No browser is rare; there is nothing useful to show if so.
        Linking.openURL(CREDIT_URL).catch(() => undefined);
      }}
      style={({ pressed }) => [styles.creditLinkRow, pressed && styles.creditLinkPressed]}
    >
      <Text style={styles.creditLink}>{CREDIT_NAME}</Text>
      {withIcon && (
        <Ionicons accessible={false} name="open-outline" size={opticalSize('open-outline', 14)} style={styles.creditLink} />
      )}
    </Pressable>
  );
}

export const X_URL = 'https://x.com/mrbrainaxes';

/**
 * "Made by wahidalways", a divider, then X and GitHub as soft round chips.
 * Colors come in, so Welcome (onboarding tokens) and About (app theme) match.
 */
export function MakerCredit({
  colors,
  style,
}: {
  colors: { text: string; muted: string; chip: string };
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[credit.row, style]}>
      <Text style={[credit.text, { color: colors.muted }]}>
        Made by <Text style={{ color: colors.text }}>{CREDIT_NAME}</Text>
      </Text>
      {/* A real 1dp line in the muted text color, softened so it separates without shouting. */}
      <View style={[credit.divider, { backgroundColor: colors.muted }]} />
      <CreditChip name="logo-x" label={`${CREDIT_NAME} on X`} url={X_URL} colors={colors} />
      <CreditChip name="logo-github" label={`${CREDIT_NAME} on GitHub`} url={CREDIT_URL} colors={colors} />
    </View>
  );
}

function CreditChip({
  name,
  label,
  url,
  colors,
}: {
  name: 'logo-x' | 'logo-github';
  label: string;
  url: string;
  colors: { text: string; chip: string };
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens in your browser"
      onPress={() => {
        // No browser is rare; there is nothing useful to show if so.
        Linking.openURL(url).catch(() => undefined);
      }}
      style={({ pressed }) => [credit.chip, { backgroundColor: colors.chip }, pressed && credit.pressed]}
    >
      <Ionicons accessible={false} name={name} size={17} color={colors.text} />
    </Pressable>
  );
}

const credit = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { fontSize: 13 },
  divider: { width: 1, height: 16, marginHorizontal: 4, opacity: 0.5 },
  // Soft round chips, so X and GitHub read as tappable.
  chip: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
