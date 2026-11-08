import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { MusicTrack, ListeningEvent, MusicFolder } from '../types';
import {
  computeStats,
  getGoalSummary,
  getLibraryCoverage,
  getRecentTracks,
  getStreaks,
  getWeek,
} from '../history/stats';
import { getMixes } from '../history/mixes';
import { useFavoriteIds } from '../library/favorites';
import { hideRecap, markRecapSeen, usePulse } from '../settings/pulse';
import { GoalPicker } from '../components/GoalPicker';
import { Sheet } from '../components/Sheet';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT } from '../motion/motion';
import { CustomizeIcon, PulseBoard } from './pulse/PulseBoard';
import { CustomizeSheet } from './pulse/CustomizeSheet';
import { RecapStory, recapCard, useRecap } from './pulse/RecapStory';
import { ProfileSheet } from './pulse/ProfileSheet';
import { ShareSheet } from './pulse/ShareSheet';
import { Avatar } from '../components/Avatar';
import { BrandMark } from '../components/Brand';
import { greetingParts } from '../utils/greeting';
import { useProfile } from '../settings/profile';

/**
 * Home: your listening at a glance, as a board of widgets you can show,
 * hide, reorder and resize. Its entrance plays once per launch, not on every
 * tab switch, since it's the screen people return to most.
 */
let hasPlayedIntro = false;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];


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
  onOpenStats: () => void;
  goalMinutes: number;
  onChangeGoal: (minutes: number) => void;
  onRefresh: () => void;
  isLoading: boolean;
}) {
  const styles = useAppStyles();
  const [playIntro] = useState(() => !hasPlayedIntro);
  useEffect(() => {
    hasPlayedIntro = true;
  }, []);
  const favorites = useFavoriteIds();
  const { board, weekStart, recapSeen, recapHidden } = usePulse();
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profile = useProfile();
  const name = profile.name.trim();
  // Stats rebuild at low priority, so a new song's title and button show
  // first and the numbers catch up a moment later.
  const history = useDeferredValue(liveHistory);
  const goalSeconds = goalMinutes * 60;

  const data = useMemo(() => {
    const lookup = (id: string) => tracksById.get(id);
    const month = computeStats(history, '30d', lookup);
    // The top artist's albums, one cover each, so the tile shows the artist rather than one song.
    const topArtist = month.topArtists[0]?.name;
    const albums = new Map<string, MusicTrack>();
    tracks.forEach((track) => {
      const album = track.album || track.title;
      if (topArtist && track.artist === topArtist && !albums.has(album)) {
        albums.set(album, track);
      }
    });
    return {
      week: getWeek(history, lookup, weekStart),
      month,
      artistAlbums: [...albums.values()],
      goalSeconds,
      todaySeconds: getGoalSummary(history, lookup, goalSeconds).todaySeconds,
      streak: getStreaks(history),
      coverage: getLibraryCoverage(history, tracks),
      recent: getRecentTracks(history, 12),
      mixes: getMixes(history, tracks, favorites),
    };
  }, [favorites, goalSeconds, history, tracks, tracksById, weekStart]);

  const recap = useRecap(history, tracksById, goalSeconds, weekStart);

  const hiddenFolderCount = folders.filter((folder) => blockedFolderIds.includes(folder.id)).length;
  // The mini player has no room for errors, so Home says them here instead of the date.
  const notice = playbackError || (!historyLoaded ? 'Loading your listening...' : historyError);

  return (
    <View style={styles.tabBody}>
      {/* The logo row, with Home's own buttons on it. */}
      <View style={styles.header}>
        <BrandMark />
        <View style={styles.pulseRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Customize Home"
          onPress={() => setIsCustomizing(true)}
          style={styles.pulseIconButton}
        >
          <CustomizeIcon />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          onPress={() => setIsProfileOpen(true)}
          style={styles.pulseAvatarButton}
        >
          <Avatar profile={profile} size={44} />
        </Pressable>
        </View>
      </View>
      <Animated.View
        entering={playIntro ? FadeInDown.duration(360).easing(EASE_OUT) : undefined}
        style={styles.pulseHeroRow}
      >
        <Hello name={name} notice={notice} />
      </Animated.View>

      <PulseBoard
        board={board}
        data={data}
        tracksById={tracksById}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        playIntro={playIntro}
        onPlayTrack={onPlayTrack}
        onPlayMix={onPlayMix}
        onOpenPlayer={onOpenPlayer}
        onOpenStats={onOpenStats}
        onEditGoal={() => setIsEditingGoal(true)}
        onCustomize={() => setIsCustomizing(true)}
        recap={recap && recap.key !== recapHidden ? recap : null}
        recapNew={recap !== null && recap.key !== recapSeen}
        onOpenRecap={() => {
          if (recap) {
            markRecapSeen(recap.key);
            setIsRecapOpen(true);
          }
        }}
        onHideRecap={() => recap && hideRecap(recap.key)}
      />

      <Text style={styles.pulseFooter}>
        {trackCount} {trackCount === 1 ? 'song' : 'songs'} · {folders.length - hiddenFolderCount} folders
        {hiddenFolderCount > 0 ? ` · ${hiddenFolderCount} hidden` : ''} ·{' '}
        <Text
          accessibilityRole="button"
          accessibilityLabel="Scan for new music"
          onPress={isLoading ? undefined : onRefresh}
          style={styles.homeLinkLabel}
        >
          {isLoading ? 'Scanning...' : 'Scan'}
        </Text>
        {`\n© ${new Date().getFullYear()} Muse`}
      </Text>

      {recap && (
        <RecapStory
          visible={isRecapOpen}
          recap={recap}
          tracksById={tracksById}
          goalSeconds={goalSeconds}
          onPlayTrack={onPlayTrack}
          onClose={() => setIsRecapOpen(false)}
          onShare={() => {
            setIsRecapOpen(false);
            setIsSharing(true);
          }}
        />
      )}
      {recap && (
        <ShareSheet
          visible={isSharing}
          title="Share your week"
          data={recapCard(recap, tracksById, goalSeconds)}
          onClose={() => setIsSharing(false)}
        />
      )}
      <ProfileSheet visible={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <CustomizeSheet visible={isCustomizing} onClose={() => setIsCustomizing(false)} />
      <Sheet visible={isEditingGoal} eyebrow="Home" title="Daily goal" onClose={() => setIsEditingGoal(false)}>
        <View style={styles.goalPickerWrap}>
          <GoalPicker
            goalMinutes={goalMinutes}
            onChange={(minutes) => {
              onChangeGoal(minutes);
              setIsEditingGoal(false);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

/** 9:41 PM */
function clockTime(date: Date): string {
  const hours = date.getHours();
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * The greeting, then the date and a 12-hour clock. It ticks on the minute by
 * itself, so only these two lines redraw, not the whole board.
 */
function Hello({ name, notice }: { name: string; notice: string }) {
  const styles = useAppStyles();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(timer);
  }, []);
  const hello = greetingParts(now.getHours());
  return (
    <>
      <Text accessibilityRole="header" style={styles.homeHeroTitle}>
        {hello.before}
        {/* The name stands out in the accent color. */}
        {name ? (
          <>
            , <Text style={styles.pulseName}>{name}</Text>
          </>
        ) : null}
        {hello.after}
      </Text>
      <Text style={styles.homeHeroLine}>
        {notice || `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} · ${clockTime(now)}`}
      </Text>
    </>
  );
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
