import { createContext, memo, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Pressable, Text, useWindowDimensions, View, type TextStyle } from 'react-native';
// The gesture library's ScrollView claims sideways drags before the tab swipe.
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  LinearTransition,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ListeningEvent, MusicTrack } from '../../types';
import { peakIndex, type ListeningStats, type getWeek } from '../../history/stats';
import type { Mix } from '../../history/mixes';
import { packRows, WIDGETS, type BoardItem, type WidgetId } from '../../settings/pulseBoard';
import { AlbumArtwork } from '../../components/AlbumArtwork';
import { MixCover } from '../../components/CoverCollage';
import { EqualizerBars } from '../../components/EqualizerBars';
import { RollingLine, RollingText } from '../../components/RollingText';
import { useChartColors } from '../../components/charts';
import { PlaybackGlyph, usePlayButtonColors } from '../../components/icons';
import { PressableScale } from '../../components/PressableScale';
import { formatHour, formatListeningTime, formatTimeAgo, percentChange } from '../../utils/format';
import { hapticImpact, hapticSelection } from '../../utils/haptics';
import { useAppStyles } from '../../theme/styles';
import { EASE_OUT, SNAP_BACK_SPRING } from '../../motion/motion';
import type { Recap } from './RecapStory';
import { GrowBar, RevealView, RiseIn, part, useIntro, useTileClock, useTileStarted } from './reveal';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/** Waits this long before a touch counts as a press, so starting a scroll on a tile does not buzz it. */
const PRESS_DELAY = 100;
/** Height of the This week plot, for today's value riding on its bar. */
const WEEK_PLOT = 96;
/** The Muse bars, for the goal moment. */
const MUSE_BARS = [16, 26, 36, 22];
/** Widgets that are music to play rather than numbers: they sit open, above "Your listening". */
const MUSIC_WIDGETS: WidgetId[] = ['recap', 'mixes', 'jump'];
/** A change in a live number glides over this long. */
const GLIDE = { duration: 600, easing: EASE_OUT };
/** How far entrances rise from, in points, as RiseIn does. */
const RISE = 12;

export type PulseData = {
  week: ReturnType<typeof getWeek>;
  /** The last 30 days. */
  month: ListeningStats;
  /** One song per album of the top artist, for its covers. */
  artistAlbums: MusicTrack[];
  goalSeconds: number;
  todaySeconds: number;
  streak: { current: number; best: number; previousBest: number; playedToday: boolean };
  coverage: { played: number; total: number };
  recent: ListeningEvent[];
  mixes: Mix[];
};

export type DetailKey = Exclude<WidgetId, 'recap' | 'mixes' | 'jump'> | 'mix';
export type Rect = { x: number; y: number; width: number; height: number };
/** What a tap hands the detail sheet: where the card is, so the sheet grows out of it. */
export type DetailRequest = {
  key: DetailKey;
  rect: Rect;
  /** The card, faded out while its sheet is open (mixes stay put). */
  hide?: SharedValue<number>;
  /** The card's number (or a mix's cover), which flies up into the sheet. */
  hero: { rect: Rect; text?: string; style?: TextStyle; mix?: Mix } | null;
};

type BoardProps = {
  board: BoardItem[];
  data: PulseData;
  tracksById: Map<string, MusicTrack>;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  /** Home is on screen: loops (spinning record, playing bars) only run then. */
  active: boolean;
  /** Seconds heard of the song playing now that are not saved yet. */
  live: number;
  /** Bumps when the daily goal is reached while Home is open. */
  goalMoment: number;
  /** What the queue was started from, such as a mix's title. */
  queueSource: string | null;
  onPlayTrack: (track: MusicTrack) => void;
  onOpenPlayer: () => void;
  onOpenDetail: (request: DetailRequest) => void;
  onCustomize: () => void;
  /** Last week's recap; null when there were no plays. */
  recap: Recap | null;
  recapNew: boolean;
  recapFolded: boolean;
  onOpenRecap: () => void;
  onFoldRecap: (folded: boolean) => void;
};

/** Rows drawn in Home's first frame; the rest follow two per frame, long before you can scroll to them. */
const FIRST_ROWS = 3;

export const PulseBoard = memo(function PulseBoard(props: BoardProps) {
  const styles = useAppStyles();
  const { data, tracksById } = props;
  // A widget with nothing to show yet takes no space.
  const ready: Record<WidgetId, boolean> = {
    recap: props.recap !== null,
    mixes: data.mixes.length > 0,
    jump: data.recent.length > 0,
    week: true,
    goal: true,
    streak: true,
    artist: data.month.topArtists.length > 0,
    // Plays of 0 seconds leave every hour empty, and no peak (-1) reads as "-1 AM".
    hour: peakIndex(data.month.hours) >= 0,
    repeat: Boolean(data.month.topTracks[0] && tracksById.get(data.month.topTracks[0].id)),
    album: data.month.topAlbums.length > 0,
    session: data.month.sessions.count > 0,
    genre: data.month.topGenres.length > 0,
    explore: data.coverage.total > 0,
  };
  const rows = packRows(props.board.filter((item) => ready[item.id]));
  const [rowsShown, setRowsShown] = useState(FIRST_ROWS);
  useEffect(() => {
    if (rowsShown >= rows.length) {
      return;
    }
    const frame = requestAnimationFrame(() => setRowsShown((count) => count + 2));
    return () => cancelAnimationFrame(frame);
  }, [rows.length, rowsShown]);
  // A square's side, worked out from the page width so it can grow taller
  // (large text, narrow phones) instead of clipping its content.
  const { width } = useWindowDimensions();
  const side = (width - 2 * Number(styles.content.paddingHorizontal) - Number(styles.pulseRow.gap)) / 2;
  // "Your listening" heads the first row of numbers.
  const firstStatRow = rows.findIndex((row) => row.every((item) => !MUSIC_WIDGETS.includes(item.id)));
  let order = 1;

  return (
    <View style={styles.pulseBoard}>
      {rows.slice(0, rowsShown).map((row, index) => (
        <Animated.View key={row.map((item) => item.id).join('+')} layout={LinearTransition.duration(320).easing(EASE_OUT)}>
          {index === firstStatRow && (
            <RevealView order={order++} style={[styles.pulseSectionGap, { marginBottom: 12 }]}>
              <Text accessibilityRole="header" style={styles.pulseSectionTitle}>
                Your listening
              </Text>
            </RevealView>
          )}
          <View style={styles.pulseRow}>
            {row.map((item) => (
              <RevealView key={item.id} order={order++} frame={!MUSIC_WIDGETS.includes(item.id) || item.id === 'recap'} style={styles.pulseCell}>
                <Widget item={item} side={side} {...propsFor(item.id, props)} />
              </RevealView>
            ))}
            {/* A lone square keeps its half width. */}
            {row.length === 1 && row[0].size === 'square' && <View style={styles.pulseCell} />}
          </View>
        </Animated.View>
      ))}
    </View>
  );
});

