import {
  memo,
  useCallback,
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
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
// The gesture-handler ScrollView takes part in touch arbitration, so a sideways
// drag on the smart lists shelf scrolls the shelf instead of switching tabs.
import { ScrollView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ListeningEvent, MusicTrack } from '../types';
import {
  groupTracks,
  smartList,
  sortGroups,
  type GroupKind,
  type GroupSort,
  type SmartListId,
  type SongList,
  type TrackGroup,
} from '../library/browse';
import { useFavoriteIds } from '../library/favorites';
import { useRatings } from '../library/ratings';
import {
  createPlaylist,
  deletePlaylist,
  movePlaylistTrack,
  removeFromPlaylist,
  renamePlaylist,
  usePlaylists,
  type Playlist,
} from '../library/playlists';
import { setListSort, useListSorts, type ListSort } from '../library/listSorts';
import {
  defaultDirectionFor,
  directionLabelsFor,
  formatShortDate,
  sortKindOf,
  sortMusicTracks,
  textSortKey,
  type LibrarySort,
  type SortDirection,
} from '../library/sortTracks';
import { LIBRARY_SORT_OPTIONS } from '../constants';
import { LibraryTrackRow } from './LibraryTab';
import { shuffleTracks } from '../playback/PlaybackController';
import { CoverCollage, PlaylistCover } from '../components/CoverCollage';
import { AddSongsSheet } from '../components/AddSongsSheet';
import { CoverPickerSheet } from '../components/CoverPickerSheet';
import { NamePrompt } from '../components/NamePrompt';
import { SearchInput } from '../components/SearchInput';
import { Sheet, SheetRow } from '../components/Sheet';
import { SortSheet, type SortChoice } from '../components/SortSheet';
import { ControlIcon, type ControlIconName } from '../components/icons';
import { PageBar } from '../components/PageBar';
import { starsLabel } from '../components/StarRating';
import { UpNextList } from '../player/UpNextList';
import { formatListeningTime, formatTimeAgo } from '../utils/format';
import { hapticSelection } from '../utils/haptics';
import { useBarScroll } from '../motion/barScroll';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT, POP_IN, PUSH_IN, useNavDirection } from '../motion/motion';
import { ConfirmSheet, type ConfirmRequest } from '../components/ConfirmSheet';

/** Where you are inside Collections (tab id 'more'). An empty stack is its main page. */
export type MoreRoute =
  | { kind: 'groups'; group: GroupKind }
  | { kind: 'group'; group: GroupKind; key: string }
  | { kind: 'smart'; id: SmartListId }
  | { kind: 'playlist'; id: string }
  /** Every device folder, from Browse. */
  | { kind: 'folders' }
  /** One device folder, from Folders or Search. */
  | { kind: 'folder'; id: string }
  /** Every playlist, from "See all" when Collections shows only the first few. */
  | { kind: 'playlists' };

/** Collections shows New playlist and this many playlists; the rest are a tap on "See all" away. */
const HOME_PLAYLISTS = 5;

const GROUP_INFO: Record<GroupKind, { title: string; one: string; label: string }> = {
  album: { title: 'Albums', one: 'album', label: 'Album' },
  artist: { title: 'Artists', one: 'artist', label: 'Artist' },
  albumArtist: { title: 'Album artists', one: 'album artist', label: 'Album artist' },
  genre: { title: 'Genres', one: 'genre', label: 'Genre' },
  year: { title: 'Years', one: 'year', label: 'Year' },
};
/** Albums and Artists live in Library, so Browse leaves them out. */
const BROWSE: (Exclude<GroupKind, 'album' | 'artist'> | 'folders')[] = ['genre', 'year', 'albumArtist', 'folders'];

/** A list's own order, offered first in its sort sheet. */
type OwnOrder = { label: string; order: Record<SortDirection, string>; hint?: string };
const LIST_SORT = 'list';

const SMART: { id: SmartListId; title: string; hint: string; empty: string; icon: ControlIconName; own?: OwnOrder; skip?: LibrarySort }[] = [
  { id: 'favorites', icon: 'heart-outline', title: 'Favorites', hint: 'Songs you loved', empty: 'Tap the heart on any song to keep it here.' },
  {
    id: 'mostPlayed', icon: 'most-played', title: 'Most played', hint: 'Your top 100 by plays', empty: 'Songs show up here as you listen.',
    own: { label: 'Plays', order: { ascending: 'Most first', descending: 'Fewest first' } },
  },
  {
    id: 'topRated', icon: 'star-outline', title: 'Top rated', hint: '4 and 5 stars', empty: 'Songs you rate 4 or 5 stars show up here.',
    own: { label: 'Rating', order: { ascending: 'Highest first', descending: 'Lowest first' } },
  },
  {
    id: 'lowRated', icon: 'low-rated', title: 'Low rated', hint: '1 and 2 stars', empty: 'Songs you rate 1 or 2 stars show up here.',
    own: { label: 'Rating', order: { ascending: 'Lowest first', descending: 'Highest first' } },
  },
  {
    id: 'recentlyAdded', icon: 'recently-added', title: 'Recently added', hint: 'Newest files first', empty: 'New songs on your phone show up here.',
    own: { label: 'Date added', order: { ascending: 'Newest first', descending: 'Oldest first' } }, skip: 'dateAdded',
  },
  {
    id: 'recentlyPlayed', icon: 'recently-played', title: 'Recently played', hint: 'Last songs you heard', empty: 'Songs show up here as you listen.',
    own: { label: 'Last played', order: { ascending: 'Latest first', descending: 'Earliest first' } },
  },
  {
    id: 'longest', icon: 'longest', title: 'Longest songs', hint: 'Longest first', empty: 'Nothing here yet.',
    own: { label: 'Duration', order: { ascending: 'Longest first', descending: 'Shortest first' } }, skip: 'duration',
  },
];

