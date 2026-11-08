import { Children, Fragment, useEffect, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT } from '../motion/motion';
import { hapticSelection } from '../utils/haptics';
import { ControlIcon, opticalSize } from './icons';

/**
 * iOS-style grouped settings: a section header, one rounded card of rows
 * with inset separators, and an optional footer note. Rows carry a small
 * colored icon tile, as in iOS Settings, so each one is quick to spot.
 */

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** iOS system colors for icon tiles. The glyph is white; the text says what it is. */
export const TILE = {
  blue: '#0A84FF',
  indigo: '#5E5CE6',
  purple: '#BF5AF2',
  pink: '#FF375F',
  red: '#FF453A',
  orange: '#FF9F0A',
  green: '#30D158',
  teal: '#40C8E0',
  gray: '#8E8E93',
} as const;

const SWITCH_TIMING = { duration: 180, easing: EASE_OUT };

export function SettingsSection({
  title,
  footer,
  children,
}: {
  /** Left out on the main list, where the groups speak for themselves. */
  title?: string;
  /** A short note under the card that explains the rows. */
  footer?: string;
  children: ReactNode;
}) {
  const styles = useAppStyles();
  // Separators go between rows only, so a row hidden by a condition never
  // leaves a stray line behind.
  const rows = Children.toArray(children).filter(Boolean);
  return (
    // Untitled groups (the main list) sit close together, so they read as one
    // list in a few parts; titled sections on a page get a little more air.
    <View style={title ? styles.prefSection : styles.prefSectionGrouped}>
      {title ? (
        <Text accessibilityRole="header" style={styles.prefSectionHeader}>
          {title}
        </Text>
      ) : null}
      <View style={styles.prefCard}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={styles.prefSeparator} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.prefSectionFooter}>{footer}</Text> : null}
    </View>
  );
}

function IconTile({ name, tint }: { name: IoniconName; tint: string }) {
  const styles = useAppStyles();
  return (
    <View style={[styles.prefIconTile, { backgroundColor: tint }]}>
      <Ionicons accessible={false} name={name} size={opticalSize(name, 18)} color="#FFFFFF" />
    </View>
  );
}

/**
 * A tappable row. Shows `detail` (a value) and a chevron when it opens
 * something; `busy` swaps the chevron for a spinner.
 */
export function SettingsRow({
  icon,
  tint,
  title,
  subtitle,
  detail,
  swatch,
  onPress,
  chevron = true,
  destructive = false,
  disabled = false,
  busy = false,
  accessibilityHint,
}: {
  icon: IoniconName;
  tint: string;
  title: string;
  subtitle?: string;
  detail?: string;
  /** A small color dot before `detail`, such as the current accent. */
  swatch?: string;
  onPress: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  const styles = useAppStyles();
  // With a line underneath, the value moves up beside the title, so the
  // line gets the row's full width instead of wrapping beside the value.
  const valueBesideTitle = Boolean(subtitle && detail);
  const value = (
    <>
      {swatch ? <View style={[styles.prefRowSwatch, { backgroundColor: swatch }]} /> : null}
      {detail ? (
        <Text
          numberOfLines={1}
          style={valueBesideTitle ? styles.prefRowValueBeside : styles.prefRowDetail}
        >
          {detail}
        </Text>
      ) : null}
    </>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.prefRow,
        pressed && styles.prefRowPressed,
        disabled && styles.prefRowDisabled,
      ]}
    >
      <IconTile name={icon} tint={tint} />
      <View style={styles.prefRowCopy}>
        {valueBesideTitle ? (
          <View style={styles.prefRowTitleLine}>
            <Text numberOfLines={1} style={[styles.prefRowTitle, destructive && styles.prefRowTitleDestructive]}>
              {title}
            </Text>
            <View style={styles.prefRowValueGroup}>{value}</View>
          </View>
        ) : (
          // Alone, a long title wraps rather than cutting off.
          <Text style={[styles.prefRowTitle, destructive && styles.prefRowTitleDestructive]}>{title}</Text>
        )}
        {subtitle ? <Text style={styles.prefRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {valueBesideTitle ? null : value}
      {busy ? (
        <ActivityIndicator size="small" />
      ) : chevron ? (
        <ControlIcon name="chevron-right" size={15} tone="muted" />
      ) : null}
    </Pressable>
  );
}

/** A row with an on/off switch. The whole row toggles; the thumb slides. */
export function SettingsSwitchRow({
  icon,
  tint,
  title,
  subtitle,
  value,
  onValueChange,
  accent,
  disabled = false,
}: {
  icon: IoniconName;
  tint: string;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** The switch's "on" color. */
  accent: string;
  disabled?: boolean;
}) {
  const styles = useAppStyles();
  // Starts where it rests, so opening Settings does not animate it.
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(value ? 1 : 0, SWITCH_TIMING));
  }, [on, value]);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: on.get() * 20 }],
  }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => {
        hapticSelection();
        onValueChange(!value);
      }}
      style={({ pressed }) => [
        styles.prefRow,
        pressed && styles.prefRowPressed,
        disabled && styles.prefRowDisabled,
      ]}
    >
      <IconTile name={icon} tint={tint} />
      <View style={styles.prefRowCopy}>
        <Text style={styles.prefRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.prefRowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.prefSwitchTrack, value && { backgroundColor: accent }]}>
        <Animated.View style={[styles.prefSwitchThumb, thumbStyle]} />
      </View>
    </Pressable>
  );
}

/** A row with a title and its own content underneath, such as a segmented control. */
export function SettingsBlock({
  icon,
  tint,
  title,
  subtitle,
  children,
}: {
  icon: IoniconName;
  tint: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const styles = useAppStyles();
  return (
    <View style={styles.prefBlock}>
      <View style={[styles.prefRow, { paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 }]}>
        <IconTile name={icon} tint={tint} />
        <View style={styles.prefRowCopy}>
          <Text style={styles.prefRowTitle}>{title}</Text>
          {subtitle ? <Text style={styles.prefRowSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** A segmented control: one choice of a few, all visible. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Read out to screen readers for the whole group. */
  label: string;
  options: { id: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const styles = useAppStyles();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.statsSegment, styles.glassSegment]}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: selected }}
            // 38pt tall to look right; the tap area still reaches 44pt.
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              if (!selected) {
                hapticSelection();
                onChange(option.id);
              }
            }}
            style={[styles.statsSegmentItem, selected && styles.statsSegmentItemActive]}
          >
            <Text
              numberOfLines={1}
              style={[styles.statsSegmentLabel, selected && styles.statsSegmentLabelActive]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