/** Live numbers and playback only reach the cards that show them, so a tick or a new song redraws one card, not the board. */
const LIVE_WIDGETS: WidgetId[] = ['week', 'goal'];
const PLAYING_WIDGETS: WidgetId[] = ['mixes', 'jump', 'repeat'];
function propsFor(id: WidgetId, props: BoardProps): BoardProps {
  const playing = PLAYING_WIDGETS.includes(id);
  return {
    ...props,
    live: LIVE_WIDGETS.includes(id) ? props.live : 0,
    goalMoment: id === 'goal' ? props.goalMoment : 0,
    currentTrack: playing ? props.currentTrack : null,
    isPlaying: playing ? props.isPlaying : false,
    active: playing ? props.active : false,
    queueSource: playing ? props.queueSource : null,
  };
}

const Widget = memo(function Widget({ item, side, ...props }: BoardProps & { item: BoardItem; side: number }) {
  const styles = useAppStyles();
  const wide = item.size === 'wide';
  const name = WIDGETS.find((widget) => widget.id === item.id)?.name ?? '';
  const { data, live } = props;
  const tile = (key: DetailKey, children: ReactNode, summary: string, hero?: { text: string; style: TextStyle }) => (
    <Tile
      side={wide ? 0 : side}
      label={`${name}, ${summary}`}
      hero={hero}
      onPress={(request) => props.onOpenDetail({ ...request, key })}
      onLongPress={props.onCustomize}
    >
      {children}
    </Tile>
  );
  switch (item.id) {
    case 'recap':
      return (
        <Tile
          side={0}
          label={`Your week in music, ${props.recap?.range}. Plays your week as a story`}
          tint
          onPress={props.onOpenRecap}
          onLongPress={props.onCustomize}
        >
          <RecapCard {...props} />
        </Tile>
      );
    case 'mixes':
      return <Panel title="Mixes for you"><Mixes {...props} /></Panel>;
    case 'jump':
      return <Panel title="Jump back in"><JumpBackIn {...props} /></Panel>;
    case 'week': {
      const total = data.week.seconds + live;
      const change = data.week.previousSeconds > 0 ? percentChange(total, data.week.previousSeconds) : null;
      const vs = change === null ? '' : `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on the same days last week`;
      return tile('week', <Week {...props} />, `${formatListeningTime(total)}${vs}`, {
        text: formatListeningTime(total),
        style: styles.pulseBig as TextStyle,
      });
    }
    case 'goal': {
      const today = data.todaySeconds + live;
      return tile(
        'goal',
        <Goal side={side} {...props} />,
        data.goalSeconds === 0
          ? 'no goal yet'
          : `${Math.floor(today / 60)} of ${Math.round(data.goalSeconds / 60)} minutes today`,
        data.goalSeconds > 0 ? { text: String(Math.floor(today / 60)), style: styles.pulseGaugeValue as TextStyle } : undefined,
      );
    }
    case 'streak':
      return tile('streak', <Streak {...props} />, `${data.streak.current} days in a row, best ${data.streak.best}`, {
        text: String(data.streak.current),
        style: styles.pulseStreakNumber as TextStyle,
      });
    case 'artist': {
      const artist = data.month.topArtists[0];
      return tile('artist', <TopArtist wide={wide} {...props} />, `${artist.name}, ${artist.plays} plays`, {
        text: artist.name,
        style: (wide ? styles.pulseBig : styles.pulseMid) as TextStyle,
      });
    }
    case 'hour':
      return tile('hour', <PeakHour wide={wide} {...props} />, formatHour(peakIndex(data.month.hours)), {
        text: formatHour(peakIndex(data.month.hours)),
        style: styles.pulseBig as TextStyle,
      });
    case 'repeat': {
      const top = data.month.topTracks[0];
      return tile('repeat', <OnRepeat wide={wide} {...props} />, `${top.title}, ${top.plays} plays`, {
        text: top.title,
        style: styles.pulseMid as TextStyle,
      });
    }
    case 'album': {
      const album = data.month.topAlbums[0];
      return tile('album', <TopAlbum side={side} {...props} />, `${album.name}, ${album.plays} plays`, {
        text: album.name,
        style: styles.pulseMid as TextStyle,
      });
    }
    case 'session':
      return tile('session', <Session {...props} />, `${formatListeningTime(data.month.sessions.longestSeconds)}, your longest listen`, {
        text: formatListeningTime(data.month.sessions.longestSeconds),
        style: styles.pulseBig as TextStyle,
      });
    case 'genre': {
      const genre = data.month.topGenres[0];
      return tile('genre', <Genre wide={wide} {...props} />, `${genre.name}, ${Math.round((genre.plays / data.month.genrePlays) * 100)}% of plays`, {
        text: genre.name,
        style: styles.pulseBig as TextStyle,
      });
    }
    case 'explore': {
      const percent = `${Math.floor((data.coverage.played / data.coverage.total) * 100)}%`;
      return tile('explore', <Explorer {...props} />, `${data.coverage.played} of ${data.coverage.total} songs heard`, {
        text: percent,
        style: styles.pulseBig as TextStyle,
      });
    }
  }
});

/**
 * Music widgets (Mixes, Jump back in) sit open on the page, without a card,
 * under a page-level title, so Home starts with music and the stats below
 * read as their own group. They hold their own buttons.
 */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  const styles = useAppStyles();
  return (
    <View style={styles.pulseOpen}>
      <RiseIn delay={0}>
        <Text accessibilityRole="header" style={styles.pulseSectionTitle}>
          {title}
        </Text>
      </RiseIn>
      {children}
    </View>
  );
}

const HeroContext = createContext<RefObject<ComponentRef<typeof View> | null> | null>(null);

/** Wraps a card's main number or name, so it can fly into the card's sheet. */
function Hero({ children }: { children: ReactNode }) {
  const ref = useContext(HeroContext);
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}

/**
 * The frame every card shares. A press sinks it a little; holding keeps it
 * sinking until Customize opens at 450 ms with a tick. A tap opens the card's
 * sheet, which grows out of the card.
 */
