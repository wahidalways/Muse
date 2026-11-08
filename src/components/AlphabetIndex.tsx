import { useState } from 'react';
import { Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';
export { indexLetter, letterPositions } from '../library/alphabet';

/**
 * A strip of letters down the right edge. Tap one, or drag along it, to jump
 * there; a big bubble shows the letter under the finger. Only letters the
 * list has are shown, so every one lands somewhere.
 */
export function AlphabetIndex({
  positions,
  onJump,
  top,
  bottom,
}: {
  positions: { letter: string; index: number }[];
  /** Scroll the list so item `index` is at the top. */
  onJump: (index: number) => void;
  top: number;
  bottom: number;
}) {
  const styles = useAppStyles();
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const stripHeight = useSharedValue(0);
  const lastIndex = useSharedValue(-1);

  const select = (position: number) => {
    const target = positions[position];
    if (!target) {
      return;
    }
    hapticSelection();
    setActiveLetter(target.letter);
    onJump(target.index);
  };
  const release = () => setActiveLetter(null);

  const count = positions.length;
  const drag = usePanGesture({
    // Starts on touch, so a tap jumps too.
    minDistance: 0,
    onBegin: (event) => {
      'worklet';
      lastIndex.set(-1);
      const height = stripHeight.get();
      if (height <= 0) {
        return;
      }
      const position = Math.min(count - 1, Math.max(0, Math.floor((event.y / height) * count)));
      lastIndex.set(position);
      scheduleOnRN(select, position);
    },
    onUpdate: (event) => {
      'worklet';
      const height = stripHeight.get();
      if (height <= 0) {
        return;
      }
      const position = Math.min(count - 1, Math.max(0, Math.floor((event.y / height) * count)));
      if (position !== lastIndex.get()) {
        lastIndex.set(position);
        scheduleOnRN(select, position);
      }
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(release);
    },
  });

  if (count < 2) {
    return null;
  }
  return (
    <View pointerEvents="box-none" style={[styles.libraryIndex, { top, bottom }]}>
      {activeLetter && (
        <View pointerEvents="none" style={styles.libraryIndexBubble}>
          <Text style={styles.libraryIndexBubbleText}>{activeLetter}</Text>
        </View>
      )}
      <GestureDetector gesture={drag}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Jump to letter"
          accessibilityValue={{ text: activeLetter ?? positions[0].letter }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const current = Math.max(0, positions.findIndex((p) => p.letter === activeLetter));
            const next = current + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
            select(Math.min(count - 1, Math.max(0, next)));
          }}
          onLayout={(event) => stripHeight.set(event.nativeEvent.layout.height)}
          hitSlop={{ left: 12 }}
        >
          {positions.map((position) => (
            <Text key={position.letter} style={styles.libraryIndexLetter}>
              {position.letter}
            </Text>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}
