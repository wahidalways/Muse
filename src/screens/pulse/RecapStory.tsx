import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ListeningEvent, MusicTrack } from '../../types';
import { computeStats, getWeek, peakIndex, type ListeningStats, type WeekStart } from '../../history/stats';
import { useToday } from '../../history/useToday';
import { AlbumArtwork } from '../../components/AlbumArtwork';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatHour, formatListeningTime, percentChange } from '../../utils/format';
import { EASE_OUT } from '../../motion/motion';
import { cardFromStats, type CardData } from './ShareCard';

const SLIDE_MS = 5000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// The story is always dark, one quiet tint per slide.
const SLIDE_COLORS = ['#2A1F33', '#33281A', '#33201C', '#1C2333', '#1E2B1A', '#1A2B28', '#331C27'];

export type Recap = {
  /** Day key of the week's first day; what "seen" and "hidden" remember. */
  key: string;
  stats: ListeningStats;
  range: string;
  /** "31 Oct – 6 Nov", for tight spots. */
  short: string;
  goalDays: number;
  /** Per day, Monday-first in week order: listened, goal met. */
  days: { played: boolean; metGoal: boolean }[];
  /** No play from before this week at all. */
  isFirstWeek: boolean;
};

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const label = (date: Date) => `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;

export function shortRange(from: Date, to: Date): string {
  if (from.getFullYear() !== to.getFullYear()) {
    // All time can span years: "3 Nov 2025 – 10 Nov 2026", not "3–10 Nov".
    return `${from.getDate()} ${MONTHS[from.getMonth()]} ${from.getFullYear()} – ${to.getDate()} ${MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  }
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()}–${to.getDate()} ${MONTHS[to.getMonth()]}`
    : `${from.getDate()} ${MONTHS[from.getMonth()]} – ${to.getDate()} ${MONTHS[to.getMonth()]}`;
}

/** The recap as a share card. Goal days only when there is a goal. */
export function recapCard(recap: Recap, tracksById: Map<string, MusicTrack>, goalSeconds: number): CardData {
  return cardFromStats(recap.stats, tracksById, {
    kicker: 'My week in music',
    range: recap.range,
    issue: 'Weekly',
    short: recap.short,
    goal: goalSeconds > 0 ? { value: `${recap.goalDays} of 7`, sub: `${formatListeningTime(goalSeconds)} a day`, emoji: '🎯' } : null,
  });
}

/** Last full week, from the chosen start day. Null until there is a play in it. */
export function useRecap(
  history: ListeningEvent[],
  tracksById: Map<string, MusicTrack>,
  goalSeconds: number,
  weekStart: WeekStart,
): Recap | null {
  // A new week starts at midnight, even with no new play.
  const today = useToday();
  return useMemo(() => {
    const lookup = (id: string) => tracksById.get(id);
    // Noon on the last day of last week: computeStats' calendar week then covers all of it.
    const lastDay = getWeek([], lookup, weekStart, new Date().getTime()).start - 12 * 3_600_000;
    const stats = computeStats(history, 'week', lookup, lastDay, weekStart);
    if (stats.plays === 0) {
      return null;
    }
    const days = stats.buckets.map((bucket) => ({
      played: bucket.plays > 0,
      metGoal: goalSeconds > 0 && bucket.seconds >= goalSeconds,
    }));
    return {
      key: stats.buckets[0].key,
      stats,
      range: `${label(dateFromKey(stats.buckets[0].key))} – ${label(dateFromKey(stats.buckets[6].key))}`,
      short: shortRange(dateFromKey(stats.buckets[0].key), dateFromKey(stats.buckets[6].key)),
      goalDays: days.filter((day) => day.metGoal).length,
      days,
      // Any play from before this week: a quiet week before it is a break, not a first week.
      isFirstWeek: !history.some((event) => event.playedAt < dateFromKey(stats.buckets[0].key).getTime()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today`: last week moves on when the day turns.
  }, [goalSeconds, history, today, tracksById, weekStart]);
}

function partOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Morning person, clearly ☀️';
  if (hour >= 12 && hour < 17) return 'Afternoons had the soundtrack 🎧';
  if (hour >= 17 && hour < 21) return 'Evenings are for music 🌆';
  return 'Late nights were your thing 🌙';
}

type StoryProps = {
  visible: boolean;
  recap: Recap;
  tracksById: Map<string, MusicTrack>;
  goalSeconds: number;
  onPlayTrack: (track: MusicTrack) => void;
  onClose: () => void;
  /** Closes the story and opens the share card. */
  onShare: () => void;
};

export function RecapStory(props: StoryProps) {
  return (
    <Modal visible={props.visible} animationType="fade" statusBarTranslucent onRequestClose={props.onClose}>
      {/* Mounts with each opening, so the story starts at the first slide. */}
      {props.visible && <Story {...props} />}
    </Modal>
  );
}

