import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { toggleFavorite, useIsFavorite } from '../library/favorites';
import { POP_SPRING, PRESS_IN_SPRING, PRESS_OUT_SPRING } from '../motion/motion';
import { ControlIcon } from './icons';

/**
 * Heart toggle for a song. Filling it pops (the one bit of delight in the
 * flow motion); removing just changes the icon. Both run on the UI thread.
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
      onPressIn={() => scale.set(withSpring(0.88, PRESS_IN_SPRING))}
      onPressOut={() => scale.set(withSpring(1, PRESS_OUT_SPRING))}
      onPress={() => {
        if (!isFavorite) {
          // From small, overshooting on the way back to full size.
          scale.set(0.55);
          scale.set(withSpring(1, POP_SPRING));
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