function Tile({
  side,
  label,
  hero,
  tint = false,
  onPress,
  onLongPress,
  children,
}: {
  /** A square's side; 0 for a wide tile. */
  side: number;
  /** What a screen reader says: the name and its numbers. */
  label: string;
  hero?: { text: string; style: TextStyle };
  /** The recap's own tinted look. */
  tint?: boolean;
  onPress: ((request: Omit<DetailRequest, 'key'>) => void) | (() => void);
  onLongPress: () => void;
  children: ReactNode;
}) {
  const styles = useAppStyles();
  const frame = useRef<ComponentRef<typeof Animated.View>>(null);
  const heroRef = useRef<ComponentRef<typeof View>>(null);
  const scale = useSharedValue(1);
  const shown = useSharedValue(1);
  const held = useRef(false);
  const frameStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: scale.get() }] }));

  const open = () => {
    hapticSelection();
    const node = frame.current;
    if (!node) {
      return;
    }
    // Card and number are measured at the same time, so the sheet starts a frame sooner.
    const measure = (target: { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void } | null) =>
      new Promise<Rect | null>((resolve) =>
        target ? target.measureInWindow((x, y, width, height) => resolve({ x, y, width, height })) : resolve(null),
      );
    void Promise.all([measure(node), hero ? measure(heroRef.current) : Promise.resolve(null)]).then(([rect, heroRect]) => {
      if (!rect) {
        return;
      }
      (onPress as (request: Omit<DetailRequest, 'key'>) => void)({
        rect,
        hide: shown,
        hero: heroRect && hero ? { rect: heroRect, text: hero.text, style: hero.style } : null,
      });
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold to customize Home"
      unstable_pressDelay={PRESS_DELAY}
      delayLongPress={450}
      onPressIn={() => {
        held.current = false;
        scale.set(
          withSequence(
            withTiming(0.97, { duration: 100, easing: EASE_OUT }),
            withTiming(0.94, { duration: 350, easing: Easing.in(Easing.quad) }),
          ),
        );
      }}
      onPressOut={() => {
        if (!held.current) {
          scale.set(withTiming(1, { duration: 160, easing: EASE_OUT }));
        }
      }}
      onLongPress={() => {
        held.current = true;
        hapticImpact();
        scale.set(withSpring(1, SNAP_BACK_SPRING));
        onLongPress();
      }}
      onPress={open}
      style={styles.pulseTileFill}
    >
      <Animated.View
        ref={frame}
        collapsable={false}
        style={[styles.pulseTile, styles.pulseTileFill, tint && styles.pulseRecap, side > 0 && { minHeight: side }, frameStyle]}
      >
        <HeroContext.Provider value={heroRef}>{children}</HeroContext.Provider>
      </Animated.View>
    </Pressable>
  );
}

function Label({ children, right, accent = false, roll = false }: { children: string; right?: string; accent?: boolean; roll?: boolean }) {
  const styles = useAppStyles();
  const rightStyle = [styles.pulseLabel, accent && styles.pulseLabelAccent];
  return (
    <View style={styles.pulseLabelRow}>
      <Text style={styles.pulseLabel}>{children}</Text>
      {right ? roll ? <RollingLine text={right} style={rightStyle} /> : <Text style={rightStyle}>{right}</Text> : null}
    </View>
  );
}

/** "▲ 12%": the arrow is an icon, since a text triangle sits off centre in the pill. */
export function DeltaPill({ change, style }: { change: number; style?: object }) {
  const styles = useAppStyles();
  const down = change < 0;
  const text = [styles.pulseDeltaPillText, down && styles.pulseDeltaPillTextDown];
  return (
    <View
      accessible
      accessibilityLabel={`${down ? 'Down' : 'Up'} ${Math.abs(change)}%`}
      style={[styles.pulseDeltaPill, down && styles.pulseDeltaPillDown, style]}
    >
      <Ionicons
        accessible={false}
        name={down ? 'caret-down' : 'caret-up'}
        size={11}
        color={String((down ? styles.pulseDeltaPillTextDown : styles.pulseDeltaPillText).color)}
      />
      <Text style={text}>{Math.abs(change)}%</Text>
    </View>
  );
}

/** Your week in music: a tinted story card, or a slim row once folded. */
function RecapCard({ recap, recapNew, recapFolded, tracksById, onFoldRecap }: BoardProps) {
  const styles = useAppStyles();
  const play = usePlayButtonColors();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const { stats, short, days } = recap as Recap;
  const covers = stats.topTracks.map((item) => tracksById.get(item.id)).filter(Boolean).slice(0, 3) as MusicTrack[];
  const change = stats.previous && stats.previous.seconds > 0 ? percentChange(stats.seconds, stats.previous.seconds) : null;
  const playedDays = days.filter((day) => day.played).length;
  const goalDays = days.filter((day) => day.metGoal).length;
  const letters = stats.buckets.map((bucket) => bucket.label.slice(0, 1));

  if (recapFolded) {
    return (
      <View style={styles.pulseRecapFold}>
        <View style={styles.pulseRecapMini} accessible={false}>
          {covers.map((track, index) => (
            <View key={track.id} style={index > 0 && { marginLeft: -12 }}>
              <AlbumArtwork track={track} size={36} radius={9} />
            </View>
          ))}
        </View>
        <View style={styles.homeSongCopy}>
          <Text style={styles.pulseRecapFoldTitle}>Your week in music</Text>
          <Text numberOfLines={1} style={styles.pulseRecapFoldSub}>
            {recapNew ? <Text style={styles.pulseRecapNewText}>New · </Text> : null}
            {short} · {formatListeningTime(stats.seconds)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show your week in music"
          onPress={() => onFoldRecap(false)}
          hitSlop={8}
          style={[styles.pulseTextButton, { marginVertical: 0 }]}
        >
          <Text style={[styles.pulseTextButtonText, styles.pulseRecapShow]}>Show</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <StorySegments count={days.length} />
      <View style={styles.pulseRecapTop}>
        {recapNew ? (
          <View style={styles.pulseRecapNew}>
            <View style={[styles.pulseFill, styles.pulseNewDot]} />
            <Text style={styles.pulseRecapNewText}>New · {short}</Text>
          </View>
        ) : (
          <Text style={styles.pulseRecapRange}>{short}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide recap, keep a slim row"
          onPress={() => onFoldRecap(true)}
          hitSlop={8}
          style={styles.pulseTextButton}
        >
          <Text style={styles.pulseTextButtonText}>Hide</Text>
        </Pressable>
      </View>
      <View style={styles.pulseRecapBody}>
        <View style={styles.homeSongCopy}>
          <Text style={styles.pulseRecapTitle}>Your week in music</Text>
          <View style={styles.pulseRecapHero}>
            <RollingText text={formatListeningTime(stats.seconds)} style={styles.pulseRecapTotal} fromZero={intro} start={started} />
            {change !== null && <DeltaPill change={change} style={styles.pulseRecapPill} />}
          </View>
          <PopIn delay={420}>
            <View style={styles.pulseRecapDays} accessible={false}>
              {days.map((day, index) => (
                <View key={index} style={styles.pulseRecapDay}>
                  <View style={[styles.pulseRecapDot, day.played && styles.pulseRecapDotPlayed, day.metGoal && styles.pulseRecapDotGoal]} />
                  <Text style={styles.pulseRecapDayLetter}>{letters[index]}</Text>
                </View>
              ))}
            </View>
          </PopIn>
          <Text style={styles.pulseRecapCaption}>
            Played {playedDays} of 7 days{goalDays > 0 ? ` · goal on ${goalDays}` : ''}
          </Text>
        </View>
        <View style={styles.pulseRecapFan} accessible={false}>
          {covers.map((track, index) => (
            <FanCover key={track.id} track={track} index={index} count={covers.length} />
          ))}
        </View>
      </View>
      <View style={[styles.pulseCta, { backgroundColor: play.background, alignSelf: 'flex-start', marginTop: 14 }]}>
        <PlaybackGlyph mode="play" color="inverse" size={10} />
        <Text style={[styles.pulseCtaText, { color: play.glyph }]}>Play story</Text>
      </View>
    </>
  );
}

/** The recap's story segments, filling in from the left like a story loading (one animation for all). */
function StorySegments({ count }: { count: number }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: clock ? part(clock.get(), 120, 520) : 1 }] }));
  return (
    <Animated.View style={[styles.pulseStorySegs, { transformOrigin: 'left' }, fill]} accessible={false}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.pulseStorySeg} />
      ))}
    </Animated.View>
  );
}