const SONG_SORT_IDS: LibrarySort[] = ['title', 'artist', 'album', 'dateAdded', 'duration'];
function songChoices(own?: OwnOrder, skip?: LibrarySort, first?: LibrarySort): SortChoice[] {
  const songs: SortChoice[] = LIBRARY_SORT_OPTIONS.filter((option) => SONG_SORT_IDS.includes(option.id) && option.id !== skip)
    .map((option) => ({ id: option.id, label: option.label, hint: option.hint, kind: sortKindOf(option.id) }))
    .sort((a, b) => Number(b.id === first) - Number(a.id === first));
  // An own order sorts like a number: ascending is the list as it comes.
  return own ? [{ id: LIST_SORT, label: own.label, hint: own.hint, kind: 'number', orderLabels: own.order }, ...songs] : songs;
}
const PLAYLIST_SONG_SORTS = songChoices({
  label: 'Playlist order',
  order: { ascending: 'As arranged', descending: 'Reversed' },
  hint: 'The order you arranged',
});
const ALBUM_SONG_SORTS = songChoices({ label: 'Track order', order: { ascending: 'First to last', descending: 'Last to first' } });
const GROUP_SONG_SORTS = songChoices(undefined, undefined, 'album');
const SMART_SORTS = Object.fromEntries(SMART.map((list) => [list.id, songChoices(list.own, list.skip)])) as Record<SmartListId, SortChoice[]>;
const PLAYLIST_SORTS: SortChoice[] = [
  { id: 'created', label: 'Date created', kind: 'date' },
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'songs', label: 'Number of songs', kind: 'count' },
  { id: 'length', label: 'Length', kind: 'duration' },
];
const GROUP_LIST_SORTS: SortChoice[] = [
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'songCount', label: 'Number of songs', kind: 'count' },
];
const YEAR_LIST_SORTS: SortChoice[] = [{ id: 'year', label: 'Year', kind: 'date' }, GROUP_LIST_SORTS[1]];

/** The saved sort for a list, or its first choice in that choice's usual order. */
function pickSort(saved: ListSort | undefined, choices: SortChoice[]): { choice: SortChoice; direction: SortDirection } {
  const match = saved && choices.find((choice) => choice.id === saved.by);
  return match ? { choice: match, direction: saved.direction } : { choice: choices[0], direction: defaultDirectionFor(choices[0].kind) };
}
function sortSongs(base: MusicTrack[], by: string, direction: SortDirection): MusicTrack[] {
  if (by === LIST_SORT) {
    return direction === 'ascending' ? base : [...base].reverse();
  }
  return sortMusicTracks(base, by as LibrarySort, direction);
}

