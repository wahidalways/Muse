import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
// The gesture library's ScrollView claims sideways drags before the tab swipe.
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { ListeningEvent, MusicTrack } from '../types';
import {
  computeStats,
  getCalendar,
  getGoalSummary,
  getLibraryCoverage,
  getStreaks,
  peakIndex,
  type StatsRange,
} from '../history/stats';
import { AlbumArtwork } from '../components/AlbumArtwork';
import {
  CalendarHeatmap,
  ListeningClock,
  Meter,
  RankBars,
  SegmentBar,
  TimeChart,
} from '../components/charts';
import { GoalPicker } from '../components/GoalPicker';
import { formatHour, formatListeningTime, percentChange } from '../utils/format';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT } from '../motion/motion';
import { SectionHeading } from './HomeTab';

const RANGES: { id: StatsRange; label: string; period: string }[] = [
  { id: '7d', label: '7 days', period: 'last week' },
  { id: '30d', label: '30 days', period: 'the 30 days before' },
  { id: 'all', label: 'All time', period: '' },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR_WEEKS = 18;
const SWAP = FadeIn.duration(220).easing(EASE_OUT);

export function StatsScreen({
  history: liveHistory,
  historyLoaded,
  historyError,
  tracks,
  tracksById,
  goalMinutes,
  onChangeGoal,
  onPlayTrack,
  onBack,
}: {
  /** Plays, already without hidden folders. */
  history: ListeningEvent[];
  historyLoaded: boolean;
  historyError: string;
  /** Playable songs in included folders. */
  tracks: MusicTrack[];
  tracksById: Map<string, MusicTrack>;
  goalMinutes: number;
  onChangeGoal: (minutes: number) => void;
  onPlayTrack: (track: MusicTrack) => void;
  onBack: () => void;
}) {
  const styles = useAppStyles();
  const [range, setRange] = useState<StatsRange>('7d');
  // Charts rebuild at low priority, so playback stays quick while they do.
  const history = useDeferredValue(liveHistory);
  const lookup = (trackId: string) => tracksById.get(trackId);

  const stats = useMemo(
    () => computeStats(history, range, (id) => tracksById.get(id)),
    [range, tracksById, history],
  );
  const calendar = useMemo(
    () => getCalendar(history, (id) => tracksById.get(id), CALENDAR_WEEKS),
    [tracksById, history],
  );
  const streaks = useMemo(() => getStreaks(history), [history]);
  const goalSeconds = goalMinutes * 60;
  const goal = useMemo(
    () => getGoalSummary(history, (id) => tracksById.get(id), goalSeconds),
    [goalSeconds, tracksById, history],
  );
  const coverage = useMemo(() => getLibraryCoverage(history, tracks), [tracks, history]);

  const rangeInfo = RANGES.find((item) => item.id === range) ?? RANGES[0];
  const change = stats.previous ? percentChange(stats.seconds, stats.previous.seconds) : null;
  const peakHour = peakIndex(stats.hours);
  const peakDay = peakIndex(stats.weekdays);
  const finished = stats.skips.measured - stats.skips.skipped;
  // Day keys sort as text, so the range is everything from its first day on.
  const firstDay = stats.buckets[0]?.key ?? '';
  const goalDaysMet = [...goal.metDays].filter(
    (key) => range === 'all' || key >= firstDay,
  ).length;

  return (
    <View style={styles.tabBody}>
      <View style={styles.statsTopBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          hitSlop={8}
          onPress={onBack}
          style={styles.headerBackButton}
        >
          <Text style={styles.headerBackIcon}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.statsTitle}>
          Your stats
        </Text>
      </View>

      <View style={styles.statsSegment} accessibilityRole="tablist">
        {RANGES.map((item) => {
          const selected = item.id === range;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setRange(item.id)}
              style={[styles.statsSegmentItem, selected && styles.statsSegmentItemActive]}
            >
              <Text style={[styles.statsSegmentLabel, selected && styles.statsSegmentLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!historyLoaded ? (
        <Text style={[styles.homeMutedText, styles.statsTopGap]}>Loading your history...</Text>
      ) : historyError ? (
        <Text style={[styles.homeMutedText, styles.statsTopGap]}>{historyError}</Text>
      ) : (
        <Animated.View key={range} entering={SWAP}>
          {/* Headline */}
          <View style={styles.homeCard}>
            <Text style={styles.homeCardLabel}>LISTENING TIME</Text>
            <View style={styles.homeBigRow}>
              <Text style={styles.homeBigNumber}>{formatListeningTime(stats.seconds)}</Text>
              {change !== null && (
                <View style={styles.homeDeltaChip}>
                  <Text style={styles.homeDeltaText}>
                    {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs {rangeInfo.period}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.homeFactRow}>
              <Text style={styles.homeFact}>
                <Text style={styles.homeFactValue}>{stats.plays}</Text> plays
              </Text>
              <Text style={styles.homeFact}>
                <Text style={styles.homeFactValue}>{stats.uniqueTracks}</Text> songs
              </Text>
              <Text style={styles.homeFact}>
                <Text style={styles.homeFactValue}>{stats.uniqueArtists}</Text> artists
              </Text>
              <Text style={styles.homeFact}>
                <Text style={styles.homeFactValue}>
                  {formatListeningTime(stats.seconds / stats.dayCount)}
                </Text>{' '}
                a day
              </Text>
            </View>
            <View style={styles.homeChartWrap}>
              <TimeChart
                data={stats.buckets.map((bucket) => ({
                  label: stats.bucketUnit === 'week' ? `Week of ${bucket.label}` : bucket.label,
                  value: bucket.seconds,
                }))}
                kind={range === '7d' ? 'bars' : 'area'}
                formatValue={formatListeningTime}
                readoutPrefix={stats.bucketUnit === 'week' ? 'This week' : 'Today'}
                height={130}
                goal={stats.bucketUnit === 'day' && goalSeconds > 0 ? goalSeconds : undefined}
              />
            </View>
          </View>

          {/* Daily goal */}
          <View style={styles.homeCard}>
            {goalMinutes > 0 ? (
              <>
                <View style={styles.homeCardHeader}>
                  <Text style={styles.homeCardLabel}>
                    DAILY GOAL · {formatListeningTime(goalSeconds).toUpperCase()}
                  </Text>
                  <Text style={styles.homeFactValue}>
                    {goalDaysMet} of {stats.dayCount} days
                  </Text>
                </View>
                <Meter ratio={goalDaysMet / stats.dayCount} />
                <View style={styles.homeFactRow}>
                  <Text style={styles.homeFact}>
                    <Text style={styles.homeFactValue}>{goal.streaks.current}</Text>
                    {goal.streaks.current === 1 ? ' day' : ' days'} in a row now
                  </Text>
                  <Text style={styles.homeFact}>
                    <Text style={styles.homeFactValue}>{goal.streaks.best}</Text> best run
                  </Text>
                </View>
                <Text style={styles.homeCardFootnote}>
                  Change your goal in Settings or on Home.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.homeCardLabel}>DAILY GOAL</Text>
                <Text style={styles.homeMutedText}>
                  Set a goal to see how often you reach it.
                </Text>
                <View style={styles.goalPickerWrap}>
                  <GoalPicker goalMinutes={goalMinutes} onChange={onChangeGoal} />
                </View>
              </>
            )}
          </View>

          {stats.plays === 0 ? (
            <View style={styles.homeCard}>
              <Text style={styles.homeSongTitle}>No plays in this time yet</Text>
              <Text style={styles.homeMutedText}>
                Play some songs and your charts will fill in here.
              </Text>
            </View>
          ) : (
            <>
              {/* Habits */}
              <SectionHeading
                title="Your rhythm"
                hint={
                  peakHour >= 0 && peakDay >= 0
                    ? `You listen most around ${formatHour(peakHour)}, and most on ${WEEKDAYS[peakDay]}`
                    : undefined
                }
              />
              <View style={styles.homeCard}>
                <Text style={styles.homeCardLabel}>BY HOUR</Text>
                <ListeningClock
                  hours={stats.hours}
                  size={230}
                  formatValue={formatListeningTime}
                  formatHour={formatHour}
                />
              </View>
              <View style={styles.homeCard}>
                <Text style={styles.homeCardLabel}>BY DAY OF THE WEEK</Text>
                <View style={styles.homeChartWrap}>
                  <TimeChart
                    data={stats.weekdays.map((value, index) => ({
                      label: WEEKDAYS[index],
                      value,
                    }))}
                    kind="bars"
                    formatValue={formatListeningTime}
                    readoutPrefix={peakDay >= 0 ? `Top day: ${WEEKDAYS[peakDay]}` : undefined}
                    defaultIndex={peakDay >= 0 ? peakDay : undefined}
                    height={90}
                  />
                </View>
              </View>

              {/* Top songs */}
              <SectionHeading title="Top songs" hint="Ranked by plays" />
              <View style={styles.homeCardFlush}>
                {stats.topTracks.map((item, index) => {
                  const track = lookup(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Play ${item.title}, played ${item.plays} times`}
                      accessibilityState={{ disabled: !track?.uri }}
                      disabled={!track?.uri}
                      onPress={() => track && onPlayTrack(track)}
                      style={[
                        styles.homeSongRow,
                        index === stats.topTracks.length - 1 && styles.homeSongRowLast,
                      ]}
                    >
                      <Text style={styles.chartRankNumber}>{index + 1}</Text>
                      {track ? (
                        <AlbumArtwork track={track} size={42} />
                      ) : (
                        <View style={styles.homeRecentIcon}>
                          <Text style={styles.homeRecentIconText}>♫</Text>
                        </View>
                      )}
                      <View style={styles.homeSongCopy}>
                        <Text numberOfLines={1} style={styles.homeSongTitle}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.homeSongHint}>
                          {item.artist || 'Unknown artist'} · {formatListeningTime(item.seconds)}
                        </Text>
                      </View>
                      <Text style={styles.homeSongMeta}>
                        {item.plays} {item.plays === 1 ? 'play' : 'plays'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Top artists */}
              {stats.topArtists.length > 0 && (
                <>
                  <SectionHeading title="Top artists" hint="Ranked by plays" />
                  <View style={styles.homeCard}>
                    <RankBars
                      items={stats.topArtists.map((artist) => ({
                        key: artist.name,
                        label: artist.name,
                        hint: formatListeningTime(artist.seconds),
                        value: artist.plays,
                        valueLabel: `${artist.plays} ${artist.plays === 1 ? 'play' : 'plays'}`,
                      }))}
                    />
                  </View>
                </>
              )}

              {/* Top genres */}
              <SectionHeading title="Top genres" hint="Ranked by plays" />
              <View style={styles.homeCard}>
                {stats.topGenres.length > 0 ? (
                  <>
                    <RankBars
                      items={stats.topGenres.map((genre) => ({
                        key: genre.name,
                        label: genre.name,
                        hint: formatListeningTime(genre.seconds),
                        value: genre.plays,
                        valueLabel: `${Math.round((genre.plays / stats.genrePlays) * 100)}%`,
                      }))}
                    />
                    {stats.genrePlays < stats.plays && (
                      <Text style={styles.homeCardFootnote}>
                        {stats.plays - stats.genrePlays} of {stats.plays} plays had no genre in the
                        song file, so they are left out.
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.homeMutedText}>
                    None of these songs have a genre saved in their files yet. Muse reads the
                    genre tag from each song.
                  </Text>
                )}
              </View>

              {/* Top albums */}
              {stats.topAlbums.length > 0 && (
                <>
                  <SectionHeading title="Top albums" />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.homeShelf}
                    contentContainerStyle={styles.homeShelfContent}
                  >
                    {stats.topAlbums.map((album) => {
                      const track = lookup(album.trackId);
                      return (
                        <View
                          key={album.name}
                          style={styles.homeShelfItem}
                          accessible
                          accessibilityLabel={`${album.name}, ${album.plays} plays`}
                        >
                          {track ? (
                            <AlbumArtwork track={track} size={120} />
                          ) : (
                            <View style={styles.homeArtFallback}>
                              <Text style={styles.homeRecentIconText}>♫</Text>
                            </View>
                          )}
                          <Text numberOfLines={1} style={styles.homeShelfTitle}>
                            {album.name}
                          </Text>
                          <Text numberOfLines={1} style={styles.homeShelfHint}>
                            {album.plays} {album.plays === 1 ? 'play' : 'plays'}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Folders */}
              <SectionHeading title="Top folders" hint="Where your music comes from" />
              <View style={styles.homeCard}>
                <RankBars
                  items={stats.topFolders.map((folder) => ({
                    key: folder.name,
                    label: folder.name,
                    value: folder.seconds,
                    valueLabel: formatListeningTime(folder.seconds),
                  }))}
                />
              </View>

              {/* How you listen */}
              <SectionHeading title="How you listen" />
              <View style={styles.homeCard}>
                <Text style={styles.homeCardLabel}>FINISHED OR SKIPPED</Text>
                {stats.skips.measured > 0 ? (
                  <>
                    <View style={styles.statsSegmentChart}>
                      <SegmentBar
                        segments={[
                          { label: 'Finished', value: finished, strong: true },
                          { label: 'Skipped', value: stats.skips.skipped, strong: false },
                        ]}
                      />
                    </View>
                    <Text style={styles.homeCardFootnote}>
                      A skip is a song you left in under 30 seconds.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.homeMutedText}>
                    Skips are counted for new plays. Check back after a few songs.
                  </Text>
                )}
              </View>
              <View style={styles.homeCard}>
                <Text style={styles.homeCardLabel}>NEW OR FAMILIAR</Text>
                <View style={styles.statsSegmentChart}>
                  <SegmentBar
                    segments={[
                      { label: 'First listens', value: stats.firstListens, strong: true },
                      { label: 'Replays', value: stats.plays - stats.firstListens, strong: false },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.homeCard}>
                <Text style={styles.homeCardLabel}>SESSIONS</Text>
                <View style={styles.homeFactRow}>
                  <Text style={styles.homeFact}>
                    <Text style={styles.homeFactValue}>{stats.sessions.count}</Text> sessions
                  </Text>
                  <Text style={styles.homeFact}>
                    <Text style={styles.homeFactValue}>
                      {formatListeningTime(stats.sessions.averageSeconds)}
                    </Text>{' '}
                    on average
                  </Text>
                  <Text style={styles.homeFact}>
                    <Text style={styles.homeFactValue}>
                      {formatListeningTime(stats.sessions.longestSeconds)}
                    </Text>{' '}
                    longest
                  </Text>
                </View>
                <Text style={styles.homeCardFootnote}>
                  A session ends after 10 minutes with no music.
                </Text>
              </View>
            </>
          )}
        </Animated.View>
      )}

      {historyLoaded && !historyError && (
        <>
          {/* Calendar and streaks cover all saved history, whatever the range. */}
          <SectionHeading title="Activity" hint={`The last ${CALENDAR_WEEKS} weeks`} />
          <View style={styles.homeCard}>
            <View style={styles.homeFactRow}>
              <Text style={styles.homeFact}>
                <Text style={styles.homeFactValue}>{streaks.current}</Text>
                {streaks.current === 1 ? ' day' : ' days'} in a row now
              </Text>
              <Text style={styles.homeFact}>
                <Text style={styles.homeFactValue}>{streaks.best}</Text> best streak
              </Text>
            </View>
            <View style={styles.homeChartWrap}>
              <CalendarHeatmap
                columns={calendar.columns}
                start={calendar.start}
                formatValue={formatListeningTime}
              />
            </View>
          </View>

          {coverage.total > 0 && (
            <View style={styles.homeCard}>
              <View style={styles.homeCardHeader}>
                <Text style={styles.homeCardLabel}>LIBRARY EXPLORED</Text>
                <Text style={styles.homeFactValue}>
                  {Math.round((coverage.played / coverage.total) * 100)}%
                </Text>
              </View>
              <Meter ratio={coverage.played / coverage.total} />
              <Text style={styles.homeCardFootnote}>
                You have played {coverage.played} of your {coverage.total} songs.
              </Text>
            </View>
          )}

          {stats.estimatedShare > 0 && (
            <Text style={styles.statsNote}>
              Some older times are a best guess based on song length. New plays
              are timed exactly.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
