import {
  createContext,
  forwardRef,
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
  type Ref,
} from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewProps,
  type StyleProp,
  type TextInput,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE_OUT } from '../motion/motion';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  folderGroups,
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
import { LibraryTabsSheet } from '../components/LibraryTabsSheet';
import { libraryTabViews, usePreferences } from '../settings/preferences';
import { Sheet, SheetRow } from '../components/Sheet';
import { SwipeQueue } from '../components/SwipeQueue';
import { PlaylistPickerSheet } from '../components/PlaylistPickerSheet';
import { setListSort, useListSorts, type ListSort } from '../library/listSorts';
import { AlphabetIndex, letterPositions } from '../components/AlphabetIndex';
import { LIBRARY_SORT_OPTIONS } from '../constants';
import { useAppStyles } from '../theme/styles';
import { hapticImpact, hapticSelection } from '../utils/haptics';
import { setDockHidden, useBarScroll } from '../motion/barScroll';
import { sidewaysDragLock } from '../motion/gestureLock';
import { addToQueue, playNext } from '../playback/queueActions';
import { formatListeningTime, formatTrackDuration } from '../utils/format';

const NO_ANCHOR = { disabled: true };
const ROW_ART = 46;
const ROW_PRESSED = { transform: [{ scale: 0.985 }] };
const CARD_PRESSED = { transform: [{ scale: 0.97 }] };
/** Height of the slim bar under the status bar. */
const SLIM_BAR = 52;
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
const BAR_IN = FadeInUp.duration(280).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 24 }] });
const BAR_OUT = FadeOutDown.duration(180).withInitialValues({ opacity: 1, transform: [{ translateY: 0 }] });
const TOP_IN = FadeIn.duration(200);
const TOP_OUT = FadeOut.duration(160);
/** The line under the selected view: glides, no bounce. */
const UNDERLINE_TIMING = { duration: 320, easing: Easing.bezier(0.25, 0.9, 0.3, 1) };
/** The trailing edge waits this long, so the line stretches toward the new tab, then catches up. */
const UNDERLINE_TRAIL_DELAY = 90;
/** The line's drawn width; scaleX stretches it to each word's width. */
const UNDERLINE_BASE = 100;
const TOOLS_TIMING = { duration: 180, easing: EASE_OUT };

const getTrackKey = (track: MusicTrack) => track.id;
const getGroupKey = (group: TrackGroup) => group.key;

type LibraryView = 'songs' | 'albums' | 'artists' | 'folders';
const VIEW_LABELS: Record<LibraryView, string> = { songs: 'Songs', albums: 'Albums', artists: 'Artists', folders: 'Folders' };

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
const FOLDER_SORTS: SortChoice[] = [
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'songCount', label: 'Number of songs', kind: 'count' },
  { id: 'dateAdded', label: 'Date added', kind: 'date', hint: 'Of its newest song' },
];
type GroupSortState = { by: GroupSort; direction: SortDirection };
const DEFAULT_GROUP_SORT: GroupSortState = { by: 'name', direction: 'ascending' };
/** A saved album or artist sort, if it is still one of the choices. */
const savedGroupSort = (saved: ListSort | undefined, choices: SortChoice[]): GroupSortState =>
  saved && choices.some((choice) => choice.id === saved.by)
    ? { by: saved.by as GroupSort, direction: saved.direction }
    : DEFAULT_GROUP_SORT;

/**
 * The list's scroll view, from Reanimated, so the title fold reads the
 * scroll offset on the UI thread (no JS work per frame). FlashList still
 * gets its own ref and plain onScroll; the animated ref rides alongside.
 */