type PlaylistItem = { playlist: Playlist; songs: MusicTrack[]; seconds: number };
function sortPlaylists(items: PlaylistItem[], by: string, direction: SortDirection): PlaylistItem[] {
  const sign = direction === 'ascending' ? 1 : -1;
  const value = (item: PlaylistItem): string | number =>
    by === 'name' ? textSortKey(item.playlist.name)
      : by === 'songs' ? item.songs.length
        : by === 'length' ? item.seconds
          : item.playlist.createdAt;
  const byName = (a: PlaylistItem, b: PlaylistItem) => {
    const first = textSortKey(a.playlist.name);
    const second = textSortKey(b.playlist.name);
    return first < second ? -1 : first > second ? 1 : 0;
  };
  return items
    .map((item) => ({ item, value: value(item) }))
    .sort((a, b) => {
      const comparison =
        typeof a.value === 'string' ? (a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : a.value - (b.value as number);
      return sign * comparison || byName(a.item, b.item);
    })
    .map((entry) => entry.item);
}

/** Device folders as groups, so Folders lists and sorts like Genres. */
function folderGroups(tracks: MusicTrack[]): TrackGroup[] {
  const groups = new Map<string, TrackGroup>();
  for (const track of tracks) {
    const group = groups.get(track.folderId) ?? { key: track.folderId, title: track.folderTitle, subtitle: null, tracks: [] };
    group.tracks.push(track);
    groups.set(track.folderId, group);
  }
  return [...groups.values()];
}

const plural = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;
const totalSeconds = (tracks: MusicTrack[]) => tracks.reduce((sum, track) => sum + track.duration, 0);
/** "Genre · 12 songs · 48m", leaving out parts that are empty. */
const songsMeta = (prefix: string | null, tracks: MusicTrack[]) =>
  [prefix, tracks.length ? plural(tracks.length, 'song') : 'No songs yet', tracks.length ? formatListeningTime(totalSeconds(tracks)) : null]
    .filter(Boolean)
    .join(' · ');

const PAGE_IN = FadeIn.duration(200).easing(EASE_OUT);
const PRESSED = { transform: [{ scale: 0.97 }] };
const HERO_SIZE = 220;
const HERO_RADIUS = 18;
const FLIGHT = { duration: 380, easing: EASE_OUT };
const NO_TRACKS: MusicTrack[] = [];

type ViewNode = ComponentRef<typeof View>;
type Rect = { x: number; y: number; width: number; height: number };
/** Draws a cover at any size, for the copy that flies to the page header. */
type CoverRender = (size: number) => ReactNode;
type OpenRoute = (route: MoreRoute, cover: ViewNode | null, render: CoverRender) => void;
type Flight = { from: Rect; to: Rect | null; render: CoverRender };
type Hero = { style: ReturnType<typeof useAnimatedStyle>; land: (node: ViewNode | null) => void };

type Shared = {
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlayFromList: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  onOpenTrackMenu: (track: MusicTrack, playlistId?: string) => void;
  onPop: () => void;
  contentContainerStyle: StyleProp<ViewStyle>;
};

export function MoreTab({
  stack,
  onPush,
  onPop,
  tracks,
  history: liveHistory,
  currentTrackId,
  isPlaying,
  onPlayFromList,
  onOpenTrackMenu,
  contentContainerStyle,
}: {
  stack: MoreRoute[];
  onPush: (route: MoreRoute) => void;
  onPop: () => void;
  /** Playable songs in included folders. */
  tracks: MusicTrack[];
  /** Plays, already without hidden folders. */
  history: ListeningEvent[];
  currentTrackId: string | null;
  isPlaying: boolean;
  /** Plays `track` with `list` as the queue. `freshQueue` never just pauses. */
  onPlayFromList: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  onOpenTrackMenu: (track: MusicTrack, playlistId?: string) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const route = stack[stack.length - 1];
  const direction = useNavDirection(stack.length);
  // Lists rebuild at low priority, so playback stays quick while they do.
  const history = useDeferredValue(liveHistory);
  const favorites = useFavoriteIds();
  const ratings = useRatings();
  const playlists = usePlaylists();
  const sorts = useListSorts();
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);

  // ----- Cover flight: the tapped cover moves and grows into the page header -----
  // Transform only, on the UI thread, and only while a page opens.
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<ViewNode>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef<Flight | null>(null);
  useEffect(() => {
    flightRef.current = flight;
  }, [flight]);
  /** 0 while a cover is on its way, 1 once it has landed. */
  const landed = useSharedValue(1);
  const travel = useSharedValue({ dx: 0, dy: 0, scale: 1 });
  const flightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const endFlight = useCallback(() => {
    clearTimeout(flightTimer.current);
    landed.set(1);
    setFlight(null);
  }, [landed]);
  useEffect(() => () => clearTimeout(flightTimer.current), []);

  const open = useCallback<OpenRoute>(
    (next, cover, render) => {
      const root = rootRef.current;
      if (reduceMotion || !cover || !root) {
        onPush(next);
        return;
      }
      cover.measureInWindow((x, y, width, height) =>
        root.measureInWindow((rootX, rootY) => {
          landed.set(0);
          setFlight({ from: { x: x - rootX, y: y - rootY, width, height }, to: null, render });
          onPush(next);
          clearTimeout(flightTimer.current);
          // If the header is never measured, it must not stay hidden.
          flightTimer.current = setTimeout(endFlight, 900);
        }),
      );
    },
    [endFlight, landed, onPush, reduceMotion],
  );
  const land = useCallback(
    (node: ViewNode | null) => {
      const current = flightRef.current;
      const root = rootRef.current;
      if (!current || current.to || !node || !root) {
        return;
      }
      node.measureInWindow((_x, y, width, height) =>
        root.measureInWindow((_rootX, rootY) => {
          // The header cover is centred; its x is worked out, since the page may still be fading in.
          const to = { x: (windowWidth - width) / 2, y: y - rootY, width, height };
          travel.set({ dx: current.from.x - to.x, dy: current.from.y - to.y, scale: current.from.width / Math.max(1, width) });
          setFlight({ ...current, to });
        }),
      );
    },
    [travel, windowWidth],
  );
  const hasLanding = flight?.to != null;
  useEffect(() => {
    if (hasLanding) {
      landed.set(withTiming(1, FLIGHT, (finished) => {
        if (finished) {
          scheduleOnRN(endFlight);
        }
      }));
    }
  }, [endFlight, hasLanding, landed]);
  const flyerStyle = useAnimatedStyle(() => {
    const p = landed.get();
    const { dx, dy, scale } = travel.get();
    return { transform: [{ translateX: dx * (1 - p) }, { translateY: dy * (1 - p) }, { scale: scale + (1 - scale) * p }] };
  });
  const heroStyle = useAnimatedStyle(() => ({ opacity: landed.get() < 1 ? 0 : 1 }));
  const hero = useMemo<Hero>(() => ({ style: heroStyle, land }), [heroStyle, land]);

  // Built only when the page or its data changes, not on every play/pause.
  const group = useMemo(
    () => (route?.kind === 'group' ? groupTracks(tracks, route.group).find((item) => item.key === route.key) : undefined),
    [route, tracks],
  );
  const smart = useMemo(
    () => (route?.kind === 'smart' ? smartList(route.id, tracks, history, ratings, favorites) : undefined),
    [favorites, history, ratings, route, tracks],
  );
  const folderTracks = useMemo(
    () => (route?.kind === 'folder' ? tracks.filter((track) => track.folderId === route.id) : NO_TRACKS),
    [route, tracks],
  );
  const shared: Shared = { currentTrackId, isPlaying, onPlayFromList, onOpenTrackMenu, contentContainerStyle, onPop };

  let page: ReactNode;
  if (!route || route.kind === 'playlists') {
    page = (
      <CollectionsHome
        all={route?.kind === 'playlists'}
        onPop={onPop}
        tracks={tracks}
        history={history}
        favorites={favorites}
        ratings={ratings}
        playlists={playlists}
        byId={byId}
        sorts={sorts}
        onOpen={open}
        onPush={onPush}
        onPlayFromList={onPlayFromList}
        contentContainerStyle={contentContainerStyle}
      />
    );
  } else if (route.kind === 'groups' || route.kind === 'folders') {
    page = (
      <GroupsPage
        kind={route.kind === 'folders' ? 'folders' : route.group}
        tracks={tracks}
        sorts={sorts}
        onOpen={open}
        onPop={onPop}
        contentContainerStyle={contentContainerStyle}
      />
    );
  } else if (route.kind === 'group') {
    const isAlbum = route.group === 'album';
    const songs = group?.tracks ?? NO_TRACKS;
    page = (
      <SongsPage
        {...shared}
        hero={hero}
        title={group?.title ?? 'Not found'}
        meta={songsMeta(isAlbum ? group?.subtitle ?? 'Album' : GROUP_INFO[route.group].label, songs)}
        cover={(size) => <CoverCollage tracks={songs} size={size} radius={HERO_RADIUS} />}
        base={songs}
        sortKey={isAlbum ? 'collections:album' : 'collections:group'}
        choices={isAlbum ? ALBUM_SONG_SORTS : GROUP_SONG_SORTS}
        sorts={sorts}
        emptyText="These songs are no longer in your library."
      />
    );
  } else if (route.kind === 'smart') {
    const info = SMART.find((item) => item.id === route.id);
    const list = smart ?? { tracks: NO_TRACKS };
    page = (
      <SongsPage
        {...shared}
        hero={hero}
        title={info?.title ?? ''}
        meta={list.tracks.length ? songsMeta(info?.hint ?? null, list.tracks) : info?.hint ?? ''}
        cover={(size) => <CoverCollage tracks={list.tracks} size={size} radius={HERO_RADIUS} emptyIcon={info?.icon} />}
        base={list.tracks}
        sortKey={`collections:smart:${route.id}`}
        choices={SMART_SORTS[route.id]}
        sorts={sorts}
        listValue={(track) => listValue(route.id, list, track)}
        emptyText={info?.empty ?? ''}
      />
    );
  } else if (route.kind === 'folder') {
    page = (
      <SongsPage
        {...shared}
        hero={hero}
        title={folderTracks[0]?.folderTitle ?? 'Folder'}
        meta={songsMeta('Folder', folderTracks)}
        cover={(size) => <CoverCollage tracks={folderTracks} size={size} radius={HERO_RADIUS} />}
        base={folderTracks}
        sortKey="collections:folder"
        choices={GROUP_SONG_SORTS}
        sorts={sorts}
        emptyText="No songs from this folder are in your library."
      />
    );
  } else {
    const playlist = playlists.find((item) => item.id === route.id);
    page = playlist ? (
      <PlaylistPage {...shared} hero={hero} playlist={playlist} allTracks={tracks} byId={byId} sorts={sorts} />
    ) : (
      <SongsPage
        {...shared}
        hero={hero}
        title="Playlist removed"
        meta=""
        cover={(size) => <CoverCollage tracks={NO_TRACKS} size={size} radius={HERO_RADIUS} />}
        base={NO_TRACKS}
        sortKey="collections:playlist"
        choices={PLAYLIST_SONG_SORTS}
        sorts={sorts}
        emptyText="This playlist was deleted."
      />
    );
  }

  const shownFlight = flight?.to ?? flight?.from;
  return (
    <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
      <Animated.View
        key={stack.length}
        entering={flight ? PAGE_IN : direction === 'forward' ? PUSH_IN : direction === 'back' ? POP_IN : PAGE_IN}
        style={{ flex: 1 }}
      >
        {page}
      </Animated.View>
      {flight && shownFlight ? (
        // Sits where the tile was until the header is measured, then travels.
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: shownFlight.x, top: shownFlight.y, transformOrigin: 'top left' },
            flight.to ? flyerStyle : null,
          ]}
        >
          {flight.render(shownFlight.width)}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Text at the end of a smart list's rows, in its own order: plays, stars, when. */
function listValue(kind: SmartListId, list: SongList, track: MusicTrack): string | null {
  if (kind === 'recentlyAdded') return track.dateAdded ? formatShortDate(track.dateAdded) : null;
  const value = list.values?.get(track.id);
  if (value === undefined) return null;
  if (kind === 'mostPlayed') return plural(value, 'play');
  if (kind === 'topRated' || kind === 'lowRated') return starsLabel(value);
  if (kind === 'recentlyPlayed') return formatTimeAgo(value);
  return null;
}

/** The reverse arrow and the sort's name, as in Library. */
function SortControl({
  choice,
  direction,
  quietAscending = false,
  onOpen,
  onReverse,
}: {
  choice: SortChoice;
  direction: SortDirection;
  /** "Playlist order" alone reads better than "Playlist order, As arranged". */
  quietAscending?: boolean;
  onOpen: () => void;
  onReverse: () => void;
}) {
  const styles = useAppStyles();
  const order = (choice.orderLabels ?? directionLabelsFor(choice.kind))[direction];
  return (
    <View style={styles.librarySortControls}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reverse order. Now ${order}`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
        onPress={() => {
          hapticSelection();
          onReverse();
        }}
        style={({ pressed }) => [styles.librarySortReverse, pressed && styles.librarySortChipPressed]}
      >
        <ControlIcon name={direction === 'ascending' ? 'sort-up' : 'sort-down'} size={14} tone="accent" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sorted by ${choice.label}, ${order}. Change sorting`}
        hitSlop={{ top: 4, bottom: 4 }}
        onPress={() => {
          hapticSelection();
          onOpen();
        }}
        style={({ pressed }) => [styles.librarySortLink, pressed && styles.librarySortChipPressed]}
      >
        <Text numberOfLines={1} style={styles.librarySortButtonText}>
          {choice.label}
          {quietAscending && direction === 'ascending' ? null : <Text style={styles.librarySortButtonDetail}>, {order}</Text>}
        </Text>
      </Pressable>
    </View>
  );
}

/** A sort control plus its sheet, saved under `sortKey`. */
function useSortUi(sortKey: string, choices: SortChoice[], sorts: Readonly<Record<string, ListSort>>, title: string, quietAscending = false) {
  const [isOpen, setIsOpen] = useState(false);
  const { choice, direction } = pickSort(sorts[sortKey], choices);
  const control = (
    <SortControl
      choice={choice}
      direction={direction}
      quietAscending={quietAscending}
      onOpen={() => setIsOpen(true)}
      onReverse={() => setListSort(sortKey, { by: choice.id, direction: direction === 'ascending' ? 'descending' : 'ascending' })}
    />
  );
  const sheet = (
    <SortSheet
      visible={isOpen}
      eyebrow="COLLECTIONS"
      title={title}
      choices={choices}
      sortBy={choice.id}
      sortDirection={direction}
      onChangeSort={(by, next) => setListSort(sortKey, { by, direction: next })}
      onClose={() => setIsOpen(false)}
    />
  );
  return { choice, direction, control, sheet };
}

/**
 * Collections: New playlist and the first few playlists, Smart lists, Browse.
 * With `all`, the same grid is the full Playlists page: every playlist, a
 * name search, and the same sort, so the order matches what Collections shows.
 */
function CollectionsHome({
  all = false,
  onPop,
  tracks,
  history,
  favorites,
  ratings,
  playlists,
  byId,
  sorts,
  onOpen,
  onPush,
  onPlayFromList,
  contentContainerStyle,
}: {
  all?: boolean;
  onPop: () => void;
  tracks: MusicTrack[];
  history: ListeningEvent[];
  favorites: ReadonlySet<string>;
  ratings: Readonly<Record<string, number>>;
  playlists: Playlist[];
  byId: Map<string, MusicTrack>;
  sorts: Readonly<Record<string, ListSort>>;
  onOpen: OpenRoute;
  onPush: (route: MoreRoute) => void;
  onPlayFromList: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const barScroll = useBarScroll();
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const tile = (width - 48 - 12) / 2;
  const [isNaming, setIsNaming] = useState(false);
  const [menu, setMenu] = useState<{ id: string; sheet: PlaylistSheet } | null>(null);
  const sort = useSortUi('collections:playlists', PLAYLIST_SORTS, sorts, 'Sort playlists');
  // Stable, so the memoized tiles skip re-rendering on play/pause.
  const openMenu = useCallback((id: string) => setMenu({ id, sheet: 'menu' }), []);

  const items = useMemo(
    () =>
      playlists.map((playlist): PlaylistItem => {
        const songs = playlist.trackIds.map((id) => byId.get(id)).filter((track): track is MusicTrack => !!track);
        return { playlist, songs, seconds: totalSeconds(songs) };
      }),
    [byId, playlists],
  );
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => sortPlaylists(items, sort.choice.id, sort.direction), [items, sort.choice.id, sort.direction]);
  const data = useMemo<(PlaylistItem | 'new')[]>(() => {
    if (!all) {
      return ['new', ...sorted.slice(0, HOME_PLAYLISTS)];
    }
    const needle = query.trim().toLowerCase();
    return ['new', ...(needle ? sorted.filter((item) => item.playlist.name.toLowerCase().includes(needle)) : sorted)];
  }, [all, query, sorted]);
  const hidden = all ? 0 : Math.max(0, sorted.length - HOME_PLAYLISTS);
  // Recomputed when songs, plays, ratings or favorites change; not on play/pause.
  const smart = useMemo(
    () => SMART.map((info) => ({ info, tracks: smartList(info.id, tracks, history, ratings, favorites).tracks })),
    [favorites, history, ratings, tracks],
  );
  const browse = useMemo(
    () =>
      BROWSE.map((kind) => {
        const groups = kind === 'folders' ? sortGroups(folderGroups(tracks), 'name', 'ascending') : groupTracks(tracks, kind);
        return {
          kind,
          title: kind === 'folders' ? 'Folders' : GROUP_INFO[kind].title,
          count: groups.length,
          names: groups.slice(0, 3).map((group) => group.title).join(', '),
          covers: groups.map((group) => group.tracks[0]),
        };
      }),
    [tracks],
  );
  const favoriteCount = smart[0].tracks.length;
  const menuItem = menu ? items.find((item) => item.playlist.id === menu.id) : undefined;

  const header = all ? (
    <View>
      <PageBar title="Playlists" onBack={onPop} style={styles.collPageBar} />
      <View style={[styles.libraryListMeta, styles.collListMeta]}>
        <Text style={styles.libraryListMetaText}>{plural(playlists.length, 'playlist')}</Text>
        {playlists.length > 1 ? sort.control : null}
      </View>
      <View style={[styles.searchPill, styles.collSearch]}>
        <SearchInput query={query} onChangeQuery={setQuery} placeholder="Find a playlist" accessibilityLabel="Find a playlist" />
      </View>
      {query.trim() && data.length === 1 ? <Text style={styles.collRowHint}>No playlist called “{query.trim()}”.</Text> : null}
    </View>
  ) : (
    <View>
      <View style={styles.libraryIntro}>
        <Text accessibilityRole="header" style={styles.libraryHeading}>
          Collections
        </Text>
        <Text style={styles.libraryDescription}>
          {plural(playlists.length, 'playlist')} · {plural(favoriteCount, 'favorite')}
        </Text>
      </View>
      <View style={styles.collSectionHead}>
        <Text accessibilityRole="header" style={styles.collSectionTitle}>
          Playlists
        </Text>
        {playlists.length > 1 ? sort.control : null}
      </View>
    </View>
  );

  const footer = all ? null : (
    <View>
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`See all ${playlists.length} playlists`}
          onPress={() => onPush({ kind: 'playlists' })}
          style={({ pressed }) => [styles.collRow, styles.collSeeAll, pressed && styles.librarySortChipPressed]}
        >
          {/* First songs only: an empty playlist has none, and undefined crashed the collage. */}
          <CoverCollage tracks={sorted.slice(HOME_PLAYLISTS).flatMap((item) => item.songs.slice(0, 1))} size={52} radius={10} />
          <View style={styles.collRowCopy}>
            <Text numberOfLines={1} style={styles.collRowTitle}>
              See all {playlists.length} playlists
            </Text>
            <Text numberOfLines={1} style={styles.collRowHint}>
              {sorted
                .slice(HOME_PLAYLISTS, HOME_PLAYLISTS + 3)
                .map((item) => item.playlist.name)
                .join(', ')}
              {hidden > 3 ? ` and ${hidden - 3} more` : ''}
            </Text>
          </View>
          <ControlIcon name="chevron-right" size={16} tone="muted" />
        </Pressable>
      ) : null}
      <Text accessibilityRole="header" style={[styles.collSectionTitle, styles.collSectionGap]}>
        Smart lists
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.collShelf}
        contentContainerStyle={styles.collShelfContent}
      >
        {smart.map(({ info, tracks: list }) => (
          <SmartTile key={info.id} id={info.id} title={info.title} icon={info.icon} tracks={list} onOpen={onOpen} />
        ))}
      </ScrollView>
      <Text accessibilityRole="header" style={[styles.collSectionTitle, styles.collSectionGap]}>
        Browse
      </Text>
      {browse.map((entry) => (
        <Pressable
          key={entry.kind}
          accessibilityRole="button"
          accessibilityLabel={`${entry.title}, ${entry.count}`}
          onPress={() => onPush(entry.kind === 'folders' ? { kind: 'folders' } : { kind: 'groups', group: entry.kind })}
          style={({ pressed }) => [styles.collRow, pressed && styles.librarySortChipPressed]}
        >
          <CoverCollage tracks={entry.covers} size={52} radius={10} />
          <View style={styles.collRowCopy}>
            <Text numberOfLines={1} style={styles.collRowTitle}>
              {entry.title}
            </Text>
            <Text numberOfLines={1} style={styles.collRowHint}>
              {entry.names || 'None yet'}
            </Text>
          </View>
          <Text style={styles.collRowCount}>{entry.count}</Text>
          <ControlIcon name="chevron-right" size={16} tone="muted" />
        </Pressable>
      ))}
    </View>
  );

  const playItem = (item: PlaylistItem, shuffle: boolean) => {
    const playable = item.songs.filter((track) => track.uri);
    const order = shuffle ? shuffleTracks(playable) : playable;
    if (order[0]) onPlayFromList(order[0], order, true, item.playlist.name);
  };

  return (
    <>
      <FlashList
        data={data}
        numColumns={2}
        keyExtractor={(item) => (item === 'new' ? 'new' : item.playlist.id)}
        extraData={sort.choice.id}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        onScroll={barScroll}
        scrollEventThrottle={32}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item, index }) =>
          item === 'new' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New playlist"
              onPress={() => setIsNaming(true)}
              style={({ pressed }) => [styles.collTile, { width: tile }, pressed && PRESSED]}
            >
              <View style={[styles.collNewTile, { width: tile, height: tile }]}>
                <ControlIcon name="plus" size={30} tone="accent" />
              </View>
              <Text style={styles.collTileTitle}>New playlist</Text>
            </Pressable>
          ) : (
            <PlaylistTile
              item={item}
              width={tile}
              // Each column holds half the 12dp gap, so both columns end at the page margin.
              marginLeft={index % 2 ? 6 : 0}
              sortBy={sort.choice.id}
              onOpen={onOpen}
              onMenu={openMenu}
            />
          )
        }
      />
      {sort.sheet}
      <NamePrompt
        visible={isNaming}
        title="New playlist"
        actionLabel="Create playlist"
        onClose={() => setIsNaming(false)}
        onSubmit={(name) => {
          setIsNaming(false);
          onPush({ kind: 'playlist', id: createPlaylist(name) });
        }}
      />
      {menuItem && menu ? (
        <PlaylistActions
          playlist={menuItem.playlist}
          songs={menuItem.songs}
          allTracks={tracks}
          sheet={menu.sheet}
          // Stays mounted with no sheet, so a closing sheet slides away instead of vanishing.
          onSheet={(sheet) => setMenu({ id: menu.id, sheet })}
          onPlay={(shuffle) => playItem(menuItem, shuffle)}
        />
      ) : null}
    </>
  );
}

