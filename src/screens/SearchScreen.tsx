import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ListeningEvent, MusicFolder, MusicTrack } from '../types';
import { groupTracks, type GroupKind, type TrackGroup } from '../library/browse';
import { usePlaylists, type Playlist } from '../library/playlists';
import { EMPTY_RESULTS, searchLibrary, type TopResult } from '../library/search';
import { getRecentTracks } from '../history/stats';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { PlaylistCover } from '../components/CoverCollage';
import { EqualizerBars } from '../components/EqualizerBars';
import { ControlIcon, PlaybackGlyph, usePlayButtonColors, type ControlIconName } from '../components/icons';
import { SectionHeading } from './HomeTab';
import type { MoreRoute } from './MoreTab';
import { useAppStyles } from '../theme/styles';

/** Songs shown under "All" before "See all", so other kinds stay in view. */
const SONG_PREVIEW = 5;
/** Songs listed A to Z before anything is typed. Typing finds the rest. */
const BROWSE_SONGS = 40;
const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

type Filter = 'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'genres' | 'folders';
const FILTERS: { id: Exclude<Filter, 'all'>; label: string }[] = [
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'genres', label: 'Genres' },
  { id: 'folders', label: 'Folders' },
];

export function SearchScreen({
  query,
  tracks,
  folders,
  history,
  currentTrackId,
  isPlaying,
  onPlaySong,
  onOpenRoute,
  contentContainerStyle,
}: {
  query: string;
  /** Playable songs in included folders. */
  tracks: MusicTrack[];
  /** Included folders only. */
  folders: MusicFolder[];
  /** Plays, newest first, already without hidden folders. */
  history: ListeningEvent[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlaySong: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  onOpenRoute: (route: MoreRoute) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const styles = useAppStyles();
  const playlists = usePlaylists();
  // Typing stays quick; results catch up a moment later.
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>('all');
  const source = useMemo(
    () => ({
      tracks,
      artists: groupTracks(tracks, 'artist'),
      albums: groupTracks(tracks, 'album'),
      genres: groupTracks(tracks, 'genre'),
      playlists,
      folders,
    }),
    [folders, playlists, tracks],
  );
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const results = useMemo(
    () => (deferredQuery.trim() ? searchLibrary(deferredQuery, source) : EMPTY_RESULTS),
    [deferredQuery, source],
  );

  const openGroup = (group: GroupKind, item: TrackGroup) =>
    onOpenRoute({ kind: 'group', group, key: item.key });
  const hasQuery = deferredQuery.trim().length > 0;
  const counts: Record<Exclude<Filter, 'all'>, number> = {
    songs: results.songs.length,
    artists: results.artists.length,
    albums: results.albums.length,
    playlists: results.playlists.length,
    genres: results.genres.length,
    folders: results.folders.length,
  };
  const hasResults = Object.values(counts).some((count) => count > 0);
  // A filter with nothing for this search falls back to everything.
  const shown: Filter = filter !== 'all' && counts[filter] > 0 ? filter : 'all';
  const show = (kind: Exclude<Filter, 'all'>) => counts[kind] > 0 && (shown === 'all' || shown === kind);
  const songs = shown === 'songs' ? results.songs : results.songs.slice(0, SONG_PREVIEW);

  return (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.libraryIntro}>
        <Text accessibilityRole="header" style={styles.libraryHeading}>
          Search
        </Text>
        <Text style={styles.libraryDescription} accessibilityLiveRegion="polite">
          {!hasQuery
            ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} in your library`
            : hasResults
              ? `Results for "${deferredQuery.trim()}"`
              : `Nothing found for "${deferredQuery.trim()}"`}
        </Text>
      </View>

      {!hasQuery && (
        <SongsFirst
          tracks={tracks}
          history={history}
          byId={byId}
          genres={source.genres}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          onPlaySong={onPlaySong}
          onOpenGenre={(genre) => openGroup('genre', genre)}
        />
      )}

      {hasQuery && !hasResults && (
        <Text style={styles.homeMutedText}>
          Check the spelling, or try a song, artist or album name.
        </Text>
      )}

      {hasResults && (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.homeShelf}
          contentContainerStyle={styles.searchChipRow}
        >
          <FilterChip label="All" selected={shown === 'all'} onPress={() => setFilter('all')} />
          {FILTERS.filter((item) => counts[item.id] > 0).map((item) => (
            <FilterChip
              key={item.id}
              label={`${item.label} ${counts[item.id]}`}
              selected={shown === item.id}
              onPress={() => setFilter(item.id)}
            />
          ))}
        </ScrollView>
      )}

      {shown === 'all' && results.top && (
        <>
          <SectionHeading title="Top result" />
          <TopResultCard
            result={results.top}
            onOpen={() => {
              const top = results.top;
              if (!top) return;
              if (top.kind === 'song') onPlaySong(top.track, results.songs, false, 'Search');
              else if (top.kind === 'playlist') onOpenRoute({ kind: 'playlist', id: top.playlist.id });
              else openGroup(top.kind, top.group);
            }}
          />
        </>
      )}

      {show('songs') && (
        <ResultSection title="Songs">
          {songs.map((track, index) => (
            <SongRow
              key={track.id}
              track={track}
              isCurrent={track.id === currentTrackId}
              isPlaying={isPlaying}
              last={index === songs.length - 1 && songs.length === results.songs.length}
              onPress={() => onPlaySong(track, results.songs, false, 'Search')}
            />
          ))}
          {songs.length < results.songs.length && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setFilter('songs')}
              style={styles.searchSeeAll}
            >
              <Text style={styles.homeLinkLabel}>See all {results.songs.length} songs</Text>
            </Pressable>
          )}
        </ResultSection>
      )}

      {show('artists') && (
        <ResultSection title="Artists">
          {results.artists.map((group, index) => (
            <ResultRow
              key={group.key}
              leading={<AlbumArtwork track={group.tracks[0]} size={44} radius={22} />}
              title={group.title}
              hint={songCount(group.tracks.length)}
              last={index === results.artists.length - 1}
              onPress={() => openGroup('artist', group)}
            />
          ))}
        </ResultSection>
      )}

      {show('albums') && (
        <ResultSection title="Albums">
          {results.albums.map((group, index) => (
            <ResultRow
              key={group.key}
              leading={<AlbumArtwork track={group.tracks[0]} size={44} />}
              title={group.title}
              hint={[group.subtitle, songCount(group.tracks.length)].filter(Boolean).join(' · ')}
              last={index === results.albums.length - 1}
              onPress={() => openGroup('album', group)}
            />
          ))}
        </ResultSection>
      )}

      {show('playlists') && (
        <ResultSection title="Playlists">
          {results.playlists.map((playlist, index) => (
            <ResultRow
              key={playlist.id}
              leading={<PlaylistLeading playlist={playlist} byId={byId} />}
              title={playlist.name}
              hint={songCount(playlist.trackIds.length)}
              last={index === results.playlists.length - 1}
              onPress={() => onOpenRoute({ kind: 'playlist', id: playlist.id })}
            />
          ))}
        </ResultSection>
      )}

      {show('genres') && (
        <ResultSection title="Genres">
          {results.genres.map((group, index) => (
            <ResultRow
              key={group.key}
              leading={<IconTile name="genre" />}
              title={group.title}
              hint={songCount(group.tracks.length)}
              last={index === results.genres.length - 1}
              onPress={() => openGroup('genre', group)}
            />
          ))}
        </ResultSection>
      )}

      {show('folders') && (
        <ResultSection title="Folders">
          {results.folders.map((folder, index) => (
            <ResultRow
              key={folder.id}
              leading={<IconTile name="folder" />}
              title={folder.title}
              hint={songCount(folder.trackCount)}
              last={index === results.folders.length - 1}
              onPress={() => onOpenRoute({ kind: 'folder', id: folder.id })}
            />
          ))}
        </ResultSection>
      )}
    </ScrollView>
  );
}

const songCount = (count: number) => `${count} ${count === 1 ? 'song' : 'songs'}`;

/**
 * Before anything is typed: songs, not folders. What you played last, then
 * your songs A to Z, then genres to browse.
 */
function SongsFirst({
  tracks,
  history,
  byId,
  genres,
  currentTrackId,
  isPlaying,
  onPlaySong,
  onOpenGenre,
}: {
  tracks: MusicTrack[];
  history: ListeningEvent[];
  byId: Map<string, MusicTrack>;
  genres: TrackGroup[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlaySong: (track: MusicTrack, list: MusicTrack[], freshQueue?: boolean, source?: string) => void;
  onOpenGenre: (genre: TrackGroup) => void;
}) {
  const styles = useAppStyles();
  const recent = useMemo(
    () =>
      getRecentTracks(history, 8)
        .map((event) => byId.get(event.trackId))
        .filter((track): track is MusicTrack => track !== undefined),
    [byId, history],
  );
  const aToZ = useMemo(
    () => [...tracks].sort((first, second) => titleCollator.compare(first.title, second.title)),
    [tracks],
  );
  const browse = aToZ.slice(0, BROWSE_SONGS);
  const topGenres = genres
    .filter((genre) => genre.key !== '')
    .sort((first, second) => second.tracks.length - first.tracks.length)
    .slice(0, 12);

  return (
    <>
      {recent.length > 0 && (
        <ResultSection title="Recently played">
          {recent.map((track, index) => (
            <SongRow
              key={track.id}
              track={track}
              isCurrent={track.id === currentTrackId}
              isPlaying={isPlaying}
              last={index === recent.length - 1}
              onPress={() => onPlaySong(track, recent, false, 'Recently played')}
            />
          ))}
        </ResultSection>
      )}

      {browse.length > 0 && (
        <>
          <SectionHeading
            title="Your songs"
            hint={aToZ.length > BROWSE_SONGS ? `A to Z. Type to find any of your ${aToZ.length} songs.` : 'A to Z'}
          />
          <View style={styles.searchSection}>
            {browse.map((track, index) => (
              <SongRow
                key={track.id}
                track={track}
                isCurrent={track.id === currentTrackId}
                isPlaying={isPlaying}
                last={index === browse.length - 1}
                onPress={() => onPlaySong(track, aToZ, false, 'Your songs')}
              />
            ))}
          </View>
        </>
      )}

      {topGenres.length > 0 && (
        <>
          <SectionHeading title="Browse genres" />
          <View style={styles.goalChips}>
            {topGenres.map((genre) => (
              <Pressable
                key={genre.key}
                accessibilityRole="button"
                accessibilityLabel={`${genre.title}, ${songCount(genre.tracks.length)}`}
                onPress={() => onOpenGenre(genre)}
                style={({ pressed }) => [styles.goalChip, styles.searchChip, pressed && styles.settingRowPressed]}
              >
                <Text style={styles.goalChipLabel}>{genre.title}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </>
  );
}

function SongRow({
  track,
  isCurrent,
  isPlaying,
  last,
  onPress,
}: {
  track: MusicTrack;
  isCurrent: boolean;
  isPlaying: boolean;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <ResultRow
      leading={<AlbumArtwork track={track} size={44} />}
      title={track.title}
      hint={[track.artist, track.album].filter(Boolean).join(' · ') || track.folderTitle}
      trailing={isCurrent ? <EqualizerBars playing={isPlaying} size={14} /> : <View />}
      last={last}
      accessibilityLabel={`Play ${track.title}${track.artist ? ` by ${track.artist}` : ''}`}
      onPress={onPress}
    />
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.goalChip, styles.searchChip, selected && styles.goalChipActive]}
    >
      <Text style={[styles.goalChipLabel, selected && styles.goalChipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function TopResultCard({ result, onOpen }: { result: TopResult; onOpen: () => void }) {
  const styles = useAppStyles();
  const playButton = usePlayButtonColors();
  const title =
    result.kind === 'song' ? result.track.title : result.kind === 'playlist' ? result.playlist.name : result.group.title;
  const hint =
    result.kind === 'song'
      ? `Song${result.track.artist ? ` · ${result.track.artist}` : ''}`
      : result.kind === 'artist'
        ? `Artist · ${songCount(result.group.tracks.length)}`
        : result.kind === 'album'
          ? `Album${result.group.subtitle ? ` · ${result.group.subtitle}` : ''}`
          : `Playlist · ${songCount(result.playlist.trackIds.length)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={result.kind === 'song' ? `Play ${title}` : `Open ${title}, ${hint}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.homeCard, styles.insightRow, pressed && styles.settingRowPressed]}
    >
      {result.kind === 'playlist' ? (
        <View style={styles.searchTopArt}>
          <ControlIcon name="playlist" size={28} tone="accent" />
        </View>
      ) : (
        <AlbumArtwork
          track={result.kind === 'song' ? result.track : result.group.tracks[0]}
          size={72}
          radius={result.kind === 'artist' ? 36 : undefined}
        />
      )}
      <View style={styles.homeSongCopy}>
        <Text numberOfLines={2} style={styles.searchTopTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.homeSongHint}>
          {hint}
        </Text>
      </View>
      {result.kind === 'song' ? (
        <View style={[styles.searchTopPlay, { backgroundColor: playButton.background }]}>
          <PlaybackGlyph mode="play" color="inverse" size={16} />
        </View>
      ) : (
        <ControlIcon name="chevron-right" size={18} tone="muted" />
      )}
    </Pressable>
  );
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  const styles = useAppStyles();
  return (
    <>
      <SectionHeading title={title} />
      <View style={styles.searchSection}>{children}</View>
    </>
  );
}

function ResultRow({
  leading,
  title,
  hint,
  trailing,
  last,
  accessibilityLabel,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  hint: string;
  trailing?: ReactNode;
  last: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}, ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.homeSongRow, last && styles.homeSongRowLast, pressed && styles.settingRowPressed]}
    >
      {leading}
      <View style={styles.homeSongCopy}>
        <Text numberOfLines={1} style={styles.homeSongTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.homeSongHint}>
          {hint}
        </Text>
      </View>
      {trailing ?? <ControlIcon name="chevron-right" size={16} tone="muted" />}
    </Pressable>
  );
}

function IconTile({ name }: { name: ControlIconName }) {
  const styles = useAppStyles();
  return (
    <View style={styles.searchIconTile}>
      <ControlIcon name={name} size={18} tone="accent" />
    </View>
  );
}

function PlaylistLeading({ playlist, byId }: { playlist: Playlist; byId: Map<string, MusicTrack> }) {
  const listTracks = playlist.trackIds
    .map((id) => byId.get(id))
    .filter((track): track is MusicTrack => track !== undefined);
  return <PlaylistCover playlist={playlist} tracks={listTracks} size={44} radius={10} />;
}