function Story({ recap, tracksById, goalSeconds, onPlayTrack, onClose, onShare }: StoryProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const slides = useSlides(recap, tracksById, goalSeconds, onPlayTrack, onClose, onShare);
  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const pressedAt = useRef(0);

  const next = () => (index < slides.length - 1 ? setIndex(index + 1) : onClose());
  const run = (from: number) => {
    progress.set(from);
    progress.set(
      withTiming(1, { duration: (1 - from) * SLIDE_MS, easing: Easing.linear }, (finished) => {
        if (finished) {
          scheduleOnRN(next);
        }
      }),
    );
  };
  // Each slide starts its own timer.
  useEffect(() => {
    run(0);
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));
  const slide = slides[index];

  return (
    <View style={[story.screen, { backgroundColor: slide.color, paddingTop: insets.top + 10, paddingBottom: insets.bottom }]}>
      {/* Tap left for back, right for next; hold anywhere to pause. Behind the content, so buttons on a slide still work. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next"
        accessibilityHint="Tap the left side to go back. Hold to pause."
        style={StyleSheet.absoluteFill}
        onPressIn={() => {
          pressedAt.current = Date.now();
          cancelAnimation(progress);
        }}
        onPressOut={() => run(progress.get())}
        onPress={(event) => {
          if (Date.now() - pressedAt.current > 250) {
            return; // a hold, not a tap
          }
          if (event.nativeEvent.locationX < width / 3) {
            setIndex(Math.max(0, index - 1));
            if (index === 0) run(0);
          } else {
            next();
          }
        }}
      />
      <View style={story.bars} pointerEvents="none">
        {slides.map((item, at) => (
          <View key={item.id} style={story.bar}>
            {at < index && <View style={story.barFill} />}
            {at === index && <Animated.View style={[story.barFill, fill]} />}
          </View>
        ))}
      </View>
      <View style={story.top} pointerEvents="box-none">
        <Text style={story.range}>{recap.range}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close recap" hitSlop={10} onPress={onClose} style={story.close}>
          <Ionicons accessible={false} name="close" size={24} color="#F3F1E8" />
        </Pressable>
      </View>
      <Animated.View key={slide.id} entering={FadeInDown.duration(420).easing(EASE_OUT)} style={story.body} pointerEvents="box-none">
        {slide.body}
      </Animated.View>
    </View>
  );
}

function useSlides(
  recap: Recap,
  tracksById: Map<string, MusicTrack>,
  goalSeconds: number,
  onPlayTrack: (track: MusicTrack) => void,
  onClose: () => void,
  onShare: () => void,
): { id: string; color: string; body: ReactNode }[] {
  const { stats } = recap;
  const slides: { id: string; body: ReactNode }[] = [];
  const change = stats.previous && stats.previous.seconds > 0 ? percentChange(stats.seconds, stats.previous.seconds) : null;
  const topTrack = stats.topTracks[0];
  const track = topTrack ? tracksById.get(topTrack.id) : undefined;
  const artist = stats.topArtists[0];
  const artistTrack = artist ? tracksById.get(artist.trackId) : undefined;
  const peak = peakIndex(stats.hours);
  const activeDays = recap.days.filter((day) => day.played).length;

  slides.push({
    id: 'time',
    body: (
      <>
        <Text style={story.kick}>Your week in music 🎧</Text>
        <Text style={story.huge}>{formatListeningTime(stats.seconds)}</Text>
        <Text style={story.say}>
          {change === null
            ? recap.isFirstWeek
              ? 'Your first full week here. Welcome in ✨'
              : 'Good to have you back. Welcome in ✨'
            : change >= 0
              ? `${change}% more than the week before. Turn it up 📈`
              : `${Math.abs(change)}% less than the week before. Quality over quantity 😌`}
        </Text>
      </>
    ),
  });
  if (topTrack) {
    slides.push({
      id: 'song',
      body: (
        <>
          <Text style={story.kick}>Song of the week 🔁</Text>
          {track && (
            <View style={story.cover}>
              <AlbumArtwork track={track} size={220} radius={22} />
            </View>
          )}
          <Text numberOfLines={2} style={[story.huge, story.title]}>
            {topTrack.title}
          </Text>
          <Text style={story.say}>
            {topTrack.artist ? `${topTrack.artist} · ` : ''}
            {topTrack.plays} {topTrack.plays === 1 ? 'play' : 'plays'}
          </Text>
          {track?.uri && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onPlayTrack(track);
                onClose();
              }}
              style={story.pill}
            >
              <Ionicons accessible={false} name="play" size={18} color="#14160F" />
              <Text style={story.pillText}>Play it again</Text>
            </Pressable>
          )}
        </>
      ),
    });
  }
  if (artist) {
    slides.push({
      id: 'artist',
      body: (
        <>
          <Text style={story.kick}>Artist of the week 💞</Text>
          {artistTrack && (
            <View style={story.cover}>
              <AlbumArtwork track={artistTrack} size={160} radius={80} />
            </View>
          )}
          <Text numberOfLines={2} style={[story.huge, story.title]}>
            {artist.name}
          </Text>
          <Text style={story.say}>
            {artist.plays} {artist.plays === 1 ? 'play' : 'plays'} · {formatListeningTime(artist.seconds)}
          </Text>
        </>
      ),
    });
  }
  if (peak >= 0) {
    slides.push({
      id: 'hour',
      body: (
        <>
          <Text style={story.kick}>Peak hour</Text>
          <Text style={story.huge}>{formatHour(peak)}</Text>
          <Text style={story.say}>{partOfDay(peak)}</Text>
        </>
      ),
    });
  }
  slides.push({
    id: 'days',
    body:
      goalSeconds > 0 ? (
        <>
          <Text style={story.kick}>Daily goal 🎯</Text>
          <Text style={story.huge}>{recap.goalDays} of 7</Text>
          <Text style={story.say}>days you hit your {formatListeningTime(goalSeconds)} goal</Text>
          <DayDots on={recap.days.map((day) => day.metGoal)} />
        </>
      ) : (
        <>
          <Text style={story.kick}>Music days</Text>
          <Text style={story.huge}>{activeDays} of 7</Text>
          <Text style={story.say}>days with music on</Text>
          <DayDots on={recap.days.map((day) => day.played)} />
        </>
      ),
  });
  if (stats.firstListens > 0) {
    slides.push({
      id: 'new',
      body: (
        <>
          <Text style={story.kick}>New to you 🧭</Text>
          <Text style={story.huge}>
            {stats.firstListens} {stats.firstListens === 1 ? 'song' : 'songs'}
          </Text>
          <Text style={story.say}>heard for the first time</Text>
        </>
      ),
    });
  }
  const facts: [string, string][] = [
    [formatListeningTime(stats.seconds), 'listened'],
    ...(topTrack ? ([[topTrack.title, 'top song']] as [string, string][]) : []),
    ...(artist ? ([[artist.name, 'top artist']] as [string, string][]) : []),
    ...(peak >= 0 ? ([[formatHour(peak), 'peak hour']] as [string, string][]) : []),
    goalSeconds > 0 ? [`${recap.goalDays} of 7`, 'goal days'] : [`${activeDays} of 7`, 'music days'],
    ...(stats.firstListens > 0 ? ([[String(stats.firstListens), 'new songs']] as [string, string][]) : []),
  ];
  slides.push({
    id: 'summary',
    body: (
      <>
        <Text style={story.kick}>That was your week ✨</Text>
        <View style={story.grid}>
          {facts.map(([value, name]) => (
            <View key={name} style={story.cell}>
              <Text numberOfLines={1} style={story.cellValue}>
                {value}
              </Text>
              <Text style={story.cellName}>{name}</Text>
            </View>
          ))}
        </View>
        <View style={story.pillRow}>
          <Pressable accessibilityRole="button" onPress={onShare} style={story.pill}>
            <Ionicons accessible={false} name="share-outline" size={18} color="#14160F" />
            <Text style={story.pillText}>Share</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={[story.pill, story.pillQuiet]}>
            <Text style={[story.pillText, { color: '#F3F1E8' }]}>Done</Text>
          </Pressable>
        </View>
      </>
    ),
  });
  return slides.map((item, index) => ({ ...item, color: SLIDE_COLORS[index % SLIDE_COLORS.length] }));
}

function DayDots({ on }: { on: boolean[] }) {
  return (
    <View style={story.dots} accessible={false}>
      {on.map((value, index) => (
        <View key={index} style={[story.dot, value && story.dotOn]} />
      ))}
    </View>
  );
}

// Fixed colors: the story looks the same in light and dark mode.
const story = StyleSheet.create({
  screen: { flex: 1 },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: 14 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  barFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', transformOrigin: 'left' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 6, marginTop: 6 },
  range: { color: 'rgba(243,241,232,0.7)', fontSize: 13, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80 },
  kick: { color: 'rgba(243,241,232,0.7)', fontSize: 15, fontWeight: '700' },
  huge: { color: '#F3F1E8', fontSize: 60, fontWeight: '900', letterSpacing: -2, lineHeight: 64, marginVertical: 10 },
  title: { fontSize: 40, lineHeight: 44 },
  say: { color: '#F3F1E8', fontSize: 21, fontWeight: '700', lineHeight: 28 },
  cover: { marginTop: 18, marginBottom: 6, alignSelf: 'flex-start', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 18 }, elevation: 12 },
  pill: {
    marginTop: 24,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: '#F3F1E8',
  },
  pillText: { color: '#14160F', fontSize: 16, fontWeight: '800' },
  pillRow: { flexDirection: 'row', gap: 10 },
  pillQuiet: { backgroundColor: 'rgba(255,255,255,0.14)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  cell: { flexBasis: '46%', flexGrow: 1, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', padding: 14 },
  cellValue: { color: '#F3F1E8', fontSize: 22, fontWeight: '800' },
  cellName: { color: 'rgba(243,241,232,0.7)', fontSize: 12, marginTop: 2 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 20 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.18)' },
  dotOn: { backgroundColor: '#C4F078' },
});
