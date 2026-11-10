import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useAppStyles } from '../theme/styles';
import { sidewaysDragLock } from '../motion/gestureLock';

/** Bars rise from the baseline. Runs on the UI thread as a layout animation. */
const GROW_IN = new Keyframe({
  0: { transform: [{ scaleY: 0 }] },
  100: { transform: [{ scaleY: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(560);

/**
 * Small SVG charts for listening stats. One series per chart in the accent
 * color, with the selected or peak mark at full strength and the rest
 * softened. Every chart can be tapped or dragged to read exact values, and
 * colors come from the theme styles so light, dark and AMOLED all follow.
 */

export function useChartColors() {
  const styles = useAppStyles();
  return useMemo(
    () => ({
      accent: String(styles.chartAccent.color),
      track: String(styles.chartTrack.backgroundColor),
      surface: String(styles.chartSurface.backgroundColor),
      grid: String(styles.chartGrid.borderColor),
      muted: String(styles.chartAxisLabel.color),
    }),
    [styles],
  );
}

function useWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(Math.round(event.nativeEvent.layout.width));
  return { width, onLayout };
}

/**
 * Reports the finger's x and y inside the chart: on touch (so a tap picks a
 * point) and while dragging sideways. A vertical drag fails it, so the page
 * still scrolls. Sideways it wins before the tab swipe starts, like sliders.
 */
function useScrub(onTouch: (x: number, y: number) => void) {
  return usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onBegin: (event) => {
      'worklet';
      sidewaysDragLock.set(true);
      scheduleOnRN(onTouch, event.x, event.y);
    },
    onUpdate: (event) => {
      'worklet';
      scheduleOnRN(onTouch, event.x, event.y);
    },
    onFinalize: () => {
      'worklet';
      sidewaysDragLock.set(false);
    },
  });
}

/** A bar with 4pt rounded top corners standing on the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(4, width / 2, height);
  const bottom = y + height;
  return [
    `M${x},${bottom}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${bottom}`,
    'Z',
  ].join(' ');
}

export type ChartPoint = { label: string; value: number };

/**
 * Listening over time. Bars for a few points, an area line for many. The
 * readout above shows the chosen point, starting with the latest one.
 */
export function TimeChart({
  data,
  formatValue,
  height = 120,
  kind = data.length <= 12 ? 'bars' : 'area',
  readoutPrefix,
  defaultIndex,
  goal,
  animateIn = false,
}: {
  data: ChartPoint[];
  formatValue: (value: number) => string;
  height?: number;
  kind?: 'bars' | 'area';
  /** Shown before the default readout, such as "Today". */
  readoutPrefix?: string;
  /** The point the readout and highlight show until one is tapped. Last by default. */
  defaultIndex?: number;
  /** Draws a dashed target line at this value. */
  goal?: number;
  /** Grow the marks up from the baseline when the chart first appears. */
  animateIn?: boolean;
}) {
  const styles = useAppStyles();
  const colors = useChartColors();
  const { width, onLayout } = useWidth();
  const [selected, setSelected] = useState<number | null>(null);
  const count = data.length;
  const max = Math.max(1, goal ?? 0, ...data.map((point) => point.value));
  const active = selected ?? defaultIndex ?? count - 1;
  const plotTop = 14;
  const plotHeight = height - plotTop;
  const yFor = (value: number) => plotTop + plotHeight - (value / max) * plotHeight;

  const gap = count > 20 ? 2 : 6;
  const barWidth = count > 0 ? Math.min(28, (width - gap * (count - 1)) / count) : 0;
  const barsWidth = barWidth * count + gap * (count - 1);
  const barsLeft = (width - barsWidth) / 2;
  const xFor = (index: number) =>
    kind === 'bars'
      ? barsLeft + index * (barWidth + gap) + barWidth / 2
      : count < 2
        ? width / 2
        : (index / (count - 1)) * width;

  const scrub = useScrub((x) => {
    if (count === 0 || width === 0) {
      return;
    }
    const index =
      kind === 'bars'
        ? Math.floor((x - barsLeft + gap / 2) / (barWidth + gap))
        : Math.round((x / width) * (count - 1));
    setSelected(Math.max(0, Math.min(count - 1, index)));
  });

  // Each step leaves and arrives flat, so the line never overshoots the data.
  let line = '';
  if (kind === 'area' && count > 0 && width > 0) {
    data.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point.value);
      if (index === 0) {
        line = `M${x},${y}`;
      } else {
        const previousX = xFor(index - 1);
        const previousY = yFor(data[index - 1].value);
        const middle = (previousX + x) / 2;
        line += ` C${middle},${previousY} ${middle},${y} ${x},${y}`;
      }
    });
  }

  // Up to six evenly spread labels, always including the last.
  const labelStep = Math.max(1, Math.ceil(count / 6));
  const labelIndexes = data
    .map((_, index) => index)
    .filter((index) => (count - 1 - index) % labelStep === 0);

  const activePoint = data[active];

  return (
    <View>
      <View style={chartStyles.readout} accessibilityLiveRegion="polite">
        <Text style={styles.chartReadoutLabel}>
          {activePoint
            ? selected === null && readoutPrefix
              ? readoutPrefix
              : activePoint.label
            : ''}
        </Text>
        <Text style={styles.chartReadoutValue}>
          {activePoint ? formatValue(activePoint.value) : ''}
        </Text>
      </View>
      <GestureDetector gesture={scrub}>
        <View
          onLayout={onLayout}
          style={{ height }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={data
            .map((point) => `${point.label}: ${formatValue(point.value)}`)
            .join(', ')}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
            setSelected(Math.max(0, Math.min(count - 1, active + step)));
          }}
        >
          {width > 0 && (
            <Animated.View
              entering={animateIn ? GROW_IN : undefined}
              style={chartStyles.growFromBottom}
              pointerEvents="none"
            >
            <Svg width={width} height={height} pointerEvents="none">
              <Line
                x1={0}
                x2={width}
                y1={height - 0.5}
                y2={height - 0.5}
                stroke={colors.grid}
                strokeWidth={1}
              />
              {kind === 'bars' &&
                data.map((point, index) => {
                  const barHeight = Math.max(2, (point.value / max) * plotHeight);
                  return (
                    <Path
                      key={index}
                      d={barPath(
                        barsLeft + index * (barWidth + gap),
                        plotTop + plotHeight - barHeight,
                        barWidth,
                        barHeight,
                      )}
                      fill={point.value > 0 ? colors.accent : colors.track}
                      fillOpacity={point.value > 0 && index !== active ? 0.45 : 1}
                    />
                  );
                })}
              {kind === 'area' && line !== '' && (
                <>
                  <Path
                    d={`${line} L${xFor(count - 1)},${height} L${xFor(0)},${height} Z`}
                    fill={colors.accent}
                    fillOpacity={0.14}
                  />
                  <Path d={line} stroke={colors.accent} strokeWidth={2} fill="none" />
                  <Line
                    x1={xFor(active)}
                    x2={xFor(active)}
                    y1={plotTop}
                    y2={height}
                    stroke={colors.muted}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <Circle
                    cx={xFor(active)}
                    cy={yFor(data[active].value)}
                    r={5}
                    fill={colors.accent}
                    stroke={colors.surface}
                    strokeWidth={2}
                  />
                </>
              )}
              {goal !== undefined && goal > 0 && (
                <Line
                  x1={0}
                  x2={width}
                  y1={yFor(goal)}
                  y2={yFor(goal)}
                  stroke={colors.muted}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              )}
            </Svg>
            </Animated.View>
          )}
          {width > 0 && goal !== undefined && goal > 0 && (
            <Text
              style={[styles.chartAxisLabel, chartStyles.goalLabel, { top: yFor(goal) - 14 }]}
              pointerEvents="none"
            >
              Goal
            </Text>
          )}
        </View>
      </GestureDetector>
      <View style={chartStyles.axis}>
        {width > 0 &&
          labelIndexes.map((index) => (
            <Text
              key={index}
              numberOfLines={1}
              style={[
                styles.chartAxisLabel,
                chartStyles.axisLabel,
                {
                  left: Math.max(0, Math.min(width - 48, xFor(index) - 24)),
                },
                index === active && styles.chartAxisLabelActive,
              ]}
            >
              {data[index].label}
            </Text>
          ))}
      </View>
    </View>
  );
}