const PlaylistTile = memo(function PlaylistTile({
  item,
  width,
  marginLeft,
  sortBy,
  onOpen,
  onMenu,
}: {
  item: PlaylistItem;
  width: number;
  marginLeft: number;
  sortBy: string;
  onOpen: OpenRoute;
  onMenu: (id: string) => void;
}) {
  const styles = useAppStyles();
  const cover = useRef<ViewNode>(null);
  const { playlist, songs, seconds } = item;
  // The second line follows the sort: songs, plus the date or the length when sorted by them.
  const line =
    sortBy === 'length'
      ? formatListeningTime(seconds)
      : sortBy === 'created'
        ? `${plural(songs.length, 'song')} · ${formatShortDate(playlist.createdAt / 1000)}`
        : plural(songs.length, 'song');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${playlist.name}, ${line}`}
      accessibilityHint="Hold for options"
      onPress={() =>
        onOpen({ kind: 'playlist', id: playlist.id }, cover.current, (size) => (
          <PlaylistCover playlist={playlist} tracks={songs} size={size} radius={HERO_RADIUS} />
        ))
      }
      onLongPress={() => {
        hapticSelection();
        onMenu(playlist.id);
      }}
      style={({ pressed }) => [styles.collTile, { width, marginLeft }, pressed && PRESSED]}
    >
      <View ref={cover} collapsable={false}>
        <PlaylistCover playlist={playlist} tracks={songs} size={width} radius={14} />
      </View>
      <Text numberOfLines={1} style={styles.collTileTitle}>
        {playlist.name}
      </Text>
      <Text numberOfLines={1} style={styles.collTileHint}>
        {line}
      </Text>
    </Pressable>
  );
});

const SmartTile = memo(function SmartTile({ id, title, icon, tracks, onOpen }: { id: SmartListId; title: string; icon: ControlIconName; tracks: MusicTrack[]; onOpen: OpenRoute }) {
  const styles = useAppStyles();
  const cover = useRef<ViewNode>(null);
  const empty = tracks.length === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${empty ? 'nothing yet' : plural(tracks.length, 'song')}`}
      onPress={() =>
        onOpen({ kind: 'smart', id }, cover.current, (size) => <CoverCollage tracks={tracks} size={size} radius={HERO_RADIUS} emptyIcon={icon} />)
      }
      style={({ pressed }) => [styles.collSmart, pressed && PRESSED]}
    >
      <View ref={cover} collapsable={false} style={empty && styles.collFaded}>
        <CoverCollage tracks={tracks} size={132} radius={14} emptyIcon={icon} />
      </View>
      <Text numberOfLines={1} style={[styles.collTileTitle, empty && styles.collTileTitleMuted]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.collTileHint}>
        {empty ? 'Nothing yet' : plural(tracks.length, 'song')}
      </Text>
    </Pressable>
  );
});

