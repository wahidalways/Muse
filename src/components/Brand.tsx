import { useEffect } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

/** Bar heights of the Muse mark at its base size of 22. */
const BAR_HEIGHTS = [7, 12, 19, 12];
const BASE_SIZE = 22;

/**
 * The Muse mark: four sound bars and the name. `size` is the bar height
 * box; everything scales from it. With `animated`, the bars pulse like a
 * level meter, used while the app starts.
 */
export function BrandMark({ size = BASE_SIZE, animated = false }: { size?: number; animated?: boolean }) {
  const styles = useAppStyles();
  const scale = size / BASE_SIZE;
  return (
    <View style={[styles.brand, { gap: 9 * scale }]} accessibilityRole="header" accessibilityLabel="Muse">
      <View style={[styles.logo, { height: size, gap: 3 * scale }]}>
        {BAR_HEIGHTS.map((height, index) => (
          <LogoBar
            key={index}
            index={index}
            width={3 * scale}
            height={height * scale}
            animated={animated}
          />
        ))}
      </View>
      <Text style={[styles.brandName, { fontSize: 23 * scale, letterSpacing: -1 * scale }]}>
        muse
      </Text>
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
