import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { DropdownAnchor } from '../types';
import { useAppStyles } from '../theme/styles';

export function DropdownOverlay({
  anchor,
  onDismiss,
  children,
  width = 'anchor',
  align = 'start',
  preferredHeight,
}: {
  anchor: DropdownAnchor | null;
  onDismiss: () => void;
  children: ReactNode;
  width?: 'anchor' | number;
  align?: 'start' | 'end';
  preferredHeight: number;
}) {
  const styles = useAppStyles();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState(preferredHeight);

  if (!anchor) {
    return null;
  }

  const maxHeight = Math.max(120, windowHeight - 32);
  const popupHeight = Math.min(contentHeight, maxHeight);
  const popupWidth = Math.min(
    width === 'anchor' ? anchor.width : width,
    windowWidth - 24,
  );
  const leftEdge =
    align === 'end' ? anchor.x + anchor.width - popupWidth : anchor.x;
  const left = Math.max(12, Math.min(leftEdge, windowWidth - popupWidth - 12));
  const fitsBelow =
    anchor.y + anchor.height + 8 + popupHeight <= windowHeight - 16;
  const top = fitsBelow
    ? anchor.y + anchor.height + 8
    : Math.max(16, anchor.y - popupHeight - 8);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
          onPress={onDismiss}
          style={styles.dropdownScrim}
        />
        <View
          onLayout={(event) => {
            const measuredHeight = event.nativeEvent.layout.height;
            if (measuredHeight > 0 && measuredHeight !== contentHeight) {
              setContentHeight(measuredHeight);
            }
          }}
          style={[
            styles.dropdownPanel,
            {
              top,
              left,
              width: popupWidth,
              maxHeight,
            },
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
