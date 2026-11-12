import { File } from 'expo-file-system';
import { useEffect, useMemo } from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { getCoverThumb } from '../../modules/muse-audio-metadata';
import { getSongCover } from '../library/covers';
import { getGoalSummary, getStreaks } from '../history/stats';
import { getPlaybackController } from '../playback/PlaybackController';
import type { ListeningEvent, MusicTrack } from '../types';
import { renderMuseWidget, WIDGET_NAMES } from './MuseWidgets';
import { saveWidgetState, setWidgetPlayer, type WidgetState } from './state';
import { localDay } from './today';

/** Changes this close together redraw the widgets once. */
const SETTLE_MS = 400;

/** A song's cover as a data URI for the widgets (they cannot read files): the cover Muse shows, list size. */
async function coverData(track: MusicTrack): Promise<string | null> {
  try {
    const own = getSongCover(track.id);
    if (own?.kind === 'muse') {
      return null;
    }
    const uri = own?.kind === 'image' ? own.uri : await getCoverThumb(track.id);
    if (!uri || !uri.startsWith('file://')) {
      return null;
    }
    const base64 = await new File(uri).base64();
    return `data:image/${uri.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Keeps the home-screen widgets in step with Muse: the song and play state,
 * and today's minutes, goal and streak. Saves what they show for when Muse is
 * closed, and lends them the player while it runs. Mounted only in Muse's own
 * build (the widget library is not in Expo Go).
 */
export function WidgetSync({
  track,
  isPlaying,
  history,
  tracksById,
  goalMinutes,
  accent,
  dark,
}: {
  track: MusicTrack | null;
  isPlaying: boolean;
  history: ListeningEvent[];
  tracksById: Map<string, MusicTrack>;
  goalMinutes: number;
  accent: string;
  dark: boolean;
}) {
  useEffect(() => {
    const player = getPlaybackController();
    setWidgetPlayer(player);
    return () => setWidgetPlayer(null);
  }, []);

  const listening = useMemo(() => {
    const summary = getGoalSummary(history, (id) => tracksById.get(id), goalMinutes * 60);
    return { todayMinutes: Math.floor(summary.todaySeconds / 60), streak: getStreaks(history).current };
  }, [goalMinutes, history, tracksById]);

  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(() => {
      void (async () => {
        const state: WidgetState = {
          hasTrack: track !== null,
          title: track?.title ?? 'Nothing playing',
          artist: track ? track.artist ?? 'Unknown artist' : 'Open Muse to play',
          isPlaying: track !== null && isPlaying,
          cover: track ? await coverData(track) : null,
          accent: (accent.startsWith('#') ? accent : `#${accent}`) as `#${string}`,
          dark,
          todayMinutes: listening.todayMinutes,
          goalMinutes,
          streak: listening.streak,
          day: localDay(),
        };
        if (!isActive) {
          return;
        }
        await saveWidgetState(state);
        for (const name of WIDGET_NAMES) {
          // Quietly does nothing when that widget is not on the home screen.
          requestWidgetUpdate({ widgetName: name, renderWidget: (info) => renderMuseWidget(name, state, info, true) }).catch(() => undefined);
        }
      })();
    }, SETTLE_MS);
    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [accent, dark, goalMinutes, isPlaying, listening, track]);

  return null;
}
