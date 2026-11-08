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

export function SetupProgress({ step }: { step: 1 | 2 | 3 }) {
  const styles = useAppStyles();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 1,
        max: 3,
        now: step,
        text: `Step ${step} of 3`,
      }}
      style={styles.setupProgress}
    >
      <View style={styles.setupProgressTop}>
        <Text style={styles.setupProgressLabel}>SETUP</Text>
        <Text style={styles.setupProgressCount}>
          Step {step} of 3
        </Text>
      </View>
      <View style={styles.setupProgressTrack}>
        {[1, 2, 3].map((item) => (
          <View
            key={item}
            style={[
              styles.setupProgressSegment,
              item <= step && styles.setupProgressSegmentActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function RecordArtwork() {
  const styles = useAppStyles();
  return (
    <View style={styles.artworkCard}>
      <View style={styles.artworkTopline}>
        <View>
          <Text style={styles.cardEyebrow}>MADE FOR YOUR MUSIC</Text>
          <Text style={styles.artworkTitle}>Your library, at home.</Text>
        </View>
        <View style={styles.artworkDeviceBadge}>
          <View style={styles.artworkLiveDot} />
          <Text style={styles.artworkDeviceLabel}>ON THIS PHONE</Text>
        </View>
      </View>
      <View style={styles.artworkStage}>
        <View style={styles.artworkSleeveBack} />
        <View style={styles.artworkSleeve}>
          <View style={styles.artworkSleeveTop}>
            <View style={styles.artworkSleeveDot} />
            <View style={styles.artworkSleeveLine} />
          </View>
          <View style={styles.artworkSleeveCenter}>
            <View style={styles.artworkSleeveCore} />
          </View>
          <View style={styles.artworkSleeveBottom}>
            <View style={styles.artworkSleeveLineShort} />
            <View style={styles.artworkSleeveLine} />
          </View>
        </View>
        <View style={styles.artworkVinyl}>
          <View style={styles.artworkVinylRing}>
            <View style={styles.artworkVinylRingInner}>
              <View style={styles.artworkVinylLabel}>
                <View style={styles.artworkVinylCenter} />
              </View>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.artworkFooter}>
        <View style={styles.artworkFooterMark}>
          <Text style={styles.artworkFooterMarkText}>M</Text>
        </View>
        <View style={styles.artworkFooterCopy}>
          <Text style={styles.artworkFooterTitle}>All your music</Text>
          <Text style={styles.artworkFooterNote}>Ready to play, even offline</Text>
        </View>
        <View style={styles.waveform}>
          {[10, 18, 12, 24, 15, 21, 11].map((height, index) => (
            <View
              key={index}
              style={[styles.waveformBar, { height }]}
            />
          ))}
        </View>
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

export function PrivacyItem({ text }: { text: string }) {
  const styles = useAppStyles();
  return (
    <View style={styles.privacyItem}>
      <View style={styles.checkMark}>
        <Text style={styles.checkMarkText}>✓</Text>
      </View>
      <Text style={styles.privacyItemText}>{text}</Text>
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
