import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What Muse's home-screen widgets show. The app saves it whenever it changes,
 * so a widget can draw itself even while Muse is closed (Android may wake a
 * small background copy of Muse just to draw it). No widget-library import
 * here: this file also loads in Expo Go, where that library cannot.
 */
export type WidgetState = {
  hasTrack: boolean;
  title: string;
  artist: string;
  isPlaying: boolean;
  /** The song's cover as a data URI (widgets cannot read files), or null for none. */
  cover: string | null;
  /** The app's accent color. */
  accent: `#${string}`;
  dark: boolean;
  todayMinutes: number;
  goalMinutes: number;
  /** Days in a row with listening. */
  streak: number;
  /** The day (local YYYY-MM-DD) the minutes and streak were saved on. */
  day: string;
};

export const EMPTY_WIDGET_STATE: WidgetState = {
  hasTrack: false,
  title: 'Nothing playing',
  artist: 'Open Muse to play',
  isPlaying: false,
  cover: null,
  accent: '#C6F432',
  dark: true,
  todayMinutes: 0,
  goalMinutes: 30,
  streak: 0,
  day: '',
};

const KEY = '@muse/widget-state/v1';

export async function loadWidgetState(): Promise<WidgetState> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    return saved ? { ...EMPTY_WIDGET_STATE, ...(JSON.parse(saved) as Partial<WidgetState>) } : EMPTY_WIDGET_STATE;
  } catch {
    return EMPTY_WIDGET_STATE;
  }
}

export function saveWidgetState(state: WidgetState): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

/** Widget buttons reach the player only while Muse's app is running; the app hands it over here. */
export type WidgetPlayer = { togglePlayback(): void; skipNext(): void; skipPrevious(): void };
let player: WidgetPlayer | null = null;

export function setWidgetPlayer(next: WidgetPlayer | null) {
  player = next;
}

export function getWidgetPlayer(): WidgetPlayer | null {
  return player;
}
