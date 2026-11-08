import {
  memo,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInput,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE_OUT } from '../motion/motion';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import {
  buildSearchIndex,
  hiddenMatch,
  matchesAllWords,
  matchRanges,
  normalizeSearch,
  searchWords,
} from '../library/search';
import {
  directionLabelsFor,
  sortKindOf,
  sortMusicTracks,
  type LibrarySort,
  type SortDirection,
} from '../library/sortTracks';
import {
  groupTracks,
  sortGroups,
  type GroupSort,
  type TrackGroup,
} from '../library/browse';
import type { MusicTrack, MusicFolder } from '../types';
import type { MoreRoute } from './MoreTab';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { CoverCollage } from '../components/CoverCollage';
import { useFavoriteIds } from '../library/favorites';
import { ThemeContext } from '../theme/theme';
import { ControlIcon } from '../components/icons';
import { EqualizerBars } from '../components/EqualizerBars';
import { SearchInput } from '../components/SearchInput';
import { SortSheet, type SortChoice } from '../components/SortSheet';
import { AlphabetIndex, letterPositions } from '../components/AlphabetIndex';
import { LIBRARY_SORT_OPTIONS } from '../constants';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';
import { useBarScroll } from '../motion/barScroll';
import { formatListeningTime, formatTrackDuration } from '../utils/format';

const NO_ANCHOR = { disabled: true };
/** How far a scroll up (or down) must go to bring back (or hide) the top bar. */
const TOP_BAR_TRAVEL = 24;
const TOP_BAR_TIMING = { duration: 180, easing: EASE_OUT };
const ROW_ART = 46;
const ROW_PRESSED = { transform: [{ scale: 0.985 }] };
const CARD_PRESSED = { transform: [{ scale: 0.97 }] };
/** View and sort changes: the first rows settle in, one after another. */
const INTRO_ROWS = 12;
const INTRO_MS = 650;
const rowIntro = (index: number, kind: 'rise' | 'left' | 'right') => {
  const delay = Math.min(index, INTRO_ROWS) * 32;
  // Short travel (10-12 points) and no bounce: lists should settle, not wobble.
  if (kind === 'rise') {
    return FadeInDown.duration(380).delay(delay).easing(EASE_OUT)
      .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });
  }
  return (kind === 'left' ? FadeInLeft : FadeInRight).duration(380).delay(delay).easing(EASE_OUT)
    .withInitialValues({ opacity: 0, transform: [{ translateX: kind === 'left' ? -12 : 12 }] });
};
/** The line under the selected view: glides, no bounce. */
const UNDERLINE_TIMING = { duration: 320, easing: Easing.bezier(0.25, 0.9, 0.3, 1) };
/** The line's drawn width; scaleX stretches it to each word's width. */
const UNDERLINE_BASE = 100;

const getTrackKey = (track: MusicTrack) => track.id;
const getGroupKey = (group: TrackGroup) => group.key;

type LibraryView = 'songs' | 'albums' | 'artists';
const VIEWS: { id: LibraryView; label: string }[] = [
  { id: 'songs', label: 'Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
];

/** Sorts whose order is alphabetical, so the A-Z strip makes sense. */
const LETTER_KEYS: Partial<Record<LibrarySort, (track: MusicTrack) => string | null>> = {
  title: (track) => track.title,
  artist: (track) => track.artist,
  album: (track) => track.album,
  albumArtist: (track) => track.albumArtist ?? track.artist,
};

const SONG_SORTS: SortChoice[] = LIBRARY_SORT_OPTIONS.map((option) => ({
  ...option,
  kind: sortKindOf(option.id),
}));
const ALBUM_SORTS: SortChoice[] = [
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'artist', label: 'Artist', kind: 'text' },
  { id: 'year', label: 'Year', kind: 'date', hint: 'Of its newest song' },
  { id: 'dateAdded', label: 'Date added', kind: 'date', hint: 'Of its newest song' },
];
const ARTIST_SORTS: SortChoice[] = [
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'songCount', label: 'Number of songs', kind: 'count' },
];
type GroupSortState = { by: GroupSort; direction: SortDirection };
// shortcut: album and artist sorts last until the app closes; save them with the song sort if people want them kept.
const DEFAULT_GROUP_SORT: GroupSortState = { by: 'name', direction: 'ascending' };

