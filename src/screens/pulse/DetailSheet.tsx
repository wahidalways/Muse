import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  Extrapolation,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ListeningEvent, MusicTrack } from '../../types';
import {
  computeStats,
  dayKey,
  getDailySeconds,
  getGoalSummary,
  peakIndex,
  startOfDay,
  type RankedName,
  type RankedTrack,
  type WeekStart,
} from '../../history/stats';
import type { Mix } from '../../history/mixes';
import { AlbumArtwork } from '../../components/AlbumArtwork';
import { MixCover } from '../../components/CoverCollage';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { clearMixCover, setMixCoverPhoto, useMixCover } from '../../library/mixCovers';
import { EqualizerBars } from '../../components/EqualizerBars';
import { GoalPicker } from '../../components/GoalPicker';
import { TimeChart } from '../../components/charts';
import { CloseIcon, PlaybackGlyph, usePlayButtonColors } from '../../components/icons';
import { formatHour, formatListeningTime, percentChange } from '../../utils/format';
import { useAppStyles } from '../../theme/styles';
import { EASE_SHEET, SNAP_BACK_SPRING, project } from '../../motion/motion';
import { DeltaPill, DoneBars, Gauge, type DetailKey, type DetailRequest, type PulseData } from './PulseBoard';

type Range = 'This week' | '30 days' | 'All time' | 'Today';
const RANGE_OF: Record<Exclude<Range, 'Today'>, 'week' | '30d' | 'all'> = { 'This week': 'week', '30 days': '30d', 'All time': 'all' };
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const OPEN = { duration: 460, easing: EASE_SHEET, reduceMotion: ReduceMotion.System };
const CLOSE = { duration: 340, easing: EASE_SHEET, reduceMotion: ReduceMotion.System };

/** What each mix is, in the words of its rule (history/mixes.ts). */
const MIX_ABOUT: Record<Mix['id'], string> = {
  shuffle: 'Every song in your library, shuffled.',
  liked: 'The songs you marked as favorites.',
  repeat: 'Your most played songs of the last 30 days.',
  added: 'The newest songs in your library.',
  rediscover: 'Songs you played before, but not in the last 30 days.',
  unheard: "Songs you haven't played yet, shuffled.",
};

const RANGES: Record<DetailKey, Range[] | null> = {
  week: ['This week', '30 days', 'All time'],
  goal: ['Today', '30 days'],
  streak: null,
  artist: ['This week', '30 days', 'All time'],
  hour: ['30 days', 'All time'],
  repeat: ['This week', '30 days', 'All time'],
  album: ['This week', '30 days', 'All time'],
  session: ['30 days', 'All time'],
  genre: ['This week', '30 days', 'All time'],
  explore: null,
  mix: null,
};
const TITLES: Record<DetailKey, string> = {
  week: 'This week',
  goal: 'Daily goal',
  streak: 'Streak',
  artist: 'Top artist',
  hour: 'Peak hour',
  repeat: 'On repeat',
  album: 'Top album',
  session: 'Longest session',
  genre: 'Genre mix',
  explore: 'Explorer',
  mix: 'Mix',
};

export type DetailContext = {
  history: ListeningEvent[];
  tracks: MusicTrack[];
  tracksById: Map<string, MusicTrack>;
  weekStart: WeekStart;
  data: PulseData;
  live: number;
  goalMoment: number;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  queueSource: string | null;
  onPlayMix: (tracks: MusicTrack[], shuffle: boolean, source?: string) => void;
  onPlayFromList: (track: MusicTrack, list: MusicTrack[], source: string) => void;
  onPlayTrack: (track: MusicTrack) => void;
  onOpenPlayer: () => void;
  onOpenStats: () => void;
  onChangeGoal: (minutes: number) => void;
};

/**
 * One sheet for every card on Home and every mix. It grows out of the tapped
 * card (transform only, on the UI thread), the card's number flies up into
 * the sheet's title spot, and closing runs the same path back.
 */
