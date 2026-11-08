import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
// The gesture library's ScrollView claims sideways drags before the tab swipe.
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeInDown,
  Keyframe,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { ListeningEvent, MusicTrack } from '../../types';
import { dayKey, peakIndex, type ListeningStats, type getWeek } from '../../history/stats';
import type { Mix } from '../../history/mixes';
import { packRows, WIDGETS, type BoardItem, type WidgetId } from '../../settings/pulseBoard';
import { AlbumArtwork } from '../../components/AlbumArtwork';
import { CoverCollage } from '../../components/CoverCollage';
import { EqualizerBars } from '../../components/EqualizerBars';
import { ProgressRing } from '../../components/charts';
import { PlaybackGlyph, usePlayButtonColors } from '../../components/icons';
import { PressableScale } from '../../components/PressableScale';
import { formatHour, formatListeningTime, formatTimeAgo, percentChange } from '../../utils/format';
import { useAppStyles } from '../../theme/styles';
import { EASE_OUT } from '../../motion/motion';
import type { Recap } from './RecapStory';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

/** Bars rise from the baseline; transform only, so it runs on the UI thread. */
const GROW = new Keyframe({
  0: { transform: [{ scaleY: 0 }] },
  100: { transform: [{ scaleY: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(700);
const enter = (order: number) => FadeInDown.duration(380).delay(Math.min(order, 4) * 60).easing(EASE_OUT);

export type PulseData = {
  week: ReturnType<typeof getWeek>;
  /** The last 30 days. */
  month: ListeningStats;
  /** One song per album of the top artist, for its covers. */
  artistAlbums: MusicTrack[];
  goalSeconds: number;
  todaySeconds: number;
  streak: { current: number; best: number };
  coverage: { played: number; total: number };
  recent: ListeningEvent[];
  mixes: Mix[];
};

type BoardProps = {
  board: BoardItem[];
  data: PulseData;
  tracksById: Map<string, MusicTrack>;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  playIntro: boolean;
  onPlayTrack: (track: MusicTrack) => void;
  onPlayMix: (tracks: MusicTrack[], shuffle: boolean, source?: string) => void;
  onOpenPlayer: () => void;
  onOpenStats: () => void;
  onEditGoal: () => void;
  onCustomize: () => void;
  /** Last week's recap; null when there were no plays or it was hidden. */
  recap: Recap | null;
  recapNew: boolean;
  onOpenRecap: () => void;
  onHideRecap: () => void;
};

export function PulseBoard(props: BoardProps) {
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
    hour: data.month.plays > 0,
    repeat: Boolean(data.month.topTracks[0] && tracksById.get(data.month.topTracks[0].id)),
    genre: data.month.topGenres.length > 0,
    explore: data.coverage.total > 0,
  };
  const rows = packRows(props.board.filter((item) => ready[item.id]));
  let order = 0;

  return (
    <View style={styles.pulseBoard}>
      {rows.map((row) => (
        <View key={row.map((item) => item.id).join('+')} style={styles.pulseRow}>
          {row.map((item) => (
            <Animated.View key={item.id} entering={props.playIntro ? enter(order++) : undefined} style={styles.pulseCell}>
              <Widget item={item} {...props} />
            </Animated.View>
          ))}
          {/* A lone square keeps its half width. */}
          {row.length === 1 && row[0].size === 'square' && <View style={styles.pulseCell} />}
        </View>
      ))}
    </View>
  );
}

function Widget({ item, ...props }: BoardProps & { item: BoardItem }) {
  const wide = item.size === 'wide';
  const name = WIDGETS.find((widget) => widget.id === item.id)?.name ?? '';
  const tile = (children: ReactNode, onPress = props.onOpenStats) => (
    <Tile wide={wide} label={name} onPress={onPress} onLongPress={props.onCustomize}>
      {children}
    </Tile>
  );
  switch (item.id) {
    case 'recap':
      return tile(<RecapTile {...props} />, props.onOpenRecap);
    case 'mixes':
      return tile(<Mixes {...props} />);
    case 'jump':
      return tile(<JumpBackIn {...props} />);
    case 'week':
      return tile(<Week {...props} />);
    case 'goal':
      return tile(<Goal {...props} />, props.onEditGoal);
    case 'streak':
      return tile(<Streak {...props} />);
    case 'artist':
      return tile(<TopArtist wide={wide} {...props} />);
    case 'hour':
      return tile(<PeakHour wide={wide} {...props} />);
    case 'repeat':
      return tile(<OnRepeat wide={wide} {...props} />);
    case 'genre':
      return tile(<Genre wide={wide} {...props} />);
    case 'explore':
      return tile(<Explorer wide={wide} {...props} />);
  }
}

/** The frame every widget shares. Press and hold opens Customize. */
function Tile({
  wide,
  label,
  onPress,
  onLongPress,
  children,
}: {
  wide: boolean;
  label: string;
  onPress: () => void;
  onLongPress: () => void;
  children: ReactNode;
}) {
  const styles = useAppStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold to customize Home"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={[styles.pulseTile, !wide && styles.pulseTileSquare]}
    >
      {children}
    </PressableScale>
  );
}

function Label({ children, right }: { children: string; right?: string }) {
  const styles = useAppStyles();
  return (
    <View style={styles.pulseLabelRow}>
      <Text style={styles.pulseLabel}>{children}</Text>
      {right ? <Text style={styles.pulseLabel}>{right}</Text> : null}
    </View>
  );
}

function RecapTile({ recap, recapNew, tracksById, onHideRecap }: BoardProps) {
  const styles = useAppStyles();
  const play = usePlayButtonColors();
  const { stats, range } = recap as Recap;
  const covers = stats.topTracks.map((item) => tracksById.get(item.id)).filter(Boolean).slice(0, 3) as MusicTrack[];
  return (
    <>
      <View style={styles.pulseLabelRow}>
        {recapNew ? (
          <View style={styles.pulseNew}>
            <View style={[styles.pulseFill, styles.pulseNewDot]} />
            <Text style={styles.pulseNewText}>New</Text>
          </View>
        ) : (
          <Text style={styles.pulseLabel}>Weekly recap</Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Hide recap until next week" hitSlop={12} onPress={onHideRecap}>
          <Ionicons accessible={false} name="close" size={18} color={String(styles.pulseLabel.color)} />
        </Pressable>
      </View>
      <Text style={[styles.pulseMid, { marginTop: 6 }]}>Your week in music</Text>
      <Text style={styles.pulseSub}>
        {range} · {formatListeningTime(stats.seconds)}
      </Text>
      <View style={[styles.pulseLabelRow, { marginTop: 14 }]}>
        <View style={[styles.pulseCta, { backgroundColor: play.background }]}>
          <PlaybackGlyph mode="play" color="inverse" size={10} />
          <Text style={[styles.pulseCtaText, { color: play.glyph }]}>Play story</Text>
        </View>
        <View style={styles.pulseStack} accessible={false}>
          {covers.map((track, index) => (
            <View key={track.id} style={[styles.pulseStackItem, index === 0 && { marginLeft: 0 }]}>
              <AlbumArtwork track={track} size={40} radius={10} />
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function Mixes({ data, onPlayMix }: BoardProps) {
  const styles = useAppStyles();
  return (
    <>
      <Label>Mixes for you</Label>
      <View style={styles.pulseMixGrid}>
        {data.mixes.slice(0, 4).map((mix) => (
          <PressableScale
            key={mix.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${mix.title}, ${mix.hint}`}
            onPress={() => onPlayMix(mix.tracks, mix.shuffle, mix.title)}
            style={styles.pulseMix}
          >
            <CoverCollage tracks={mix.tracks} size={44} />
            <View style={styles.homeSongCopy}>
              <Text numberOfLines={1} style={styles.homeSongTitle}>
                {mix.title}
              </Text>
              <Text numberOfLines={1} style={styles.homeSongHint}>
                {mix.hint}
              </Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </>
  );
}

function JumpBackIn({ data, tracksById, currentTrack, isPlaying, onPlayTrack, onOpenPlayer }: BoardProps) {
  const styles = useAppStyles();
  return (
    <>
      <Label>Jump back in</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pulseShelf}
        contentContainerStyle={styles.pulseShelfContent}
      >
        {data.recent.map((event) => {
          const track = tracksById.get(event.trackId);
          const isCurrent = currentTrack?.id === event.trackId;
          return (
            <PressableScale
              key={event.trackId}
              accessibilityRole="button"
              accessibilityLabel={isCurrent ? `Now playing, ${event.title}` : `Play ${event.title}`}
              accessibilityState={{ disabled: !track?.uri }}
              disabled={!track?.uri}
              onPress={() => track && (isCurrent ? onOpenPlayer() : onPlayTrack(track))}
              style={styles.pulseShelfItem}
            >
              <View>
                {track ? <AlbumArtwork track={track} size={76} /> : <View style={[styles.homeArtFallback, { width: 76, height: 76 }]} />}
                {isCurrent && (
                  <View style={styles.homeShelfPlaying}>
                    <EqualizerBars playing={isPlaying} size={12} />
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
          );
        })}
      </ScrollView>
    </>
  );
}

function shortRange(from: number, to: number): string {
  const a = new Date(from);
  const b = new Date(to);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

function Week({ data, playIntro }: BoardProps) {
  const styles = useAppStyles();
  const { week } = data;
  const change = week.previousSeconds > 0 ? percentChange(week.seconds, week.previousSeconds) : null;
  const max = Math.max(...week.days.map((day) => day.seconds ?? 0), 1) * 1.1;
  // Today is the last day of the week that has already happened.
  const todayKey = dayKey(week.days.filter((day) => day.seconds !== null).at(-1)?.time ?? week.start);
  return (
    <>
      <Label right={shortRange(week.start, week.days[6].time)}>This week</Label>
      <View style={styles.pulseValueRow}>
        <Text style={styles.pulseBig}>{formatListeningTime(week.seconds)}</Text>
        {change !== null && (
          <Text style={[styles.pulseDelta, change < 0 && styles.pulseDeltaDown]}>
            {change >= 0 ? '▲' : '▼'} {Math.abs(change)}%
          </Text>
        )}
      </View>
      <Text style={styles.pulseSub}>{change === null ? 'New week' : 'vs same days last week'}</Text>
      <View
        style={styles.pulseWeekPlot}
        accessible
        accessibilityLabel={`Listening each day this week. ${formatListeningTime(week.seconds)} so far.`}
      >
        {week.days.map((day, index) => (
          <View key={day.time} style={styles.pulseWeekColumn}>
            {day.seconds !== null && (
              <Animated.View
                entering={playIntro ? GROW.delay(150 + index * 40) : undefined}
                style={[
                  styles.pulseFill,
                  {
                    height: `${Math.max(4, (day.seconds / max) * 100)}%`,
                    opacity: dayKey(day.time) === todayKey ? 1 : 0.42,
                  },
                ]}
              />
            )}
          </View>
        ))}
      </View>
      <View style={styles.pulseWeekDays}>
        {week.days.map((day) => {
          const isToday = dayKey(day.time) === todayKey;
          return (
            <View key={day.time} style={styles.pulseDay}>
              <Text style={[styles.pulseDayText, isToday && styles.pulseDayToday]}>
                {DAY_LETTERS[new Date(day.time).getDay()]}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function Goal({ data }: BoardProps) {
  const styles = useAppStyles();
  const { goalSeconds, todaySeconds } = data;
  const minutes = Math.floor(todaySeconds / 60);
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
  const left = Math.max(0, goalSeconds - todaySeconds);
  return (
    <>
      <Label>Daily goal</Label>
      <View style={styles.pulseRingWrap}>
        <ProgressRing ratio={todaySeconds / goalSeconds} size={100} thickness={11}>
          <Text style={styles.pulseRingValue}>{minutes}</Text>
          <Text style={styles.pulseRingUnit}>of {Math.round(goalSeconds / 60)} min</Text>
        </ProgressRing>
      </View>
      <Text style={styles.pulseFoot}>{left === 0 ? 'Done for today' : `${formatListeningTime(left)} to go`}</Text>
    </>
  );
}

/** How long the current run is, measured against your best one. */
function Streak({ data }: BoardProps) {
  const styles = useAppStyles();
  const { current, best } = data.streak;
  const line =
    best === 0 ? 'Play today to start one' : current >= best ? 'Your longest run yet' : `${best - current} more to beat your best`;
  return (
    <>
      <Label right={`Best ${best}`}>Streak</Label>
      <View style={styles.pulseGrow} />
      <Text style={styles.pulseStreakNumber} accessibilityLabel={`${current} days in a row`}>
        {current}
        <Text style={styles.pulseStreakUnit}> {current === 1 ? 'day' : 'days'} 🔥</Text>
      </Text>
      <View style={styles.pulseMeter} accessible={false}>
        <View style={[styles.pulseFill, { width: `${best > 0 ? Math.max(2, (current / best) * 100) : 0}%` }]} />
      </View>
      <Text style={styles.pulseSub}>{line}</Text>
    </>
  );
}

/** The artist, shown by their albums fanned out, so it never repeats On repeat's single cover. */
function TopArtist({ wide, data, tracksById }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const artist = data.month.topArtists[0];
  const albums = data.artistAlbums.length;
  const fallback = tracksById.get(artist.trackId);
  const covers = albums > 0 ? data.artistAlbums.slice(0, 2) : fallback ? [fallback] : [];
  const size = wide ? 64 : 48;
  const plays = `${artist.plays} ${artist.plays === 1 ? 'play' : 'plays'}`;
  const albumText = albums > 1 ? ` · ${albums} albums` : '';
  const fan = (
    <View style={styles.pulseFan} accessible={false}>
      {covers.map((track, index) => (
        <View
          key={track.id}
          style={[
            styles.pulseFanCover,
            index === 0 ? { zIndex: 1, transform: [{ rotate: '-6deg' }] } : { marginLeft: -size * 0.4, transform: [{ rotate: '8deg' }, { translateY: 2 }] },
          ]}
        >
          <AlbumArtwork track={track} size={size} radius={10} />
        </View>
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
            <Text numberOfLines={1} style={styles.pulseBig}>
              {artist.name}
            </Text>
            <Text numberOfLines={1} style={styles.pulseSub}>
              {plays}
              {albumText} · {formatListeningTime(artist.seconds)}
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
      <Text numberOfLines={1} style={[styles.pulseMid, { marginTop: 10 }]}>
        {artist.name}
      </Text>
      <Text numberOfLines={1} style={styles.pulseSub}>
        {plays}
        {albumText}
      </Text>
    </>
  );
}

function PeakHour({ wide, data, playIntro }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const { hours, weekdays } = data.month;
  const peak = peakIndex(hours);
  const busiest = peakIndex(weekdays);
  const max = Math.max(...hours, 1);
  return (
    <>
      <Label>Peak hour</Label>
      {!wide && <View style={styles.pulseGrow} />}
      <Text style={[styles.pulseBig, wide && { marginTop: 6 }]}>{formatHour(peak)}</Text>
      <Text style={styles.pulseSub}>
        When you listen most{wide && busiest >= 0 ? ` · busiest on ${WEEKDAY_NAMES[busiest]}` : ''}
      </Text>
      <View style={[styles.pulseHours, wide && styles.pulseHoursTall]} accessible={false}>
        {hours.map((value, hour) => (
          <Animated.View
            key={hour}
            entering={playIntro ? GROW.delay(150 + hour * 15) : undefined}
            style={[
              styles.pulseHourBar,
              hour === peak && styles.pulseFill,
              { height: `${Math.max(6, (value / max) * 100)}%` },
            ]}
          />
        ))}
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

/**
 * The cover as a record sleeve with the disc peeking out. While that song
 * plays, the disc slides a little further out and spins.
 */
function OnRepeat({ wide, data, tracksById, currentTrack, isPlaying, onPlayTrack, onOpenPlayer }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const play = usePlayButtonColors();
  const top = data.month.topTracks[0];
  const track = tracksById.get(top.id) as MusicTrack;
  const playingThis = currentTrack?.id === top.id && isPlaying;
  const size = wide ? 76 : 58;
  const button = (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={playingThis ? `${top.title} is playing. Open the player.` : `Play ${top.title}`}
      onPress={() => (currentTrack?.id === top.id ? onOpenPlayer() : onPlayTrack(track))}
      style={[styles.pulsePlay, { backgroundColor: play.background }, !wide && { width: 40, height: 40 }]}
    >
      <PlaybackGlyph mode={playingThis ? 'pause' : 'play'} color="inverse" size={wide ? 14 : 12} />
    </PressableScale>
  );
  const reps = (
    <View style={styles.pulseReps}>
      <Text style={styles.pulseRepsNumber}>{top.plays}</Text>
      <Text style={styles.pulseRepsUnit}>{top.plays === 1 ? 'play' : 'plays'}</Text>
    </View>
  );
  if (wide) {
    return (
      <>
        <Label>On repeat</Label>
        <View style={styles.pulseMediaRow}>
          <Record track={track} size={size} spinning={playingThis} />
          <View style={styles.homeSongCopy}>
            <Text numberOfLines={1} style={styles.pulseMid}>
              {top.title}
            </Text>
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
        <Record track={track} size={size} spinning={playingThis} />
        {button}
      </View>
      <Text numberOfLines={1} style={[styles.pulseMid, { marginTop: 10 }]}>
        {top.title}
      </Text>
      {reps}
    </>
  );
}

function Record({ track, size, spinning }: { track: MusicTrack; size: number; spinning: boolean }) {
  const styles = useAppStyles();
  const angle = useSharedValue(0);
  const out = useSharedValue(spinning ? 1 : 0);
  useEffect(() => {
    out.set(withTiming(spinning ? 1 : 0, { duration: 600, easing: EASE_OUT }));
    if (spinning) {
      angle.set(withRepeat(withTiming(angle.get() + 360, { duration: 2400, easing: Easing.linear }), -1));
    } else {
      // Stops where it is, like a record lifted off the platter.
      cancelAnimation(angle);
    }
  }, [angle, out, spinning]);
  const discStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: out.get() * size * 0.13 }, { rotate: `${angle.get()}deg` }],
  }));
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
          <View style={{ width: disc * 0.06, height: disc * 0.06, borderRadius: disc, backgroundColor: '#0D0E0B' }} />
        </View>
      </Animated.View>
      <View style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 3, height: 0 }, elevation: 4, borderRadius: 10 }}>
        <AlbumArtwork track={track} size={size} radius={10} />
      </View>
    </View>
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
      <Text numberOfLines={1} style={styles.pulseBig}>
        {shares[0].name}
      </Text>
      <Text style={styles.pulseSub}>{percent(shares[0].share)} of plays</Text>
      <View style={styles.pulseMeter} accessible={false}>
        {shares.map((genre, index) => (
          <View key={genre.name} style={[styles.pulseFill, { width: percent(genre.share), opacity: [1, 0.55, 0.3][index] }]} />
        ))}
      </View>
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

function Explorer({ data }: BoardProps & { wide: boolean }) {
  const styles = useAppStyles();
  const { played, total } = data.coverage;
  return (
    <>
      <Label>Explorer</Label>
      <View style={styles.pulseGrow} />
      <Text style={styles.pulseBig}>{data.month.firstListens} new</Text>
      <Text style={styles.pulseSub}>
        {played} of {total} songs heard
      </Text>
      <View style={styles.pulseMeter} accessible={false}>
        <View style={[styles.pulseFill, { width: `${Math.max(2, (played / total) * 100)}%` }]} />
      </View>
    </>
  );
}

/** The sliders icon for Customize. */
export function CustomizeIcon() {
  const styles = useAppStyles();
  return <Ionicons accessible={false} name="options-outline" size={20} color={String(styles.homeSongTitle.color)} />;
}
