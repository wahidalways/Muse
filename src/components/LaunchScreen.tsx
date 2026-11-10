import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { EASE_OUT } from '../motion/motion';
import { useAppStyles } from '../theme/styles';
import { BrandMark } from './Brand';

const LEAVE = FadeOut.duration(320).easing(EASE_OUT);

/**
 * Shown over the app while a slow library restore runs: only the Muse bars
 * pulsing on the page colour, so it follows light and dark. The maker's
 * credit lives on Welcome and in Settings › About instead.
 */
export function LaunchScreen() {
  const styles = useAppStyles();
  return (
    <Animated.View
      exiting={LEAVE}
      accessibilityLiveRegion="polite"
      style={[StyleSheet.absoluteFill, styles.screen, styles.launch]}
    >
      <View style={styles.launchCenter}>
        <BrandMark size={44} animated withName={false} />
      </View>
    </Animated.View>
  );
}