export function DetailSheet({ request, onClose, ctx }: { request: DetailRequest | null; onClose: () => void; ctx: DetailContext }) {
  // Android's back button asks the sheet to close, so it plays the same way back as a tap outside.
  const [closeAsk, setCloseAsk] = useState(0);
  return (
    <Modal visible={request !== null} transparent animationType="none" statusBarTranslucent onRequestClose={() => setCloseAsk((count) => count + 1)}>
      {/* Gestures inside an Android modal need their own root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {request && <Frame request={request} onClose={onClose} ctx={ctx} closeAsk={closeAsk} />}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Frame({ request, onClose, ctx, closeAsk }: { request: DetailRequest; onClose: () => void; ctx: DetailContext; closeAsk: number }) {
  const styles = useAppStyles();
  const { width, height } = useWindowDimensions();
  const panelHeight = Math.round(height * 0.9);
  const panelTop = height - panelHeight;
  const { rect, hero } = request;
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  // Where the flying number lands, once the sheet has laid it out.
  const target = useSharedValue({ x: hero?.rect.x ?? 0, y: hero?.rect.y ?? 0, scale: 1, known: false });
  // Three layouts place the landing spot; they arrive in any order, so each one re-checks.
  const spot = useRef<{ body: number | null; row: { x: number; y: number } | null; hero: { x: number; y: number; width: number; height: number } | null }>({
    body: null,
    row: null,
    hero: null,
  });
  const sync = () => {
    const { body, row, hero: laid } = spot.current;
    if (!hero || body === null || !row || !laid) {
      return;
    }
    target.set({
      x: row.x + laid.x,
      y: panelTop + body + row.y + laid.y,
      scale: hero.mix ? laid.width / Math.max(1, hero.rect.width) : laid.height / Math.max(1, hero.rect.height),
      known: true,
    });
  };

  // The body (charts, stats for a range) mounts a frame after the sheet starts
  // moving, so the open animation never waits for it. It fades in late anyway.
  const [showBody, setShowBody] = useState(false);
  useEffect(() => {
    const hide = request.hide;
    hide?.set(0);
    progress.set(withTiming(1, OPEN));
    const frame = requestAnimationFrame(() => setShowBody(true));
    return () => {
      cancelAnimationFrame(frame);
      // However the sheet goes away (back button, drag, action), its card comes back.
      hide?.set(1);
    };
  }, [progress, request.hide]);

  const finish = () => {
    request.hide?.set(1);
    onClose();
  };
  const close = () => {
    progress.set(
      withTiming(0, CLOSE, (done) => {
        if (done) {
          scheduleOnRN(finish);
        }
      }),
    );
  };

  const firstAsk = useRef(closeAsk);
  useEffect(() => {
    if (closeAsk !== firstAsk.current) {
      close();
    }
    // `close` only reads shared values; re-running on it would close again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeAsk]);

  // Drag the top down to close; a short drag springs back.
  const pan = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-20, 20],
    onUpdate: (event) => {
      'worklet';
      drag.set(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      'worklet';
      if (!event.canceled && event.translationY + project(event.velocityY) > panelHeight / 3) {
        drag.set(
          withTiming(panelHeight, { duration: 200 }, (done) => {
            if (done) {
              scheduleOnRN(finish);
            }
          }),
        );
      } else {
        drag.set(withSpring(0, { ...SNAP_BACK_SPRING, velocity: event.velocityY }));
      }
    },
  });

  const panelStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      transform: [
        { translateX: rect.x * (1 - p) },
        { translateY: (rect.y - panelTop) * (1 - p) + drag.get() },
        { scaleX: rect.width / width + (1 - rect.width / width) * p },
        { scaleY: rect.height / panelHeight + (1 - rect.height / panelHeight) * p },
      ],
    };
  });
  // The card's own content is gone at once; the sheet's fades in late, so the stretch never shows text.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.45, 1], [0, 1], Extrapolation.CLAMP),
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * (1 - Math.min(1, drag.get() / panelHeight)),
  }));
  const flyerStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const to = target.get();
    if (!hero || !to.known) {
      return { opacity: 0 };
    }
    return {
      opacity: interpolate(p, [0, 0.82, 1], [1, 1, 0], Extrapolation.CLAMP) * (drag.get() > 0 ? 0 : 1),
      transform: [
        { translateX: (to.x - hero.rect.x) * p },
        { translateY: (to.y - hero.rect.y) * p },
        { scale: 1 + (to.scale - 1) * p },
      ],
    };
  });
  const heroStyle = useAnimatedStyle(() => ({
    opacity: hero ? interpolate(progress.get(), [0.8, 1], [0, 1], Extrapolation.CLAMP) : 1,
  }));

  const onRowLayout = (event: LayoutChangeEvent) => {
    spot.current.row = event.nativeEvent.layout;
    sync();
  };
  const onHeroLayout = (event: LayoutChangeEvent) => {
    spot.current.hero = event.nativeEvent.layout;
    sync();
  };

  const isMix = request.key === 'mix';
  // By id, not position: the list re-sorts as you play (a mix shows from 3 songs), and an open
  // sheet must not turn into another mix. One that dropped out keeps showing as it was opened.
  const mix = isMix ? (ctx.data.mixes.find((item) => item.id === request.hero?.mix?.id) ?? request.hero?.mix ?? null) : null;

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[styles.pulseSheetBackdrop, backdropStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.pulseSheet, { width, height: panelHeight }, panelStyle]}>
        <Animated.View style={[{ flex: 1 }, contentStyle]}>
          <GestureDetector gesture={pan}>
            <View>
              <View style={styles.pulseSheetGrab}>
                <View style={styles.pulseSheetHandle} />
              </View>
              <View style={styles.pulseSheetHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pulseSheetEyebrow}>{isMix ? 'Mixes for you' : 'Your listening'}</Text>
                  <Text accessibilityRole="header" numberOfLines={1} style={styles.pulseSheetTitle}>
                    {mix ? mix.title : TITLES[request.key]}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.pulseSheetClose}>
                  <CloseIcon color="text" size={13} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          <ScrollView
            onLayout={(event) => {
              spot.current.body = event.nativeEvent.layout.y;
              sync();
            }}
            contentContainerStyle={styles.pulseSheetBody}
            showsVerticalScrollIndicator={false}
          >
            {!showBody ? null : mix ? (
              <MixBody mix={mix} ctx={ctx} heroStyle={heroStyle} onRowLayout={onRowLayout} onHeroLayout={onHeroLayout} onDone={close} />
            ) : (
              <CardBody keyName={request.key} ctx={ctx} heroStyle={heroStyle} onRowLayout={onRowLayout} onHeroLayout={onHeroLayout} onDone={close} />
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
      {hero && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: hero.rect.x, top: hero.rect.y, transformOrigin: 'top left' }, flyerStyle]}
        >
          {hero.mix ? (
            <MixCover mix={hero.mix} size={hero.rect.width} radius={14} />
          ) : (
            <Text numberOfLines={1} style={hero.style}>
              {hero.text}
            </Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

type BodyProps = {
  ctx: DetailContext;
  heroStyle: object;
  /** The hero's row and the hero in it, laid out: where the card's number lands. */
  onRowLayout: (event: LayoutChangeEvent) => void;
  onHeroLayout: (event: LayoutChangeEvent) => void;
  /** Closes the sheet, after an action such as Play. */
  onDone: () => void;
};

type View_ = {
  hero: string;
  delta?: number | null;
  caption?: string;
  chart?: ReactNode;
  facts: [string, string][];
  action?: { label: string; run: () => void };
  extra?: ReactNode;
};

function CardBody({ keyName, ctx, heroStyle, onRowLayout, onHeroLayout, onDone }: BodyProps & { keyName: DetailKey }) {
  const styles = useAppStyles();
  const play = usePlayButtonColors();
  const ranges = RANGES[keyName];
  const [range, setRange] = useState<Range | null>(ranges ? (keyName === 'week' || keyName === 'goal' ? ranges[0] : ranges.length > 2 ? ranges[1] : ranges[0]) : null);
  // One moment per sheet, so its numbers agree with each other.
  const [now] = useState(() => Date.now());
  const view = useDetailView(keyName, range, ctx, onDone, now);

  return (
    <>
      {ranges && (
        <View style={styles.pulseSegControl} accessibilityRole="tablist">
          {ranges.map((item) => {
            const on = item === range;
            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setRange(item)}
                style={[styles.pulseSegItem, on && styles.pulseSegItemOn]}
              >
                <Text style={[styles.pulseSegText, on && styles.pulseSegTextOn]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={styles.pulseSheetHero} onLayout={onRowLayout}>
        <Animated.Text numberOfLines={2} onLayout={onHeroLayout} style={[styles.pulseSheetHeroText, heroStyle]}>
          {view.hero}
        </Animated.Text>
        {view.delta !== undefined && view.delta !== null && <DeltaPill change={view.delta} />}
      </View>
      {view.caption ? <Text style={styles.pulseSheetCaption}>{view.caption}</Text> : null}
      {view.chart ? <View style={styles.pulseSheetChart}>{view.chart}</View> : null}
      {view.extra}
      <View style={styles.pulseFacts}>
        {view.facts.map(([label, value]) => (
          <View key={label} style={styles.pulseFact}>
            <Text style={styles.pulseFactKey}>{label}</Text>
            <Text style={styles.pulseFactValue}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.pulseSheetActions}>
        {view.action && (
          <Pressable
            accessibilityRole="button"
            onPress={view.action.run}
            style={[styles.pulseSheetButton, { backgroundColor: play.background }]}
          >
            <PlaybackGlyph mode="play" color="inverse" size={11} />
            <Text style={[styles.pulseSheetButtonText, { color: play.glyph }]}>{view.action.label}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onDone();
            ctx.onOpenStats();
          }}
          style={[styles.pulseSheetButton, styles.pulseSheetGhost]}
        >
          <Text style={[styles.pulseSheetButtonText, styles.pulseSheetGhostText]}>Open full stats</Text>
        </Pressable>
      </View>
    </>
  );
}


/** Builds a card sheet's numbers for the chosen range. Everything comes from stats the app already counts. */
function useDetailView(key: DetailKey, range: Range | null, ctx: DetailContext, onDone: () => void, now: number): View_ {
  const { history, tracks, tracksById, weekStart, data, live } = ctx;
  const styles = useAppStyles();
  const lookup = (id: string) => tracksById.get(id);
  const stats = useMemo(
    () => (range && range !== 'Today' ? computeStats(history, RANGE_OF[range], (id) => tracksById.get(id), now, weekStart) : data.month),
    [data.month, history, now, range, tracksById, weekStart],
  );
  const daily = useMemo(() => getDailySeconds(history, (id) => tracksById.get(id)), [history, tracksById]);
  const playAndClose = (run: () => void) => () => {
    onDone();
    run();
  };

  switch (key) {
    case 'week': {
      const todayKey = dayKey(now);
      const points = stats.buckets.map((bucket) => ({
        label: bucket.label,
        value: bucket.seconds + (bucket.key === todayKey ? live : 0),
      }));
      const best = points.reduce((top, point) => (point.value > top.value ? point : top), { label: '-', value: 0 });
      if (range === 'This week') {
        const total = data.week.seconds + live;
        const sofar = data.week.days.filter((day) => day.seconds !== null);
        return {
          hero: formatListeningTime(total),
          delta: data.week.previousSeconds > 0 ? percentChange(total, data.week.previousSeconds) : null,
          caption: 'vs the same days last week',
          chart: <TimeChart data={points} formatValue={formatListeningTime} kind="bars" height={150} animateIn defaultIndex={sofar.length - 1} />,
          facts: [
            ['Daily average', formatListeningTime(total / Math.max(1, sofar.length))],
            ['Best day', best.value > 0 ? `${best.label} · ${formatListeningTime(best.value)}` : 'None yet'],
            ['Days played', `${sofar.filter((day) => (day.seconds ?? 0) > 0).length} of ${sofar.length}`],
          ],
        };
      }
      const total = stats.seconds + live;
      return {
        hero: formatListeningTime(total),
        delta: stats.previous && stats.previous.seconds > 0 ? percentChange(total, stats.previous.seconds) : null,
        caption: range === '30 days' ? 'vs the 30 days before' : `${stats.plays.toLocaleString()} plays`,
        // Bars for 30 days; All time has a bar per week, which passes 100 after two years, so it draws an area.
        chart: <TimeChart data={points} formatValue={formatListeningTime} kind={range === '30 days' ? 'bars' : undefined} height={150} animateIn />,
        facts: [
          [stats.bucketUnit === 'week' ? 'Weekly average' : 'Daily average', formatListeningTime(total / Math.max(1, stats.buckets.length))],
          [stats.bucketUnit === 'week' ? 'Best week' : 'Best day', best.value > 0 ? `${best.label} · ${formatListeningTime(best.value)}` : 'None yet'],
          ['Days played', `${stats.activeDays} of ${stats.dayCount}`],
        ],
      };
    }
    case 'goal': {
      const goalSeconds = data.goalSeconds;
      const goalMinutes = Math.round(goalSeconds / 60);
      const summary = getGoalSummary(history, lookup, goalSeconds);
      const picker = (
        <>
          <Text style={[styles.pulseSheetCaption, { marginTop: 22, fontWeight: '700' }]}>Change your goal</Text>
          <View style={{ marginTop: 10 }}>
            <GoalPicker goalMinutes={goalMinutes} onChange={ctx.onChangeGoal} />
          </View>
        </>
      );
      if (range === 'Today') {
        const today = data.todaySeconds + live;
        const met = goalSeconds > 0 && today >= goalSeconds;
        return {
          hero: goalSeconds > 0 ? `${Math.floor(today / 60)} of ${goalMinutes} min` : 'No goal yet',
          caption: goalSeconds === 0 ? 'Pick a goal below' : met ? 'Goal met. Nice.' : `${formatListeningTime(goalSeconds - today)} to go`,
          chart:
            goalSeconds > 0 ? (
              <View style={{ alignItems: 'center' }}>
                <Gauge ratio={today / goalSeconds} size={200} thickness={16}>
                  {met ? (
                    <DoneBars moment={ctx.goalMoment} scale={1.6} />
                  ) : (
                    <Text style={styles.pulseSheetHeroText}>{Math.round((today / goalSeconds) * 100)}%</Text>
                  )}
                </Gauge>
              </View>
            ) : undefined,
          extra: picker,
          facts: [
            ['Goal days this week', `${data.week.days.filter((day) => goalSeconds > 0 && (day.seconds ?? 0) >= goalSeconds).length} of ${data.week.days.filter((day) => day.seconds !== null).length}`],
            ['Goal streak', `${summary.streaks.current} ${summary.streaks.current === 1 ? 'day' : 'days'}`],
          ],
        };
      }
      const cells = lastDays(35, now).map((time) => {
        const seconds = daily.get(dayKey(time)) ?? 0;
        return goalSeconds > 0 && seconds >= goalSeconds ? 'on' : seconds > 0 ? 'half' : 'off';
      });
      const met30 = lastDays(30, now).filter((time) => goalSeconds > 0 && (daily.get(dayKey(time)) ?? 0) >= goalSeconds).length;
      return {
        hero: `Met on ${met30} ${met30 === 1 ? 'day' : 'days'}`,
        caption: goalSeconds > 0 ? `Goal: ${goalMinutes} min a day, last 30 days` : 'No goal yet',
        chart: <Calendar cells={cells} now={now} weekStart={weekStart} legend="Filled: goal met · Pale: played" />,
        extra: picker,
        facts: [
          ['Best goal streak', `${summary.streaks.best} ${summary.streaks.best === 1 ? 'day' : 'days'}`],
          ['Average day', formatListeningTime(data.month.seconds / 30)],
        ],
      };
    }
    case 'streak': {
      const { current, best, previousBest, playedToday } = data.streak;
      const days = lastDays(35, now);
      // The current run: the last `current` days up to today (or yesterday, before today's first play).
      const runEnd = playedToday ? 0 : 1;
      const cells = days.map((time, index) => {
        const fromEnd = days.length - 1 - index;
        if (current > 0 && fromEnd >= runEnd && fromEnd < runEnd + current) {
          return 'on';
        }
        return (daily.get(dayKey(time)) ?? 0) > 0 ? 'half' : 'off';
      });
      return {
        hero: `${current} ${current === 1 ? 'day' : 'days'}`,
        caption: current > previousBest && previousBest > 0 ? 'A new best!' : `Your best is ${best} ${best === 1 ? 'day' : 'days'}`,
        chart: <Calendar cells={cells} now={now} weekStart={weekStart} legend="Bright: your current run · Pale: other days you played" />,
        facts: [
          ['Best streak', `${best} ${best === 1 ? 'day' : 'days'}`],
          ['Days played, last 30', `${lastDays(30, now).filter((time) => (daily.get(dayKey(time)) ?? 0) > 0).length} of 30`],
          ['Today', playedToday ? 'Played' : 'Not yet'],
        ],
      };
    }
    case 'artist': {
      const top = stats.topArtists[0];
      if (!top) return empty();
      const albums = new Set(tracks.filter((track) => track.artist === top.name).map((track) => track.album ?? track.title)).size;
      return {
        hero: top.name,
        caption: `${top.plays} plays · ${formatListeningTime(top.seconds)}`,
        chart: <Ranked rows={stats.topArtists.slice(0, 5)} tracksById={tracksById} unit="plays" />,
        facts: [
          ['Albums in your library', String(albums)],
          ['Share of your plays', `${Math.round((top.plays / Math.max(1, stats.plays)) * 100)}%`],
        ],
        action: {
          label: `Play ${top.name}`,
          run: playAndClose(() => ctx.onPlayMix(tracks.filter((track) => track.artist === top.name), false, top.name)),
        },
      };
    }
    case 'hour': {
      const peak = peakIndex(stats.hours);
      const busiest = peakIndex(stats.weekdays);
      const late = stats.hours.slice(21).reduce((sum, value) => sum + value, 0);
      return {
        hero: peak >= 0 ? formatHour(peak) : '-',
        caption: 'When you listen most',
        chart: (
          <TimeChart
            data={stats.hours.map((value, hour) => ({ label: formatHour(hour), value }))}
            formatValue={formatListeningTime}
            kind="bars"
            height={150}
            animateIn
            defaultIndex={Math.max(0, peak)}
          />
        ),
        facts: [
          ['Busiest day', busiest >= 0 ? WEEKDAYS[busiest] : '-'],
          ['After 9 PM', `${Math.round((late / Math.max(1, stats.seconds)) * 100)}% of your time`],
        ],
      };
    }
    case 'repeat': {
      const top = stats.topTracks[0];
      const track = top && tracksById.get(top.id);
      if (!top) return empty();
      return {
        hero: top.title,
        caption: `${top.artist || 'Unknown artist'} · ${top.plays} plays`,
        chart: <Ranked rows={stats.topTracks.slice(0, 5)} tracksById={tracksById} unit="plays" />,
        facts: [['Time on this song', formatListeningTime(top.seconds)]],
        action: track ? { label: `Play ${top.title}`, run: playAndClose(() => ctx.onPlayTrack(track)) } : undefined,
      };
    }
    case 'album': {
      const top = stats.topAlbums[0];
      if (!top) return empty();
      const inAlbum = tracks.filter((track) => track.album === top.name);
      const heard = new Set(history.map((event) => event.trackId));
      const artist = tracksById.get(top.trackId)?.artist;
      return {
        hero: top.name,
        caption: `${artist || 'Unknown artist'} · ${top.plays} plays`,
        chart: <Ranked rows={stats.topAlbums.slice(0, 5)} tracksById={tracksById} unit="plays" />,
        facts: [
          ['Songs heard', `${inAlbum.filter((track) => heard.has(track.id)).length} of ${inAlbum.length}`],
          ['Time', formatListeningTime(top.seconds)],
        ],
        action: inAlbum.length > 0 ? { label: 'Play album', run: playAndClose(() => ctx.onPlayMix(inAlbum, false, top.name)) } : undefined,
      };
    }
    case 'session': {
      const { count, longestSeconds, averageSeconds } = stats.sessions;
      return {
        hero: formatListeningTime(longestSeconds),
        caption: 'Your longest listen in one go',
        chart: <Compare rows={[['Longest', longestSeconds], ['Average', averageSeconds]]} />,
        facts: [
          ['Sessions', count.toLocaleString()],
          ['Average session', formatListeningTime(averageSeconds)],
        ],
      };
    }
    case 'genre': {
      const top = stats.topGenres[0];
      if (!top) return empty();
      const shares = stats.topGenres.slice(0, 5).map((genre) => ({ ...genre, plays: Math.round((genre.plays / Math.max(1, stats.genrePlays)) * 100) }));
      return {
        hero: top.name,
        caption: `${shares[0].plays}% of plays with a genre tag`,
        chart: <Ranked rows={shares} tracksById={tracksById} unit="%" noCovers />,
        facts: [
          ['Genres heard', String(stats.topGenres.length)],
          ['Plays without a genre tag', `${Math.round((1 - stats.genrePlays / Math.max(1, stats.plays)) * 100)}%`],
        ],
      };
    }
    case 'explore': {
      const { played, total } = data.coverage;
      const percent = Math.floor((played / Math.max(1, total)) * 100);
      const unheard = data.mixes.find((mix) => mix.id === 'unheard');
      return {
        hero: `${percent}%`,
        caption: `${played.toLocaleString()} of ${total.toLocaleString()} songs heard`,
        chart: <BigWaffle percent={percent} />,
        facts: [
          ['New to you, last 30 days', `${data.month.firstListens.toLocaleString()} songs`],
          ['Never played', `${(total - played).toLocaleString()} songs`],
        ],
        action: unheard ? { label: 'Play Never played', run: playAndClose(() => ctx.onPlayMix(unheard.tracks, true, unheard.title)) } : undefined,
      };
    }
    default:
      return empty();
  }
}

function empty(): View_ {
  return { hero: 'Nothing yet', caption: 'Play some music and this fills in.', facts: [] };
}

/** The last `count` days up to today, as day-start times. */
function lastDays(count: number, now: number): number[] {
  const today = new Date(startOfDay(now));
  return Array.from({ length: count }, (_, index) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - index)).getTime(),
  );
}

/** Days as dots in week rows, starting on your week's first day. */
function Calendar({ cells, now, weekStart, legend }: { cells: string[]; now: number; weekStart: WeekStart; legend: string }) {
  const styles = useAppStyles();
  const first = new Date(now);
  first.setDate(first.getDate() - (cells.length - 1));
  const lead = (first.getDay() - weekStart + 7) % 7;
  const padded = [...Array.from({ length: lead }, () => 'blank'), ...cells];
  const rows = Array.from({ length: Math.ceil(padded.length / 7) }, (_, row) => padded.slice(row * 7, row * 7 + 7));
  return (
    <View accessible accessibilityLabel={legend}>
      <View style={styles.pulseCalRow}>
        {Array.from({ length: 7 }, (_, index) => (
          <View key={index} style={styles.pulseCalCellBox}>
            <Text style={styles.pulseCalLetter}>{LETTERS[(weekStart + index) % 7]}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.pulseCalRow}>
          {Array.from({ length: 7 }, (_, index) => {
            const kind = row[index];
            return (
              <View key={index} style={styles.pulseCalCellBox}>
                {kind && kind !== 'blank' && (
                  <View style={[styles.pulseCalCell, kind === 'on' && styles.pulseCalOn, kind === 'half' && styles.pulseCalHalf]} />
                )}
              </View>
            );
          })}
        </View>
      ))}
      <Text style={[styles.pulseSheetCaption, { marginTop: 12 }]}>{legend}</Text>
    </View>
  );
}

function Ranked({
  rows,
  tracksById,
  unit,
  noCovers = false,
}: {
  rows: (RankedName | RankedTrack)[];
  tracksById: Map<string, MusicTrack>;
  unit: 'plays' | '%';
  noCovers?: boolean;
}) {
  const styles = useAppStyles();
  const top = Math.max(1, rows[0]?.plays ?? 1);
  return (
    <View>
      {rows.map((row, index) => {
        const name = 'name' in row ? row.name : row.title;
        const track = tracksById.get('trackId' in row ? row.trackId : row.id);
        return (
          <View key={`${name}-${index}`} style={styles.pulseRankRow}>
            <Text style={styles.pulseRankN}>{index + 1}</Text>
            {!noCovers && (track ? <AlbumArtwork track={track} size={40} radius={8} /> : <View style={[styles.homeArtFallback, { width: 40, height: 40 }]} />)}
            <View style={styles.homeSongCopy}>
              <Text numberOfLines={1} style={styles.pulseSongTitle}>
                {name}
              </Text>
              <View style={[styles.pulseRankBar, { width: `${(row.plays / top) * 100}%`, opacity: index === 0 ? 1 : 0.45 }]} />
            </View>
            <Text style={styles.pulseRankValue}>
              {row.plays}
              {unit === '%' ? '%' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Compare({ rows }: { rows: [string, number][] }) {
  const styles = useAppStyles();
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <View>
      {rows.map(([label, value], index) => (
        <View key={label} style={index > 0 && { marginTop: 14 }}>
          <View style={styles.pulseLabelRow}>
            <Text style={styles.pulseLabel}>{label}</Text>
            <Text style={[styles.pulseLabel, styles.pulseSheetGhostText]}>{formatListeningTime(value)}</Text>
          </View>
          <View style={styles.pulseCmpTrack}>
            <View style={[styles.pulseCmpFill, { width: `${(value / max) * 100}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function BigWaffle({ percent }: { percent: number }) {
  const styles = useAppStyles();
  return (
    <View style={styles.pulseBigWaffle} accessible={false}>
      {Array.from({ length: 10 }, (_, row) => (
        <View key={row} style={styles.pulseBigWaffleRow}>
          {Array.from({ length: 10 }, (_, column) => (
            <View key={column} style={[styles.pulseBigWaffleCell, row * 10 + column < percent && styles.pulseCalOn]} />
          ))}
        </View>
      ))}
      <Text style={[styles.pulseSheetCaption, { marginTop: 8 }]}>Each square is 1% of your library</Text>
    </View>
  );
}

const SONGS_FIRST = 8;
const SONGS_ALL = 100;

/** A mix: what it is, Play and Shuffle, and its first songs. A song tap plays the mix from there. */
function MixBody({ mix, ctx, heroStyle, onRowLayout, onHeroLayout, onDone }: BodyProps & { mix: Mix }) {
  const styles = useAppStyles();
  const play = usePlayButtonColors();
  const [showAll, setShowAll] = useState(false);
  const isCurrent = ctx.currentTrack !== null && ctx.queueSource === mix.title;
  const total = mix.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  const shown = mix.tracks.slice(0, showAll ? SONGS_ALL : SONGS_FIRST);
  const run = (action: () => void) => () => {
    onDone();
    action();
  };
  const customCover = useMixCover(mix.id);
  const [coverError, setCoverError] = useState('');
  const pickCover = async () => {
    setCoverError('');
    try {
      const result = await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (!result.canceled && result.assets[0]) {
        await setMixCoverPhoto(mix.id, result.assets[0].uri);
      }
    } catch {
      setCoverError('Could not use that photo. Please try another one.');
    }
  };
  return (
    <>
      <View style={styles.pulseMixHead} onLayout={onRowLayout}>
        <Animated.View onLayout={onHeroLayout} style={[{ borderRadius: 16, overflow: 'hidden' }, heroStyle]}>
          <MixCover mix={mix} size={128} radius={16} />
        </Animated.View>
        <View style={styles.homeSongCopy}>
          <Text style={styles.pulseMixAbout}>{MIX_ABOUT[mix.id]}</Text>
          <Text style={styles.pulseMixMeta}>
            {mix.hint}
            {total > 0 ? ` · ${formatListeningTime(total)}` : ''}
          </Text>
          <View style={styles.pulseMixCoverLinks}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Choose a cover photo for ${mix.title}`} hitSlop={6} onPress={pickCover}>
              <Text style={styles.pulseMixCoverLink}>{customCover ? 'Change cover' : 'Add cover'}</Text>
            </Pressable>
            {customCover && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Use song covers for ${mix.title}`}
                hitSlop={6}
                onPress={() => clearMixCover(mix.id)}
              >
                <Text style={[styles.pulseMixCoverLink, styles.pulseMixMeta, { marginTop: 0 }]}>Remove</Text>
              </Pressable>
            )}
          </View>
          {coverError ? <Text style={styles.pulseMixMeta}>{coverError}</Text> : null}
        </View>
      </View>
      <View style={styles.pulseSheetActions}>
        <Pressable
          accessibilityRole="button"
          onPress={isCurrent ? run(ctx.onOpenPlayer) : run(() => ctx.onPlayMix(mix.tracks, mix.shuffle, mix.title))}
          style={[styles.pulseSheetButton, { backgroundColor: play.background, flex: 1 }]}
        >
          <PlaybackGlyph mode="play" color="inverse" size={11} />
          <Text style={[styles.pulseSheetButtonText, { color: play.glyph }]}>
            {isCurrent ? 'Open player' : mix.shuffle ? 'Shuffle play' : 'Play'}
          </Text>
        </Pressable>
        {!mix.shuffle && (
          <Pressable
            accessibilityRole="button"
            onPress={run(() => ctx.onPlayMix(mix.tracks, true, mix.title))}
            style={[styles.pulseSheetButton, styles.pulseSheetGhost, { flex: 1 }]}
          >
            <Text style={[styles.pulseSheetButtonText, styles.pulseSheetGhostText]}>Shuffle</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.pulseSheetCaption, { marginTop: 22, fontWeight: '700' }]}>
        {mix.shuffle ? 'A few of the songs' : 'Up first'}
      </Text>
      {shown.map((track) => {
        const now = ctx.currentTrack?.id === track.id && isCurrent;
        return (
          <Pressable
            key={track.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${track.title}, from ${mix.title}`}
            onPress={run(() => ctx.onPlayFromList(track, mix.tracks, mix.title))}
            style={styles.pulseSongRow}
          >
            <View>
              <AlbumArtwork track={track} size={44} radius={8} />
              {now && (
                <View style={[styles.homeShelfPlaying, { left: 4, bottom: 4 }]}>
                  <EqualizerBars playing={ctx.isPlaying} size={10} />
                </View>
              )}
            </View>
            <View style={styles.homeSongCopy}>
              <Text numberOfLines={1} style={[styles.pulseSongTitle, now && styles.pulseLabelAccent]}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={styles.pulseSongArtist}>
                {track.artist || 'Unknown artist'}
              </Text>
            </View>
            <Text style={styles.pulseSongTime}>{songLength(track.duration)}</Text>
          </Pressable>
        );
      })}
      {mix.tracks.length > SONGS_FIRST && !showAll && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll(true)}
          style={[styles.pulseSheetButton, styles.pulseSheetGhost, { marginTop: 12 }]}
        >
          <Text style={[styles.pulseSheetButtonText, styles.pulseSheetGhostText]}>Show all {mix.hint}</Text>
        </Pressable>
      )}
      {showAll && mix.tracks.length > SONGS_ALL && (
        <Text style={[styles.pulseSheetCaption, { marginTop: 12 }]}>
          And {(mix.tracks.length - SONGS_ALL).toLocaleString()} more. Play the mix to hear them all.
        </Text>
      )}
    </>
  );
}

function songLength(seconds: number | undefined): string {
  if (!seconds) {
    return '';
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

