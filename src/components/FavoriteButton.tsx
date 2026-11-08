import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { toggleFavorite, useIsFavorite } from '../library/favorites';
import { EASE_OUT, SETTLE_SPRING } from '../motion/motion';
import { ControlIcon } from './icons';

/**
 * Heart toggle for a song. A small pop confirms adding; removing just
 * changes the icon. Both run on the UI thread.
 */
export function FavoriteButton({
  trackId,
  title,
  size = 22,
}: {
  trackId: string;
  title: string;
  size?: number;
}) {
  const isFavorite = useIsFavorite(trackId);
  const scale = useSharedValue(1);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isFavorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`
      }
      accessibilityState={{ selected: isFavorite }}
      hitSlop={10}
      pressRetentionOffset={16}
      onPressIn={() => scale.set(withTiming(0.9, { duration: 100, easing: EASE_OUT }))}
      onPressOut={() => scale.set(withSpring(1, SETTLE_SPRING))}
      onPress={() => {
        if (!isFavorite) {
          scale.set(
            withSequence(
              withTiming(1.22, { duration: 120, easing: EASE_OUT }),
              withSpring(1, SETTLE_SPRING),
            ),
          );
        }
        toggleFavorite(trackId);
      }}
      style={favoriteStyles.button}
    >
      <Animated.View style={iconStyle}>
        <ControlIcon
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={size}
          tone={isFavorite ? 'accent' : 'muted'}
        />
      </Animated.View>
    </Pressable>
  );
}

const favoriteStyles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
