import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { ListeningEvent, MusicTrack } from '../types';
import {
  groupTracks,
  smartList,
  type GroupKind,
  type SmartListId,
  type SongList,
} from '../library/browse';
import { useFavoriteIds } from '../library/favorites';
import { useRatings } from '../library/ratings';
import {
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  usePlaylists,
  type Playlist,
} from '../library/playlists';
import { LibraryTrackRow } from './LibraryTab';
import { shuffleTracks } from '../playback/PlaybackController';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { CoverCollage, PlaylistCover } from '../components/CoverCollage';
import { AddSongsSheet } from '../components/AddSongsSheet';
import { CoverPickerSheet } from '../components/CoverPickerSheet';
import { NamePrompt } from '../components/NamePrompt';
import { ControlIcon, type ControlIconName } from '../components/icons';
import { starsLabel } from '../components/StarRating';
import { formatListeningTime, formatTimeAgo, formatTrackDuration } from '../utils/format';
import { useBarScroll } from '../motion/barScroll';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT, POP_IN, PUSH_IN, useNavDirection } from '../motion/motion';

/** Where you are inside More. An empty stack is the menu. */
export type MoreRoute =
  | { kind: 'groups'; group: GroupKind }
  | { kind: 'group'; group: GroupKind; key: string }
  | { kind: 'smart'; id: SmartListId }
  | { kind: 'playlists' }
  | { kind: 'playlist'; id: string }
  /** A device folder, opened from Search. */
  | { kind: 'folder'; id: string };

const GROUPS: { group: GroupKind; title: string; icon: ControlIconName }[] = [
  { group: 'album', title: 'Albums', icon: 'album' },
  { group: 'artist', title: 'Artists', icon: 'artist' },
  { group: 'albumArtist', title: 'Album artists', icon: 'album-artist' },
  { group: 'genre', title: 'Genres', icon: 'genre' },
  { group: 'year', title: 'Years', icon: 'year' },
];

const SMART: { id: SmartListId; title: string; hint: string; icon: ControlIconName }[] = [
  { id: 'favorites', title: 'Favorites', hint: 'Songs you loved', icon: 'heart' },
  { id: 'mostPlayed', title: 'Most played', hint: 'Your top 100 by plays', icon: 'most-played' },
  { id: 'topRated', title: 'Top rated', hint: '4 and 5 stars', icon: 'star' },
  { id: 'lowRated', title: 'Low rated', hint: '1 and 2 stars', icon: 'low-rated' },
  { id: 'recentlyAdded', title: 'Recently added', hint: 'Newest files first', icon: 'recently-added' },
  { id: 'recentlyPlayed', title: 'Recently played', hint: 'Last songs you heard', icon: 'recently-played' },
  { id: 'longest', title: 'Longest songs', hint: 'Longest first', icon: 'longest' },
];