function PopIn({ delay, children }: { delay: number; children: ReactNode }) {
  const clock = useTileClock();
  const pop = useAnimatedStyle(() => {
    const progress = clock ? part(clock.get(), delay, 320) : 1;
    return { opacity: progress, transform: [{ scale: 0.6 + 0.4 * progress }] };
  });
  return <Animated.View style={[{ alignSelf: 'flex-start' }, pop]}>{children}</Animated.View>;
}

// The recap's covers fanned like cards in a hand; they rise in, top card last.
const FAN = [
  { x: 0, rotate: -9, y: 6 },
  { x: 22, rotate: 5, y: 0 },
  { x: 44, rotate: 0, y: 2 },
];

function FanCover({ track, index, count }: { track: MusicTrack; index: number; count: number }) {
  const styles = useAppStyles();
  const spot = FAN[index];
  const clock = useTileClock();
  const delay = 260 + (count - 1 - index) * 80;
  const deal = useAnimatedStyle(() => {
    const progress = clock ? part(clock.get(), delay, 560) : 1;
    return {
      opacity: progress,
      transform: [{ translateY: spot.y + (1 - progress) * RISE }, { rotate: `${spot.rotate * progress}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.pulseRecapFanCover, { left: spot.x, zIndex: index }, deal]}>
      <AlbumArtwork track={track} size={64} radius={12} />
    </Animated.View>
  );
}

/** Every mix as a cover grid, three across. A tap opens the mix's sheet; nothing plays until you ask. */
function Mixes({ data, currentTrack, isPlaying, active, queueSource, onOpenDetail }: BoardProps) {
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const gap = Number(styles.pulseMixGrid.columnGap);
  const size = Math.floor((width - 2 * Number(styles.content.paddingHorizontal) - 2 * gap) / 3);
  return (
    <View style={styles.pulseMixGrid}>
      {data.mixes.map((mix, index) => (
        <MixItem
          key={mix.id}
          mix={mix}
          index={index}
          size={size}
          isCurrent={currentTrack !== null && queueSource === mix.title}
          isPlaying={isPlaying && active}
          onOpen={(rect) => onOpenDetail({ key: 'mix', rect, hero: { rect, mix } })}
        />
      ))}
    </View>
  );
}

function MixItem({
  mix,
  index,
  size,
  isCurrent,
  isPlaying,
  onOpen,
}: {
  mix: Mix;
  index: number;
  size: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onOpen: (rect: Rect) => void;
}) {
  const styles = useAppStyles();
  const art = useRef<ComponentRef<typeof View>>(null);
  const clock = useTileClock();
  const enter = useAnimatedStyle(() => {
    const progress = clock ? part(clock.get(), 80 + index * 45, 420) : 1;
    return { opacity: progress, transform: [{ scale: 0.92 + 0.08 * progress }] };
  });
  return (
    <Animated.View style={enter}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${mix.title}, ${mix.hint}${isCurrent ? ', playing now' : ''}. Opens the mix`}
        onPress={() => art.current?.measureInWindow((x, y, width, height) => onOpen({ x, y, width, height }))}
        unstable_pressDelay={PRESS_DELAY}
        style={{ width: size }}
      >
        <View ref={art} collapsable={false}>
          <MixCover mix={mix} size={size} radius={14} />
          {isCurrent && (
            <View style={styles.homeShelfPlaying}>
              <EqualizerBars playing={isPlaying} size={12} />
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={styles.homeShelfTitle}>
          {mix.title}
        </Text>
        <Text numberOfLines={1} style={styles.homeShelfHint}>
          {isCurrent ? 'Playing now' : mix.hint}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

function JumpBackIn({ data, tracksById, currentTrack, isPlaying, active, onPlayTrack, onOpenPlayer }: BoardProps) {
  const styles = useAppStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pulseShelf}
      contentContainerStyle={styles.pulseShelfContent}
    >
      {data.recent.map((event, index) => {
        const track = tracksById.get(event.trackId);
        const isCurrent = currentTrack?.id === event.trackId;
        return (
          <SlideIn key={event.trackId} index={index}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={isCurrent ? `Now playing, ${event.title}` : `Play ${event.title}`}
              accessibilityState={{ disabled: !track?.uri }}
              disabled={!track?.uri}
              onPress={() => track && (isCurrent ? onOpenPlayer() : onPlayTrack(track))}
              unstable_pressDelay={PRESS_DELAY}
              style={styles.pulseShelfItem}
            >
              <View>
                {track ? <AlbumArtwork track={track} size={76} /> : <View style={[styles.homeArtFallback, { width: 76, height: 76 }]} />}
                {isCurrent && (
                  <View style={styles.homeShelfPlaying}>
                    <EqualizerBars playing={isPlaying && active} size={12} />
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={styles.homeShelfTitle}>
                {event.title}
              </Text>
              <Text numberOfLines={1} style={styles.homeShelfHint}>
                {isCurrent ? 'Playing now' : formatTimeAgo(event.playedAt)}
              </Text>
            </PressableScale>
          </SlideIn>
        );
      })}
    </ScrollView>
  );
}

/** Shelf items rise in, one after another, on first view; only the first few animate. Nothing on Home moves sideways at launch. */
function SlideIn({ index, children }: { index: number; children: ReactNode }) {
  const clock = useTileClock();
  const slide = useAnimatedStyle(() => {
    const progress = clock ? part(clock.get(), 60 + index * 35, 420) : 1;
    return { opacity: progress, transform: [{ translateY: (1 - progress) * RISE }] };
  });
  // Only the first few on screen rise; the rest are off to the right anyway.
  return index > 5 ? <>{children}</> : <Animated.View style={slide}>{children}</Animated.View>;
}

function shortRange(from: number, to: number): string {
  const a = new Date(from);
  const b = new Date(to);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/**
 * This week: each day's bar stands in front of a ghost of the same day last
 * week, so the % has visible proof. Days still ahead show only the ghost.
 * Today's bar and its value grow while you listen.
 */
function Week({ data, live }: BoardProps) {
  const styles = useAppStyles();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const { week } = data;
  const todayIndex = week.days.reduce((last, day, index) => (day.seconds !== null ? index : last), 0);
  const values = week.days.map((day, index) => (day.seconds === null ? null : day.seconds + (index === todayIndex ? live : 0)));
  const total = week.seconds + live;
  const change = week.previousSeconds > 0 ? percentChange(total, week.previousSeconds) : null;
  const max = Math.max(...values.map((value) => value ?? 0), ...week.days.map((day) => day.previous), 1) * 1.08;
  return (
    <>
      <Label right={shortRange(week.start, week.days[6].time)}>This week</Label>
      <View style={styles.pulseValueRow}>
        <Hero>
          <RollingText text={formatListeningTime(total)} style={styles.pulseBig} fromZero={intro} start={started} />
        </Hero>
        {change !== null && <DeltaPill change={change} />}
      </View>
      <View style={styles.pulseWeekPlot2} accessible={false}>
        {week.days.map((day, index) => {
          const value = values[index];
          return (
            <View key={day.time} style={styles.pulseWeekSlot}>
              <View style={[styles.pulseGhost, { height: `${Math.max(3, (day.previous / max) * 100)}%` }]} />
              {value !== null && <WeekBar delay={300 + index * 45} ratio={value / max} faded={index !== todayIndex} />}
              {index === todayIndex && value !== null && <TodayValue ratio={value / max} text={formatListeningTime(value)} />}
            </View>
          );
        })}
      </View>
      <View style={styles.pulseWeekDays}>
        {week.days.map((day, index) => (
          <View key={day.time} style={styles.pulseDay}>
            <Text style={[styles.pulseDayText, index === todayIndex && styles.pulseDayToday]}>
              {DAY_LETTERS[new Date(day.time).getDay()]}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

/** A day's bar: rises on first view, then glides to each new value. One transform, one mapper. */
function WeekBar({ delay, ratio, faded }: { delay: number; ratio: number; faded: boolean }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const shown = useSharedValue(ratio);
  useEffect(() => {
    shown.set(withTiming(ratio, GLIDE));
  }, [ratio, shown]);
  const bar = useAnimatedStyle(() => ({
    transform: [{ scaleY: Math.max(0.04, shown.get()) * (clock ? part(clock.get(), delay, 700) : 1) }],
  }));
  return (
    <View style={styles.pulseWeekBarBox}>
      <Animated.View style={[styles.pulseWeekBar, faded && { opacity: 0.5 }, bar]} />
    </View>
  );
}

/** Today's time, riding on top of its bar as it grows. */
function TodayValue({ ratio, text }: { ratio: number; text: string }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const shown = useSharedValue(ratio);
  useEffect(() => {
    shown.set(withTiming(ratio, GLIDE));
  }, [ratio, shown]);
  const ride = useAnimatedStyle(() => ({
    opacity: clock ? part(clock.get(), 950, 300) : 1,
    transform: [{ translateY: -Math.max(0.04, shown.get()) * WEEK_PLOT - 6 }],
  }));
  return <Animated.Text style={[styles.pulseWeekValue, ride]}>{text}</Animated.Text>;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * An open 270° gauge, gap at the bottom. It draws in on first view and then
 * glides to each new value. Used on the Daily goal card and in its sheet.
 */
export function Gauge({
  ratio,
  size,
  thickness = 10,
  gate,
  children,
  gap,
}: {
  ratio: number;
  size: number;
  thickness?: number;
  /** 0 to 1: how much of the fill may show yet (the entrance). */
  gate?: SharedValue<number>;
  children?: ReactNode;
  /** What sits in the open gap at the bottom. */
  gap?: ReactNode;
}) {
  const colors = useChartColors();
  const styles = useAppStyles();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.75;
  const progress = useSharedValue(0);
  const filled = Math.min(1, Math.max(0, ratio));
  useEffect(() => {
    progress.set(withTiming(filled, { duration: 900, easing: EASE_OUT }));
  }, [filled, progress]);
  const arcProps = useAnimatedProps(() => {
    const shown = progress.get() * (gate ? gate.get() : 1);
    return {
      // A dash as long as the arc, pulled back so only `shown` of it is drawn from the start.
      strokeDashoffset: arc * (1 - shown),
      strokeOpacity: shown > 0.003 ? 1 : 0,
    };
  });
  const center = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.track}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${arc} ${circumference}`}
          transform={`rotate(135 ${center} ${center})`}
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.accent}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${arc} ${circumference}`}
          animatedProps={arcProps}
          transform={`rotate(135 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.pulseGaugeCenter} pointerEvents="none">
        {children}
      </View>
      {gap ? (
        <View style={styles.pulseGaugeGap} pointerEvents="none">
          {gap}
        </View>
      ) : null}
    </View>
  );
}

/** The Muse bars that stand in the gauge once the goal is met. They bounce like a meter for the moment. */
export function DoneBars({ moment, scale = 1 }: { moment: number; scale?: number }) {
  const styles = useAppStyles();
  return (
    <View style={styles.pulseDoneBars} accessible={false}>
      {MUSE_BARS.map((height, index) => (
        <DoneBar key={index} index={index} height={height * scale} moment={moment} />
      ))}
    </View>
  );
}

function DoneBar({ index, height, moment }: { index: number; height: number; moment: number }) {
  const styles = useAppStyles();
  const level = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const step = (to: number, duration: number) => withTiming(to, { duration, easing: Easing.inOut(Easing.quad) });
    level.set(0);
    level.set(withDelay(180 + index * 70, withSequence(step(1, 300), step(0.5, 200), step(1, 200), step(0.75, 150), step(1, 150))));
  }, [index, level, moment]);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleY: level.get() }] }));
  return <Animated.View style={[styles.pulseDoneBar, { height }, bar]} />;
}

function Goal({ data, live, side, goalMoment }: BoardProps & { side: number }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const gate = useDerivedValue(() => (clock ? part(clock.get(), 100, 900) : 1));
  const { goalSeconds } = data;
  const today = data.todaySeconds + live;
  // The gauge is open at the bottom, so it can be nearly as tall as the card's free space.
  const size = Math.max(92, Math.min(112, Math.round(side - 52)));
  const pulse = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pulse.set(withSequence(withTiming(1.07, { duration: 200, easing: EASE_OUT }), withTiming(1, { duration: 360, easing: EASE_OUT })));
  }, [goalMoment, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  if (goalSeconds === 0) {
    return (
      <>
        <Label>Daily goal</Label>
        <View style={styles.pulseGrow} />
        <Text style={styles.pulseMid}>No goal yet</Text>
        <Text style={styles.pulseSub}>Tap to set one</Text>
      </>
    );
  }
  const met = today >= goalSeconds;
  return (
    <>
      <Label right={`${Math.round(goalSeconds / 60)} min`} roll>Daily goal</Label>
      <View style={styles.pulseGrow} />
      <Animated.View style={[styles.pulseGaugeWrap, pulseStyle]}>
        <Gauge
          ratio={today / goalSeconds}
          size={size}
          gate={gate}
          gap={<RollingLine text={met ? 'Goal met' : `${formatListeningTime(goalSeconds - today)} to go`} style={styles.pulseGaugeGapText} />}
        >
          {met ? (
            <DoneBars moment={goalMoment} />
          ) : (
            <>
              <Hero>
                <RollingText text={String(Math.floor(today / 60))} style={styles.pulseGaugeValue} fromZero={intro} start={started} />
              </Hero>
              <Text style={styles.pulseGaugeUnit}>min</Text>
            </>
          )}
        </Gauge>
      </Animated.View>
    </>
  );
}

/** How long the current run is, as one lit segment per day toward your best. */
function Streak({ data }: BoardProps) {
  const styles = useAppStyles();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const { current, best, previousBest, playedToday } = data.streak;
  const isNewBest = current > previousBest && previousBest > 0;
  const line =
    best === 0
      ? 'Play today to start one'
      : current > 0 && !playedToday
        ? 'Play today to keep it going'
        : current >= best
          ? 'Your longest run yet'
          : `${best - current} more to beat your best`;
  const segments = Math.min(14, Math.max(best, current, 1));
  return (
    <>
      <Label right={isNewBest ? 'New best' : `Best ${best}`} accent={isNewBest} roll>
        Streak
      </Label>
      <View style={styles.pulseGrow} />
      <View style={styles.pulseValueRow} accessible accessibilityLabel={`${current} days in a row`}>
        <Hero>
          <RollingText text={String(current)} style={styles.pulseStreakNumber} fromZero={intro} start={started} />
        </Hero>
        <Text style={styles.pulseStreakUnit}>{current === 1 ? 'day' : 'days'} 🔥</Text>
      </View>
      <Segments count={segments} lit={Math.min(current, segments)} />
      <RollingLine text={line} style={styles.pulseSub} />
    </>
  );
}

/** One segment per day toward your best; the row draws in from the left as one. */
function Segments({ count, lit }: { count: number; lit: number }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const draw = useAnimatedStyle(() => ({ transform: [{ scaleX: clock ? part(clock.get(), 200, 520) : 1 }] }));
  return (
    <Animated.View style={[styles.pulseSegs, { transformOrigin: 'left' }, draw]} accessible={false}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.pulseSeg, index < lit && styles.pulseSegLit]} />
      ))}
    </Animated.View>
  );
}

/** The artist, shown by their albums fanned out; the covers open from a stack on first view. */
function TopArtist({ wide, data, tracksById }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const artist = data.month.topArtists[0];
  const fallback = tracksById.get(artist.trackId);
  const covers = data.artistAlbums.length > 0 ? data.artistAlbums.slice(0, 2) : fallback ? [fallback] : [];
  const size = wide ? 64 : 48;
  const plays = `${artist.plays} ${artist.plays === 1 ? 'play' : 'plays'}`;
  const fan = (
    <View style={styles.pulseFan} accessible={false}>
      {covers.map((track, index) => (
        <ArtistCover key={track.id} track={track} index={index} size={size} />
      ))}
    </View>
  );
  if (wide) {
    return (
      <>
        <Label>Top artist</Label>
        <View style={styles.pulseMediaRow}>
          {fan}
          <View style={styles.homeSongCopy}>
            <Hero>
              <Text numberOfLines={1} style={styles.pulseBig}>
                {artist.name}
              </Text>
            </Hero>
            <Text numberOfLines={1} style={styles.pulseSub}>
              {plays}
            </Text>
          </View>
        </View>
      </>
    );
  }
  return (
    <>
      <Label>Top artist</Label>
      <View style={styles.pulseGrow} />
      {fan}
      <Hero>
        <Text numberOfLines={1} style={[styles.pulseMid, { marginTop: 10 }]}>
          {artist.name}
        </Text>
      </Hero>
      <Text numberOfLines={1} style={styles.pulseSub}>
        {plays}
      </Text>
    </>
  );
}

function ArtistCover({ track, index, size }: { track: MusicTrack; index: number; size: number }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const rest = index === 0 ? -6 : 8;
  const open = useAnimatedStyle(() => {
    const progress = clock ? part(clock.get(), 180, 620) : 1;
    return {
      opacity: progress,
      transform: [{ translateY: (index === 0 ? 0 : 2) + (1 - progress) * RISE }, { rotate: `${rest * progress}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.pulseFanCover, index === 0 ? { zIndex: 1 } : { marginLeft: -size * 0.4 }, open]}>
      <AlbumArtwork track={track} size={size} radius={10} />
    </Animated.View>
  );
}

/** The hour you listen most, with a dot over the hour it is now. */
function PeakHour({ wide, data }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const { hours } = data.month;
  const peak = peakIndex(hours);
  const max = Math.max(...hours, 1);
  const now = useHourNow();
  const clock = useTileClock();
  const dotStyle = useAnimatedStyle(() => {
    const progress = clock ? part(clock.get(), 900, 360) : 1;
    return { opacity: progress, transform: [{ translateY: (1 - progress) * -8 }] };
  });
  return (
    <>
      <Label>Peak hour</Label>
      {!wide && <View style={styles.pulseGrow} />}
      <Hero>
        <Text style={[styles.pulseBig, wide && { marginTop: 6 }]}>{formatHour(peak)}</Text>
      </Hero>
      <RollingLine text={now === peak ? "It's your peak hour" : 'When you listen most'} style={styles.pulseSub} />
      <View style={[styles.pulseHours, wide && styles.pulseHoursTall]} accessible={false}>
        <GrowBar delay={150} style={[styles.pulseHours, { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, marginTop: 0, transformOrigin: 'bottom' }]}>
          {hours.map((value, hour) => (
            <View
              key={hour}
              style={[styles.pulseHourBar, hour === peak && styles.pulseFill, { height: `${Math.max(6, (value / max) * 100)}%` }]}
            />
          ))}
        </GrowBar>
        <Animated.View style={[styles.pulseNowDot, { left: `${((now + 0.5) / 24) * 100}%` }, dotStyle]} />
      </View>
      {wide && (
        <View style={styles.pulseHourLabels}>
          {['12a', '6a', '12p', '6p', '11p'].map((label) => (
            <Text key={label} style={styles.pulseTinyLabel}>
              {label}
            </Text>
          ))}
        </View>
      )}
    </>
  );
}

/** The hour of the day, updated when the hour turns (one timer an hour). */
function useHourNow(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1).getTime() - now.getTime();
    const timer = setTimeout(() => setHour(new Date().getHours()), next + 500);
    return () => clearTimeout(timer);
  }, [hour]);
  return hour;
}

/**
 * The cover as a record sleeve with the disc peeking out. The disc slides out
 * of the sleeve on first view; while that song plays (and Home is on screen)
 * it slides a little further and spins.
 */
function OnRepeat({ wide, data, tracksById, currentTrack, isPlaying, active, onPlayTrack, onOpenPlayer }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const play = usePlayButtonColors();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const top = data.month.topTracks[0];
  const track = tracksById.get(top.id) as MusicTrack;
  const playingThis = currentTrack?.id === top.id && isPlaying;
  const size = wide ? 76 : 58;
  const button = (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={playingThis ? `${top.title} is playing. Open the player.` : `Play ${top.title}`}
      onPress={() => (currentTrack?.id === top.id ? onOpenPlayer() : onPlayTrack(track))}
      unstable_pressDelay={PRESS_DELAY}
      style={[styles.pulsePlay, { backgroundColor: play.background }, !wide && { width: 40, height: 40 }]}
    >
      <PlaybackGlyph mode={playingThis ? 'pause' : 'play'} color="inverse" size={wide ? 14 : 12} />
    </PressableScale>
  );
  const reps = (
    <View style={styles.pulseReps}>
      <RollingText text={String(top.plays)} style={styles.pulseRepsNumber} fromZero={intro} start={started} />
      <Text style={styles.pulseRepsUnit}>{top.plays === 1 ? 'play' : 'plays'}</Text>
    </View>
  );
  const record = <Record track={track} size={size} spinning={playingThis && active} />;
  if (wide) {
    return (
      <>
        <Label>On repeat</Label>
        <View style={styles.pulseMediaRow}>
          {record}
          <View style={styles.homeSongCopy}>
            <Hero>
              <Text numberOfLines={1} style={styles.pulseMid}>
                {top.title}
              </Text>
            </Hero>
            <Text numberOfLines={1} style={styles.pulseSub}>
              {top.artist || 'Unknown artist'}
            </Text>
            {reps}
          </View>
          {button}
        </View>
      </>
    );
  }
  return (
    <>
      <Label>On repeat</Label>
      <View style={styles.pulseGrow} />
      <View style={[styles.pulseLabelRow, { alignItems: 'flex-end' }]}>
        {record}
        {button}
      </View>
      <Hero>
        <Text numberOfLines={1} style={[styles.pulseMid, { marginTop: 10 }]}>
          {top.title}
        </Text>
      </Hero>
      {reps}
    </>
  );
}

function Record({ track, size, spinning }: { track: MusicTrack; size: number; spinning: boolean }) {
  const styles = useAppStyles();
  const angle = useSharedValue(0);
  const out = useSharedValue(spinning ? 1 : 0);
  const clock = useTileClock();
  useEffect(() => {
    out.set(withTiming(spinning ? 1 : 0, { duration: 600, easing: EASE_OUT }));
    if (spinning) {
      angle.set(withRepeat(withTiming(angle.get() + 360, { duration: 2400, easing: Easing.linear }), -1));
    } else {
      // Stops where it is, like a record lifted off the platter.
      cancelAnimation(angle);
    }
  }, [angle, out, spinning]);
  const discStyle = useAnimatedStyle(() => {
    const enter = clock ? part(clock.get(), 200, 760) : 1;
    return {
      opacity: enter,
      // Sideways only when it slides out of the sleeve to play, never at launch.
      transform: [
        { translateX: out.get() * size * 0.13 },
        { translateY: (1 - enter) * RISE },
        { rotate: `${angle.get() - (1 - enter) * 120}deg` },
      ],
    };
  });
  const disc = size * 0.92;
  // A record is black in both themes, so these colors skip the theme conversion.
  return (
    <View style={{ width: size * 1.4, height: size }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: size * 0.04,
            left: size * 0.34,
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            backgroundColor: '#121310',
            alignItems: 'center',
            justifyContent: 'center',
          },
          discStyle,
        ]}
      >
        {[0.86, 0.72, 0.58].map((ratio) => (
          <View
            key={ratio}
            style={{
              position: 'absolute',
              width: disc * ratio,
              height: disc * ratio,
              borderRadius: disc,
              borderWidth: 1,
              borderColor: '#24261F',
            }}
          />
        ))}
        <View style={[styles.pulseFill, { width: disc * 0.36, height: disc * 0.36, borderRadius: disc, alignItems: 'center', justifyContent: 'center' }]}>
          {/* A round disc turning looks still; this mark off the centre is what shows the spin. */}
          <View
            style={{
              position: 'absolute',
              top: disc * 0.04,
              width: disc * 0.045,
              height: disc * 0.08,
              borderRadius: 2,
              backgroundColor: '#0D0E0B',
              opacity: 0.55,
            }}
          />
          <View style={{ width: disc * 0.06, height: disc * 0.06, borderRadius: disc, backgroundColor: '#0D0E0B' }} />
        </View>
      </Animated.View>
      <View style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 3, height: 0 }, elevation: 4, borderRadius: 10 }}>
        <AlbumArtwork track={track} size={size} radius={10} />
      </View>
    </View>
  );
}

/** The album you played most: a big cover that flips over on first view, its plays beside it. */
function TopAlbum({ data, tracksById, side }: BoardProps & { side: number }) {
  const styles = useAppStyles();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const album = data.month.topAlbums[0];
  const track = tracksById.get(album.trackId);
  const size = Math.max(68, Math.min(88, Math.round(side - 80)));
  const clock = useTileClock();
  const flipStyle = useAnimatedStyle(() => {
    const flip = clock ? part(clock.get(), 160, 640) : 1;
    return { opacity: 0.2 + 0.8 * flip, transform: [{ perspective: 600 }, { rotateY: `${(1 - flip) * 80}deg` }] };
  });
  return (
    <>
      <Label>Top album</Label>
      <View style={styles.pulseAlbumRow}>
        <Animated.View style={flipStyle} accessible={false}>
          {track ? <AlbumArtwork track={track} size={size} radius={12} /> : <View style={[styles.homeArtFallback, { width: size, height: size }]} />}
        </Animated.View>
        <View>
          <RollingText text={String(album.plays)} style={styles.pulseAlbumCount} fromZero={intro} start={started} />
          <Text style={styles.pulseAlbumUnit}>{album.plays === 1 ? 'play' : 'plays'}</Text>
        </View>
      </View>
      <View style={[styles.pulseGrow, { minHeight: 8 }]} />
      <Hero>
        <Text numberOfLines={1} style={styles.pulseMid}>
          {album.name}
        </Text>
      </Hero>
      <Text numberOfLines={1} style={styles.pulseSub}>
        {track?.artist || 'Unknown artist'}
      </Text>
    </>
  );
}

/** Your longest listen in one go, with your average marked on the same line. */
function Session({ data }: BoardProps) {
  const styles = useAppStyles();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const { longestSeconds, averageSeconds } = data.month.sessions;
  const clock = useTileClock();
  const drawStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: clock ? part(clock.get(), 160, 760) : 1 }] }));
  const notchStyle = useAnimatedStyle(() => {
    const notch = clock ? part(clock.get(), 760, 320) : 1;
    return { opacity: notch, transform: [{ translateY: (1 - notch) * -6 }] };
  });
  return (
    <>
      <Label>Longest session</Label>
      <View style={styles.pulseGrow} />
      <Hero>
        <RollingText text={formatListeningTime(longestSeconds)} style={styles.pulseBig} fromZero={intro} start={started} />
      </Hero>
      <Text numberOfLines={1} style={styles.pulseSub}>
        {formatListeningTime(averageSeconds)} on average
      </Text>
      <View style={styles.pulsePill} accessible={false}>
        <Animated.View style={[styles.pulsePillFill, drawStyle]} />
        <Animated.View
          style={[styles.pulseNotch, { left: `${Math.min(100, (averageSeconds / Math.max(1, longestSeconds)) * 100)}%` }, notchStyle]}
        />
      </View>
    </>
  );
}

