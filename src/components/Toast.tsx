import { useContext, useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, { ReduceMotion, withSpring, withTiming } from 'react-native-reanimated';
import { useAppStyles } from '../theme/styles';
import { ThemeContext } from '../theme/theme';
import { ControlIcon, type ControlIconName } from './icons';

/**
 * A short confirmation ("Playing next · Harbour Lights") over everything but
 * sheets. One message at a time; a new one replaces the old. Module state,
 * so any screen or helper can show one without props.
 */
type Message = { id: number; title: string; detail?: string; icon: ControlIconName } | null;
let message: Message = null;
let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const read = () => message;

/** `detail` is the second, quieter line: usually the song or playlist the title acted on. */
export function showToast(title: string, { detail, icon = 'check' }: { detail?: string; icon?: ControlIconName } = {}) {
  message = { id: nextId++, title, detail, icon };
  clearTimeout(hideTimer);
  hideTimer = setTimeout(
    () => {
      message = null;
      emit();
    },
    detail ? 2600 : 2000,
  );
  emit();
}

// A small spring with a touch of give: the card pops in, then sits still.
const POP = { duration: 420, dampingRatio: 0.78, reduceMotion: ReduceMotion.System };
const QUICK = { duration: 140, reduceMotion: ReduceMotion.System };
/** Rises from below over the dock, or drops from above under the player's header. */
const enterFrom = (offset: number) => () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: offset }, { scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, QUICK),
      transform: [{ translateY: withSpring(0, POP) }, { scale: withSpring(1, POP) }],
    },
  };
};
const ENTER_UP = enterFrom(18);
const ENTER_DOWN = enterFrom(-18);
// Leaves faster than it came, shrinking a little in place.
const EXIT = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: { opacity: withTiming(0, QUICK), transform: [{ scale: withTiming(0.96, QUICK) }] },
  };
};

// Set here, not in styles: the style converter keeps one tone per colour.
// Light: dark card, so it reads over any page. Dark: a raised grey card,
// not a white one, so it does not glare (and lights fewer OLED pixels).
const TONES = {
  light: { card: '#1C211B', edge: 'rgba(255, 255, 255, 0.06)', text: '#F5F6F0', detail: 'rgba(245, 246, 240, 0.66)' },
  dark: { card: '#2A2B2E', edge: 'rgba(255, 255, 255, 0.10)', text: '#F5F5F7', detail: 'rgba(245, 245, 247, 0.62)' },
};

/** Mounted once, near the root. `bottom` clears the dock; `top` is used while the full player is open. */
export function ToastHost({ bottom, top }: { bottom: number; top: number | null }) {
  const styles = useAppStyles();
  const { theme } = useContext(ThemeContext);
  const tone = TONES[theme === 'light' ? 'light' : 'dark'];
  const current = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (current) {
      // The toast itself is not focusable; screen readers hear it once.
      AccessibilityInfo.announceForAccessibility(current.detail ? `${current.title}, ${current.detail}` : current.title);
    }
  }, [current]);
  // The wrapper stays mounted (empty, untouchable) so the card can animate out.
  return (
    <View
      pointerEvents="none"
      style={[styles.toastWrap, top !== null ? { top } : { bottom }]}
      importantForAccessibility="no-hide-descendants"
    >
      {current && (
        <Animated.View
          key={current.id}
          entering={top !== null ? ENTER_DOWN : ENTER_UP}
          exiting={EXIT}
          style={[styles.toast, { backgroundColor: tone.card, borderColor: tone.edge }]}
        >
          <ControlIcon name={current.icon} size={18} color={tone.text} />
          <View style={styles.toastCopy}>
            <Text numberOfLines={1} style={[styles.toastText, { color: tone.text }]}>
              {current.title}
            </Text>
            {current.detail ? (
              <Text numberOfLines={1} style={[styles.toastDetail, { color: tone.detail }]}>
                {current.detail}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      )}
    </View>
  );
}
