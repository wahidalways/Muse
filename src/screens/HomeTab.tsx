import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
// The gesture library's ScrollView claims sideways drags before the tab swipe.
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeOut,
  LinearTransition,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import type { MusicTrack, ListeningEvent, MusicFolder } from '../types';
import {
  computeStats,
  getGoalSummary,
  getLibraryCoverage,
  getRecentTracks,
  getStreaks,
  peakIndex,
} from '../history/stats';
import { getMixes, type Mix } from '../history/mixes';
import { useFavoriteIds } from '../library/favorites';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { CoverCollage } from '../components/CoverCollage';
import { EqualizerBars } from '../components/EqualizerBars';
import { ListeningClock, Meter, ProgressRing, TimeChart } from '../components/charts';
import { GoalPicker } from '../components/GoalPicker';
import { ControlIcon } from '../components/icons';
import { PressableScale } from '../components/PressableScale';
import {
  formatHour,
  formatListeningTime,
  formatTimeAgo,
  percentChange,
} from '../utils/format';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT } from '../motion/motion';

/**
 * Home is the screen people return to most, so its entrance plays once per
 * launch, not on every tab switch.
 */
let hasPlayedHomeIntro = false;
const enter = (order: number) =>
  FadeInDown.duration(360).delay(order * 70).easing(EASE_OUT);
const SWAP_IN = FadeIn.duration(200).easing(EASE_OUT);
const SWAP_OUT = FadeOut.duration(150).easing(EASE_OUT);
const RESIZE = LinearTransition.duration(240).easing(EASE_OUT);
const PAGE_PADDING = 24;
const INSIGHT_GAP = 12;
/** How much of the next insight peeks in, so people know to swipe. */
const INSIGHT_PEEK = 28;

