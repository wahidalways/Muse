import { Pressable, View } from 'react-native';
import { setRating, useRatings } from '../library/ratings';
import { ControlIcon } from './icons';
import { useAppStyles } from '../theme/styles';

/** Five tappable stars. Tapping the current rating again clears it. */
export function StarRating({ trackId, size = 20 }: { trackId: string; size?: number }) {
  const styles = useAppStyles();
  const stars = useRatings()[trackId] ?? 0;
  return (
    <View
      style={styles.starRow}
      // One focus target: swipe up or down to change, instead of five unlabeled buttons.
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Your rating"
      accessibilityValue={{ min: 0, max: 5, now: stars, text: stars ? `${stars} of 5 stars` : 'Not rated' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        setRating(trackId, Math.max(0, Math.min(5, stars + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))
      }
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Pressable
          key={value}
          hitSlop={4}
          onPress={() => setRating(trackId, value === stars ? 0 : value)}
          style={styles.starButton}
        >
          <ControlIcon
            name={value <= stars ? 'star' : 'star-outline'}
            size={size}
            tone={value <= stars ? 'accent' : 'muted'}
          />
        </Pressable>
      ))}
    </View>
  );
}

/** Stars as text for list rows, such as "★★★★". */
export function starsLabel(stars: number): string {
  return '★'.repeat(stars);
}