function Genre({ wide, data }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const { topGenres, genrePlays } = data.month;
  const shares = topGenres.slice(0, 3).map((genre) => ({ name: genre.name, share: genre.plays / genrePlays }));
  const percent = (share: number) => `${Math.round(share * 100)}%`;
  return (
    <>
      <Label>Genre mix</Label>
      <View style={styles.pulseGrow} />
      <Hero>
        <Text numberOfLines={1} style={styles.pulseBig}>
          {shares[0].name}
        </Text>
      </Hero>
      <Text style={styles.pulseSub}>{percent(shares[0].share)} of plays</Text>
      <GenreMeter shares={shares.map((genre) => genre.share)} />
      {wide && shares.length > 1 && (
        <View style={styles.pulseLegend}>
          {shares.map((genre) => (
            <Text key={genre.name} style={styles.pulseTinyLabel}>
              {genre.name} {percent(genre.share)}
            </Text>
          ))}
        </View>
      )}
    </>
  );
}

/** The top genres' shares in one bar that draws in from the left. */
function GenreMeter({ shares }: { shares: number[] }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const draw = useAnimatedStyle(() => ({ transform: [{ scaleX: clock ? part(clock.get(), 160, 640) : 1 }] }));
  return (
    <View style={styles.pulseMeter} accessible={false}>
      <Animated.View style={[{ flexDirection: 'row', gap: 3, flex: 1, transformOrigin: 'left' }, draw]}>
        {shares.map((share, index) => (
          <View key={index} style={[styles.pulseMeterPart, { width: `${Math.round(share * 100)}%`, opacity: [1, 0.55, 0.3][index] }]} />
        ))}
      </Animated.View>
    </View>
  );
}

