import { useContext, useEffect, useMemo, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { Avatar } from '../components/Avatar';
import { BrandMark } from '../components/Brand';
import { Glass, useGlassColors } from '../components/Glass';
import { MuseArtTile } from '../components/MuseArt';
import { ControlIcon, PlaybackGlyph, opticalSize } from '../components/icons';
import { TABS, TabGlyph } from '../components/BottomTabs';
import { usePreferences } from '../settings/preferences';
import { useProfile } from '../settings/profile';
import { ThemeContext } from '../theme/theme';
import { useAppStyles } from '../theme/styles';
import { greeting } from '../utils/greeting';
import type { MusicTrack } from '../types';

/**
 * Small, still pictures of Muse for the setup steps. They are drawn from the
 * app's own colors, Muse art and glass, and show the listener's own songs
 * once the scan has found them. Nothing here plays sound or reads files.
 */

/** Made-up albums for previews before any music is found. */
export const SAMPLES = [
  { title: 'Glass Harbor', artist: 'Nadia Rowe' },
  { title: 'Paper Lanterns', artist: 'The Low Tides' },
  { title: 'Night Crossings', artist: 'Ilan Brooks' },
  { title: 'Orange Hours', artist: 'Sunroom' },
  { title: 'Northbound', artist: 'Kai Mendes' },
  { title: 'Small Weather', artist: 'Juno Park' },
];

/** The current theme's colors, read from the shared styles so every accent and theme stays in step. */
export function useTokens() {
  const styles = useAppStyles();
  const { theme } = useContext(ThemeContext);
  return useMemo(
    () => ({
      dark: theme === 'dark',
      bg: String(styles.screen.backgroundColor),
      card: String(styles.prefCard.backgroundColor),
      line: String(styles.prefSeparator.backgroundColor),
      text: String(styles.title.color),
      muted: String(styles.description.color),
      accent: String(styles.eyebrow.color),
      action: String(styles.primaryButton.backgroundColor),
      onAction: String(styles.primaryButtonLabel.color),
    }),
    [styles, theme],
  );
}

/** A cover: the listener's own song when there is one, else Muse art for a sample album. */
export function Cover({ track, index, size, radius }: { track?: MusicTrack; index: number; size: number; radius: number }) {
  const { artSet } = usePreferences();
  return track ? (
    <AlbumArtwork track={track} size={size} radius={radius} />
  ) : (
    <MuseArtTile name={SAMPLES[index % SAMPLES.length].title} set={artSet} size={size} radius={radius} />
  );
}

const songLine = (track: MusicTrack | undefined, index: number) =>
  track
    ? { title: track.title, artist: track.artist || track.album || track.folderTitle || 'Unknown artist' }
    : SAMPLES[index % SAMPLES.length];

/**
 * The dock as it will look: Joined, Floating or Solid. With `blurTarget` the
 * glass is the real Muse glass over it; without, only the glass colors.
 */
export function DockPreview({
  track,
  solid,
  joined,
  blurTarget,
}: {
  track?: MusicTrack;
  solid: boolean;
  joined: boolean;
  blurTarget?: RefObject<ComponentRef<typeof View> | null>;
}) {
  const tokens = useTokens();
  const glass = useGlassColors();
  const song = songLine(track, 0);
  const pane = (round: 'all' | 'top' | 'bottom') => ({
    backgroundColor: solid ? tokens.card : glass.fill,
    borderColor: glass.edge,
    borderWidth: solid ? 0 : StyleSheet.hairlineWidth,
    borderTopLeftRadius: solid || round === 'bottom' ? 0 : 24,
    borderTopRightRadius: solid || round === 'bottom' ? 0 : 24,
    borderBottomLeftRadius: solid || round === 'top' ? 0 : 24,
    borderBottomRightRadius: solid || round === 'top' ? 0 : 24,
  });
  const mini = (
    <View style={local.mini}>
      <Cover track={track} index={0} size={34} radius={8} />
      <View style={local.flex}>
        <Text numberOfLines={1} style={[local.miniTitle, { color: tokens.text }]}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={[local.miniSub, { color: tokens.muted }]}>
          {song.artist}
        </Text>
      </View>
      <PlaybackGlyph mode="pause" color="text" size={16} />
    </View>
  );
  // Joined and Solid carry Search in the row; Floating keeps it as a round button beside the pill.
  const searchInRow = solid || joined;
  const items = searchInRow ? [...TABS, { id: 'search', label: 'Search', icon: 'search-outline' as const, iconSelected: 'search' as const }] : TABS;
  const tabs = (
    <View style={local.tabs}>
      {items.map(
        (tab, index) => {
          const lit = index === 0;
          const color = lit ? tokens.accent : tokens.text;
          return (
            <View
              key={tab.id}
              style={[
                local.tab,
                lit && !solid && { backgroundColor: glass.capsule, borderColor: glass.capsuleEdge, borderWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <TabGlyph name={lit ? tab.iconSelected : tab.icon} size={opticalSize(tab.icon, 18)} style={{ color }} />
              <Text numberOfLines={1} style={[local.tabLabel, { color }]}>
                {tab.label}
              </Text>
            </View>
          );
        },
      )}
    </View>
  );
  if (solid) {
    return (
      <View style={[local.dock, local.dockSolid, { backgroundColor: tokens.card, borderTopColor: tokens.line }]}>
        {mini}
        {tabs}
      </View>
    );
  }
  // One piece of glass: real when there is something to blur, else its colors.
  const piece = (round: 'all' | 'top' | 'bottom', children: ReactNode, style?: StyleProp<ViewStyle>) =>
    blurTarget ? (
      <Glass blurTarget={blurTarget} radius={24} seam={round === 'top' ? 'bottom' : round === 'bottom' ? 'top' : undefined} style={style}>
        {children}
      </Glass>
    ) : (
      <View style={[pane(round), style]}>{children}</View>
    );
  return joined ? (
    <View style={local.dock}>
      {piece('top', mini, !blurTarget && { borderBottomColor: glass.edge })}
      {piece('bottom', tabs, !blurTarget && { borderTopWidth: 0 })}
    </View>
  ) : (
    <View style={[local.dock, local.dockGap]}>
      {piece('all', mini)}
      <View style={local.floatRow}>
        {piece('all', tabs, local.flex)}
        {piece('all', <Ionicons name="search" size={18} color={tokens.text} />, local.searchCircle)}
      </View>
    </View>
  );
}

/** Home's top, a shelf of covers and the dock: what the Look step changes. */
export function HomePreview({ tracks }: { tracks: MusicTrack[] }) {
  const tokens = useTokens();
  const profile = useProfile();
  const { miniDock } = usePreferences();
  const glass = useGlassColors();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[local.frame, local.home, { backgroundColor: tokens.bg, borderColor: tokens.line }]}>
      <View style={local.homeTop}>
        <BrandMark size={16} withName={false} />
        <Avatar profile={profile} size={28} />
      </View>
      <Text numberOfLines={1} style={[local.greet, { color: tokens.text }]}>
        {greeting(new Date().getHours(), profile.name.trim())}
      </Text>
      <Text style={[local.shelfLabel, { color: tokens.muted }]}>Jump back in</Text>
      <View style={local.shelf}>
        {[1, 2, 3].map((index) => {
          const song = songLine(tracks[index], index);
          return (
            <View key={index} style={local.shelfItem}>
              <Cover track={tracks[index]} index={index} size={88} radius={10} />
              <Text numberOfLines={1} style={[local.shelfTitle, { color: tokens.text }]}>
                {song.title}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={local.dockSpot}>
        <DockPreview track={tracks[0]} solid={glass.style === 'solid'} joined={miniDock === 'joined'} />
      </View>
    </View>
  );
}

/**
 * Pick your look's pinned preview: a small phone showing Home with covers
 * drifting under the real Muse dock (true glass, or the solid bar), so every
 * choice on the step shows while the options scroll under it. The greeting
 * and avatar follow the profile. The belt slides on the UI thread and stops
 * for Reduce motion.
 */
export function LookPhone({ tracks }: { tracks: MusicTrack[] }) {
  const tokens = useTokens();
  const profile = useProfile();
  const { miniDock } = usePreferences();
  const glass = useGlassColors();
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const target = useRef<ComponentRef<typeof View>>(null);
  const phoneWidth = Math.min(250, Math.round((width - 48) * 0.72));
  // Never more than about a third of the screen, so the options keep room.
  const phoneHeight = Math.min(Math.round(phoneWidth * 1.15), Math.round(height * 0.36));
  const shift = useSharedValue(0);
  const BELT = 6 * 74;
  useEffect(() => {
    if (still) {
      return;
    }
    shift.set(withRepeat(withTiming(-BELT, { duration: 16000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(shift);
  }, [BELT, shift, still]);
  const beltStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }));
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[local.frame, local.phone, { width: phoneWidth, height: phoneHeight, backgroundColor: tokens.bg, borderColor: tokens.line }]}
    >
      <BlurTargetView ref={target} style={[StyleSheet.absoluteFill, local.phoneInner]}>
        <View style={local.phoneTop}>
          <BrandMark size={14} withName={false} />
          <Avatar profile={profile} size={24} />
        </View>
        <Text numberOfLines={1} style={[local.greet, local.phoneGreet, { color: tokens.text }]}>
          {greeting(new Date().getHours(), profile.name.trim())}
        </Text>
        <Text style={[local.shelfLabel, { color: tokens.muted }]}>Jump back in</Text>
        <View style={local.phoneBelt}>
          <Animated.View style={[local.belt, beltStyle]}>
            {[0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5].map((index, at) => (
              <Cover key={at} track={tracks[index]} index={index} size={64} radius={10} />
            ))}
          </Animated.View>
        </View>
      </BlurTargetView>
      <View style={local.dockSpot}>
        <DockPreview track={tracks[0]} solid={glass.style === 'solid'} joined={miniDock === 'joined'} blurTarget={target} />
      </View>
    </View>
  );
}

/** The greeting and goal ring from Home, for the You step. */
export function GreetingPreview({ goalLabel }: { goalLabel: string | null }) {
  const tokens = useTokens();
  const profile = useProfile();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[local.frame, local.greetCard, { backgroundColor: tokens.bg, borderColor: tokens.line }]}>
      <Avatar profile={profile} size={46} />
      <View style={local.flex}>
        <Text numberOfLines={1} style={[local.greet, local.greetSmall, { color: tokens.text }]}>
          {greeting(new Date().getHours(), profile.name.trim())}
        </Text>
        <Text style={[local.miniSub, { color: tokens.muted }]}>{goalLabel ? `0m of ${goalLabel} today` : 'No daily goal'}</Text>
      </View>
      <View style={[local.ring, { borderColor: tokens.line }, goalLabel ? { borderTopColor: tokens.accent } : null]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tour demos. Each loops only while its card is the one on screen.

function useLoop(active: boolean, make: () => number) {
  const value = useSharedValue(0);
  useEffect(() => {
    if (active) {
      value.set(make());
    } else {
      cancelAnimation(value);
      value.set(0);
    }
    return () => cancelAnimation(value);
    // `make` is a fresh arrow each render; only `active` decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, value]);
  return value;
}

const SLIDE = 116;

/** A song slides right to show Play next, the way the swipe works in lists. */
export function GestureDemo({ active, tracks }: { active: boolean; tracks: MusicTrack[] }) {
  const tokens = useTokens();
  const x = useLoop(active, () =>
    withRepeat(
      withSequence(
        withDelay(500, withTiming(SLIDE, { duration: 700, easing: Easing.out(Easing.cubic) })),
        withDelay(500, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) })),
      ),
      -1,
      false,
    ),
  );
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: x.get() > 2 ? 0.3 : 0, transform: [{ translateX: x.get() }] }));
  return (
    <View style={[local.frame, local.demo, { backgroundColor: tokens.bg, borderColor: tokens.line }]}>
      <View style={local.swipeRow}>
        <View style={[StyleSheet.absoluteFill, local.under, { backgroundColor: tokens.action }]}>
          <Ionicons name="return-down-forward-outline" size={18} color={tokens.onAction} />
          <Text style={[local.underLabel, { color: tokens.onAction }]}>Play next</Text>
        </View>
        <Animated.View style={[local.demoSong, { backgroundColor: tokens.bg }, rowStyle]}>
          <DemoSong track={tracks[3]} index={3} />
        </Animated.View>
        <Animated.View style={[local.touch, { backgroundColor: tokens.text }, dotStyle]} />
      </View>
      <View style={[local.demoSong, local.faded]}>
        <DemoSong track={tracks[4]} index={4} />
      </View>
      <View style={[local.demoSong, local.faded]}>
        <DemoSong track={tracks[5]} index={5} />
      </View>
    </View>
  );
}

function DemoSong({ track, index }: { track?: MusicTrack; index: number }) {
  const tokens = useTokens();
  const song = songLine(track, index);
  return (
    <>
      <Cover track={track} index={index} size={40} radius={8} />
      <View style={local.flex}>
        <Text numberOfLines={1} style={[local.miniTitle, { color: tokens.text }]}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={[local.miniSub, { color: tokens.muted }]}>
          {song.artist}
        </Text>
      </View>
    </>
  );
}

const LYRICS = ['Lights on the water', 'I kept the window open', 'Every ferry going home', 'Sings the same old tune', 'Glass harbor, hold me'];
const LINE = 28;

/** Lyrics roll under the controls, with the Lyrics and Up Next bar below. */
export function PlayerDemo({ active }: { active: boolean }) {
  const tokens = useTokens();
  const y = useLoop(active, () =>
    withRepeat(
      withSequence(
        withDelay(1400, withTiming(-LINE, { duration: 380 })),
        withDelay(1400, withTiming(-LINE * 2, { duration: 380 })),
        withDelay(1400, withTiming(-LINE * 3, { duration: 380 })),
        withDelay(1400, withTiming(0, { duration: 380 })),
      ),
      -1,
      false,
    ),
  );
  const linesStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <View style={[local.frame, local.demo, { backgroundColor: tokens.bg, borderColor: tokens.line }]}>
      <View style={local.lyricsWindow}>
        <Animated.View style={linesStyle}>
          {LYRICS.map((line, index) => (
            <LyricLine key={line} text={line} index={index} y={y} />
          ))}
        </Animated.View>
      </View>
      <View style={[local.playerBar, { backgroundColor: tokens.card }]}>
        <View style={local.barItem}>
          <ControlIcon name="lyrics" size={15} />
          <Text style={[local.barLabel, { color: tokens.text }]}>Lyrics</Text>
        </View>
        <ControlIcon name="moon" size={15} tone="muted" />
        <View style={local.barItem}>
          <ControlIcon name="queue" size={15} tone="muted" />
          <Text style={[local.barLabel, { color: tokens.muted }]}>Up Next</Text>
        </View>
      </View>
    </View>
  );
}

function LyricLine({ text, index, y }: { text: string; index: number; y: { get: () => number } }) {
  const tokens = useTokens();
  // The line in the second slot is the one being sung.
  const style = useAnimatedStyle(() => ({ opacity: Math.abs(index * LINE + y.get() - LINE) < LINE / 2 ? 1 : 0.35 }));
  return <Animated.Text style={[local.lyric, { color: tokens.text }, style]}>{text}</Animated.Text>;
}

/** Two Home widgets trade places, as Customize lets you do. */
export function HomeDemo({ active }: { active: boolean }) {
  const tokens = useTokens();
  const t = useLoop(active, () =>
    withRepeat(
      withSequence(withDelay(900, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })), withDelay(1200, withTiming(0, { duration: 650 }))),
      -1,
      false,
    ),
  );
  const width = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateX: t.get() * (width.get() + 8) }] }));
  const bStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -t.get() * (width.get() + 8) }] }));
  const tile = (title: string, sub: string) => (
    <View style={[local.widget, { backgroundColor: tokens.card }]} onLayout={(event) => width.set(event.nativeEvent.layout.width)}>
      <Text style={[local.widgetTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[local.miniSub, { color: tokens.muted }]}>{sub}</Text>
    </View>
  );
  return (
    <View style={[local.frame, local.demo, { backgroundColor: tokens.bg, borderColor: tokens.line }]}>
      <View style={local.widgets}>
        <Animated.View style={[local.widgetCell, aStyle]}>{tile('Daily goal', '12m of 30m')}</Animated.View>
        <Animated.View style={[local.widgetCell, bStyle]}>{tile('Mixes', '3 ready')}</Animated.View>
        <View style={local.widgetCell}>{tile('Your week', 'Recap')}</View>
        <View style={local.widgetCell}>{tile('Top song', 'Glass Harbor')}</View>
      </View>
      <View style={[local.customize, { backgroundColor: tokens.card }]}>
        <Text style={[local.barLabel, { color: tokens.text }]}>Customize</Text>
      </View>
    </View>
  );
}