/** `text` with the parts the search matched picked out in `matchStyle`. */
function withMatches(text: string, words: string[] | undefined, matchStyle: object): ReactNode {
  const ranges = words && words.length > 0 ? matchRanges(text, words) : [];
  if (ranges.length === 0) {
    return text;
  }
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], index) => {
    if (start > at) {
      parts.push(text.slice(at, start));
    }
    parts.push(
      <Text key={index} style={matchStyle}>
        {text.slice(start, end)}
      </Text>,
    );
    at = end;
  });
  if (at < text.length) {
    parts.push(text.slice(at));
  }
  return parts;
}

/** "Artist · Album", falling back to the folder for untagged files. */
function trackSubtitle(track: MusicTrack): string {
  const tagged = [track.artist, track.album].filter((value): value is string => Boolean(value));
  return tagged.length > 0 ? tagged.join(' · ') : track.folderTitle || 'Unknown artist';
}

/**
 * One song row, shared with More's lists. Memoized so a play/pause or song
 * change only re-renders the rows whose `isCurrent` or `isPlaying` changed.
 * The playing song shows moving bars over its cover; tap plays, the ⋯ button
 * (or a long press) opens the song menu.
 */
export const LibraryTrackRow = memo(function LibraryTrackRow({
  track,
  isCurrent,
  isPlaying,
  valueLabel,
  subtitle: subtitleOverride,
  highlight,
  note,
  isFavorite = false,
  onPlayTrack,
  onLongPress,
}: {
  track: MusicTrack;
  isCurrent: boolean;
  isPlaying: boolean;
  /** A small grey heart before the length. */
  isFavorite?: boolean;
  /** Shown instead of the length, for example the date when sorting by date. */
  valueLabel: string | null;
  /** Replaces "Artist · Album", for example the file name when sorting by it. */
  subtitle?: string;
  /** Search words to pick out in the title and subtitle. */
  highlight?: string[];
  /** Why a search found this song when the row would not show it ("Folder: Downloads"). */
  note?: string;
  onPlayTrack: (track: MusicTrack) => void;
  /** Opens the song menu. */
  onLongPress?: (track: MusicTrack) => void;
}) {
  const styles = useAppStyles();
  const subtitle = [note, subtitleOverride ?? trackSubtitle(track)].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isCurrent ? 'Open player for' : 'Play'} ${track.title}, ${subtitle}`}
      accessibilityState={{ selected: isCurrent, disabled: !track.uri }}
      disabled={!track.uri}
      onPress={() => onPlayTrack(track)}
      onLongPress={onLongPress ? () => onLongPress(track) : undefined}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Song options' }] : undefined}
      onAccessibilityAction={() => onLongPress?.(track)}
      style={({ pressed }) => [
        styles.libraryTrackRow,
        isCurrent && styles.libraryTrackRowPlaying,
        !track.uri && styles.libraryTrackRowDisabled,
        pressed && !isCurrent && styles.sortSheetOptionPressed,
        // A gentle give under the finger; scale only, so it is instant.
        pressed && ROW_PRESSED,
      ]}
    >
      <View style={styles.libraryArtWrap}>
        <AlbumArtwork track={track} size={ROW_ART} />
        {isCurrent && (
          <View style={styles.libraryArtOverlay}>
            <EqualizerBars playing={isPlaying} size={16} />
          </View>
        )}
      </View>
      <View style={styles.libraryTrackCopy}>
        <Text
          style={[styles.libraryTrackTitle, isCurrent && styles.libraryTrackTitleCurrent]}
          numberOfLines={1}
        >
          {withMatches(track.title, highlight, styles.libraryMatch)}
        </Text>
        <Text
          style={styles.libraryTrackSubtitle}
          numberOfLines={1}
          // A file name or path keeps its end (the name) in view.
          ellipsizeMode={subtitleOverride ? 'middle' : 'tail'}
        >
          {isCurrent && (
            <Text style={styles.libraryNowPlaying}>{isPlaying ? 'NOW PLAYING' : 'PAUSED'}  ·  </Text>
          )}
          {withMatches(subtitle, highlight, styles.libraryMatch)}
        </Text>
      </View>
      {isFavorite && (
        <Ionicons
          accessibilityLabel="Favorite"
          name="heart"
          size={12}
          style={styles.libraryTrackFavorite}
        />
      )}
      {valueLabel !== null ? (
        <Text style={[styles.libraryTrackDuration, styles.libraryTrackSortValue]}>{valueLabel}</Text>
      ) : (
        track.duration > 0 && (
          <Text style={styles.libraryTrackDuration}>{formatTrackDuration(track.duration)}</Text>
        )
      )}
      {onLongPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More options for ${track.title}`}
          hitSlop={4}
          onPress={() => onLongPress(track)}
          style={styles.libraryRowMenu}
        >
          <ControlIcon name="more" size={16} tone="muted" />
        </Pressable>
      ) : (
        <View style={{ width: 6 }} />
      )}
    </Pressable>
  );
});