const FoldScrollContext = createContext<AnimatedRef<Animated.ScrollView> | null>(null);
const FoldScrollView = forwardRef(function FoldScrollView(
  props: ScrollViewProps,
  ref: Ref<ComponentRef<typeof Animated.ScrollView>>,
) {
  const animatedRef = useContext(FoldScrollContext);
  const setRef = useCallback(
    (node: ComponentRef<typeof Animated.ScrollView> | null) => {
      animatedRef?.(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [animatedRef, ref],
  );
  return <Animated.ScrollView {...props} ref={setRef} />;
});
const renderFoldScroll = (props: ScrollViewProps) => <FoldScrollView {...props} />;

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
 * The playing song shows moving bars over its cover and an accent title.
 * Tap plays; the ⋯ button opens the song menu. With `swipeable`, a drag
 * right is Play next and left is Add to queue. While `selected` is set the
 * row is in a selection: tap toggles it, and a check replaces the ⋯.
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
  swipeable = false,
  selected,
  onPlayTrack,
  onLongPress,
  onMenu,
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
  /** Drag sideways for Play next and Add to queue. */
  swipeable?: boolean;
  /** Undefined outside a selection; otherwise whether this row is picked. */
  selected?: boolean;
  onPlayTrack: (track: MusicTrack) => void;
  /** A long press: the song menu, or (Library) starting a selection. */
  onLongPress?: (track: MusicTrack) => void;
  /** The ⋯ button. Defaults to `onLongPress`. */
  onMenu?: (track: MusicTrack) => void;
}) {
  const styles = useAppStyles();
  const subtitle = [note, subtitleOverride ?? trackSubtitle(track)].filter(Boolean).join(' · ');
  const selecting = selected !== undefined;
  const openMenu = onMenu ?? onLongPress;
  const canQueue = swipeable && !selecting && Boolean(track.uri);
  const row = (
      <Pressable
        accessibilityRole={selecting ? 'checkbox' : 'button'}
        accessibilityLabel={
          selecting
            ? `${track.title}, ${subtitle}`
            : `${isCurrent ? 'Open player for' : 'Play'} ${track.title}, ${subtitle}`
        }
        accessibilityState={selecting ? { checked: selected } : { selected: isCurrent, disabled: !track.uri }}
        disabled={!selecting && !track.uri}
        onPress={() => onPlayTrack(track)}
        onLongPress={onLongPress ? () => onLongPress(track) : undefined}
        accessibilityActions={[
          ...(openMenu && !selecting ? [{ name: 'menu', label: 'Song options' }] : []),
          ...(canQueue
            ? [
                { name: 'playNext', label: 'Play next' },
                { name: 'addToQueue', label: 'Add to queue' },
              ]
            : []),
        ]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === 'playNext') playNext([track]);
          else if (action === 'addToQueue') addToQueue([track]);
          else openMenu?.(track);
        }}
        style={({ pressed }) => [
          styles.libraryTrackRow,
          // An opaque row, so the swipe strip only shows where the row slid away.
          canQueue && styles.libraryTrackRowSolid,
          isCurrent && styles.libraryTrackRowPlaying,
          selected && styles.libraryTrackRowSelected,
          !selecting && !track.uri && styles.libraryTrackRowDisabled,
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
        {selecting ? (
          // In the ⋯'s place, so nothing in the row moves.
          <View style={styles.libraryRowMenu}>
            <View style={[styles.libraryCheck, selected && styles.libraryCheckOn]}>
              {selected && <Ionicons name="checkmark" size={15} color={String(styles.primaryButtonLabel.color)} />}
            </View>
          </View>
        ) : openMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More options for ${track.title}`}
            hitSlop={4}
            onPress={() => openMenu(track)}
            style={styles.libraryRowMenu}
          >
            <ControlIcon name="more" size={16} tone="muted" />
          </Pressable>
        ) : (
          <View style={{ width: 6 }} />
        )}
      </Pressable>
  );
  // Only lists that offer the swipe pay for its gesture and strip.
  return swipeable ? (
    <SwipeQueue enabled={canQueue} onPlayNext={() => playNext([track])} onAddToQueue={() => addToQueue([track])}>
      {row}
    </SwipeQueue>
  ) : (
    row
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
  onDeleteTracks,
  onExcludeFolder,
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
  /** Deletes the files of the songs picked in a selection (one Android dialog). */
  onDeleteTracks: (tracks: MusicTrack[]) => void;
  /** Hides a folder from Muse (Settings › Library › Included folders turns it back on). */
  onExcludeFolder: (folderId: string, title: string) => void;
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
  // The tab row follows the tap at once; the heavy list swap renders behind it,
  // so the line keeps sliding instead of freezing while albums/artists build.
  const [tabView, setView] = useState<LibraryView>('songs');
  // Songs, then the two views picked in Settings › Library (or by holding a tab).
  const { libraryTabs } = usePreferences();
  const views = useMemo(
    () => (['songs', ...libraryTabViews(libraryTabs)] as LibraryView[]).map((id) => ({ id, label: VIEW_LABELS[id] })),
    [libraryTabs],
  );
  // A tab that was just taken away falls back to Songs.
  if (!views.some((option) => option.id === tabView)) {
    setView('songs');
  }
  const [isTabsSheetOpen, setIsTabsSheetOpen] = useState(false);
  const view = useDeferredValue(tabView);
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
      view === 'songs'
        ? []
        : view === 'folders'
          ? folderGroups(includedTracks)
          : groupTracks(includedTracks, view === 'albums' ? 'album' : 'artist'),
    [includedTracks, view],
  );
  const groupText = useMemo(
    () =>
      new Map(
        allGroups.map((group) => [group.key, normalizeSearch(`${group.title} ${group.subtitle ?? ''}`)]),
      ),
    [allGroups],
  );
  const listSorts = useListSorts();
  const albumSort = savedGroupSort(listSorts['library:albums'], ALBUM_SORTS);
  const artistSort = savedGroupSort(listSorts['library:artists'], ARTIST_SORTS);
  const folderSort = savedGroupSort(listSorts['library:folders'], FOLDER_SORTS);
  const groupSort = view === 'albums' ? albumSort : view === 'folders' ? folderSort : artistSort;
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
  const sortChoices =
    view === 'songs' ? SONG_SORTS : view === 'albums' ? ALBUM_SORTS : view === 'folders' ? FOLDER_SORTS : ARTIST_SORTS;
  const shownSortBy: string = view === 'songs' ? sortBy : groupSort.by;
  const shownDirection = view === 'songs' ? sortDirection : groupSort.direction;
  const shownChoice = sortChoices.find((choice) => choice.id === shownSortBy) ?? sortChoices[0];
  const selectedSortLabel = shownChoice.label;
  const directionLabels = directionLabelsFor(shownChoice.kind);
  const favoriteIds = useFavoriteIds();
  const { theme } = useContext(ThemeContext);

  // ---------------------------------------------------------------------------
  // Selection: hold a song to start; the dock steps aside for the action bar.

  const [selection, setSelection] = useState<Set<string> | null>(null);
  const isSelecting = selection !== null;
  useEffect(() => {
    setDockHidden(isSelecting);
    // The page-wide tab swipe waits too: the dock that would bring you back is gone.
    sidewaysDragLock.set(isSelecting);
    if (!isSelecting) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(null);
      return true;
    });
    return () => subscription.remove();
  }, [isSelecting]);
  useEffect(
    () => () => {
      setDockHidden(false);
      sidewaysDragLock.set(false);
    },
    [],
  );
  const toggleSelected = useCallback((track: MusicTrack) => {
    hapticSelection();
    setSelection((current) => {
      const next = new Set(current ?? []);
      if (next.has(track.id)) {
        next.delete(track.id);
      } else {
        next.add(track.id);
      }
      // Android's way: picking the last one off ends the selection.
      return next.size === 0 ? null : next;
    });
  }, []);
  const startSelection = useCallback((track: MusicTrack) => {
    hapticImpact();
    setSelection(new Set([track.id]));
  }, []);
  /** The picked songs, in the order shown. */
  const selectedTracks = useMemo(
    () => (selection ? sortedTracks.filter((track) => selection.has(track.id)) : []),
    [selection, sortedTracks],
  );
  const [pickerTracks, setPickerTracks] = useState<MusicTrack[] | null>(null);
  const [groupMenu, setGroupMenu] = useState<TrackGroup | null>(null);
  const endSelectionWith = (action: (list: MusicTrack[]) => void) => {
    const list = selectedTracks;
    setSelection(null);
    if (list.length > 0) {
      action(list);
    }
  };

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
  // A view switch starts its clock only once the new list is on screen; a
  // slow first build of albums or artists used to outlast it, so no intro.
  useEffect(() => {
    clearTimeout(introTimer.current);
    introTimer.current = setTimeout(() => setIntro(null), INTRO_MS);
  }, [view]);

  // The line under the selected view. It lives here, not in the list header,
  // so it keeps sliding while the list (and its header) is rebuilt for the
  // new view. Moved and sized with transforms only (a fixed-width bar,
  // scaled), so it never waits on React drawing the new list.
  const viewIndex = views.findIndex((option) => option.id === tabView);
  // A ref, not state: the three tabs measure in the same frame, and state
  // updates from one stale copy kept only the last tab, so the line had
  // nowhere to go on the first switch.
  const tabFrames = useRef<({ x: number; width: number } | null)[]>([null, null, null]);
  // The line's two edges, animated apart: the edge on the side it travels
  // leads and the other trails, so it stretches over then settles.
  const lineLeft = useSharedValue(0);
  const lineRight = useSharedValue(0);
  const linePlaced = useRef(false);
  const placeLine = useCallback(
    (index: number, animate: boolean) => {
      const frame = tabFrames.current[index];
      if (!frame) {
        return;
      }
      const left = frame.x;
      const right = frame.x + frame.width;
      if (!animate) {
        lineLeft.set(left);
        lineRight.set(right);
        return;
      }
      const movingRight = left > lineLeft.get();
      const edge = (to: number, trails: boolean) =>
        trails ? withDelay(UNDERLINE_TRAIL_DELAY, withTiming(to, UNDERLINE_TIMING)) : withTiming(to, UNDERLINE_TIMING);
      lineLeft.set(edge(left, movingRight));
      lineRight.set(edge(right, !movingRight));
    },
    [lineLeft, lineRight],
  );
  const measureTab = (index: number, x: number, width: number) => {
    const known = tabFrames.current[index];
    if (known && known.x === x && known.width === width) {
      return;
    }
    tabFrames.current[index] = { x, width };
    // The selected tab: first time the line appears in place; later (its bold
    // label is a little wider) it follows the new width.
    if (index === viewIndex) {
      placeLine(index, linePlaced.current);
      linePlaced.current = true;
    }
  };
  const lineStyle = useAnimatedStyle(() => {
    const width = lineRight.get() - lineLeft.get();
    return {
      opacity: width > 0 ? 1 : 0,
      transform: [{ translateX: lineLeft.get() }, { scaleX: Math.max(width, 0) / UNDERLINE_BASE }],
    };
  });
  const chooseView = (next: LibraryView) => {
    if (next === tabView) {
      return;
    }
    hapticSelection();
    setSelection(null);
    const nextIndex = views.findIndex((option) => option.id === next);
    placeLine(nextIndex, true);
    clearTimeout(introTimer.current);
    setIntro(nextIndex > viewIndex ? 'right' : 'left');
    setView(next);
  };

  const changeSort = useCallback(
    (nextSortBy: string, nextDirection: SortDirection) => {
      startIntro('rise');
      if (view === 'songs') {
        setSortBy(nextSortBy as LibrarySort);
        setSortDirection(nextDirection);
      } else {
        setListSort(`library:${view}`, { by: nextSortBy, direction: nextDirection });
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

  // ---------------------------------------------------------------------------
  // The large title folds into a slim bar as the list scrolls. The offset is
  // read on the UI thread; JS only hears when the bar's tools appear or go.

  const insets = useSafeAreaInsets();
  const slimBarHeight = insets.top + SLIM_BAR;
  const searchInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);
  /** Scroll offset where the header's search row has gone under the slim bar. */
  const searchGone = useSharedValue(Number.MAX_SAFE_INTEGER);
  const tools = useSharedValue(0);
  const [areToolsShown, setAreToolsShown] = useState(false);
  useAnimatedReaction(
    () => scrollY.get() > searchGone.get(),
    (shown, was) => {
      if (shown !== was) {
        tools.set(withTiming(shown ? 1 : 0, TOOLS_TIMING));
        scheduleOnRN(setAreToolsShown, shown);
      }
    },
  );
  const titleFoldStyle = useAnimatedStyle(() => {
    const fold = interpolate(scrollY.get(), [4, 48], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: 1 - fold,
      transform: [{ translateY: -8 * fold }, { scale: 1 - 0.06 * fold }],
    };
  });
  const slimBackStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [20, 50], [0, 1], Extrapolation.CLAMP),
  }));
  const slimTitleStyle = useAnimatedStyle(() => {
    const shown = interpolate(scrollY.get(), [36, 60], [0, 1], Extrapolation.CLAMP);
    return { opacity: shown, transform: [{ translateY: (1 - shown) * 6 }] };
  });
  const toolsStyle = useAnimatedStyle(() => ({
    opacity: tools.get(),
    transform: [{ translateY: (1 - tools.get()) * 6 }],
  }));
  const barScroll = useBarScroll();
  /** The slim bar's search: back up to the real field, ready to type. */
  const jumpToSearch = () => {
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
  const listKey =
    view === 'songs' ? `songs:${listSortBy}:${listSortDirection}` : `${view}:${groupSort.by}:${groupSort.direction}`;
  // A rebuilt list starts at the top; the fold must not stay folded from the old one.
  useEffect(() => {
    scrollY.set(0);
  }, [listKey, scrollY]);

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
            swipeable
            selected={selection ? selection.has(item.id) : undefined}
            onPlayTrack={selection ? toggleSelected : playFromShown}
            onLongPress={selection ? toggleSelected : startSelection}
            onMenu={onOpenTrackMenu}
          />
        </Animated.View>
      );
    },
    [currentTrackId, favoriteIds, intro, isPlaying, onOpenTrackMenu, playFromShown, searching, selection, startSelection, toggleSelected, words],
  );
  const albumArt = Math.floor((windowWidth - Number(paddingHorizontal) * 2 - 14) / 2);
  const renderGroup = useCallback<ListRenderItem<TrackGroup>>(
    ({ item, index }) => {
      const count = `${item.tracks.length} ${item.tracks.length === 1 ? 'song' : 'songs'}`;
      const entering = intro && index < INTRO_ROWS ? rowIntro(index, intro) : undefined;
      const open = () => {
        hapticSelection();
        onOpenGroup(
          view === 'folders'
            ? { kind: 'folder', id: item.key }
            : { kind: 'group', group: view === 'albums' ? 'album' : 'artist', key: item.key },
        );
      };
      const openMenu = () => {
        hapticImpact();
        setGroupMenu(item);
      };
      const menuAction = [{ name: 'menu', label: 'Options' }];
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
              accessibilityHint="Hold for Play next, Add to queue and more"
              accessibilityActions={menuAction}
              onAccessibilityAction={openMenu}
              onPress={open}
              onLongPress={openMenu}
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
      const detail =
        view === 'folders'
          ? [count, item.subtitle].filter(Boolean).join(' · ')
          : `${count} · ${albumCount} ${albumCount === 1 ? 'album' : 'albums'}`;
      return (
        <Animated.View entering={entering}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${detail}`}
            accessibilityActions={menuAction}
            onAccessibilityAction={openMenu}
            onPress={open}
            onLongPress={openMenu}
            style={({ pressed }) => [
              styles.libraryArtistRow,
              pressed && styles.sortSheetOptionPressed,
              pressed && ROW_PRESSED,
            ]}
          >
            {/* Up to four of the album covers inside: a circle for an artist, a rounded square for a folder. */}
            <CoverCollage tracks={item.tracks} size={56} radius={view === 'folders' ? 12 : 28} />
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
  const rowState = useMemo(
    () => ({ currentTrackId, isPlaying, view, favoriteIds, intro, selection }),
    [currentTrackId, favoriteIds, intro, isPlaying, selection, view],
  );
  /** What Shuffle plays: the songs shown, or the songs of the albums or artists shown. */
  const shuffleList = useMemo(
    () => (view === 'songs' ? filteredTracks : groups.flatMap((group) => group.tracks)).filter((track) => track.uri),
    [filteredTracks, groups, view],
  );
  const totalSeconds = useMemo(
    () => includedTracks.reduce((sum, track) => sum + (track.duration > 0 ? track.duration : 0), 0),
    [includedTracks],
  );
  const plural = (count: number, one: string, many: string) =>
    `${count.toLocaleString()} ${count === 1 ? one : many}`;
  // The title's summary counts everything, so this line only shows while searching.
  const countLine = !searching
    ? null
    : view === 'songs'
      ? `${filteredTracks.length.toLocaleString()} of ${plural(includedTracks.length, 'song', 'songs')}`
      : `${groups.length.toLocaleString()} of ${plural(allGroups.length, view.slice(0, -1), view)}`;

  // The top, in order: the title and a one-line summary (they fold away),
  // the views with the sort beside them, then search with Shuffle beside it.
  const listHeader = (
    <>
      <Animated.View style={[styles.libraryIntro, styles.libraryIntroFold, titleFoldStyle]}>
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
      </Animated.View>

      {/* Songs and two more views as text tabs (hold one to change them), the sort at the right of the same row. */}
      <View style={styles.libraryViewRow}>
        <View accessibilityRole="tablist" style={styles.libraryViewTabs}>
          {views.map((option, index) => {
            const selected = option.id === tabView;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                hitSlop={{ left: 10, right: 10 }}
                accessibilityHint="Hold to change the tabs"
                onPress={() => chooseView(option.id)}
                onLongPress={() => {
                  hapticImpact();
                  setIsTabsSheetOpen(true);
                }}
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
        {/* The arrow reverses in one tap; the name opens the sheet. */}
        <View style={styles.librarySortControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reverse order. Now ${directionLabels[shownDirection]}`}
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 2 }}
            onPress={reverseSort}
            style={({ pressed }) => [styles.librarySortReverse, pressed && styles.librarySortChipPressed]}
          >
            <ControlIcon name={shownDirection === 'ascending' ? 'sort-up' : 'sort-down'} size={14} tone="accent" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sortButtonLabel}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={openSortSheet}
            style={({ pressed }) => [styles.librarySortLink, pressed && styles.librarySortChipPressed]}
          >
            <Text numberOfLines={1} style={styles.librarySortButtonText}>
              {selectedSortLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        style={styles.librarySearchRow}
        // Once scrolled past this row, the slim bar takes over search and sort.
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          searchGone.set(Number(paddingTop) + y + height - slimBarHeight);
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
        {/* Shuffles exactly what is shown: after a search, just those songs. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Shuffle ${plural(shuffleList.length, 'song', 'songs')}`}
          disabled={shuffleList.length === 0}
          onPress={() => {
            hapticSelection();
            onPlayAll(shuffleList, true, 'Library');
          }}
          style={({ pressed }) => [
            styles.libraryShuffleButton,
            shuffleList.length === 0 && styles.libraryTrackRowDisabled,
            pressed && styles.libraryActionPressed,
            pressed && CARD_PRESSED,
          ]}
        >
          <ControlIcon name="shuffle" size={18} tone="accent" />
        </Pressable>
      </View>
      {countLine !== null && (
        <Text numberOfLines={1} style={styles.libraryCountLine} accessibilityLiveRegion="polite">
          {countLine}
        </Text>
      )}
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

  const selectedCount = selection?.size ?? 0;
  const groupKind = view === 'albums' ? 'ALBUM' : view === 'folders' ? 'FOLDER' : 'ARTIST';
  const closeGroupMenu = (then?: () => void) => {
    setGroupMenu(null);
    then?.();
  };
  const playableOf = (group: TrackGroup) => group.tracks.filter((track) => track.uri);

  return (
    <View style={styles.mainScroll}>
      {/*
        FlashList reuses row views as they scroll off instead of creating new
        ones, which keeps scrolling smooth on slow phones. Rows must not set
        a `key` inside, or reuse is lost. Each tab is its own list.
      */}
      <FoldScrollContext.Provider value={scrollRef}>
        {view === 'songs' ? (
          <FlashList
            // A new sort rebuilds the list, so the new order settles in from the top.
            key={listKey}
            ref={listRef as React.Ref<FlashListRef<MusicTrack>>}
            data={filteredTracks}
            keyExtractor={getTrackKey}
            // Filtering must not scroll to wherever the old top row went (FlashList
            // keeps it in view by default, which suits chats, not search).
            maintainVisibleContentPosition={NO_ANCHOR}
            renderItem={renderTrack}
            renderScrollComponent={renderFoldScroll}
            // Rows depend on the current song, play state and selection as well as the data.
            extraData={rowState}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            contentContainerStyle={contentContainerStyle}
            keyboardShouldPersistTaps="handled"
            // Scrolling the results puts the keyboard away, as in Search.
            keyboardDismissMode="on-drag"
            onScroll={barScroll}
            scrollEventThrottle={32}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlashList
            key={listKey}
            ref={listRef as React.Ref<FlashListRef<TrackGroup>>}
            data={groups}
            keyExtractor={getGroupKey}
            numColumns={view === 'albums' ? albumColumns : 1}
            maintainVisibleContentPosition={NO_ANCHOR}
            renderItem={renderGroup}
            renderScrollComponent={renderFoldScroll}
            extraData={rowState}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            contentContainerStyle={contentContainerStyle}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={barScroll}
            scrollEventThrottle={32}
            showsVerticalScrollIndicator={false}
          />
        )}
      </FoldScrollContext.Provider>

      {/*
        The slim bar: the page color fades in as the big title folds away,
        then search and sort join it once the header's own row has gone.
      */}
      <View
        pointerEvents="box-none"
        style={[
          styles.librarySlimBar,
          { height: slimBarHeight, paddingTop: insets.top, paddingHorizontal: Number(paddingHorizontal) },
        ]}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.librarySlimBack, slimBackStyle]} />
        <Animated.Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.librarySlimTitle, slimTitleStyle]}
        >
          Library
        </Animated.Text>
        <Animated.View
          pointerEvents={areToolsShown ? 'auto' : 'none'}
          importantForAccessibility={areToolsShown ? 'auto' : 'no-hide-descendants'}
          style={[styles.librarySlimTools, toolsStyle]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searchText ? `Search: ${searchText}. Edit search` : `Search ${view}`}
            onPress={jumpToSearch}
            style={({ pressed }) => [styles.librarySlimTool, pressed && styles.libraryActionPressed]}
          >
            <ControlIcon name="search" size={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sortButtonLabel}
            onPress={openSortSheet}
            style={({ pressed }) => [styles.librarySlimTool, pressed && styles.libraryActionPressed]}
          >
            <ControlIcon name={shownDirection === 'ascending' ? 'sort-up' : 'sort-down'} size={16} tone="accent" />
          </Pressable>
        </Animated.View>
      </View>

      {positions.length > 1 && !isSelecting && (
        <AlphabetIndex
          positions={positions}
          onJump={jumpTo}
          top={Number(paddingTop) + 120}
          bottom={Number(paddingBottom)}
        />
      )}

      {/* Selecting: a count with Cancel and Select all on top, the actions where the dock was. */}
      {isSelecting && (
        <Animated.View
          entering={TOP_IN}
          exiting={TOP_OUT}
          style={[styles.librarySelectBar, { height: slimBarHeight, paddingTop: insets.top }]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelection(null)}
            hitSlop={8}
            style={({ pressed }) => [styles.librarySelectButton, pressed && styles.libraryActionPressed]}
          >
            <Text style={styles.librarySelectButtonText}>Cancel</Text>
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.librarySelectCount}>
            {selectedCount.toLocaleString()} selected
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              hapticSelection();
              setSelection(new Set(filteredTracks.map((track) => track.id)));
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.librarySelectButton, pressed && styles.libraryActionPressed]}
          >
            <Text style={styles.librarySelectButtonText}>Select all</Text>
          </Pressable>
        </Animated.View>
      )}
      {isSelecting && (
        <Animated.View
          entering={BAR_IN}
          exiting={BAR_OUT}
          accessibilityRole="toolbar"
          accessibilityLabel={`${selectedCount} selected songs`}
          style={[styles.librarySelectActions, { bottom: insets.bottom + 14 }]}
        >
          <SelectAction icon="play" label="Play" onPress={() => endSelectionWith((list) => onPlayAll(list, false, 'Library'))} />
          <SelectAction icon="play-next" label="Play next" onPress={() => endSelectionWith(playNext)} />
          <SelectAction icon="queue-add" label="Queue" onPress={() => endSelectionWith(addToQueue)} />
          <SelectAction
            icon="playlist-add"
            label="Playlist"
            onPress={() => {
              const list = selectedTracks;
              setSelection(null);
              setPickerTracks(list);
            }}
          />
          <SelectAction icon="delete" label="Delete" danger onPress={() => endSelectionWith(onDeleteTracks)} />
        </Animated.View>
      )}

      <LibraryTabsSheet visible={isTabsSheetOpen} onClose={() => setIsTabsSheetOpen(false)} />
      <SortSheet
        visible={isSortSheetOpen}
        title={`Sort ${view}`}
        choices={sortChoices}
        sortBy={shownSortBy}
        sortDirection={shownDirection}
        onChangeSort={changeSort}
        onClose={() => setIsSortSheetOpen(false)}
      />
      {/* Hold an album or artist: play it, queue it, or add it to a playlist. */}
      <Sheet
        visible={groupMenu !== null}
        eyebrow={groupKind}
        title={groupMenu?.title ?? ''}
        onClose={() => setGroupMenu(null)}
      >
        {groupMenu && (
          <View style={styles.sheetList}>
            <SheetRow
              icon={<ControlIcon name="play" size={18} tone="accent" />}
              label="Play"
              onPress={() => closeGroupMenu(() => onPlayAll(playableOf(groupMenu), false, groupMenu.title))}
            />
            <SheetRow
              icon={<ControlIcon name="shuffle" size={18} tone="accent" />}
              label="Shuffle"
              onPress={() => closeGroupMenu(() => onPlayAll(playableOf(groupMenu), true, groupMenu.title))}
            />
            <SheetRow
              icon={<ControlIcon name="play-next" size={18} tone="accent" />}
              label="Play next"
              onPress={() => closeGroupMenu(() => playNext(groupMenu.tracks))}
            />
            <SheetRow
              icon={<ControlIcon name="queue-add" size={18} tone="accent" />}
              label="Add to queue"
              onPress={() => closeGroupMenu(() => addToQueue(groupMenu.tracks))}
            />
            <SheetRow
              icon={<ControlIcon name="playlist-add" size={18} tone="accent" />}
              label="Add to playlist"
              onPress={() => {
                const list = groupMenu.tracks;
                setGroupMenu(null);
                // The menu fades out before the picker comes up (two sheets clash on Android).
                setTimeout(() => setPickerTracks(list), 260);
              }}
            />
            {view === 'folders' && (
              <>
                <SheetRow
                  icon={<ControlIcon name="hide" size={18} tone="muted" />}
                  label="Exclude from Muse"
                  detail="Turn it on again in Settings › Library"
                  onPress={() => closeGroupMenu(() => onExcludeFolder(groupMenu.key, groupMenu.title))}
                />
                <SheetRow
                  icon={<ControlIcon name="delete" size={18} tone="muted" />}
                  label="Delete from phone"
                  detail={`${groupMenu.tracks.length} ${groupMenu.tracks.length === 1 ? 'song' : 'songs'}. Other files stay`}
                  danger
                  onPress={() => {
                    const list = groupMenu.tracks;
                    setGroupMenu(null);
                    // After the menu has gone: Android's own confirm comes up next.
                    setTimeout(() => onDeleteTracks(list), 260);
                  }}
                />
              </>
            )}
          </View>
        )}
      </Sheet>
      <PlaylistPickerSheet tracks={pickerTracks} onClose={() => setPickerTracks(null)} />
    </View>
  );
}

function SelectAction({
  icon,
  label,
  danger = false,
  onPress,
}: {
  icon: 'play' | 'play-next' | 'queue-add' | 'playlist-add' | 'delete';
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === 'Queue' ? 'Add to queue' : label === 'Playlist' ? 'Add to playlist' : label}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.librarySelectAction, pressed && styles.libraryActionPressed]}
    >
      <ControlIcon name={icon} size={20} tone={danger ? 'muted' : 'accent'} />
      <Text style={[styles.librarySelectActionText, danger && styles.sheetRowDanger]}>{label}</Text>
    </Pressable>
  );
}
