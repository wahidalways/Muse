import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppStyles } from '../theme/styles';
import { Sheet } from './Sheet';

/** What a confirm sheet says and does. Used in place of the grey system alert. */
export type ConfirmRequest = {
  eyebrow: string;
  title: string;
  message: string;
  /** A round badge above the message, such as a check for "up to date". */
  icon?: ComponentProps<typeof Ionicons>['name'];
  confirmLabel: string;
  /** Null shows the confirm button alone (a plain notice). */
  cancelLabel?: string | null;
  /** Red outline: the action removes or replaces something. */
  destructive?: boolean;
  onConfirm?: () => void;
  /** Extra content under the message, such as release notes. */
  children?: ReactNode;
};

/**
 * A Muse bottom sheet with a message and one or two buttons. Open it by
 * setting `request`; it closes itself before running the action, so a
 * follow-up (a file picker, a toast) never sits under it.
 */
export function ConfirmSheet({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const styles = useAppStyles();
  // The last request stays drawn while the sheet fades away.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) {
    setShown(request);
  }
  if (!shown) {
    return null;
  }
  const cancelLabel = shown.cancelLabel === undefined ? 'Cancel' : shown.cancelLabel;
  const confirm = () => {
    onClose();
    shown.onConfirm?.();
  };

  return (
    <Sheet visible={request !== null} eyebrow={shown.eyebrow} title={shown.title} onClose={onClose}>
      <View style={styles.confirmBody}>
        {shown.icon ? (
          <View style={styles.confirmIcon}>
            <Ionicons accessible={false} name={shown.icon} size={22} style={styles.confirmIconGlyph} />
          </View>
        ) : null}
        <Text style={styles.confirmMessage}>{shown.message}</Text>
        {shown.children}
        <View style={styles.confirmActions}>
          {cancelLabel ? (
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.confirmButton, styles.confirmSecondary, pressed && styles.primaryButtonPressed]}
            >
              <Text style={styles.confirmSecondaryText}>{cancelLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={confirm}
            style={({ pressed }) => [
              styles.confirmButton,
              shown.destructive ? styles.confirmDanger : styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={shown.destructive ? styles.confirmDangerText : styles.primaryButtonLabel}>{shown.confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}
