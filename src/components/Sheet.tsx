import { useRef, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppStyles } from '../theme/styles';
import { useKeyboardLift } from './useKeyboardLift';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { EASE_OUT, SHEET_IN, SNAP_BACK_SPRING, project } from '../motion/motion';
import { CloseIcon } from './icons';

type SheetProps = {
  visible: boolean;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Fills most of the screen, for long lists. */
  tall?: boolean;
};

/**
 * A bottom sheet in the same look as the sleep timer sheet. Drag its top
 * (handle and title) down to close it, or tap outside or the close button.
 */
export function Sheet(props: SheetProps) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      {/* Gestures inside an Android modal need their own root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SheetPanel {...props} />
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Mounts with each opening, so a drag never carries over to the next one. */
function SheetPanel({ visible, eyebrow, title, onClose, children, tall = false }: SheetProps) {
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetRef = useRef<ComponentRef<typeof Animated.View>>(null);
  const bottomPadding = Math.max(insets.bottom, 20);
  // Modals do not resize for the keyboard, so a name field would sit under it.
  const keyboardLift = useKeyboardLift(sheetRef, visible, bottomPadding);

  const dragY = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  // Same rule as the player: past a third of the way down (counting the
  // flick's momentum) it closes; otherwise it springs back.
  const drag = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-20, 20],
    onUpdate: (event) => {
      'worklet';
      dragY.set(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      'worklet';
      const projected = event.translationY + project(event.velocityY);
      if (!event.canceled && projected > sheetHeight.get() / 3) {
        dragY.set(
          withTiming(sheetHeight.get(), { duration: 180, easing: EASE_OUT }, (finished) => {
            if (finished) {
              scheduleOnRN(onClose);
            }
          }),
        );
      } else {
        dragY.set(withSpring(0, { ...SNAP_BACK_SPRING, velocity: event.velocityY }));
      }
    },
  });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.get() }] }));

  return (
    <View style={styles.sleepTimerBackdrop} accessibilityViewIsModal>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={styles.sleepTimerBackdropPressable}
      />
      {/* The drag moves this wrapper, so it never fights the rise-in animation below. */}
      <Animated.View style={dragStyle}>
        <Animated.View
          ref={sheetRef}
          entering={SHEET_IN}
          onLayout={(event) => sheetHeight.set(event.nativeEvent.layout.height)}
          style={[
            styles.sleepTimerSheet,
            { paddingBottom: bottomPadding, maxHeight: height * 0.88, marginBottom: keyboardLift },
            tall && { height: height * 0.88 },
          ]}
        >
          <GestureDetector gesture={drag}>
            <View>
              <View style={styles.sleepTimerHandle} />
              <View style={styles.sleepTimerHeading}>
                <View style={styles.sheetHeadingCopy}>
                  <Text style={styles.sleepTimerEyebrow}>{eyebrow}</Text>
                  <Text numberOfLines={1} style={styles.sleepTimerTitle}>
                    {title}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={onClose}
                  style={styles.sleepTimerClose}
                >
                  <CloseIcon color="text" size={13} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** One tappable row in a sheet: an icon, a label and an optional detail. */
export function SheetRow({
  icon,
  label,
  detail,
  onPress,
  danger = false,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
  /** Shown but not tappable, with `detail` saying why. */
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
        styles.sheetRow,
        pressed && styles.sortSheetOptionPressed,
        disabled && styles.prefRowDisabled,
      ]}
    >
      <View style={styles.sheetRowIcon}>{icon}</View>
      <Text style={[styles.sheetRowLabel, danger && styles.sheetRowDanger]}>{label}</Text>
      {detail ? <Text style={styles.sheetRowDetail}>{detail}</Text> : null}
    </Pressable>
  );
}
