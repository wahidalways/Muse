import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { MusicTrack } from '../types';
import { getAudioDetails, type AudioDetails } from '../../modules/muse-audio-metadata';
import { formatShortDate } from '../library/sortTracks';
import { formatAudioDetails, formatBytes, formatPlayCount, formatTrackDuration } from '../utils/format';
import { useAppStyles } from '../theme/styles';
import { useCurrentTrackId } from '../playback/usePlayback';
import { describeOutput, useOutput } from '../playback/output';

type Row = { label: string; value: string };

/**
 * Everything Muse knows about one song: its tags, the file, and how often it
 * was played. Shown inside the song menu. Values can be selected to copy, so
 * a path can be pasted into a file manager. Missing tags are left out rather
 * than shown as blanks; artist and album always show, as "Unknown" if need be.
 */
export function SongInfo({ track, playCount }: { track: MusicTrack; playCount: number }) {
  const styles = useAppStyles();
  // Read from the file when opened. In Expo Go it stays null, so the format
  // falls back to the file extension.
  const [details, setDetails] = useState<{ trackId: string; value: AudioDetails | null } | null>(null);
  useEffect(() => {
    let isActive = true;
    void getAudioDetails(track.id).then((value) => {
      if (isActive) {
        setDetails({ trackId: track.id, value });
      }
    });
    return () => {
      isActive = false;
    };
  }, [track.id]);
  const loaded = details?.trackId === track.id ? details : null;
  const isPlaying = useCurrentTrackId() === track.id;
  const output = useOutput().state;

  const folder = track.path.slice(0, Math.max(0, track.path.length - track.filename.length - 1));
  const sections: { title: string; rows: (Row | null)[] }[] = [
    {
      title: 'SONG',
      rows: [
        { label: 'Title', value: track.title },
        { label: 'Artist', value: track.artist ?? 'Unknown' },
        { label: 'Album', value: track.album ?? 'Unknown' },
        track.albumArtist && track.albumArtist !== track.artist
          ? { label: 'Album artist', value: track.albumArtist }
          : null,
        track.genre ? { label: 'Genre', value: track.genre } : null,
        track.year !== null ? { label: 'Year', value: String(track.year) } : null,
        track.trackNumber !== null ? { label: 'Track', value: String(track.trackNumber) } : null,
        track.duration > 0 ? { label: 'Length', value: formatTrackDuration(track.duration) } : null,
      ],
    },
    {
      title: 'FILE',
      rows: [
        {
          label: 'Format',
          value: loaded ? formatAudioDetails(loaded.value, track.filename) || 'Unknown' : 'Reading...',
        },
        loaded?.value?.size ? { label: 'Size', value: formatBytes(loaded.value.size) } : null,
        // Where this song's sound goes right now (Hi-Res, bit-perfect...).
        isPlaying && output.mode !== 'idle' ? { label: 'Output', value: describeOutput(output) } : null,
        { label: 'File name', value: track.filename },
        { label: 'Folder', value: folder || track.folderTitle },
        track.dateAdded != null ? { label: 'Added', value: formatShortDate(track.dateAdded) } : null,
        track.dateModified != null ? { label: 'Changed', value: formatShortDate(track.dateModified) } : null,
      ],
    },
    {
      title: 'LISTENING',
      rows: [{ label: 'Plays', value: playCount > 0 ? formatPlayCount(playCount) : 'Not played yet' }],
    },
  ];

  return (
    <ScrollView style={styles.songInfoList} showsVerticalScrollIndicator={false}>
      {sections.map((section) => (
        <View key={section.title} style={styles.songInfoSection}>
          <Text accessibilityRole="header" style={styles.sortSheetSectionTitle}>
            {section.title}
          </Text>
          {section.rows
            .filter((row): row is Row => row !== null)
            .map((row) => (
              <View key={row.label} accessible style={styles.songInfoRow}>
                <Text style={styles.songInfoLabel}>{row.label}</Text>
                <Text selectable style={styles.songInfoValue}>
                  {row.value}
                </Text>
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}