/** How much of your library you've heard: a 10x10 grid, one square per 1%, that fills in row by row. */
function Explorer({ data }: BoardProps) {
  const styles = useAppStyles();
  const started = useTileStarted();
  // Numbers roll up from 0 only on the launch's first visit, like every entrance.
  const intro = useIntro();
  const { played, total } = data.coverage;
  const percent = Math.floor((played / total) * 100);
  return (
    <>
      <View style={styles.pulseXHead}>
        <Text style={styles.pulseLabel}>Explorer</Text>
        <View style={styles.pulseWaffle} accessible={false}>
          {Array.from({ length: 10 }, (_, row) => (
            <WaffleRow key={row} row={row} lit={Math.max(0, Math.min(10, percent - row * 10))} />
          ))}
        </View>
      </View>
      <View style={styles.pulseGrow} />
      <Hero>
        <RollingText text={`${percent}%`} style={styles.pulseBig} fromZero={intro} start={started} />
      </Hero>
      <Text numberOfLines={1} style={styles.pulseSub}>
        {played.toLocaleString()} of {total.toLocaleString()} heard
      </Text>
    </>
  );
}

/** One row of the grid; rows light up one after another (10 views per row, one animation per row). */
function WaffleRow({ row, lit }: { row: number; lit: number }) {
  const styles = useAppStyles();
  const clock = useTileClock();
  const fill = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * (clock ? part(clock.get(), 150 + row * 45, 260) : 1) }));
  return (
    <Animated.View style={[styles.pulseWaffleRow, fill]}>
      {Array.from({ length: 10 }, (_, column) => (
        <View key={column} style={[styles.pulseWaffleCell, column < lit && styles.pulseWaffleOn]} />
      ))}
    </Animated.View>
  );
}

