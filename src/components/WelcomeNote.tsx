import { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE_OUT } from '../motion/motion';
import { useProfile } from '../settings/profile';
import { useAppStyles } from '../theme/styles';
import { greeting } from '../utils/greeting';
import { APP_VERSION, BrandMark, MakerCredit } from './Brand';
import { PrimaryButton } from './setup';

/** 1.0 is Muse's first release; later versions greet new listeners without saying so. */
const FIRST_RELEASE = APP_VERSION.startsWith('1.0.');
const SHORT_VERSION = APP_VERSION.split('.').slice(0, 2).join('.');
const rise = (step: number) => FadeInDown.duration(420).delay(step * 80).easing(EASE_OUT);
const LEAVE = FadeOut.duration(320).easing(EASE_OUT);

/**
 * Muse's hello, shown once on each phone: right after setup, or on the first
 * open for someone who set up a test build before. Home plays its entrance
 * as this fades away.
 */
export function WelcomeNote({ songCount, onDone }: { songCount: number; onDone: () => void }) {
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  const { name } = useProfile();
  useEffect(() => {
    // Back closes the hello, like its button, instead of acting on the page under it.
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      onDone();
      return true;
    });
    return () => listener.remove();
  }, [onDone]);
  const facts = [
    ...(songCount > 0 ? [`${songCount.toLocaleString('en-US')} ${songCount === 1 ? 'song' : 'songs'} ready`] : []),
    'Free',
    'No ads',
    'No account',
  ];
  return (
    <Animated.View exiting={LEAVE} style={[StyleSheet.absoluteFill, styles.screen]}>
      {/* Scrolls only when a large font size needs it; otherwise the button sits at the bottom. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: 18 + insets.top, paddingBottom: 28 + insets.bottom }]}
      >
        <Animated.View entering={rise(0)}>
          <BrandMark size={30} animated />
        </Animated.View>
        <Animated.View entering={rise(1)} style={styles.intro}>
          <Text style={styles.eyebrow}>{FIRST_RELEASE ? `MUSE ${SHORT_VERSION} · FIRST RELEASE` : `MUSE ${SHORT_VERSION}`}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {greeting(new Date().getHours(), name.trim())} 👋
          </Text>
          <Text style={styles.description}>
            {FIRST_RELEASE
              ? 'Welcome to Muse, our very first release. Thank you for being one of the first to try it!'
              : 'Welcome to Muse. Thank you for trying it!'}
          </Text>
        </Animated.View>
        <Animated.View entering={rise(2)} style={[styles.aboutMetaRow, styles.welcomeFacts]}>
          {facts.map((fact) => (
            <View key={fact} style={styles.aboutPill}>
              <Text style={styles.aboutPillText}>{fact}</Text>
            </View>
          ))}
        </Animated.View>
        <Animated.View entering={rise(3)} style={styles.bottomArea}>
          <PrimaryButton label="Let's listen" onPress={onDone} />
          <MakerCredit
            colors={{
              text: String(styles.aboutPillText.color),
              muted: String(styles.aboutTagline.color),
              chip: String(styles.aboutPill.backgroundColor),
            }}
            style={styles.welcomeCredit}
          />
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
