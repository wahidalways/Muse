import { useEffect, useRef, useSyncExternalStore, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { getPlaybackController } from '../playback/PlaybackController';
import { activeLyricsLine, type Lyrics } from '../library/lyrics';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';

/** After you scroll the lyrics yourself, they stop following the song for this long. */
const HANDS_OFF_MS = 2500;

/**
 * Lyrics in the full player, in place of the cover. Time-stamped lyrics
 * follow the song: the line playing is bright and kept near the top third,
 * and tapping a line plays from there. Plain lyrics are shown as text.
 */
export function LyricsView({
  lyrics,
  onSeekTo,
}: {
  /** Null: the song's file has none. */
  lyrics: Lyrics | null;
  onSeekTo: (seconds: number) => void;
}) {
  const styles = useAppStyles();
  if (!lyrics) {
    return (
      <View style={styles.playerPaneEmpty}>
        <Text style={styles.playerPaneEmptyTitle}>No lyrics in this file</Text>
        <Text style={styles.playerPaneEmptyText}>Lyrics saved in a song’s tags show up here.</Text>
      </View>
    );
  }
  if (!lyrics.synced) {
    return (
      <ScrollView contentContainerStyle={styles.playerLyricsContent} showsVerticalScrollIndicator={false}>
        <Text selectable style={styles.playerLyricsPlain}>
          {lyrics.lines.map((line) => line.text).join('\n')}
        </Text>
      </ScrollView>
    );
  }
  return <SyncedLines lyrics={lyrics} onSeekTo={onSeekTo} />;
}

function SyncedLines({ lyrics, onSeekTo }: { lyrics: Lyrics; onSeekTo: (seconds: number) => void }) {
  const styles = useAppStyles();
  const controller = getPlaybackController();
  // Re-renders only when the line changes, not on every position report.
  const active = useSyncExternalStore(controller.subscribeProgress, () =>
    activeLyricsLine(lyrics.lines, controller.getProgress().currentTime),
  );
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const lineTops = useRef<number[]>([]);
  const viewHeight = useRef(0);
  const handsOffUntil = useRef(0);

  useEffect(() => {
    const top = lineTops.current[active];
    if (top !== undefined && Date.now() > handsOffUntil.current) {
      scrollRef.current?.scrollTo({ y: Math.max(0, top - viewHeight.current * 0.3), animated: true });
    }
  }, [active]);

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.playerLyricsContent}
      showsVerticalScrollIndicator={false}
      onLayout={(event) => {
        viewHeight.current = event.nativeEvent.layout.height;
      }}
      onScrollBeginDrag={() => {
        handsOffUntil.current = Date.now() + HANDS_OFF_MS;
      }}
      onScrollEndDrag={() => {
        handsOffUntil.current = Date.now() + HANDS_OFF_MS;
      }}
    >
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
              handsOffUntil.current = 0;
              onSeekTo(line.time);
            }
          }}
        >
          <Text style={[styles.playerLyricsLine, index === active && styles.playerLyricsLineActive]}>
            {line.text || '♪'}
          </Text>
        </Pressable>
      ))}
      <Text style={styles.playerLyricsNote}>From the song file. Tap a line to play from there.</Text>
    </ScrollView>
  );
}