const PAGE_IN = FadeIn.duration(200).easing(EASE_OUT);

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
  /** Name of the chosen sound preset, shown on the Equalizer row. */
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const route = stack[stack.length - 1];
  const direction = useNavDirection(stack.length);
  // Lists rebuild at low priority, so playback stays quick while they do.
  const history = useDeferredValue(liveHistory);
  const favorites = useFavoriteIds();
  const ratings = useRatings();
  const playlists = usePlaylists();
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  // Built only when the page or its data changes, not on every play/pause.
  const group = useMemo(
    () =>
      route?.kind === 'group'
        ? groupTracks(tracks, route.group).find((item) => item.key === route.key)
        : undefined,
    [route, tracks],
  );
  const smart = useMemo(
    () => (route?.kind === 'smart' ? smartList(route.id, tracks, history, ratings, favorites) : undefined),
    [favorites, history, ratings, route, tracks],
  );
  const shared = { currentTrackId, isPlaying, onPlayFromList, onOpenTrackMenu, contentContainerStyle, onPop };

  let page: ReactNode;
  if (!route) {
    page = (
      <MoreMenu
        tracks={tracks}
        history={history}
        favorites={favorites}
        ratings={ratings}
        playlists={playlists}
        byId={byId}
        onPush={onPush}
        contentContainerStyle={contentContainerStyle}
      />
    );
  } else if (route.kind === 'groups') {
    page = <GroupsPage group={route.group} tracks={tracks} onPush={onPush} {...shared} />;
  } else if (route.kind === 'group') {
    page = (
      <SongsPage
        {...shared}
        eyebrow={GROUPS.find((item) => item.group === route.group)?.title.toUpperCase() ?? ''}
        title={group?.title ?? 'Not found'}
        subtitle={group?.subtitle ?? null}
        list={{ tracks: group?.tracks ?? [] }}
        banner={group && route.group === 'album' ? <CoverCollage tracks={group.tracks.slice(0, 1)} size={180} radius={18} /> : null}
      />
    );
  } else if (route.kind === 'smart') {
    const info = SMART.find((item) => item.id === route.id);
    page = (
      <SongsPage
        {...shared}
        eyebrow="SMART LIST"
        title={info?.title ?? ''}
        subtitle={info?.hint ?? null}
        list={smart ?? { tracks: [] }}
        valueKind={route.id}
      />
    );
  } else if (route.kind === 'folder') {
    const folderTracks = tracks.filter((track) => track.folderId === route.id);
    page = (
      <SongsPage
        {...shared}
        eyebrow="FOLDER"
        title={folderTracks[0]?.folderTitle ?? 'Folder'}
        subtitle={null}
        list={{ tracks: folderTracks }}
      />
    );
  } else if (route.kind === 'playlists') {
    page = <PlaylistsPage playlists={playlists} byId={byId} onPush={onPush} {...shared} />;
  } else {
    const playlist = playlists.find((item) => item.id === route.id);
    page = playlist ? (
      <PlaylistPage {...shared} playlist={playlist} allTracks={tracks} byId={byId} />
    ) : (
      <SongsPage {...shared} eyebrow="PLAYLIST" title="Playlist removed" subtitle={null} list={{ tracks: [] }} />
    );
  }

  return (
    <Animated.View
      key={stack.length}
      entering={direction === 'forward' ? PUSH_IN : direction === 'back' ? POP_IN : PAGE_IN}
      style={{ flex: 1 }}
    >
      {page}
    </Animated.View>
  );
}

function MoreMenu({
  tracks,
  history,
  favorites,
  ratings,
  playlists,
  byId,
  onPush,
  contentContainerStyle,
}: {
  tracks: MusicTrack[];
  history: ListeningEvent[];
  favorites: ReadonlySet<string>;
  ratings: Readonly<Record<string, number>>;
  playlists: Playlist[];
  byId: Map<string, MusicTrack>;
  onPush: (route: MoreRoute) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const barScroll = useBarScroll();
  const styles = useAppStyles();
  const groupCounts = useMemo(
    () => new Map(GROUPS.map(({ group }) => [group, groupTracks(tracks, group).length])),
    [tracks],
  );
  const smartCounts = useMemo(
    () => new Map(SMART.map(({ id }) => [id, smartList(id, tracks, history, ratings, favorites).tracks.length])),
    [favorites, history, ratings, tracks],
  );
  const favoriteTracks = tracks.filter((track) => favorites.has(track.id));
  const playlistTracks = playlists[0]?.trackIds.map((id) => byId.get(id)).filter((t): t is MusicTrack => !!t) ?? [];

  return (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      onScroll={barScroll}
      scrollEventThrottle={32}
    >
      <View style={styles.libraryIntro}>
        <Text style={styles.libraryHeading}>Collections</Text>
        <Text style={styles.libraryDescription}>Playlists, favorites and your music grouped every way.</Text>
      </View>

      <View style={styles.moreFeatureRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Favorites, ${favoriteTracks.length} songs`}
          onPress={() => onPush({ kind: 'smart', id: 'favorites' })}
          style={styles.moreFeature}
        >
          <CoverCollage tracks={favoriteTracks} size={64} />
          <Text style={styles.homeSongTitle}>Favorites</Text>
          <Text style={styles.homeSongHint}>{favoriteTracks.length} songs</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Playlists, ${playlists.length}`}
          onPress={() => onPush({ kind: 'playlists' })}
          style={styles.moreFeature}
        >
          {playlists[0] ? (
            <PlaylistCover playlist={playlists[0]} tracks={playlistTracks} size={64} radius={10} />
          ) : (
            <View style={styles.moreFeatureIcon}>
              <ControlIcon name="playlist" size={26} tone="accent" />
            </View>
          )}
          <Text style={styles.homeSongTitle}>Playlists</Text>
          <Text style={styles.homeSongHint}>
            {playlists.length === 0 ? 'Make your first' : `${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}`}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.settingsSectionLabel}>BROWSE</Text>
      <View style={styles.settingsGroup}>
        {GROUPS.map((item, index) => (
          <MenuRow
            key={item.group}
            icon={item.icon}
            title={item.title}
            detail={String(groupCounts.get(item.group) ?? 0)}
            last={index === GROUPS.length - 1}
            onPress={() => onPush({ kind: 'groups', group: item.group })}
          />
        ))}
      </View>

      <Text style={styles.settingsSectionLabel}>SMART LISTS</Text>
      <View style={styles.settingsGroup}>
        {SMART.filter((item) => item.id !== 'favorites').map((item, index, list) => (
          <MenuRow
            key={item.id}
            icon={item.icon}
            title={item.title}
            hint={item.hint}
            detail={String(smartCounts.get(item.id) ?? 0)}
            last={index === list.length - 1}
            onPress={() => onPush({ kind: 'smart', id: item.id })}
          />
        ))}
      </View>

    </ScrollView>
  );
}