/** A list re-sorts itself, with the sort's name changing above it. */
export function LibraryDemo({ active, tracks }: { active: boolean; tracks: MusicTrack[] }) {
  const tokens = useTokens();
  const t = useLoop(active, () =>
    withRepeat(
      withSequence(withDelay(1600, withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) })), withDelay(1600, withTiming(0, { duration: 550 }))),
      -1,
      false,
    ),
  );
  const first = useAnimatedStyle(() => ({ transform: [{ translateY: t.get() * 108 }] }));
  const last = useAnimatedStyle(() => ({ transform: [{ translateY: -t.get() * 108 }] }));
  const nameA = useAnimatedStyle(() => ({ opacity: 1 - t.get() }));
  const nameB = useAnimatedStyle(() => ({ opacity: t.get() }));
  return (
    <View style={[local.frame, local.demo, { backgroundColor: tokens.bg, borderColor: tokens.line }]}>
      <View style={local.sortName}>
        <Animated.Text style={[local.sortLabel, { color: tokens.accent }, nameA]}>Title A to Z</Animated.Text>
        <Animated.Text style={[local.sortLabel, local.sortLabelOver, { color: tokens.accent }, nameB]}>Recently added</Animated.Text>
      </View>
      <Animated.View style={[local.sortRow, first]}>
        <DemoSong track={tracks[0]} index={0} />
      </Animated.View>
      <View style={local.sortRow}>
        <DemoSong track={tracks[1]} index={1} />
      </View>
      <Animated.View style={[local.sortRow, last]}>
        <DemoSong track={tracks[4]} index={4} />
      </Animated.View>
    </View>
  );
}

