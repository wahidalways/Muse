import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSleepTimer } from '../utils/format';
import { useAppStyles } from '../theme/styles';
import { useSecondsLeft } from './useSecondsLeft';
import Animated from 'react-native-reanimated';
import { SHEET_IN } from '../motion/motion';

export function SleepTimerModal({
  visible,
  endsAt,
  onClose,
  onSelectMinutes,
  onCancelTimer,
}: {
  visible: boolean;
  /** When the timer ends, or null when none is set. */
  endsAt: number | null;
  onClose: () => void;
  onSelectMinutes: (minutes: number) => void;
  onCancelTimer: () => void;
}) {
  // Only count down while the sheet is showing.
  const secondsLeft = useSecondsLeft(visible ? endsAt : null);
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  const timerOptions = [15, 30, 45, 60];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.sleepTimerBackdrop} accessibilityViewIsModal>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sleep timer"
          onPress={onClose}
          style={styles.sleepTimerBackdropPressable}
        />
        <Animated.View
          entering={SHEET_IN}
          style={[
            styles.sleepTimerSheet,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <View style={styles.sleepTimerHandle} />
          <View style={styles.sleepTimerHeading}>
            <View>
              <Text style={styles.sleepTimerEyebrow}>PLAYBACK</Text>
              <Text style={styles.sleepTimerTitle}>Sleep timer</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close sleep timer"
              onPress={onClose}
              style={styles.sleepTimerClose}
            >
              <Text style={styles.sleepTimerCloseText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.sleepTimerDescription}>
            Pause your music after a set time.
          </Text>
          {secondsLeft > 0 && (
            <View style={styles.sleepTimerActiveCard}>
              <View style={styles.sleepTimerActiveDot} />
              <Text style={styles.sleepTimerActiveText}>
                Pauses in {formatSleepTimer(secondsLeft)}
              </Text>
            </View>
          )}
          <View style={styles.sleepTimerOptions}>
            {timerOptions.map((minutes) => (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                onPress={() => onSelectMinutes(minutes)}
                style={styles.sleepTimerOption}
              >
                <Text style={styles.sleepTimerOptionValue}>
                  {minutes === 60 ? '1 hour' : `${minutes} min`}
                </Text>
              </Pressable>
            ))}
          </View>
          {secondsLeft > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCancelTimer}
              style={styles.sleepTimerCancel}
            >
              <Text style={styles.sleepTimerCancelText}>Turn off timer</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={styles.sleepTimerCancel}
            >
              <Text style={styles.sleepTimerCancelText}>Not now</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