function MenuRow({
  icon,
  title,
  hint,
  detail,
  last,
  onPress,
}: {
  icon: ControlIconName;
  title: string;
  hint?: string;
  detail: string;
  last: boolean;
  onPress: () => void;
}) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, last && styles.settingRowLast, pressed && styles.settingRowPressed]}
    >
      <View style={styles.moreRowIcon}>
        <ControlIcon name={icon} size={17} tone="accent" />
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        {hint ? <Text style={styles.settingSubtitle}>{hint}</Text> : null}
      </View>
      <Text style={styles.moreRowCount}>{detail}</Text>
      <ControlIcon name="chevron-right" size={16} tone="muted" />
    </Pressable>
  );
}

/** A page's top bar: back, a small label and a title. */
function PageTop({ eyebrow, title, onPop }: { eyebrow: string; title: string; onPop: () => void }) {
  const styles = useAppStyles();
  return (
    <View style={styles.moreTopBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={onPop}
        style={styles.headerBackButton}
      >
        <Text style={styles.headerBackIcon}>‹</Text>
      </Pressable>
      <View style={styles.homeSongCopy}>
        <Text style={styles.homeCardLabel}>{eyebrow}</Text>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.statsTitle}>
          {title}
        </Text>
      </View>
    </View>
  );
}

function GroupsPage({
  group,
  tracks,
  onPush,
  onPop,
  contentContainerStyle,
}: {
  group: GroupKind;
  tracks: MusicTrack[];
  onPush: (route: MoreRoute) => void;
  onPop: () => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const barScroll = useBarScroll();
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const groups = useMemo(() => groupTracks(tracks, group), [group, tracks]);
  const info = GROUPS.find((item) => item.group === group);
  const isGrid = group === 'album';
  const tile = (width - 48 - 12) / 2;

  return (
    <FlashList
      data={groups}
      numColumns={isGrid ? 2 : 1}
      keyExtractor={(item) => item.key}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      onScroll={barScroll}
      scrollEventThrottle={32}
      ListHeaderComponent={
        <View style={styles.morePageHeader}>
          <PageTop eyebrow="BROWSE" title={info?.title ?? ''} onPop={onPop} />
          <Text style={styles.libraryDescription}>
            {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const label = `${item.tracks.length} ${item.tracks.length === 1 ? 'song' : 'songs'}`;
        const open = () => onPush({ kind: 'group', group, key: item.key });
        return isGrid ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${label}`}
            onPress={open}
            style={[styles.moreTile, { width: tile, marginLeft: index % 2 ? 12 : 0 }]}
          >
            <AlbumArtwork track={item.tracks[0]} size={tile} />
            <Text numberOfLines={1} style={styles.homeShelfTitle}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.homeShelfHint}>
              {item.subtitle ? `${item.subtitle} · ${label}` : label}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${label}`}
            onPress={open}
            style={styles.homeSongRow}
          >
            <CoverCollage tracks={item.tracks} size={48} />
            <View style={styles.homeSongCopy}>
              <Text numberOfLines={1} style={styles.homeSongTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.homeSongHint}>
                {label}
              </Text>
            </View>
            <ControlIcon name="chevron-right" size={16} tone="muted" />
          </Pressable>
        );
      }}
    />
  );
}

