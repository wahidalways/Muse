import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { addMediaVolumeListener, getMediaVolume, setMediaVolume } from '../../modules/muse-audio-metadata';
import { useAppStyles } from '../theme/styles';
import { opticalSize } from '../components/icons';

/** The phone sets volume in steps (often 15); sending more often than this is wasted. */
const SEND_STEP = 0.02;

/**
 * Whether this build can read the phone's volume at all. Expo Go cannot load
 * Muse's native module, so there the slider (and its setting) cannot work.
 */
export function canShowVolumeSlider(): boolean {
  return getMediaVolume() !== null;
}

/**
 * The phone's media volume: the same one the volume buttons move, so each
 * follows the other. Hidden where it cannot be read (Expo Go).
 */
export function VolumeSlider() {
  const styles = useAppStyles();
  const [initial] = useState(getMediaVolume);
  const [percent, setPercent] = useState(Math.round((initial ?? 0) * 100));
  const volume = useSharedValue(initial ?? 0);
  const width = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const lastSent = useSharedValue(-1);

  useEffect(() => {
    const subscription = addMediaVolumeListener((next) => {
      setPercent(Math.round(next * 100));
      // The buttons move the slider, except under a finger.
      if (!isDragging.get()) {
        volume.set(withTiming(next, { duration: 120 }));
      }
    });
    return () => subscription.remove();
  }, [isDragging, volume]);

  const setFromTouch = (x: number) => {
    'worklet';
    const total = width.get();
    if (total <= 0) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, x / total));
    volume.set(ratio);
    if (Math.abs(ratio - lastSent.get()) >= SEND_STEP || ratio === 0 || ratio === 1) {
      lastSent.set(ratio);
      scheduleOnRN(setMediaVolume, ratio);
    }
  };
  const drag = usePanGesture({
    minDistance: 0,
    hitSlop: { top: 14, bottom: 14 },
    onBegin: (event) => {
      'worklet';
      isDragging.set(true);
      setFromTouch(event.x);
    },
    onUpdate: (event) => {
      'worklet';
      setFromTouch(event.x);
    },
    onFinalize: () => {
      'worklet';
      isDragging.set(false);
    },
  });
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (volume.get() - 1) * width.get() }],
  }));

  if (initial === null) {
    return null;
  }
  const step = (delta: number) => setMediaVolume(Math.min(1, Math.max(0, percent / 100 + delta)));
  return (
    <View style={styles.volumeRow}>
      <Ionicons accessible={false} name="volume-low" size={opticalSize('volume-low', 18)} style={styles.volumeIcon} />
      <GestureDetector gesture={drag}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Volume"
          accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent} percent` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
          onLayout={(event) => width.set(event.nativeEvent.layout.width)}
          style={styles.volumeTrack}
        >
          <Animated.View style={[styles.volumeFill, fillStyle]} />
        </View>
      </GestureDetector>
      <Ionicons accessible={false} name="volume-high" size={opticalSize('volume-high', 18)} style={styles.volumeIcon} />
    </View>
  );
}
