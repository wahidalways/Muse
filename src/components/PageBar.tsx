import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppStyles } from '../theme/styles';
import { ControlIcon } from './icons';

const PRESSED = { transform: [{ scale: 0.97 }] };

/**
 * A page's top row on Settings pages and Collections lists: the back button
 * with the title, and an optional small subtitle, beside it. One row instead
 * of a back row over a big title gives the content about 80 pt more.
 */
export function PageBar({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  style,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  /** Where the row sits on its page. */
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useAppStyles();
  return (
    <View style={[styles.pageBar, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.collNavButton, pressed && PRESSED]}
      >
        <ControlIcon name="back" size={20} />
      </Pressable>
      <View style={styles.pageBarText}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.pageBarTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.pageBarSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