const local = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  frame: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  home: { height: 360, padding: 16 },
  homeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 30 },
  greet: { marginTop: 12, fontSize: 21, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  greetSmall: { marginTop: 0, fontSize: 18, lineHeight: 23 },
  shelfLabel: { marginTop: 14, fontSize: 13, fontWeight: '600' },
  shelf: { marginTop: 8, flexDirection: 'row', gap: 10 },
  shelfItem: { width: 88 },
  shelfTitle: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  dockSpot: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  dock: {},
  dockGap: { gap: 6 },
  floatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchCircle: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  dockSolid: { marginHorizontal: -8, marginBottom: -8, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 10 },
  miniTitle: { fontSize: 13, fontWeight: '600' },
  miniSub: { fontSize: 12, marginTop: 1 },
  tabs: { flexDirection: 'row', padding: 3 },
  tab: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 22 },
  tabLabel: { fontSize: 9, fontWeight: '600' },
  // Pick your look: the pinned phone.
  phone: { alignSelf: 'center' },
  phoneInner: { padding: 12 },
  phoneTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 26 },
  phoneGreet: { marginTop: 6, fontSize: 16, lineHeight: 21 },
  phoneBelt: { marginTop: 8, height: 64, marginHorizontal: -12 },
  belt: { position: 'absolute', top: 14, left: 0, flexDirection: 'row', gap: 10 },
  greetCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 5 },
  demo: { height: 210, padding: 16, gap: 6 },
  swipeRow: { borderRadius: 14, overflow: 'hidden' },
  under: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16 },
  underLabel: { fontSize: 13, fontWeight: '700' },
  demoSong: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 10, borderRadius: 14 },
  faded: { opacity: 0.45 },
  touch: { position: 'absolute', left: 150, top: 14, width: 28, height: 28, borderRadius: 14 },
  lyricsWindow: { height: LINE * 4, overflow: 'hidden' },
  lyric: { height: LINE, lineHeight: LINE, fontSize: 16, fontWeight: '700' },
  playerBar: { marginTop: 'auto', height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  barItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { fontSize: 12, fontWeight: '600' },
  widgets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  widgetCell: { width: '48%' },
  widget: { height: 62, borderRadius: 14, padding: 10, justifyContent: 'space-between' },
  widgetTitle: { fontSize: 13, fontWeight: '700' },
  customize: { marginTop: 'auto', alignSelf: 'center', height: 34, paddingHorizontal: 16, borderRadius: 17, justifyContent: 'center' },
  sortName: { height: 26, justifyContent: 'center' },
  sortLabel: { fontSize: 13, fontWeight: '600' },
  sortLabelOver: { position: 'absolute', left: 0 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48 },
});