/** Text shown at the end of each row, by list. */
function rowValue(kind: SmartListId | undefined, list: SongList, track: MusicTrack): string | null {
  const value = list.values?.get(track.id);
  if (value === undefined) {
    return null;
  }
  if (kind === 'mostPlayed') return `${value} ${value === 1 ? 'play' : 'plays'}`;
  if (kind === 'topRated' || kind === 'lowRated') return starsLabel(value);
  if (kind === 'recentlyPlayed') return formatTimeAgo(value);
  return null;
}

function SongsPage({
  eyebrow,
  title,
  subtitle,
  list,
  valueKind,
  banner,
  actions,
  playlistId,
  emptyText,
  currentTrackId,
  isPlaying,
  onPlayFromList,
  onOpenTrackMenu,
  onPop,
  contentContainerStyle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string | null;
  list: SongList;
  valueKind?: SmartListId;
  banner?: ReactNode;
  actions?: ReactNode;
  playlistId?: string;
  emptyText?: string;
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlayFromList: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  onOpenTrackMenu: (track: MusicTrack, playlistId?: string) => void;
  onPop: () => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const barScroll = useBarScroll();
  const styles = useAppStyles();
  const totalSeconds = list.tracks.reduce((sum, track) => sum + track.duration, 0);
  const playable = useMemo(() => list.tracks.filter((track) => track.uri), [list.tracks]);
  // Stable handlers, so the memoized rows skip re-rendering on play/pause.
  const playRow = useCallback(
    (track: MusicTrack) => onPlayFromList(track, playable, false, title),
    [onPlayFromList, playable, title],
  );
  const openRowMenu = useCallback(
    (track: MusicTrack) => onOpenTrackMenu(track, playlistId),
    [onOpenTrackMenu, playlistId],
  );
  const shuffleStart = () => {
    const order = shuffleTracks(playable);
    if (order[0]) onPlayFromList(order[0], order, true, title);
  };

  return (
    <FlashList
      data={list.tracks}
      keyExtractor={(track) => track.id}
      extraData={`${currentTrackId}:${isPlaying}`}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      onScroll={barScroll}
      scrollEventThrottle={32}
      ListHeaderComponent={
        <View style={styles.morePageHeader}>
          <PageTop eyebrow={eyebrow} title={title} onPop={onPop} />
          {banner ? <View style={styles.moreBanner}>{banner}</View> : null}
          <Text style={styles.libraryDescription}>
            {[subtitle, `${list.tracks.length} ${list.tracks.length === 1 ? 'song' : 'songs'}`, totalSeconds > 0 ? formatListeningTime(totalSeconds) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {playable.length > 0 && (
            <View style={styles.moreActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onPlayFromList(playable[0], playable, true, title)}
                style={[styles.primaryButton, styles.moreActionMain]}
              >
                <ControlIcon name="play" size={16} />
                <Text style={styles.primaryButtonLabel}>Play</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={shuffleStart} style={styles.moreActionSoft}>
                <ControlIcon name="shuffle" size={16} tone="accent" />
                <Text style={styles.homeLinkLabel}>Shuffle</Text>
              </Pressable>
            </View>
          )}
          {actions}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyRotation}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyDescription}>{emptyText ?? 'Songs will show up here as you listen.'}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isCurrent = item.id === currentTrackId;
        const value = rowValue(valueKind, list, item);
        return (
          <LibraryTrackRow
            track={item}
            isCurrent={isCurrent}
            isPlaying={isCurrent && isPlaying}
            valueLabel={value ?? (valueKind === 'longest' ? formatTrackDuration(item.duration) : null)}
            onPlayTrack={playRow}
            onLongPress={openRowMenu}
          />
        );
      }}
    />
  );
}

