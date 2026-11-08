import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE_OUT } from '../motion/motion';
import { useAppStyles } from '../theme/styles';
import { BrandMark, CreditLink, MUSE_MOTTO } from './Brand';

const MOTTO_IN = FadeIn.duration(500).delay(250).easing(EASE_OUT);
const LEAVE = FadeOut.duration(320).easing(EASE_OUT);

/**
 * Shown over the app while it starts and restores the library: the Muse
 * mark with its bars pulsing, the motto, and the maker's credit.
 */
export function LaunchScreen() {
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      exiting={LEAVE}
      accessibilityLiveRegion="polite"
      style={[StyleSheet.absoluteFill, styles.screen, styles.launch]}
    >
      <View style={styles.launchCenter}>
        <BrandMark size={52} animated />
        <Animated.Text entering={MOTTO_IN} style={styles.launchMotto}>
          {MUSE_MOTTO}
        </Animated.Text>
      </View>
      <View style={[styles.launchCreditRow, { paddingBottom: 28 + insets.bottom }]}>
        <Text style={styles.launchCreditText}>Designed and developed by</Text>
        <CreditLink />
      </View>
    </Animated.View>
  );
}