const HOUR_LABELS = [
  { hour: 0, text: '12a' },
  { hour: 6, text: '6a' },
  { hour: 12, text: '12p' },
  { hour: 18, text: '6p' },
];

/**
 * A 24-hour clock with one spoke per hour, longer for more listening.
 * Tapping a spoke shows that hour in the middle.
 */
export function ListeningClock({
  hours,
  size = 200,
  formatValue,
  formatHour,
}: {
  hours: number[];
  size?: number;
  formatValue: (value: number) => string;
  formatHour: (hour: number) => string;
}) {
  const styles = useAppStyles();
  const colors = useChartColors();
  const max = Math.max(1, ...hours);
  const peak = hours.reduce((best, value, index) => (value > hours[best] ? index : best), 0);
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? peak;
  const center = size / 2;
  const labelSpace = 16;
  const outer = center - labelSpace;
  const inner = outer * 0.42;
  const spokeWidth = Math.max(4, ((2 * Math.PI * inner) / 24) * 0.62);
  const angleFor = (hour: number) => ((hour + 0.5) / 24) * Math.PI * 2 - Math.PI / 2;

  const scrub = useScrub((x, y) => {
    const angle = Math.atan2(y - center, x - center) + Math.PI / 2;
    const turn = (angle + Math.PI * 2) % (Math.PI * 2);
    setSelected(Math.floor((turn / (Math.PI * 2)) * 24) % 24);
  });

  return (
    <GestureDetector gesture={scrub}>
      <View
        style={{ width: size, height: size, alignSelf: 'center' }}
        accessible
        accessibilityLabel={`Listening by hour. Most around ${formatHour(peak)}.`}
      >
        <Svg width={size} height={size} pointerEvents="none">
          <Circle cx={center} cy={center} r={inner - spokeWidth} stroke={colors.grid} strokeWidth={1} fill="none" />
          {hours.map((value, hour) => {
            const angle = angleFor(hour);
            const length = value > 0 ? Math.max(spokeWidth, (value / max) * (outer - inner)) : 0;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return (
              <Line
                key={hour}
                x1={center + cos * inner}
                y1={center + sin * inner}
                x2={center + cos * (inner + length)}
                y2={center + sin * (inner + length)}
                stroke={value > 0 ? colors.accent : colors.track}
                strokeOpacity={value > 0 && hour !== active ? 0.45 : 1}
                strokeWidth={value > 0 ? spokeWidth : 2}
                strokeLinecap="round"
              />
            );
          })}
        </Svg>
        {HOUR_LABELS.map(({ hour, text }) => {
          const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
          const radius = center - labelSpace / 2;
          return (
            <Text
              key={hour}
              style={[
                styles.chartAxisLabel,
                chartStyles.clockLabel,
                {
                  left: center + Math.cos(angle) * radius - 14,
                  top: center + Math.sin(angle) * radius - 7,
                },
              ]}
            >
              {text}
            </Text>
          );
        })}
        <View style={[StyleSheet.absoluteFill, chartStyles.clockCenter]} pointerEvents="none">
          <Text style={styles.chartClockHour}>{formatHour(active)}</Text>
          <Text style={styles.chartReadoutLabel}>{formatValue(hours[active])}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

/**
 * Seconds per day as a grid of weeks, darker for more listening, with a
 * Less to More key. Tapping a day shows its date and time.
 */
export function CalendarHeatmap({
  columns,
  start,
  formatValue,
}: {
  columns: (number | null)[][];
  start: number;
  formatValue: (value: number) => string;
}) {
  const styles = useAppStyles();
  const colors = useChartColors();
  const { width, onLayout } = useWidth();
  const [selected, setSelected] = useState<{ column: number; row: number } | null>(null);
  const gap = 3;
  const dayLabelWidth = 18;
  const weeks = columns.length;
  const cell = Math.min(18, (width - dayLabelWidth - gap * (weeks - 1)) / weeks);
  const height = cell * 7 + gap * 6;
  const max = Math.max(1, ...columns.flat().map((value) => value ?? 0));
  const levelFor = (value: number) =>
    value <= 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4));
  const opacity = [1, 0.3, 0.55, 0.78, 1];

  const scrub = useScrub((x, y) => {
    const column = Math.floor((x - dayLabelWidth) / (cell + gap));
    const row = Math.floor(y / (cell + gap));
    if (column >= 0 && column < weeks && row >= 0 && row < 7 && columns[column][row] !== null) {
      setSelected({ column, row });
    }
  });

  const selectedValue = selected ? columns[selected.column][selected.row] : null;
  let selectedDate: Date | null = null;
  if (selected) {
    selectedDate = new Date(start);
    selectedDate.setDate(selectedDate.getDate() + selected.column * 7 + selected.row);
  }

  return (
    <View>
      <View style={chartStyles.readout}>
        <Text style={styles.chartReadoutLabel}>
          {selectedDate
            ? selectedDate.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
            : 'Tap a day'}
        </Text>
        <Text style={styles.chartReadoutValue}>
          {selectedValue !== null && selectedValue !== undefined ? formatValue(selectedValue) : ''}
        </Text>
      </View>
      <GestureDetector gesture={scrub}>
        <View onLayout={onLayout} style={{ height: height > 0 ? height : 120 }}>
          {width > 0 && cell > 0 && (
            <>
              {['M', 'W', 'F'].map((label, index) => (
                <Text
                  key={label}
                  style={[
                    styles.chartAxisLabel,
                    chartStyles.dayLabel,
                    { top: (index * 2) * (cell + gap) + cell / 2 - 7 },
                  ]}
                >
                  {label}
                </Text>
              ))}
              <Svg width={width} height={height} pointerEvents="none">
                {columns.map((days, column) =>
                  days.map((value, row) => {
                    if (value === null) {
                      return null;
                    }
                    const level = levelFor(value);
                    const isSelected = selected?.column === column && selected.row === row;
                    return (
                      <Rect
                        key={`${column}-${row}`}
                        x={dayLabelWidth + column * (cell + gap)}
                        y={row * (cell + gap)}
                        width={cell}
                        height={cell}
                        rx={3}
                        fill={level === 0 ? colors.track : colors.accent}
                        fillOpacity={opacity[level]}
                        stroke={isSelected ? colors.muted : undefined}
                        strokeWidth={isSelected ? 1.5 : 0}
                      />
                    );
                  }),
                )}
              </Svg>
            </>
          )}
        </View>
      </GestureDetector>
      <View style={chartStyles.legend}>
        <Text style={styles.chartAxisLabel}>Less</Text>
        {opacity.map((value, level) => (
          <View
            key={level}
            style={[
              chartStyles.legendCell,
              { backgroundColor: level === 0 ? colors.track : colors.accent, opacity: value },
            ]}
          />
        ))}
        <Text style={styles.chartAxisLabel}>More</Text>
      </View>
    </View>
  );
}