function PlaylistsPage({
  playlists,
  byId,
  onPush,
  onPop,
  contentContainerStyle,
}: {
  playlists: Playlist[];
  byId: Map<string, MusicTrack>;
  onPush: (route: MoreRoute) => void;
  onPop: () => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const barScroll = useBarScroll();
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const [isNaming, setIsNaming] = useState(false);
  const tile = (width - 48 - 12) / 2;
  const items: (Playlist | 'new')[] = ['new', ...playlists];

  return (
    <>
      <FlashList
        data={items}
        numColumns={2}
        keyExtractor={(item) => (item === 'new' ? 'new' : item.id)}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        onScroll={barScroll}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <View style={styles.morePageHeader}>
            <PageTop eyebrow="YOUR MUSIC" title="Playlists" onPop={onPop} />
          </View>
        }
        renderItem={({ item, index }) => {
          const tileStyle = [styles.moreTile, { width: tile, marginLeft: index % 2 ? 12 : 0 }];
          if (item === 'new') {
            return (
              <Pressable accessibilityRole="button" onPress={() => setIsNaming(true)} style={tileStyle}>
                <View style={[styles.moreNewTile, { width: tile, height: tile }]}>
                  <ControlIcon name="plus" size={30} tone="accent" />
                </View>
                <Text style={styles.homeShelfTitle}>New playlist</Text>
                <Text style={styles.homeShelfHint}>Make your own mix</Text>
              </Pressable>
            );
          }
          const songs = item.trackIds.map((id) => byId.get(id)).filter((t): t is MusicTrack => !!t);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${songs.length} songs`}
              onPress={() => onPush({ kind: 'playlist', id: item.id })}
              style={tileStyle}
            >
              <PlaylistCover playlist={item} tracks={songs} size={tile} />
              <Text numberOfLines={1} style={styles.homeShelfTitle}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.homeShelfHint}>
                {songs.length} {songs.length === 1 ? 'song' : 'songs'}
              </Text>
            </Pressable>
          );
        }}
      />
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
    </>
  );
}

function PlaylistPage({
  playlist,
  allTracks,
  byId,
  ...shared
}: {
  playlist: Playlist;
  allTracks: MusicTrack[];
  byId: Map<string, MusicTrack>;
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlayFromList: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  onOpenTrackMenu: (track: MusicTrack, playlistId?: string) => void;
  onPop: () => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const [sheet, setSheet] = useState<'add' | 'cover' | 'rename' | null>(null);
  // Songs whose files are gone, or in hidden folders, are left out.
  const songs = useMemo(
    () => playlist.trackIds.map((id) => byId.get(id)).filter((t): t is MusicTrack => !!t),
    [byId, playlist.trackIds],
  );
  const bannerWidth = width - 48;

  const confirmDelete = () =>
    Alert.alert('Delete playlist?', `"${playlist.name}" will be removed. Your songs stay on your phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          shared.onPop();
          deletePlaylist(playlist.id);
        },
      },
    ]);

  return (
    <>
      <SongsPage
        {...shared}
        eyebrow="PLAYLIST"
        title={playlist.name}
        subtitle={null}
        list={{ tracks: songs }}
        playlistId={playlist.id}
        emptyText="Tap Add songs to fill this playlist."
        banner={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change cover and banner"
            onPress={() => setSheet('cover')}
            style={[styles.moreWideBanner, { width: bannerWidth }]}
          >
            {/* A square cover, cropped to a wide banner from its middle. */}
            <PlaylistCover playlist={playlist} tracks={songs} size={bannerWidth} radius={0} />
            <View style={styles.moreBannerBadge}>
              <ControlIcon name="image" size={14} tone="text" />
              <Text style={styles.homeChipText}>Cover</Text>
            </View>
          </Pressable>
        }
        actions={
          <View style={styles.moreChipRow}>
            <Pressable accessibilityRole="button" onPress={() => setSheet('add')} style={[styles.homeChip, styles.homeChipAction]}>
              <Text style={styles.homeChipActionText}>+ Add songs</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setSheet('rename')} style={styles.homeChip}>
              <Text style={styles.homeChipText}>Rename</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.homeChip}>
              <Text style={styles.homeChipText}>Delete</Text>
            </Pressable>
          </View>
        }
      />
      <AddSongsSheet playlist={playlist} tracks={allTracks} visible={sheet === 'add'} onClose={() => setSheet(null)} />
      <CoverPickerSheet playlist={playlist} tracks={songs} visible={sheet === 'cover'} onClose={() => setSheet(null)} />
      <NamePrompt
        visible={sheet === 'rename'}
        title="Rename playlist"
        initialName={playlist.name}
        actionLabel="Save name"
        onClose={() => setSheet(null)}
        onSubmit={(name) => {
          renamePlaylist(playlist.id, name);
          setSheet(null);
        }}
      />
    </>
  );
}