function greeting(hour: number): string {
  if (hour < 5) return 'Up late?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function partOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function HomeTab({
  trackCount,
  tracks,
  folders,
  blockedFolderIds,
  tracksById,
  history: liveHistory,
  historyLoaded,
  historyError,
  playbackError,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onPlayMix,
  onOpenPlayer,
  onOpenSearch,
  onOpenStats,
  goalMinutes,
  onChangeGoal,
  onRefresh,
  isLoading,
}: {
  trackCount: number;
  /** Playable songs in included folders. */
  tracks: MusicTrack[];
  folders: MusicFolder[];
  blockedFolderIds: string[];
  tracksById: Map<string, MusicTrack>;
  /** Plays, already without hidden folders. */
  history: ListeningEvent[];
  historyLoaded: boolean;
  historyError: string;
  playbackError: string;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: MusicTrack) => void;
  onPlayMix: (tracks: MusicTrack[], shuffle: boolean, source?: string) => void;
  onOpenPlayer: () => void;
  onOpenSearch: () => void;
  onOpenStats: () => void;
  goalMinutes: number;
  onChangeGoal: (minutes: number) => void;
  onRefresh: () => void;
  isLoading: boolean;
}) {
  const styles = useAppStyles();
  const [playIntro] = useState(() => !hasPlayedHomeIntro);
  useEffect(() => {
    hasPlayedHomeIntro = true;
  }, []);
  const favorites = useFavoriteIds();
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  // Stats rebuild at low priority, so a new song's title and button show
  // first and the numbers catch up a moment later.
  const history = useDeferredValue(liveHistory);

  const week = useMemo(
    () => computeStats(history, '7d', (id) => tracksById.get(id)),
    [history, tracksById],
  );
  const month = useMemo(
    () => computeStats(history, '30d', (id) => tracksById.get(id)),
    [history, tracksById],
  );
  const goalSeconds = goalMinutes * 60;
  const goal = useMemo(
    () => getGoalSummary(history, (id) => tracksById.get(id), goalSeconds),
    [goalSeconds, history, tracksById],
  );
  const streak = useMemo(() => getStreaks(history).current, [history]);
  const recent = useMemo(() => getRecentTracks(history, 12), [history]);
  const mixes = useMemo(() => getMixes(history, tracks, favorites), [favorites, history, tracks]);
  const coverage = useMemo(() => getLibraryCoverage(history, tracks), [history, tracks]);

  const now = new Date();
  const hasHistory = history.length > 0;
  const goalLeft = Math.max(0, goalSeconds - goal.todaySeconds);
  const change = week.previous ? percentChange(week.seconds, week.previous.seconds) : null;
  const hiddenFolderCount = folders.filter((folder) => blockedFolderIds.includes(folder.id)).length;

  // The mini player has no room for errors, so Home says them here.
  const heroLine = playbackError
    ? playbackError
    : !historyLoaded
    ? 'Loading your listening...'
    : historyError
      ? historyError
      : goalSeconds > 0
        ? goalLeft === 0
          ? 'Goal done for today. Nice work!'
          : `${formatListeningTime(goalLeft)} to go on today's goal.`
        : streak > 1
          ? `${streak} days of music in a row.`
          : hasHistory
            ? 'Set a daily goal to fill the ring.'
            : 'Play a song to start your story.';

  return (
    <View style={styles.tabBody}>
      {/* Greeting, goal ring and search, flat so the music below leads. */}
      <Animated.View
        entering={playIntro ? enter(0) : undefined}
        layout={RESIZE}
        style={styles.homeHero}
      >
        <View style={styles.homeHeroTop}>
          <View style={styles.homeHeroCopy}>
            <Text accessibilityRole="header" style={styles.homeHeroTitle}>
              {greeting(now.getHours())}
            </Text>
            <Text style={styles.homeHeroLine}>{heroLine}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              goalSeconds > 0
                ? `${formatListeningTime(goal.todaySeconds)} of your ${formatListeningTime(goalSeconds)} goal today. Change goal.`
                : `${formatListeningTime(goal.todaySeconds)} today. Set a daily goal.`
            }
            accessibilityState={{ expanded: isEditingGoal }}
            onPress={() => setIsEditingGoal((editing) => !editing)}
            style={styles.homeIconButton}
          >
            <ProgressRing
              ratio={goalSeconds > 0 ? goal.todaySeconds / goalSeconds : 0}
              size={36}
              thickness={4}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search your music"
            onPress={onOpenSearch}
            style={styles.homeIconButton}
          >
            <ControlIcon name="search" size={20} />
          </Pressable>
        </View>

        {isEditingGoal && (
          <Animated.View entering={SWAP_IN} exiting={SWAP_OUT} style={styles.goalPickerWrap}>
            <GoalPicker
              goalMinutes={goalMinutes}
              onChange={(minutes) => {
                onChangeGoal(minutes);
                setIsEditingGoal(false);
              }}
            />
          </Animated.View>
        )}
      </Animated.View>

      {/* Mixes */}
      {mixes.length > 0 && (
        <>
          <SectionHeading
            title={hasHistory ? 'Mixes for you' : 'Start listening'}
            hint="Made from your library and plays"
          />
          <View style={styles.mixGrid}>
            {mixes.map((mix, index) => (
              <Animated.View
                key={mix.id}
                entering={playIntro ? enter(2 + index * 0.5) : undefined}
                style={styles.mixCell}
              >
                <MixTile mix={mix} onPress={() => onPlayMix(mix.tracks, mix.shuffle, mix.title)} />
              </Animated.View>
            ))}
          </View>
        </>
      )}

      {/* Jump back in */}
      {recent.length > 0 && (
        <>
          <SectionHeading title="Jump back in" hint="Pick up where you left off" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.homeShelf}
            contentContainerStyle={styles.homeShelfContent}
          >
            {recent.map((event, index) => {
              const track = tracksById.get(event.trackId);
              const isCurrent = currentTrack?.id === event.trackId;
              return (
                <Animated.View
                  key={event.trackId}
                  entering={playIntro && index < 5 ? FadeInRight.duration(380).delay(200 + index * 60).easing(EASE_OUT) : undefined}
                >
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={isCurrent ? `Now playing, ${event.title}` : `Play ${event.title}`}
                    accessibilityState={{ disabled: !track?.uri }}
                    disabled={!track?.uri}
                    onPress={() => track && (isCurrent ? onOpenPlayer() : onPlayTrack(track))}
                    style={styles.homeShelfItem}
                  >
                    <View>
                      {track ? (
                        <AlbumArtwork track={track} size={128} />
                      ) : (
                        <View style={styles.homeArtFallback}>
                          <Text style={styles.homeRecentIconText}>♫</Text>
                        </View>
                      )}
                      {isCurrent && (
                        <View style={styles.homeShelfPlaying}>
                          <EqualizerBars playing={isPlaying} size={14} />
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={styles.homeShelfTitle}>
                      {event.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.homeShelfHint}>
                      {isCurrent ? 'Playing now' : formatTimeAgo(event.playedAt)} ·{' '}
                      {event.artist || event.folderTitle}
                    </Text>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* Your week */}
      {hasHistory && (
        <>
          <SectionHeading title="Your week" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open all your listening stats"
            onPress={onOpenStats}
            style={styles.homeCard}
          >
            <View style={styles.homeCardHeader}>
              <View style={styles.homeBigRow}>
                <Text style={styles.homeBigNumber}>{formatListeningTime(week.seconds)}</Text>
                {change !== null && (
                  <View style={styles.homeDeltaChip}>
                    <Text style={styles.homeDeltaText}>
                      {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.homeLinkLabel}>Stats ›</Text>
            </View>
            <Text style={styles.homeFact}>
              <Text style={styles.homeFactValue}>{week.plays}</Text> plays ·{' '}
              <Text style={styles.homeFactValue}>{week.uniqueTracks}</Text> songs ·{' '}
              <Text style={styles.homeFactValue}>{week.uniqueArtists}</Text> artists
              {change !== null ? ' · vs last week' : ''}
            </Text>
            <View style={styles.homeChartWrap}>
              <TimeChart
                data={week.buckets.map((bucket) => ({ label: bucket.label, value: bucket.seconds }))}
                formatValue={formatListeningTime}
                readoutPrefix="Today"
                height={92}
                goal={goalSeconds > 0 ? goalSeconds : undefined}
                animateIn={playIntro}
              />
            </View>
          </Pressable>
        </>
      )}

      {/* Insights */}
      {month.plays > 0 && (
        <Insights month={month} coverage={coverage} tracksById={tracksById} onOpenStats={onOpenStats} />
      )}

      <View style={styles.homeFooter}>
        <Text style={styles.homeFooterText}>
          {trackCount} {trackCount === 1 ? 'song' : 'songs'} ·{' '}
          {folders.length - hiddenFolderCount} folders
          {hiddenFolderCount > 0 ? ` · ${hiddenFolderCount} hidden` : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan for new music"
          disabled={isLoading}
          hitSlop={10}
          onPress={onRefresh}
        >
          <Text style={styles.homeLinkLabel}>{isLoading ? 'Scanning...' : 'Scan'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A mix as a compact tile: a cover collage, its name and size. */
function MixTile({ mix, onPress }: { mix: Mix; onPress: () => void }) {
  const styles = useAppStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Play ${mix.title}, ${mix.hint}`}
      onPress={onPress}
      style={styles.mixTile}
    >
      <CoverCollage tracks={mix.tracks} size={52} />
      <View style={styles.homeSongCopy}>
        <Text numberOfLines={1} style={styles.homeSongTitle}>
          {mix.title}
        </Text>
        <Text numberOfLines={1} style={styles.homeSongHint}>
          {mix.shuffle ? `Shuffle · ${mix.hint}` : mix.hint}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Swipeable cards, each with one thing worth knowing about the last 30 days. */
function Insights({
  month,
  coverage,
  tracksById,
  onOpenStats,
}: {
  month: ReturnType<typeof computeStats>;
  coverage: { played: number; total: number };
  tracksById: Map<string, MusicTrack>;
  onOpenStats: () => void;
}) {
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const cardWidth = width - PAGE_PADDING * 2 - INSIGHT_PEEK;
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });

  const topArtist = month.topArtists[0];
  const topGenre = month.topGenres[0];
  const peakHour = peakIndex(month.hours);
  const cards: { key: string; node: ReactNode }[] = [];

  if (topArtist) {
    const track = tracksById.get(topArtist.trackId);
    cards.push({
      key: 'artist',
      node: (
        <View style={styles.insightRow}>
          {track && <AlbumArtwork track={track} size={84} />}
          <View style={styles.homeSongCopy}>
            <Text style={styles.homeCardLabel}>TOP ARTIST</Text>
            <Text numberOfLines={2} style={styles.insightBig}>
              {topArtist.name}
            </Text>
            <Text style={styles.homeMutedText}>
              {topArtist.plays} plays · {formatListeningTime(topArtist.seconds)}
            </Text>
          </View>
        </View>
      ),
    });
  }
  if (peakHour >= 0) {
    cards.push({
      key: 'hour',
      node: (
        <View style={styles.insightRow}>
          <ListeningClock
            hours={month.hours}
            size={124}
            formatValue={formatListeningTime}
            formatHour={formatHour}
          />
          <View style={styles.homeSongCopy}>
            <Text style={styles.homeCardLabel}>YOUR HOUR</Text>
            <Text style={styles.insightBig}>{formatHour(peakHour)}</Text>
            <Text style={styles.homeMutedText}>
              Your music peaks in the {partOfDay(peakHour)}.
            </Text>
          </View>
        </View>
      ),
    });
  }
  if (topGenre) {
    const share = topGenre.plays / month.genrePlays;
    cards.push({
      key: 'genre',
      node: (
        <View>
          <Text style={styles.homeCardLabel}>TOP GENRE</Text>
          <Text numberOfLines={1} style={styles.insightBig}>
            {topGenre.name}
          </Text>
          <Text style={[styles.homeMutedText, styles.insightGap]}>
            {Math.round(share * 100)}% of your tagged plays
          </Text>
          <Meter ratio={share} />
          {month.topGenres.length > 1 && (
            <Text numberOfLines={1} style={styles.homeCardFootnote}>
              Then {month.topGenres.slice(1, 3).map((genre) => genre.name).join(' and ')}
            </Text>
          )}
        </View>
      ),
    });
  }
  if (coverage.total > 0) {
    cards.push({
      key: 'explore',
      node: (
        <View>
          <Text style={styles.homeCardLabel}>EXPLORER</Text>
          <Text style={styles.insightBig}>
            {month.firstListens} new {month.firstListens === 1 ? 'song' : 'songs'}
          </Text>
          <Text style={[styles.homeMutedText, styles.insightGap]}>
            You have heard {coverage.played} of your {coverage.total} songs.
          </Text>
          <Meter ratio={coverage.played / coverage.total} />
        </View>
      ),
    });
  }

  // Home keeps it short. The rest lives on the Stats screen.
  cards.splice(3);
  if (cards.length === 0) {
    return null;
  }

  return (
    <>
      <SectionHeading title="Insights" hint="From the last 30 days" />
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + INSIGHT_GAP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.homeShelf}
        contentContainerStyle={styles.insightTrack}
      >
        {cards.map((card) => (
          <Pressable
            key={card.key}
            accessibilityRole="button"
            accessibilityHint="Opens your full stats"
            onPress={onOpenStats}
            style={[styles.insightCard, { width: cardWidth }]}
          >
            {card.node}
          </Pressable>
        ))}
      </Animated.ScrollView>
      {cards.length > 1 && (
        <View style={styles.insightDots} accessible={false}>
          {cards.map((card, index) => (
            <Dot key={card.key} index={index} scrollX={scrollX} step={cardWidth + INSIGHT_GAP} />
          ))}
        </View>
      )}
    </>
  );
}

/** A page dot that widens as its card scrolls into place. */
function Dot({ index, scrollX, step }: { index: number; scrollX: SharedValue<number>; step: number }) {
  const styles = useAppStyles();
  const style = useAnimatedStyle(() => {
    const position = scrollX.get() / step;
    const near = Math.max(0, 1 - Math.abs(position - index));
    return {
      width: interpolate(near, [0, 1], [6, 18]),
      opacity: interpolate(near, [0, 1], [0.35, 1]),
    };
  });
  return <Animated.View style={[styles.chartFill, styles.insightDot, style]} />;
}

export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  const styles = useAppStyles();
  return (
    <View style={styles.homeHeading}>
      <Text accessibilityRole="header" style={styles.homeHeadingTitle}>
        {title}
      </Text>
      {hint ? <Text style={styles.homeHeadingHint}>{hint}</Text> : null}
    </View>
  );
}