export type RankItem = {
  key: string;
  label: string;
  hint?: string | null;
  value: number;
  valueLabel: string;
};

/** Ranked rows, each with a thin bar sized against the top item. */
export function RankBars({ items }: { items: RankItem[] }) {
  const styles = useAppStyles();
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.key}
          style={chartStyles.rankRow}
          accessible
          accessibilityLabel={`${index + 1}. ${item.label}, ${item.valueLabel}`}
        >
          <View style={chartStyles.rankTop}>
            <Text style={styles.chartRankNumber}>{index + 1}</Text>
            <View style={chartStyles.rankCopy}>
              <Text numberOfLines={1} style={styles.chartRankLabel}>
                {item.label}
              </Text>
              {item.hint ? (
                <Text numberOfLines={1} style={styles.chartAxisLabel}>
                  {item.hint}
                </Text>
              ) : null}
            </View>
            <Text style={styles.chartRankValue}>{item.valueLabel}</Text>
          </View>
          <View style={[styles.chartTrack, chartStyles.rankTrack]}>
            <View
              style={[
                styles.chartFill,
                chartStyles.rankFill,
                { width: `${Math.max(3, (item.value / max) * 100)}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export type Segment = { label: string; value: number; strong: boolean };

/** Parts of a whole as one tall bar, with each part named and counted below. */
export function SegmentBar({ segments }: { segments: Segment[] }) {
  const styles = useAppStyles();
  const colors = useChartColors();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const shown = segments.filter((segment) => segment.value > 0);
  return (
    <View>
      <View style={chartStyles.segmentBar}>
        {total === 0 ? (
          <View style={[chartStyles.segment, { flex: 1, backgroundColor: colors.track }]} />
        ) : (
          shown.map((segment) => (
            <View
              key={segment.label}
              style={[
                chartStyles.segment,
                {
                  flex: segment.value,
                  backgroundColor: segment.strong ? colors.accent : colors.track,
                },
              ]}
            />
          ))
        )}
      </View>
      <View style={chartStyles.segmentLegend}>
        {segments.map((segment) => (
          <View key={segment.label} style={chartStyles.segmentKey}>
            <View
              style={[
                chartStyles.legendCell,
                { backgroundColor: segment.strong ? colors.accent : colors.track },
              ]}
            />
            <Text style={styles.chartRankLabel}>{segment.label}</Text>
            <Text style={styles.chartAxisLabel}>
              {segment.value}
              {total > 0 ? ` · ${Math.round((segment.value / total) * 100)}%` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A thin progress line for a single share, such as songs played. */
export function Meter({ ratio }: { ratio: number }) {
  const styles = useAppStyles();
  return (
    <View style={[styles.chartTrack, chartStyles.meter]}>
      <View
        style={[
          styles.chartFill,
          chartStyles.meterFill,
          { width: `${Math.max(ratio > 0 ? 2 : 0, Math.min(1, ratio) * 100)}%` },
        ]}
      />
    </View>
  );
}

const chartStyles = StyleSheet.create({
  growFromBottom: {
    transformOrigin: 'bottom',
  },
  goalLabel: {
    position: 'absolute',
    right: 0,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 18,
  },
  axis: {
    height: 20,
    marginTop: 6,
  },
  axisLabel: {
    position: 'absolute',
    width: 48,
    textAlign: 'center',
  },
  clockLabel: {
    position: 'absolute',
    width: 28,
    textAlign: 'center',
  },
  clockCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    position: 'absolute',
    left: 0,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 10,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  rankRow: {
    paddingVertical: 9,
  },
  rankTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 7,
  },
  rankCopy: {
    flex: 1,
    gap: 2,
  },
  rankTrack: {
    height: 4,
    borderRadius: 4,
    marginLeft: 26,
    overflow: 'hidden',
  },
  rankFill: {
    height: 4,
    borderRadius: 4,
  },
  segmentBar: {
    flexDirection: 'row',
    gap: 2,
    height: 14,
  },
  segment: {
    borderRadius: 4,
  },
  segmentLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 10,
  },
  segmentKey: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meter: {
    height: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  meterFill: {
    height: 4,
    borderRadius: 4,
  },
});
