import { Pressable, Text, View } from 'react-native';
// The gesture library's ScrollView lets a handle's drag win over scrolling the list.
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Sheet } from '../../components/Sheet';
import { Segmented } from '../../components/SettingsList';
import type { WeekStart } from '../../history/stats';
import { groupBoard, WIDGETS, type BoardItem, type WidgetSize } from '../../settings/pulseBoard';
import { resetBoard, setBoard, setWeekStart, usePulse } from '../../settings/pulse';
import { hapticSelection } from '../../utils/haptics';
import { useAppStyles } from '../../theme/styles';
import { EASE_OUT } from '../../motion/motion';

/** Every row is this tall, so a drag can work out the target row from distance alone. */
const ROW_HEIGHT = 58;
/** Drags are in one section: a row's key is section * SECTION + its place there. */
const SECTION = 100;
const SLIDE = { duration: 180, easing: EASE_OUT };

export const WEEK_STARTS: { id: string; label: string }[] = [
  { id: '6', label: 'Saturday' },
  { id: '0', label: 'Sunday' },
  { id: '1', label: 'Monday' },
];

export function CustomizeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useAppStyles();
  const { board, weekStart } = usePulse();
  const sections = groupBoard(board);
  // The row being dragged (-1 for none), where it started and where it would land, as section keys.
  const dragging = useSharedValue(-1);
  const target = useSharedValue(-1);
  const offset = useSharedValue(0);

  const update = (id: BoardItem['id'], change: Partial<BoardItem>) =>
    setBoard(board.map((item) => (item.id === id ? { ...item, ...change } : item)));
  const move = (from: number, to: number) => {
    const section = Math.floor(from / SECTION);
    if (from !== to && from >= 0 && Math.floor(to / SECTION) === section) {
      const lists = sections.map(({ items }) => [...items]);
      const list = lists[section];
      list.splice(to % SECTION, 0, ...list.splice(from % SECTION, 1));
      setBoard(lists.flat());
    }
    dragging.set(-1);
    target.set(-1);
    offset.set(0);
  };

  return (
    <Sheet visible={visible} eyebrow="Home" title="Customize" onClose={onClose} tall>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[styles.pulseSub, { marginBottom: 12 }]}>Drag to reorder within a section. Turn off what you don&apos;t need.</Text>
        {sections.map(({ group, items }, section) => (
          <View key={group.id}>
            <Text style={styles.pulseSectionLabel}>{group.title ?? 'Music'}</Text>
            <View style={styles.pulseEditList}>
              {items.map((item, index) => (
                <EditRow
                  key={item.id}
                  item={item}
                  index={section * SECTION + index}
                  first={section * SECTION}
                  count={items.length}
                  dragging={dragging}
                  target={target}
                  offset={offset}
                  onMove={move}
                  onToggle={() => update(item.id, { on: !item.on })}
                  onSize={(size) => update(item.id, { size })}
                />
              ))}
            </View>
          </View>
        ))}
        <Text style={styles.pulseSectionLabel}>Week starts on</Text>
        <Segmented
          label="Week starts on"
          options={WEEK_STARTS}
          value={String(weekStart)}
          onChange={(value) => setWeekStart(Number(value) as WeekStart)}
        />
        <Text style={[styles.pulseSub, { marginTop: 8 }]}>Sets This week and when your recap arrives.</Text>
        <Pressable accessibilityRole="button" onPress={resetBoard} style={styles.pulseReset}>
          <Text style={styles.homeSongTitle}>Reset to default</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

function EditRow({
  item,
  index,
  first,
  count,
  dragging,
  target,
  offset,
  onMove,
  onToggle,
  onSize,
}: {
  item: BoardItem;
  /** The row's key: its section * SECTION + its place in the section. */
  index: number;
  /** The section's first key; drags stay between first and first + count - 1. */
  first: number;
  count: number;
  dragging: SharedValue<number>;
  target: SharedValue<number>;
  offset: SharedValue<number>;
  onMove: (from: number, to: number) => void;
  onToggle: () => void;
  onSize: (size: WidgetSize) => void;
}) {
  const styles = useAppStyles();
  const widget = WIDGETS.find((candidate) => candidate.id === item.id)!;

  const drag = usePanGesture({
    onBegin: () => {
      'worklet';
      dragging.set(index);
      target.set(index);
      scheduleOnRN(hapticSelection);
    },
    onUpdate: (event) => {
      'worklet';
      offset.set(event.translationY);
      const next = Math.max(first, Math.min(first + count - 1, Math.round(index + event.translationY / ROW_HEIGHT)));
      if (next !== target.get()) {
        target.set(next);
        scheduleOnRN(hapticSelection);
      }
    },
    onFinalize: () => {
      'worklet';
      // The rows already sit where they will land, so saving the order doesn't move them.
      scheduleOnRN(onMove, dragging.get(), target.get());
    },
  });

  // The dragged row follows the finger; the rows it passes step aside.
  const rowStyle = useAnimatedStyle(() => {
    const from = dragging.get();
    const to = target.get();
    if (from === index) {
      return { transform: [{ translateY: offset.get() }, { scale: 1.02 }], zIndex: 2, elevation: 6 };
    }
    let shift = 0;
    // Rows of another section never step aside.
    if (from < first || from >= first + count) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, elevation: 0 };
    }
    if (from >= 0 && from < to && index > from && index <= to) {
      shift = -ROW_HEIGHT;
    } else if (from >= 0 && from > to && index >= to && index < from) {
      shift = ROW_HEIGHT;
    }
    return { transform: [{ translateY: withTiming(shift, SLIDE) }, { scale: 1 }], zIndex: 0, elevation: 0 };
  });

  return (
    <Animated.View style={[styles.pulseEditRow, rowStyle]}>
      <GestureDetector gesture={drag}>
        <View style={styles.pulseEditHandle} accessibilityLabel={`Drag to move ${widget.name}`}>
          <Ionicons accessible={false} name="reorder-three" size={22} color={String(styles.pulseEditNote.color)} />
        </View>
      </GestureDetector>
      <View style={styles.homeSongCopy}>
        <Text numberOfLines={1} style={[styles.pulseEditName, !item.on && styles.pulseEditNameOff]}>
          {widget.name}
        </Text>
        {widget.note ? <Text style={styles.pulseEditNote}>{widget.note}</Text> : null}
      </View>
      {widget.sizes.length > 1 ? (
        <View style={styles.pulseSize} accessibilityRole="radiogroup" accessibilityLabel={`${widget.name} size`}>
          {(['square', 'wide'] as const).map((size) => {
            const on = item.size === size;
            return (
              <Pressable
                key={size}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => !on && onSize(size)}
                hitSlop={{ top: 6, bottom: 6 }}
                style={[styles.pulseSizeOption, on && styles.pulseSizeOptionOn]}
              >
                <Text style={[styles.pulseSizeText, on && styles.pulseSizeTextOn]}>{size === 'square' ? 'Square' : 'Wide'}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.pulseEditNote}>{widget.sizes[0] === 'wide' ? 'Wide' : 'Square'}</Text>
      )}
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`Show ${widget.name}`}
        accessibilityState={{ checked: item.on }}
        hitSlop={8}
        onPress={() => {
          hapticSelection();
          onToggle();
        }}
        style={[styles.prefSwitchTrack, item.on && styles.pulseFill]}
      >
        <View style={[styles.prefSwitchThumb, item.on && { transform: [{ translateX: 20 }] }]} />
      </Pressable>
    </Animated.View>
  );
}