/** Back on the left, and the page's menu on the right when it has one. */
function PageTop({ onPop, onMore }: { onPop: () => void; onMore?: () => void }) {
  const styles = useAppStyles();
  return (
    <View style={styles.collPageTop}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={onPop}
        style={({ pressed }) => [styles.collNavButton, pressed && PRESSED]}
      >
        <ControlIcon name="back" size={20} />
      </Pressable>
      {onMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Playlist options"
          hitSlop={8}
          onPress={onMore}
          style={({ pressed }) => [styles.collNavButton, pressed && PRESSED]}
        >
          <ControlIcon name="more" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

function GroupsPage({
  kind,
  tracks,
  sorts,
  onOpen,
  onPop,
  contentContainerStyle,
}: {
  kind: GroupKind | 'folders';
  tracks: MusicTrack[];
  sorts: Readonly<Record<string, ListSort>>;
  onOpen: OpenRoute;
  onPop: () => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const barScroll = useBarScroll();
  const styles = useAppStyles();
  const title = kind === 'folders' ? 'Folders' : GROUP_INFO[kind].title;
  const one = kind === 'folders' ? 'folder' : GROUP_INFO[kind].one;
  const sort = useSortUi(`collections:groups:${kind}`, kind === 'year' ? YEAR_LIST_SORTS : GROUP_LIST_SORTS, sorts, `Sort ${title.toLowerCase()}`);
  const groups = useMemo(() => (kind === 'folders' ? folderGroups(tracks) : groupTracks(tracks, kind)), [kind, tracks]);
  const sorted = useMemo(
    () => sortGroups(groups, sort.choice.id as GroupSort, sort.direction),
    [groups, sort.choice.id, sort.direction],
  );

  return (
    <>
      <FlashList
        data={sorted}
        keyExtractor={(group) => group.key}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        onScroll={barScroll}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <View>
            <PageBar title={title} onBack={onPop} style={styles.collPageBar} />
            <View style={[styles.libraryListMeta, styles.collListMeta]}>
              <Text style={styles.libraryListMetaText}>{plural(groups.length, one)}</Text>
              {groups.length > 1 ? sort.control : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <GroupRow
            group={item}
            kind={kind}
            onOpen={onOpen}
          />
        )}
      />
      {sort.sheet}
    </>
  );
}

const GroupRow = memo(function GroupRow({ group, kind, onOpen }: { group: TrackGroup; kind: GroupKind | 'folders'; onOpen: OpenRoute }) {
  const route: MoreRoute = kind === 'folders' ? { kind: 'folder', id: group.key } : { kind: 'group', group: kind, key: group.key };
  const styles = useAppStyles();
  const cover = useRef<ViewNode>(null);
  const albums = useMemo(() => new Set(group.tracks.map((track) => track.album ?? track.id)).size, [group.tracks]);
  const label = `${plural(group.tracks.length, 'song')} · ${plural(albums, 'album')}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.title}, ${label}`}
      onPress={() =>
        onOpen(route, cover.current, (size) => <CoverCollage tracks={group.tracks} size={size} radius={HERO_RADIUS} />)
      }
      style={({ pressed }) => [styles.collRow, pressed && styles.librarySortChipPressed]}
    >
      <View ref={cover} collapsable={false}>
        <CoverCollage tracks={group.tracks} size={56} radius={12} />
      </View>
      <View style={styles.collRowCopy}>
        <Text numberOfLines={1} style={styles.collRowTitle}>
          {group.title}
        </Text>
        <Text numberOfLines={1} style={styles.collRowHint}>
          {label}
        </Text>
      </View>
      <ControlIcon name="chevron-right" size={16} tone="muted" />
    </Pressable>
  );
});

function SongsPage({
  hero,
  title,
  meta,
  cover,
  base,
  sortKey,
  choices,
  sorts,
  listValue: valueOf,
  emptyText,
  playlist,
  editing = false,
  onMore,
  onAdd,
  onDoneEditing,
  currentTrackId,
  isPlaying,
  onPlayFromList,
  onOpenTrackMenu,
  onPop,
  contentContainerStyle,
}: Shared & {
  hero: Hero;
  title: string;
  meta: string;
  cover: CoverRender;
  /** The songs in the list's own order. */
  base: MusicTrack[];
  sortKey: string;
  choices: SortChoice[];
  sorts: Readonly<Record<string, ListSort>>;
  /** Row text for the list's own order (plays, stars...). Rows show the length without it. */
  listValue?: (track: MusicTrack) => string | null;
  emptyText: string;
  playlist?: Playlist;
  /** Playlist rows show drag handles; only in the playlist's own order. */
  editing?: boolean;
  onMore?: () => void;
  onAdd?: () => void;
  onDoneEditing?: () => void;
}) {
  const barScroll = useBarScroll();
  const styles = useAppStyles();
  const favorites = useFavoriteIds();
  const heroRef = useRef<ViewNode>(null);
  const sort = useSortUi(sortKey, choices, sorts, 'Sort songs', !!playlist);
  const shown = useMemo(() => sortSongs(base, sort.choice.id, sort.direction), [base, sort.choice.id, sort.direction]);
  const playable = useMemo(() => shown.filter((track) => track.uri), [shown]);
  // Stable handlers, so the memoized rows skip re-rendering on play/pause.
  const playRow = useCallback(
    (track: MusicTrack) => onPlayFromList(track, playable, false, title),
    [onPlayFromList, playable, title],
  );
  const openRowMenu = useCallback((track: MusicTrack) => onOpenTrackMenu(track, playlist?.id), [onOpenTrackMenu, playlist?.id]);
  const extraData = useMemo(() => ({ currentTrackId, isPlaying, favorites, by: sort.choice.id }), [currentTrackId, favorites, isPlaying, sort.choice.id]);
  const playAll = (shuffle: boolean) => {
    hapticSelection();
    const order = shuffle ? shuffleTracks(playable) : playable;
    if (order[0]) onPlayFromList(order[0], order, true, title);
  };
  const rowValue = (track: MusicTrack): string | null =>
    sort.choice.id === LIST_SORT
      ? valueOf?.(track) ?? null
      : sort.choice.id === 'dateAdded' && track.dateAdded
        ? formatShortDate(track.dateAdded)
        : null;

  const header = (
    <View>
      <PageTop onPop={onPop} onMore={onMore} />
      <View style={styles.collHero}>
        <Animated.View ref={heroRef} collapsable={false} onLayout={() => hero.land(heroRef.current)} style={hero.style}>
          {cover(HERO_SIZE)}
        </Animated.View>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.collHeroTitle}>
          {title}
        </Text>
        {meta ? <Text style={styles.collHeroMeta}>{meta}</Text> : null}
        {playable.length > 0 ? (
          <View style={styles.collHeroActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${title}`}
              onPress={() => playAll(false)}
              style={({ pressed }) => [styles.primaryButton, styles.collHeroButton, pressed && styles.primaryButtonPressed]}
            >
              <Ionicons accessible={false} name="play" size={18} color={String(styles.primaryButtonLabel.color)} />
              <Text style={styles.primaryButtonLabel}>Play</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Shuffle ${title}`}
              onPress={() => playAll(true)}
              style={({ pressed }) => [styles.moreActionSoft, styles.collHeroButton, pressed && PRESSED]}
            >
              <ControlIcon name="shuffle" size={16} tone="accent" />
              <Text style={styles.homeLinkLabel}>Shuffle</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.collHeroEmpty}>{emptyText}</Text>
            {onAdd ? (
              <Pressable
                accessibilityRole="button"
                onPress={onAdd}
                style={({ pressed }) => [styles.moreActionSoft, styles.collHeroButton, styles.collHeroAdd, pressed && PRESSED]}
              >
                <ControlIcon name="plus" size={16} tone="accent" />
                <Text style={styles.homeLinkLabel}>Add songs</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
      {shown.length > 0 ? (
        <View style={[styles.libraryListMeta, styles.collListMeta]}>
          {editing ? (
            <Text numberOfLines={1} style={styles.libraryListMetaText}>
              Drag to reorder, swipe left to remove
            </Text>
          ) : onAdd ? (
            <Pressable
              accessibilityRole="button"
              onPress={onAdd}
              style={({ pressed }) => [styles.libraryShuffle, styles.libraryShuffleFirst, pressed && styles.librarySortChipPressed]}
            >
              <ControlIcon name="plus" size={15} tone="accent" />
              <Text style={styles.libraryShuffleText}>Add songs</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {editing ? (
            <Pressable
              accessibilityRole="button"
              onPress={onDoneEditing}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => [styles.librarySortLink, pressed && styles.librarySortChipPressed]}
            >
              <Text style={styles.libraryShuffleText}>Done</Text>
            </Pressable>
          ) : shown.length > 1 ? (
            sort.control
          ) : null}
        </View>
      ) : null}
      {editing && playlist ? (
        // shortcut: edit mode mounts every row (not virtualized); virtualize if very long playlists stutter.
        <View style={styles.collEditList}>
          <UpNextList
            tracks={shown}
            firstQueueIndex={0}
            removeLabel="Remove from playlist"
            onSelect={(index) => shown[index] && playRow(shown[index])}
            onMove={(from, to) => shown[from] && shown[to] && movePlaylistTrack(playlist.id, shown[from].id, shown[to].id)}
            onRemove={(index) => shown[index] && removeFromPlaylist(playlist.id, shown[index].id)}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <FlashList
        data={editing ? NO_TRACKS : shown}
        keyExtractor={(track) => track.id}
        extraData={extraData}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        onScroll={barScroll}
        scrollEventThrottle={32}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const isCurrent = item.id === currentTrackId;
          return (
            <LibraryTrackRow
              track={item}
              isCurrent={isCurrent}
              isPlaying={isCurrent && isPlaying}
              isFavorite={favorites.has(item.id)}
              valueLabel={rowValue(item)}
              onPlayTrack={playRow}
              onLongPress={openRowMenu}
            />
          );
        }}
      />
      {sort.sheet}
    </>
  );
}

type PlaylistSheet = 'menu' | 'add' | 'cover' | 'rename' | null;

/** A playlist's menu and the sheets it leads to. Delete asks first. */
function PlaylistActions({
  playlist,
  songs,
  allTracks,
  sheet,
  onSheet,
  onPlay,
  onReorder,
  onDeleted,
}: {
  playlist: Playlist;
  songs: MusicTrack[];
  allTracks: MusicTrack[];
  sheet: PlaylistSheet;
  onSheet: (sheet: PlaylistSheet) => void;
  /** From a tile: Play and Shuffle. */
  onPlay?: (shuffle: boolean) => void;
  /** From the playlist page: Reorder songs. */
  onReorder?: () => void;
  onDeleted?: () => void;
}) {
  const close = () => onSheet(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const confirmDelete = () => {
    close();
    setConfirm({
      eyebrow: 'PLAYLIST',
      title: 'Delete playlist?',
      message: `"${playlist.name}" will be removed. Your songs stay on your phone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        onDeleted?.();
        deletePlaylist(playlist.id);
      },
    });
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };
  return (
    <>
      <Sheet visible={sheet === 'menu'} eyebrow="PLAYLIST" title={playlist.name} onClose={close}>
        {onPlay && songs.length > 0 ? (
          <>
            <SheetRow icon={<ControlIcon name="play" size={18} tone="muted" />} label="Play" onPress={run(() => onPlay(false))} />
            <SheetRow icon={<ControlIcon name="shuffle" size={18} tone="muted" />} label="Shuffle" onPress={run(() => onPlay(true))} />
          </>
        ) : null}
        {onReorder && songs.length > 1 ? (
          <SheetRow icon={<ControlIcon name="drag" size={18} tone="muted" />} label="Reorder songs" onPress={run(onReorder)} />
        ) : null}
        <SheetRow icon={<ControlIcon name="plus" size={18} tone="muted" />} label="Add songs" onPress={() => onSheet('add')} />
        <SheetRow icon={<ControlIcon name="edit" size={18} tone="muted" />} label="Rename" onPress={() => onSheet('rename')} />
        <SheetRow icon={<ControlIcon name="image" size={18} tone="muted" />} label="Change cover" onPress={() => onSheet('cover')} />
        <SheetRow icon={<ControlIcon name="delete" size={18} tone="muted" />} label="Delete playlist" danger onPress={confirmDelete} />
      </Sheet>
      <AddSongsSheet playlist={playlist} tracks={allTracks} visible={sheet === 'add'} onClose={close} />
      <CoverPickerSheet playlist={playlist} tracks={songs} visible={sheet === 'cover'} onClose={close} />
      <NamePrompt
        visible={sheet === 'rename'}
        title="Rename playlist"
        initialName={playlist.name}
        actionLabel="Save name"
        onClose={close}
        onSubmit={(name) => {
          renamePlaylist(playlist.id, name);
          close();
        }}
      />
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function PlaylistPage({
  playlist,
  allTracks,
  byId,
  sorts,
  hero,
  ...shared
}: Shared & {
  playlist: Playlist;
  allTracks: MusicTrack[];
  byId: Map<string, MusicTrack>;
  sorts: Readonly<Record<string, ListSort>>;
  hero: Hero;
}) {
  const [sheet, setSheet] = useState<PlaylistSheet>(null);
  const [editing, setEditing] = useState(false);
  // Songs whose files are gone, or in hidden folders, are left out.
  const songs = useMemo(
    () => playlist.trackIds.map((id) => byId.get(id)).filter((track): track is MusicTrack => !!track),
    [byId, playlist.trackIds],
  );
  // Dragging only makes sense in the playlist's own order, so editing switches to it.
  const startEditing = () => {
    setListSort('collections:playlist', { by: LIST_SORT, direction: 'ascending' });
    setEditing(true);
  };

  return (
    <>
      <SongsPage
        {...shared}
        hero={hero}
        title={playlist.name}
        meta={songsMeta(null, songs)}
        cover={(size) => <PlaylistCover playlist={playlist} tracks={songs} size={size} radius={HERO_RADIUS} />}
        base={songs}
        sortKey="collections:playlist"
        choices={PLAYLIST_SONG_SORTS}
        sorts={sorts}
        emptyText="Add songs to fill this playlist."
        playlist={playlist}
        editing={editing && songs.length > 1}
        onMore={() => setSheet('menu')}
        onAdd={() => setSheet('add')}
        onDoneEditing={() => setEditing(false)}
      />
      <PlaylistActions
        playlist={playlist}
        songs={songs}
        allTracks={allTracks}
        sheet={sheet}
        onSheet={setSheet}
        onReorder={startEditing}
        onDeleted={shared.onPop}
      />
    </>
  );
}
