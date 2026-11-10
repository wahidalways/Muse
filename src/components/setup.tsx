import { Pressable, Text, View } from 'react-native';
import { MusicNote } from './icons';
import { BrandMark } from './Brand';
import { useAppStyles } from '../theme/styles';

export function Header({
  showBack = false,
  onBack,
}: {
  showBack?: boolean;
  onBack?: () => void;
}) {
  const styles = useAppStyles();
  return (
    <View style={styles.header}>
      <View style={styles.headerBrandGroup}>
        {showBack && onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={onBack}
            style={styles.headerBackButton}
          >
            <Text style={styles.headerBackIcon}>‹</Text>
          </Pressable>
        )}
        <BrandMark />
      </View>
    </View>
  );
}

export function StatusArtwork({ label }: { label: string }) {
  const styles = useAppStyles();
  return (
    <View style={styles.statusArtwork}>
      <View style={styles.statusArtworkIcon}>
        <MusicNote />
        <View style={styles.statusArtworkAccent} />
      </View>
      <Text style={styles.statusArtworkLabel}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled && styles.primaryButtonPressed,
        disabled && styles.primaryButtonDisabled,
      ]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
      {!disabled && <Text style={styles.buttonArrow}>→</Text>}
    </Pressable>
  );
}

export function MessageScreen({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const styles = useAppStyles();
  return (
    <View style={styles.screenBody}>
      <StatusArtwork label="MUSE. OFFLINE MUSIC." />
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.bottomArea}>
        <PrimaryButton label={actionLabel} onPress={onAction} />
      </View>
    </View>
  );
}
