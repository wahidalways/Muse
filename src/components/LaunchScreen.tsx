import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { EASE_OUT } from '../motion/motion';
import { useAppStyles } from '../theme/styles';
import { BrandMark } from './Brand';

const LEAVE = FadeOut.duration(320).easing(EASE_OUT);
/** The still cover leaves at the pace of Android's splash fade (index.ts sets 200 ms). */
const LEAVE_STILL = FadeOut.duration(200).easing(EASE_OUT);

/**
 * Covers the app while the saved library restores: the Muse bars on the
 * page colour, a still copy of Android's splash, so it follows light and
 * dark. With `pulsing` (a slow restore) the bars pulse to show Muse is
 * working. The maker's credit lives on Welcome and in Settings › About instead.
 */
export function LaunchScreen({ pulsing }: { pulsing: boolean }) {
  const styles = useAppStyles();
  return (
    <Animated.View
      exiting={pulsing ? LEAVE : LEAVE_STILL}
      accessibilityLiveRegion="polite"
      style={[StyleSheet.absoluteFill, styles.screen, styles.launch]}
    >
      <View style={styles.launchCenter}>
        <BrandMark size={44} animated={pulsing} withName={false} />
      </View>
    </Animated.View>
  );
}
