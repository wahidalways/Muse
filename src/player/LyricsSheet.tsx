import { useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Sheet } from '../components/Sheet';
import { usePlaybackProgress } from '../playback/usePlayback';
import { activeLyricsLine, type Lyrics } from '../library/lyrics';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';

/**
 * Lyrics saved in the song file. Time-stamped lyrics follow the song: the
 * line playing is bright and kept in view, and tapping a line jumps there.
 * Plain lyrics are shown as text.
 */
export function LyricsSheet({
  visible,
  title,
  lyrics,
  onClose,
  onSeekTo,
}: {
  visible: boolean;
  title: string;
  lyrics: Lyrics;
  onClose: () => void;
  /** Jump the song to this many seconds in. */
  onSeekTo: (seconds: number) => void;
}) {
  const styles = useAppStyles();
  return (
    <Sheet visible={visible} eyebrow="LYRICS" title={title} onClose={onClose} tall>
      {lyrics.synced ? (
        <SyncedLines lyrics={lyrics} onSeekTo={onSeekTo} />
      ) : (
        <ScrollView contentContainerStyle={styles.lyricsContent} showsVerticalScrollIndicator={false}>
          <Text selectable style={styles.lyricsPlain}>
            {lyrics.lines.map((line) => line.text).join('\n')}
          </Text>
        </ScrollView>
      )}
    </Sheet>
  );
}

/** Its own component: it re-renders on every progress report, the sheet does not. */
function SyncedLines({ lyrics, onSeekTo }: { lyrics: Lyrics; onSeekTo: (seconds: number) => void }) {
  const styles = useAppStyles();
  const { currentTime } = usePlaybackProgress();
  const active = activeLyricsLine(lyrics.lines, currentTime);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const lineTops = useRef<number[]>([]);

  useEffect(() => {
    const top = lineTops.current[active];
    if (top !== undefined) {
      // A little below the top, so the next lines show too.
      scrollRef.current?.scrollTo({ y: Math.max(0, top - 96), animated: true });
    }
  }, [active]);

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.lyricsContent} showsVerticalScrollIndicator={false}>
      {lyrics.lines.map((line, index) => (
        <Pressable
          key={`${index}:${line.time}`}
          accessibilityRole="button"
          accessibilityLabel={line.text || 'Instrumental'}
          accessibilityHint="Plays from this line"
          accessibilityState={{ selected: index === active }}
          onLayout={(event) => {
            lineTops.current[index] = event.nativeEvent.layout.y;
          }}
          onPress={() => {
            if (line.time !== null) {
              hapticSelection();
              onSeekTo(line.time);
            }
          }}
        >
          <Text style={[styles.lyricsLine, index === active && styles.lyricsLineActive]}>
            {line.text || '♪'}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
