import { FlexWidget, ImageWidget, OverlapWidget, SvgWidget, TextWidget, type WidgetInfo } from 'react-native-android-widget';

import type { WidgetState } from './state';

// Muse's home-screen widgets, drawn by react-native-android-widget into
// Android's widget views. Only load this file outside Expo Go (see
// MuseApp / index.ts): the library needs Muse's own build.

export const WIDGET_NAMES = ['NowPlaying', 'NowPlayingBar', 'NowPlayingLarge', 'Today'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

type Hex = `#${string}`;
type Colors = { card: Hex; text: Hex; muted: Hex; track: Hex };
const colorsFor = (dark: boolean): Colors =>
  dark
    ? { card: '#16181A', text: '#F5F5F7', muted: '#AEAEB2', track: '#2A2D30' }
    : { card: '#FFFFFF', text: '#202719', muted: '#767D6E', track: '#E7EAE1' };

const svg = (path: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="${path}"/></svg>`;
const PLAY = 'M8 5.5v13l10.5-6.5z';
const PAUSE = 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z';
const NEXT = 'M5.5 6l9 6-9 6zM16 6h2.5v12H16z';
const PREVIOUS = 'M18.5 6l-9 6 9 6zM5.5 6H8v12H5.5z';
const NOTE = 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3z';

/**
 * Buttons act on the player while Muse is running. Drawn without it (Muse
 * closed), they open Muse instead, so a tap is never lost.
 */
type Mode = { live: boolean };

function Button({ icon, action, label, size, color, mode }: { icon: string; action: string; label: string; size: number; color: string; mode: Mode }) {
  return (
    <FlexWidget
      clickAction={mode.live ? action : 'OPEN_APP'}
      accessibilityLabel={label}
      style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center', borderRadius: (size + 16) / 2 }}
    >
      <SvgWidget svg={svg(icon, color)} style={{ width: size, height: size }} />
    </FlexWidget>
  );
}

function Cover({ state, size, radius, colors }: { state: WidgetState; size: number; radius: number; colors: Colors }) {
  if (state.cover) {
    return <ImageWidget image={state.cover as `data:image${string}`} imageWidth={size} imageHeight={size} radius={radius} resizeMode="cover" clickAction="OPEN_APP" />;
  }
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' }}>
      <SvgWidget svg={svg(NOTE, colors.muted)} style={{ width: size * 0.4, height: size * 0.4 }} />
    </FlexWidget>
  );
}

function Titles({ state, colors, size = 15 }: { state: WidgetState; colors: Colors; size?: number }) {
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
      <TextWidget text={state.title} maxLines={1} truncate="END" style={{ fontSize: size, fontWeight: '700', color: colors.text }} />
      <TextWidget text={state.artist} maxLines={1} truncate="END" style={{ fontSize: size - 2, color: colors.muted, marginTop: 2 }} />
    </FlexWidget>
  );
}

function Controls({ state, colors, size, mode }: { state: WidgetState; colors: Colors; size: number; mode: Mode }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Button icon={PREVIOUS} action="PREVIOUS" label="Previous song" size={size} color={colors.text} mode={mode} />
      <Button icon={state.isPlaying ? PAUSE : PLAY} action="PLAY_PAUSE" label={state.isPlaying ? 'Pause' : 'Play'} size={size + 4} color={state.accent} mode={mode} />
      <Button icon={NEXT} action="NEXT" label="Next song" size={size} color={colors.text} mode={mode} />
    </FlexWidget>
  );
}

/** 2x2: the cover, with play/pause on it. */
function NowPlaying({ state, info, mode }: { state: WidgetState; info: WidgetInfo; mode: Mode }) {
  const colors = colorsFor(state.dark);
  const side = Math.max(80, Math.min(info.width, info.height));
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', alignItems: 'center', justifyContent: 'center' }}>
      {/* The button is layered over the cover's bottom-right corner. */}
      <OverlapWidget style={{ width: side, height: side, borderRadius: 24, backgroundColor: colors.card }}>
        <Cover state={state} size={side} radius={24} colors={colors} />
        <FlexWidget style={{ width: side, height: side, flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end', padding: 8 }}>
          <FlexWidget style={{ borderRadius: 22, backgroundColor: colors.card }}>
            <Button icon={state.isPlaying ? PAUSE : PLAY} action="PLAY_PAUSE" label={state.isPlaying ? 'Pause' : 'Play'} size={20} color={state.accent} mode={mode} />
          </FlexWidget>
        </FlexWidget>
      </OverlapWidget>
    </FlexWidget>
  );
}

/** 4x1: cover, song, and the three buttons in one row. */
function NowPlayingBar({ state, mode }: { state: WidgetState; mode: Mode }) {
  const colors = colorsFor(state.dark);
  return (
    <FlexWidget
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: colors.card, borderRadius: 24, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, flexGap: 10 }}
    >
      <Cover state={state} size={48} radius={12} colors={colors} />
      <Titles state={state} colors={colors} size={14} />
      <Controls state={state} colors={colors} size={20} mode={mode} />
    </FlexWidget>
  );
}

/** 4x2: a big cover beside the song and the buttons. */
function NowPlayingLarge({ state, info, mode }: { state: WidgetState; info: WidgetInfo; mode: Mode }) {
  const colors = colorsFor(state.dark);
  const side = Math.max(72, info.height - 24);
  return (
    <FlexWidget
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: colors.card, borderRadius: 24, flexDirection: 'row', alignItems: 'center', padding: 12, flexGap: 14 }}
    >
      <Cover state={state} size={side} radius={16} colors={colors} />
      <FlexWidget style={{ flex: 1, height: 'match_parent', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Titles state={state} colors={colors} size={16} />
        <Controls state={state} colors={colors} size={22} mode={mode} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** A ring that fills toward the daily goal. */
function goalRing(share: number, accent: string, track: string) {
  const r = 40;
  const length = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, share)) * length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="${track}" stroke-width="10"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${filled} ${length}" transform="rotate(-90 50 50)"/></svg>`;
}

/** 2x2: today's minutes against the daily goal, and the streak. */
function Today({ state }: { state: WidgetState }) {
  const colors = colorsFor(state.dark);
  const met = state.goalMinutes > 0 && state.todayMinutes >= state.goalMinutes;
  const left = Math.max(0, state.goalMinutes - state.todayMinutes);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`Today ${state.todayMinutes} of ${state.goalMinutes} minutes`}
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: colors.card, borderRadius: 24, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <TextWidget text="Today" style={{ fontSize: 13, fontWeight: '700', color: colors.muted }} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 12 }}>
        <SvgWidget svg={goalRing(state.goalMinutes > 0 ? state.todayMinutes / state.goalMinutes : 0, state.accent, colors.track)} style={{ width: 64, height: 64 }} />
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={`${state.todayMinutes}m`} style={{ fontSize: 24, fontWeight: '800', color: colors.text }} />
          <TextWidget text={met ? 'Goal met' : `${left}m to go`} style={{ fontSize: 12, color: met ? state.accent : colors.muted }} />
        </FlexWidget>
      </FlexWidget>
      <TextWidget
        text={state.streak > 0 ? `${state.streak} ${state.streak === 1 ? 'day' : 'days'} 🔥` : 'Play today to start a streak'}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 13, fontWeight: '600', color: colors.text }}
      />
    </FlexWidget>
  );
}

/** The widget named `name`, drawn from `state`; `live`: Muse's player is running in this process. */
export function renderMuseWidget(name: string, state: WidgetState, info: WidgetInfo, live: boolean) {
  const mode = { live };
  switch (name as WidgetName) {
    case 'NowPlayingBar':
      return <NowPlayingBar state={state} mode={mode} />;
    case 'NowPlayingLarge':
      return <NowPlayingLarge state={state} info={info} mode={mode} />;
    case 'Today':
      return <Today state={state} />;
    default:
      return <NowPlaying state={state} info={info} mode={mode} />;
  }
}