export function LibraryTab({
  folders,
  tracks,
  blockedFolderIds,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onPlayAll,
  onOpenGroup,
  onOpenTrackMenu,
  onSearchEverywhere,
  searchText,
  onChangeSearchText: setSearchText,
  sortBy,
  onChangeSortBy: setSortBy,
  sortDirection,
  onChangeSortDirection: setSortDirection,
  contentContainerStyle,
}: {
  folders: MusicFolder[];
  tracks: MusicTrack[];
  blockedFolderIds: string[];
  currentTrackId: string | null;
  isPlaying: boolean;
  /** Plays `track` with the list as shown, sorted and filtered, as the queue. */
  onPlayTrack: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  /** Play (in order) or Shuffle the songs shown. */
  onPlayAll: (list: MusicTrack[], shuffle: boolean, source?: string) => void;
  /** Opens an album or artist page (in More). */
  onOpenGroup: (route: MoreRoute) => void;
  onOpenTrackMenu: (track: MusicTrack) => void;
  /** Opens the Search tab with this text, which also finds playlists and folders. */
  onSearchEverywhere: (query: string) => void;
  searchText: string;
  onChangeSearchText: (text: string) => void;
  sortBy: LibrarySort;
  onChangeSortBy: (sortBy: LibrarySort) => void;
  sortDirection: SortDirection;
  onChangeSortDirection: (direction: SortDirection) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const styles = useAppStyles();
  const { width: windowWidth } = useWindowDimensions();
  const [view, setView] = useState<LibraryView>('songs');
  // Typing stays responsive; filtering catches up a moment later.
  const deferredSearchText = useDeferredValue(searchText);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const listRef = useRef<FlashListRef<MusicTrack | TrackGroup>>(null);
  const blockedFolders = useMemo(() => new Set(blockedFolderIds), [blockedFolderIds]);
  const includedFolders = useMemo(
    () => folders.filter((folder) => !blockedFolders.has(folder.id)),
    [blockedFolders, folders],
  );
  const includedTracks = useMemo(
    () => tracks.filter((track) => !blockedFolders.has(track.folderId)),
    [blockedFolders, tracks],
  );
  // Sorting only reruns when the library or the sort choice changes, not on
  // every keystroke or playback update. Deferred, so the sheet closes and
  // the sort label updates at once while the list catches up.
  const listSortBy = useDeferredValue(sortBy);
  const listSortDirection = useDeferredValue(sortDirection);
  const sortedTracks = useMemo(
    () => sortMusicTracks(includedTracks, listSortBy, listSortDirection),
    [includedTracks, listSortBy, listSortDirection],
  );
  const searchIndex = useMemo(() => buildSearchIndex(tracks), [tracks]);
  const words = useMemo(() => searchWords(deferredSearchText), [deferredSearchText]);
  const searching = words.length > 0;
  const filteredTracks = useMemo(
    () =>
      words.length === 0
        ? sortedTracks
        : sortedTracks.filter((track) => matchesAllWords(searchIndex.get(track.id) ?? '', words)),
    [searchIndex, sortedTracks, words],
  );
  // Albums and artists are built only when their tab is open, and once per
  // library change, not on every keystroke. Each keeps its search text.
  const allGroups = useMemo(
    () =>
      view === 'songs' ? [] : groupTracks(includedTracks, view === 'albums' ? 'album' : 'artist'),
    [includedTracks, view],
  );
  const groupText = useMemo(
    () =>
      new Map(
        allGroups.map((group) => [group.key, normalizeSearch(`${group.title} ${group.subtitle ?? ''}`)]),
      ),
    [allGroups],
  );
  const [albumSort, setAlbumSort] = useState<GroupSortState>(DEFAULT_GROUP_SORT);
  const [artistSort, setArtistSort] = useState<GroupSortState>(DEFAULT_GROUP_SORT);
  const groupSort = view === 'albums' ? albumSort : artistSort;
  const sortedGroups = useMemo(
    () => (view === 'songs' ? [] : sortGroups(allGroups, groupSort.by, groupSort.direction)),
    [allGroups, groupSort.by, groupSort.direction, view],
  );
  const groups = useMemo(
    () =>
      words.length === 0
        ? sortedGroups
        : sortedGroups.filter((group) => matchesAllWords(groupText.get(group.key) ?? '', words)),
    [groupText, sortedGroups, words],
  );
  // The sort for whichever tab is open: songs, albums or artists.
  const sortChoices = view === 'songs' ? SONG_SORTS : view === 'albums' ? ALBUM_SORTS : ARTIST_SORTS;
  const shownSortBy: string = view === 'songs' ? sortBy : groupSort.by;
  const shownDirection = view === 'songs' ? sortDirection : groupSort.direction;
  const shownChoice = sortChoices.find((choice) => choice.id === shownSortBy) ?? sortChoices[0];
  const selectedSortLabel = shownChoice.label;
  const directionLabels = directionLabelsFor(shownChoice.kind);
  const favoriteIds = useFavoriteIds();
  const { theme } = useContext(ThemeContext);

  // For a short moment after a view or sort change, the first rows settle in
  // one after another. Rows that mount later (scrolling) never animate.
  const [intro, setIntro] = useState<'rise' | 'left' | 'right' | null>(null);
  const introTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startIntro = useCallback((kind: 'rise' | 'left' | 'right') => {
    clearTimeout(introTimer.current);
    setIntro(kind);
    introTimer.current = setTimeout(() => setIntro(null), INTRO_MS);
  }, []);
  useEffect(() => () => clearTimeout(introTimer.current), []);

  // The line under the selected view. It lives here, not in the list header,
  // so it keeps sliding while the list (and its header) is rebuilt for the
  // new view. Moved and sized with transforms only (a fixed-width bar,
  // scaled), so it never waits on React drawing the new list.
  const viewIndex = VIEWS.findIndex((option) => option.id === view);
  const [tabFrames, setTabFrames] = useState<({ x: number; width: number } | null)[]>([null, null, null]);
  const lineX = useSharedValue(0);
  const lineWidth = useSharedValue(0);
  const linePlaced = useRef(false);
  const placeLine = useCallback(
    (index: number, frames: ({ x: number; width: number } | null)[], animate: boolean) => {
      const frame = frames[index];
      if (!frame) {
        return;
      }
      lineX.set(animate ? withTiming(frame.x, UNDERLINE_TIMING) : frame.x);
      lineWidth.set(animate ? withTiming(frame.width, UNDERLINE_TIMING) : frame.width);
    },
    [lineWidth, lineX],
  );
  const measureTab = (index: number, x: number, width: number) => {
    const known = tabFrames[index];
    if (known && known.x === x && known.width === width) {
      return;
    }
    const next = tabFrames.map((frame, at) => (at === index ? { x, width } : frame));
    setTabFrames(next);
    // The first time the selected tab is measured, the line appears in place.
    if (index === viewIndex && !linePlaced.current) {
      linePlaced.current = true;
      placeLine(index, next, false);
    }
  };
  const lineStyle = useAnimatedStyle(() => ({
    opacity: lineWidth.get() > 0 ? 1 : 0,
    transform: [{ translateX: lineX.get() }, { scaleX: lineWidth.get() / UNDERLINE_BASE }],
  }));
  const chooseView = (next: LibraryView) => {
    if (next === view) {
      return;
    }
    hapticSelection();
    const nextIndex = VIEWS.findIndex((option) => option.id === next);
    placeLine(nextIndex, tabFrames, true);
    startIntro(nextIndex > viewIndex ? 'right' : 'left');
    setView(next);
  };

  const changeSort = useCallback(
    (nextSortBy: string, nextDirection: SortDirection) => {
      startIntro('rise');
      if (view === 'songs') {
        setSortBy(nextSortBy as LibrarySort);
        setSortDirection(nextDirection);
      } else {
        const setGroupSort = view === 'albums' ? setAlbumSort : setArtistSort;
        setGroupSort({ by: nextSortBy as GroupSort, direction: nextDirection });
      }
    },
    [setSortBy, setSortDirection, startIntro, view],
  );
  const sortButtonLabel = `Sorted by ${selectedSortLabel}, ${directionLabels[shownDirection]}. Change sorting`;
  const searchPlaceholder = view === 'songs' ? 'Search songs, artists, albums' : `Search ${view}`;
  const openSortSheet = () => {
    hapticSelection();
    setIsSortSheetOpen(true);
  };
  const reverseSort = () => {
    hapticSelection();
    changeSort(shownSortBy, shownDirection === 'ascending' ? 'descending' : 'ascending');
  };

  // The quick-return top bar. Only a change of direction flips it, so the
  // JS thread sets a flag a few times per scroll, never per frame.
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  /** Scroll offset where the header's own search row has left the screen. */
  const searchRowBottom = useRef(0);
  const lastScrollY = useRef(0);
  const scrollTravel = useRef(0);
  const [isTopBarShown, setIsTopBarShown] = useState(false);
  const barScroll = useBarScroll();
  const onListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    barScroll(event);
    const y = event.nativeEvent.contentOffset.y;
    const delta = y - lastScrollY.current;
    lastScrollY.current = y;
    if (y <= searchRowBottom.current) {
      // The header's own search is on screen.
      scrollTravel.current = 0;
      setIsTopBarShown(false);
      return;
    }
    // Distance in one direction; turning around starts the count again.
    scrollTravel.current =
      Math.sign(delta) === Math.sign(scrollTravel.current) ? scrollTravel.current + delta : delta;
    if (scrollTravel.current < -TOP_BAR_TRAVEL) {
      setIsTopBarShown(true);
    } else if (scrollTravel.current > TOP_BAR_TRAVEL) {
      setIsTopBarShown(false);
    }
  }, [barScroll]);
  const topBar = useSharedValue(0);
  useEffect(() => {
    topBar.set(withTiming(isTopBarShown ? 1 : 0, TOP_BAR_TIMING));
  }, [isTopBarShown, topBar]);
  const topBarStyle = useAnimatedStyle(() => ({
    opacity: topBar.get(),
    transform: [{ translateY: (topBar.get() - 1) * 24 }],
  }));
  /** The top bar's search: back up to the real field, ready to type. */
  const jumpToSearch = () => {
    setIsTopBarShown(false);
    void listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setTimeout(() => searchInputRef.current?.focus(), 300);
  };
  const playFromShown = useCallback(
    (track: MusicTrack) => onPlayTrack(track, filteredTracks, false, 'Library'),
    [filteredTracks, onPlayTrack],
  );

  // The A-Z strip: on Songs for alphabetical sorts, always on Albums/Artists.
  const letterKey = view === 'songs' ? LETTER_KEYS[listSortBy] : undefined;
  const positions = useMemo(() => {
    if (view === 'songs') {
      return letterKey ? letterPositions(filteredTracks.map(letterKey)) : [];
    }
    // Albums and artists: by name, or albums by artist; other orders are not A to Z.
    if (groupSort.by === 'name') {
      return letterPositions(groups.map((group) => group.title));
    }
    return groupSort.by === 'artist' ? letterPositions(groups.map((group) => group.subtitle)) : [];
  }, [filteredTracks, groupSort.by, groups, letterKey, view]);
  const albumColumns = 2;
  const { paddingTop = 0, paddingBottom = 0, paddingHorizontal = 24 } =
    (StyleSheet.flatten(contentContainerStyle) ?? {}) as {
      paddingTop?: number;
      paddingBottom?: number;
      paddingHorizontal?: number;
    };
  const jumpTo = useCallback(
    (index: number) => {
      void listRef.current?.scrollToIndex({
        // Albums sit two to a row.
        index: view === 'albums' ? Math.floor(index / albumColumns) * albumColumns : index,
        animated: false,
        viewOffset: Number(paddingTop),
      });
    },
    [paddingTop, view],
  );

  // Sorting only changes the order; rows look the same under every sort.
  const renderTrack = useCallback<ListRenderItem<MusicTrack>>(
    ({ item, index }) => {
      const isCurrent = item.id === currentTrackId;
      const hidden = searching ? hiddenMatch(item, words) : null;
      return (
        <Animated.View entering={intro && index < INTRO_ROWS ? rowIntro(index, intro) : undefined}>
          <LibraryTrackRow
            track={item}
            isCurrent={isCurrent}
            isPlaying={isCurrent && isPlaying}
            isFavorite={favoriteIds.has(item.id)}
            valueLabel={null}
            highlight={searching ? words : undefined}
            note={hidden ? `${hidden.label}: ${hidden.value}` : undefined}
            onPlayTrack={playFromShown}
            onLongPress={onOpenTrackMenu}
          />
        </Animated.View>
      );
    },
    [currentTrackId, favoriteIds, intro, isPlaying, onOpenTrackMenu, playFromShown, searching, words],
  );
  const albumArt = Math.floor((windowWidth - Number(paddingHorizontal) * 2 - 14) / 2);
  const renderGroup = useCallback<ListRenderItem<TrackGroup>>(
    ({ item, index }) => {
      const count = `${item.tracks.length} ${item.tracks.length === 1 ? 'song' : 'songs'}`;
      const entering = intro && index < INTRO_ROWS ? rowIntro(index, intro) : undefined;
      const open = () => {
        hapticSelection();
        onOpenGroup({ kind: 'group', group: view === 'albums' ? 'album' : 'artist', key: item.key });
      };
      if (view === 'albums') {
        // The album's year is its newest song's, as the Year sort uses.
        let year: number | null = null;
        for (const track of item.tracks) {
          if (track.year !== null && (year === null || track.year > year)) {
            year = track.year;
          }
        }
        const detail = year === null ? count : `${year} · ${count}`;
        return (
          <Animated.View
            entering={entering}
            style={[styles.libraryAlbumCard, index % 2 === 0 ? styles.libraryAlbumCardLeft : styles.libraryAlbumCardRight]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}, ${detail}`}
              onPress={open}
              style={({ pressed }) => pressed && CARD_PRESSED}
            >
              <AlbumArtwork track={item.tracks[0]} size={albumArt} radius={16} />
              <Text numberOfLines={1} style={styles.libraryAlbumTitle}>
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text numberOfLines={1} style={styles.libraryAlbumSubtitle}>
                  {item.subtitle}
                </Text>
              ) : null}
              <Text numberOfLines={1} style={styles.libraryAlbumDetail}>
                {detail}
              </Text>
            </Pressable>
          </Animated.View>
        );
      }
      const albumCount = new Set(item.tracks.map((track) => track.album ?? '')).size;
      const detail = `${count} · ${albumCount} ${albumCount === 1 ? 'album' : 'albums'}`;
      return (
        <Animated.View entering={entering}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${detail}`}
            onPress={open}
            style={({ pressed }) => [
              styles.libraryArtistRow,
              pressed && styles.sortSheetOptionPressed,
              pressed && ROW_PRESSED,
            ]}
          >
            {/* Up to four of the artist's album covers, in a circle. */}
            <CoverCollage tracks={item.tracks} size={56} radius={28} />
            <View style={styles.libraryTrackCopy}>
              <Text numberOfLines={1} style={styles.libraryTrackTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.libraryTrackSubtitle}>
                {detail}
              </Text>
            </View>
            <ControlIcon name="chevron-right" size={15} tone="muted" />
          </Pressable>
        </Animated.View>
      );
    },
    [albumArt, intro, onOpenGroup, styles, view],
  );
  const rowState = `${currentTrackId ?? ''}:${isPlaying}:${view}:${favoriteIds.size}:${intro ?? ''}`;
  const playable = useMemo(() => filteredTracks.filter((track) => track.uri), [filteredTracks]);
  const totalSeconds = useMemo(
    () => includedTracks.reduce((sum, track) => sum + (track.duration > 0 ? track.duration : 0), 0),
    [includedTracks],
  );
  const plural = (count: number, one: string, many: string) =>
    `${count.toLocaleString()} ${count === 1 ? one : many}`;
  // The whole library is under the title, so this line only counts what
  // differs from it: search matches, or the albums and artists.
  const countLine =
    view === 'songs'
      ? searching
        ? `${filteredTracks.length.toLocaleString()} of ${plural(includedTracks.length, 'song', 'songs')}`
        : null
      : searching
        ? `${groups.length.toLocaleString()} of ${plural(allGroups.length, view.slice(0, -1), view)}`
        : plural(groups.length, view.slice(0, -1), view);
  const showShuffle = view === 'songs' && playable.length > 0;

  // The top, in order: title and a one-line summary of the whole library,
  // the view switch, search, then one quiet line for count, Shuffle and sort.
  const listHeader = (
    <>
      <View style={styles.libraryIntro}>
        <Text accessibilityRole="header" style={styles.libraryHeading}>
          Library
        </Text>
        <Text style={styles.libraryDescription}>
          {[
            plural(includedTracks.length, 'song', 'songs'),
            totalSeconds > 0 ? formatListeningTime(totalSeconds) : null,
            plural(includedFolders.length, 'folder', 'folders'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {/* Songs, Albums, Artists: text tabs with a short line under the selected one. */}
      <View accessibilityRole="tablist" style={styles.libraryViewTabs}>
        {VIEWS.map((option, index) => {
          const selected = option.id === view;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              hitSlop={{ left: 10, right: 10 }}
              onPress={() => chooseView(option.id)}
              onLayout={(event) => measureTab(index, event.nativeEvent.layout.x, event.nativeEvent.layout.width)}
              style={styles.libraryViewTab}
            >
              <Text style={[styles.libraryViewTabLabel, selected && styles.libraryViewTabLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        <Animated.View
          pointerEvents="none"
          // Theme colors set here: the style converter has no light match for a light bar.
          style={[styles.libraryViewTabLine, { backgroundColor: theme === 'light' ? '#192218' : '#F5F5F7' }, lineStyle]}
        />
      </View>

      {/* Search gets the full width; sort moved to the line below it. */}
      <View
        style={styles.librarySearchRow}
        // Once scrolled past this row, the top bar may take over (see onListScroll).
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          searchRowBottom.current = Number(paddingTop) + y + height;
        }}
      >
        <View
          style={[
            styles.searchPill,
            styles.librarySearchField,
            isSearchFocused && styles.librarySearchFieldFocused,
          ]}
        >
          <SearchInput
            inputRef={searchInputRef}
            query={searchText}
            onChangeQuery={setSearchText}
            onFocusChange={setIsSearchFocused}
            placeholder={searchPlaceholder}
            accessibilityLabel={`Search ${view}`}
          />
        </View>
      </View>
      {/* "3 of 24 songs · Shuffle" on the left, the sort on the right. */}
      <View style={styles.libraryListMeta}>
        <View style={styles.libraryMetaLeft}>
          {countLine !== null && (
            <Text
              numberOfLines={1}
              style={styles.libraryListMetaText}
              accessibilityLiveRegion={searching ? 'polite' : 'none'}
            >
              {countLine}
              {showShuffle ? '  ·' : ''}
            </Text>
          )}
          {showShuffle && (
            // Shuffles exactly what is shown: after a search, just those songs.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Shuffle ${plural(playable.length, 'song', 'songs')}`}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => {
                hapticSelection();
                onPlayAll(playable, true, 'Library');
              }}
              style={({ pressed }) => [
                styles.libraryShuffle,
                countLine === null && styles.libraryShuffleFirst,
                pressed && styles.librarySortChipPressed,
                pressed && CARD_PRESSED,
              ]}
            >
              <ControlIcon name="shuffle" size={15} tone="accent" />
              <Text style={styles.libraryShuffleText}>Shuffle</Text>
            </Pressable>
          )}
        </View>
        {/* The arrow reverses in one tap; the words open the sheet. */}
        <View style={styles.librarySortControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reverse order. Now ${directionLabels[shownDirection]}`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
            onPress={reverseSort}
            style={({ pressed }) => [styles.librarySortReverse, pressed && styles.librarySortChipPressed]}
          >
            <ControlIcon name={shownDirection === 'ascending' ? 'sort-up' : 'sort-down'} size={14} tone="accent" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sortButtonLabel}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={openSortSheet}
            style={({ pressed }) => [styles.librarySortLink, pressed && styles.librarySortChipPressed]}
          >
            <Text numberOfLines={1} style={styles.librarySortButtonText}>
              {selectedSortLabel}
              <Text style={styles.librarySortButtonDetail}>, {directionLabels[shownDirection]}</Text>
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.libraryRows} />
    </>
  );

  const listEmpty =
    includedFolders.length === 0 ? (
      <View style={styles.emptyRotation}>
        <Text style={styles.emptyTitle}>No music in your library</Text>
        <Text style={styles.emptyDescription}>
          Turn on a music folder in Settings › Library to see its songs here.
        </Text>
      </View>
    ) : (
      <View style={styles.emptyRotation}>
        <Text style={styles.emptyTitle}>
          {searching ? `Nothing matches "${deferredSearchText.trim()}"` : `No ${view} found`}
        </Text>
        <Text style={styles.emptyDescription}>
          {searching
            ? view === 'songs'
              ? 'Try a shorter word, or an artist or album name.'
              : `Try a shorter word, or look in ${view === 'albums' ? 'Artists' : 'Albums'}.`
            : 'Rescan your music in Settings › Library to look for songs.'}
        </Text>
        {searching && (
          // Not a dead end: the Search tab also looks in playlists, genres and folders.
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Also looks in playlists, genres and folders"
            onPress={() => onSearchEverywhere(deferredSearchText.trim())}
            style={({ pressed }) => [
              styles.homeChip,
              styles.homeChipAction,
              styles.libraryEmptyAction,
              pressed && styles.librarySortChipPressed,
            ]}
          >
            <Text style={styles.homeChipActionText}>Search everywhere</Text>
          </Pressable>
        )}
      </View>
    );

  return (
    <View style={styles.mainScroll}>
      {/*
        FlashList reuses row views as they scroll off instead of creating new
        ones, which keeps scrolling smooth on slow phones. Rows must not set
        a `key` inside, or reuse is lost. Each tab is its own list.
      */}
      {view === 'songs' ? (
        <FlashList
          // A new sort rebuilds the list, so the new order settles in from the top.
          key={`songs:${listSortBy}:${listSortDirection}`}
          ref={listRef as React.Ref<FlashListRef<MusicTrack>>}
          data={filteredTracks}
          keyExtractor={getTrackKey}
          // Filtering must not scroll to wherever the old top row went (FlashList
          // keeps it in view by default, which suits chats, not search).
          maintainVisibleContentPosition={NO_ANCHOR}
          renderItem={renderTrack}
          // Rows depend on the current song and play state as well as the data.
          extraData={rowState}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          // Scrolling the results puts the keyboard away, as in Search.
          keyboardDismissMode="on-drag"
          onScroll={onListScroll}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlashList
          key={`${view}:${groupSort.by}:${groupSort.direction}`}
          ref={listRef as React.Ref<FlashListRef<TrackGroup>>}
          data={groups}
          keyExtractor={getGroupKey}
          numColumns={view === 'albums' ? albumColumns : 1}
          maintainVisibleContentPosition={NO_ANCHOR}
          renderItem={renderGroup}
          extraData={rowState}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          // Scrolling the results puts the keyboard away, as in Search.
          keyboardDismissMode="on-drag"
          onScroll={onListScroll}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
        />
      )}
      {/*
        Quick return: scrolled past the header, a slight scroll up brings back
        a top bar with search and sort, so neither needs a trip to the top.
        It only toggles on a change of direction and animates on the UI
        thread, so it never jitters with the finger.
      */}
      <Animated.View
        pointerEvents={isTopBarShown ? 'box-none' : 'none'}
        importantForAccessibility={isTopBarShown ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.libraryTopBar,
          { paddingTop: insets.top + 8, paddingHorizontal: Number(paddingHorizontal) },
          topBarStyle,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searchText ? `Search: ${searchText}. Edit search` : `Search ${view}`}
          onPress={jumpToSearch}
          style={[styles.searchPill, styles.librarySearchField]}
        >
          <ControlIcon name="search" size={18} tone="muted" />
          <Text
            numberOfLines={1}
            style={[styles.libraryTopBarText, searchText.length > 0 && styles.libraryTopBarQuery]}
          >
            {searchText || searchPlaceholder}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sortButtonLabel}
          onPress={openSortSheet}
          style={({ pressed }) => [styles.libraryTopBarSort, pressed && styles.libraryActionPressed]}
        >
          <ControlIcon name={shownDirection === 'ascending' ? 'sort-up' : 'sort-down'} size={16} tone="accent" />
        </Pressable>
      </Animated.View>
      {positions.length > 1 && (
        <AlphabetIndex
          positions={positions}
          onJump={jumpTo}
          top={Number(paddingTop) + 120}
          bottom={Number(paddingBottom)}
        />
      )}
      <SortSheet
        visible={isSortSheetOpen}
        title={`Sort ${view}`}
        choices={sortChoices}
        sortBy={shownSortBy}
        sortDirection={shownDirection}
        onChangeSort={changeSort}
        onClose={() => setIsSortSheetOpen(false)}
      />
    </View>
  );
}
