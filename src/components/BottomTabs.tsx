import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { setBarMinimized, useBarMinimized } from '../motion/barScroll';
import type { MusicTrack, Tab } from '../types';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT } from '../motion/motion';
import { hapticSelection } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';
import { Glass, useGlassColors } from './Glass';
import { opticalSize, PlaybackGlyph } from './icons';
import { PressableScale } from './PressableScale';
import { MINI_ART_RADIUS, MiniProgressLine, SETTLED_MS } from '../player/MiniPlayer';
import type { PlayerTransition } from '../player/playerTransition';
import { useTrackSwipe } from '../player/useTrackSwipe';
import { SearchInput } from './SearchInput';

type IconName = ComponentProps<typeof Ionicons>['name'];
type BlurTarget = RefObject<ComponentRef<typeof View> | null>;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Each glyph names a place, not an action: Library is your songs,
 * Collections the ways your songs are grouped (playlists, favorites,
 * albums, artists, smart lists). The glass bar shows the filled glyph on
 * every tab, as iOS 26 does, and colors only the selected one; Solid keeps
 * Android's outline at rest. The Collections tab's id stays 'more', so saved
 * start-tab choices keep working; so does Home's ('home'). Equalizer lives in Settings.
 */
const TABS: { id: Tab; label: string; icon: IconName; iconSelected: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home-outline', iconSelected: 'home' },
  { id: 'library', label: 'Library', icon: 'musical-notes-outline', iconSelected: 'musical-notes' },
  { id: 'more', label: 'Collections', icon: 'albums-outline', iconSelected: 'albums' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', iconSelected: 'settings' },
];

/** A soft spring, so the capsule glides and settles like a drop of liquid. */
const CAPSULE_SPRING = { damping: 18, stiffness: 200, mass: 0.8 };
/** Quick and a little bouncy: the lens lifting under the finger. */
const LIFT_SPRING = { damping: 14, stiffness: 320, mass: 0.6 };
/** Close behind the finger without lag. */
const FOLLOW_SPRING = { damping: 26, stiffness: 520, mass: 0.5 };
const INDICATOR_TIMING = { duration: 220, easing: EASE_OUT };
/** The search glyph: no label under it, so a touch smaller than the tab icons. */
const SEARCH_GLYPH = 22;
/** The cover in the shrunk bar's song. */
const SONG_ART = 40;
/** Glass circles pop in and out from this size; uniform scale keeps them round. */
const SHRUNK = 0.6;
const POP_IN_SPRING = { damping: 15, stiffness: 260, mass: 0.7 };
const SLIDE_SPRING = { damping: 20, stiffness: 230, mass: 0.8 };

// Swaps in the bar move only transform and opacity, the fast path that never
// waits on React. (A glass size change rebuilds its blur every frame.)
const CIRCLE_IN = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: SHRUNK }] },
    animations: {
      opacity: withTiming(1, { duration: 140 }),
      transform: [{ scale: withSpring(1, POP_IN_SPRING) }],
    },
  };
};
const CIRCLE_OUT = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 120 }),
      transform: [{ scale: withTiming(SHRUNK, { duration: 140, easing: EASE_OUT }) }],
    },
  };
};
/**
 * Every round glass piece and the bar share this height. Declared before the
 * field animations, which Reanimated on web runs while this file loads.
 */
const SLOT = 56;
/** The field starts where the search circle sits and slides open to the left. */
const FIELD_IN = (values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: values.targetWidth - SLOT }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [{ translateX: withSpring(0, SLIDE_SPRING) }],
    },
  };
};
/** Closing: back into the search circle's spot, where the circle pops back. */
const FIELD_OUT = (values: ExitAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: 180 }),
      transform: [{ translateX: withTiming(values.currentWidth - SLOT, { duration: 200, easing: EASE_OUT }) }],
    },
  };
};
/** Text and caret appear once the field has mostly opened. */
const FIELD_CONTENT_IN = FadeIn.delay(110).duration(160).easing(EASE_OUT);
/** The song joins the shrunk bar from beside the tab circle. */
const SONG_IN = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: -20 }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [{ translateX: withSpring(0, SLIDE_SPRING) }],
    },
  };
};

/** Tab icons: a quick sink under the finger, a soft bounce back. */
const PRESSED_SCALE = 0.86;
const PRESS_SPRING = { damping: 20, stiffness: 500, mass: 0.5 };
const POP_SPRING = { damping: 9, stiffness: 260, mass: 0.6 };
const SWAP_IN = FadeIn.duration(180).easing(EASE_OUT);
const SWAP_OUT = FadeOut.duration(120).easing(EASE_OUT);

const GAP = 8;
const SIDE = 14;
/** The pill's inner padding around the tab row. */
const PILL_PAD = 3;
const ROW_HEIGHT = SLOT - PILL_PAD * 2;
/** How much the pressed lens grows, and how much it magnifies. */
const LENS_GROW = 0.32;
const LENS_RISE = 8;
const MAGNIFY = 0.28;

type NowPlaying = {
  track: MusicTrack;
  isPlaying: boolean;
  isBuffering: boolean;
  onTogglePlayback: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** The song a skip would land on, or null when Previous would restart. */
  trackAfterSkip: (direction: 1 | -1) => MusicTrack | null;
  onOpenPlayer: () => void;
  /** A swipe up pulled the full player open (or let it go). */
  onOpenChange: (open: boolean) => void;
  /** The mini <-> full player morph, which this song in the bar takes part in. */
  transition: PlayerTransition;
};

type BarProps = {
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onSearch: () => void;
  blurTarget: BlurTarget;
  /** The tabs turn into a search field, and search into a way out. */
  isSearching: boolean;
  query: string;
  onChangeQuery: (text: string) => void;
  onCloseSearch: () => void;
  /** The phone's navigation bar height, which the bar pads below itself. */
  bottomInset: number;
  /** The song in the mini player, which joins the shrunk bar's row. */
  nowPlaying: NowPlaying | null;
};

/** Frosted and Full blur float as glass; Solid is a classic bar on the edge. */
export const BottomTabs = memo(function BottomTabs(props: BarProps) {
  const glass = useGlassColors();
  return glass.style === 'solid' ? <SolidBar {...props} /> : <GlassBar {...props} />;
});

/** Equalizer lives in Settings, so Settings stays lit while it is open. */
const shownTabFor = (activeTab: Tab) => (activeTab === 'equalizer' ? 'settings' : activeTab);

const clamp = (value: number, low: number, high: number) => {
  'worklet';
  return Math.min(high, Math.max(low, value));
};

// ---------- Solid: one opaque bar, Android style ----------

function SolidBar({
  activeTab,
  onSelectTab,
  onSearch,
  isSearching,
  query,
  onChangeQuery,
  onCloseSearch,
  bottomInset,
}: BarProps) {
  const styles = useAppStyles();
  const shownTab = shownTabFor(activeTab);

  return (
    <View style={[styles.solidBar, { paddingBottom: bottomInset }]}>
      {isSearching ? (
        <Animated.View key="field" entering={SWAP_IN} exiting={SWAP_OUT} style={styles.solidSearchRow}>
          <View style={[styles.searchPill, styles.dockSlot]}>
            <SearchInput query={query} onChangeQuery={onChangeQuery} autoFocus />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close search"
            onPress={onCloseSearch}
            style={styles.solidSearchCancel}
          >
            <Text style={styles.solidSearchCancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          key="tabs"
          entering={SWAP_IN}
          exiting={SWAP_OUT}
          accessibilityRole="tablist"
          style={styles.solidTabRow}
        >
          {TABS.map((tab) => (
            <SolidItem
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              iconSelected={tab.iconSelected}
              selected={tab.id === shownTab}
              role="tab"
              onPress={() => onSelectTab(tab.id)}
            />
          ))}
          <SolidItem
            label="Search"
            icon="search"
            iconSelected="search"
            selected={false}
            role="button"
            onPress={onSearch}
          />
        </Animated.View>
      )}
    </View>
  );
}

function SolidItem({
  label,
  icon,
  iconSelected,
  selected,
  role,
  onPress,
}: {
  label: string;
  icon: IconName;
  iconSelected: IconName;
  selected: boolean;
  role: 'tab' | 'button';
  onPress: () => void;
}) {
  const styles = useAppStyles();
  // Starts at rest, so nothing animates on launch.
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(selected ? 1 : 0, INDICATOR_TIMING));
  }, [progress, selected]);
  // The pill grows out from the icon's middle, the way Android's own bar does.
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scaleX: 0.4 + progress.get() * 0.6 }],
  }));

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'tab' ? { selected } : undefined}
      onPress={onPress}
      style={styles.solidItem}
    >
      <View style={styles.solidIndicatorWrap}>
        <Animated.View style={[styles.solidIndicator, indicatorStyle]} />
        <Ionicons
          accessible={false}
          name={selected ? iconSelected : icon}
          size={opticalSize(selected ? iconSelected : icon, 22)}
          style={[styles.solidIcon, selected && styles.solidIconActive]}
        />
      </View>
      <Text numberOfLines={1} style={[styles.solidLabel, selected && styles.solidLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- Frosted and Full blur: floating glass ----------

/**
 * Three fixed layouts, swapped with a short fade. (Resizing glass on every
 * frame made Android rebuild its blur every frame, which was slow.)
 * - at rest: tab pill and search circle;
 * - scrolled down: the current tab's circle, the playing song, search;
 * - searching: the current tab's circle (tap to leave) and the field.
 * The search circle stays put across rest and scrolled, so a fold mounts less.
 */
function GlassBar({
  activeTab,
  onSelectTab,
  onSearch,
  blurTarget,
  isSearching,
  query,
  onChangeQuery,
  onCloseSearch,
  bottomInset,
  nowPlaying,
}: BarProps) {
  const styles = useAppStyles();
  // Read here, not in the app root, so a fold redraws only the bar.
  const minimized = useBarMinimized() && !isSearching;
  const tab = TABS.find((item) => item.id === shownTabFor(activeTab)) ?? TABS[0];

  return (
    <View style={[localStyles.dock, { paddingBottom: 6 + bottomInset }]}>
      <View style={localStyles.slot}>
        {isSearching ? (
          <View key="search" style={localStyles.layout}>
            <Animated.View entering={CIRCLE_IN} exiting={CIRCLE_OUT}>
              <TabCircle tab={tab} label="Close search" onPress={onCloseSearch} blurTarget={blurTarget} />
            </Animated.View>
            {/* The field slides out of the search circle's spot, so it reads as the circle opening up. */}
            <Animated.View entering={FIELD_IN} exiting={FIELD_OUT} style={localStyles.fill}>
              <Glass blurTarget={blurTarget} radius={SLOT / 2} style={styles.searchField}>
                <Animated.View entering={FIELD_CONTENT_IN} style={styles.searchFieldRow}>
                  <SearchInput query={query} onChangeQuery={onChangeQuery} autoFocus />
                </Animated.View>
              </Glass>
            </Animated.View>
          </View>
        ) : minimized ? (
          <View key="folded" style={localStyles.layout}>
            <Animated.View entering={CIRCLE_IN} exiting={CIRCLE_OUT}>
              <TabCircle
                tab={tab}
                label={`Show all tabs, now on ${tab.label}`}
                onPress={() => setBarMinimized(false)}
                blurTarget={blurTarget}
              />
            </Animated.View>
            {nowPlaying ? (
              <Animated.View entering={SONG_IN} exiting={SWAP_OUT} style={localStyles.songPill}>
                <Glass blurTarget={blurTarget} radius={SLOT / 2} style={localStyles.fill}>
                  <SongInBar {...nowPlaying} />
                </Glass>
              </Animated.View>
            ) : (
              <View style={localStyles.fill} />
            )}
            <View style={localStyles.searchSpace} />
          </View>
        ) : (
          <Animated.View key="full" entering={SWAP_IN} exiting={SWAP_OUT} style={localStyles.layout}>
            <TabPill activeTab={activeTab} onSelectTab={onSelectTab} blurTarget={blurTarget} />
            <View style={localStyles.searchSpace} />
          </Animated.View>
        )}
        {!isSearching && (
          <Animated.View entering={CIRCLE_IN} exiting={CIRCLE_OUT} style={localStyles.searchCircle}>
            <Glass blurTarget={blurTarget} radius={SLOT / 2} style={styles.bottomSearch}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search your music"
                onPress={onSearch}
                style={styles.bottomSearchButton}
              >
                {({ pressed }) => (
                  <PressScale pressed={pressed}>
                    <Ionicons
                      accessible={false}
                      name="search"
                      size={opticalSize('search', SEARCH_GLYPH)}
                      style={styles.bottomTabIcon}
                    />
                  </PressScale>
                )}
              </Pressable>
            </Glass>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** The current tab alone, in a glass circle. */
function TabCircle({
  tab,
  label,
  onPress,
  blurTarget,
}: {
  tab: (typeof TABS)[number];
  label: string;
  onPress: () => void;
  blurTarget: BlurTarget;
}) {
  const styles = useAppStyles();
  return (
    <Glass blurTarget={blurTarget} radius={SLOT / 2} style={styles.bottomSearch}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.bottomSearchButton}>
        {({ pressed }) => (
          <PressScale pressed={pressed}>
            <Ionicons
              accessible={false}
              name={tab.iconSelected}
              size={opticalSize(tab.iconSelected, 24)}
              style={styles.bottomTabIconActive}
            />
          </PressScale>
        )}
      </Pressable>
    </Glass>
  );
}

/** Sinks a little under the finger and springs back. Scale only. */
function PressScale({ pressed, children }: { pressed: boolean; children: ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.set(withSpring(pressed ? PRESSED_SCALE : 1, pressed ? PRESS_SPRING : POP_SPRING));
  }, [pressed, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * The mini player inside the shrunk bar: cover, title and artist, play or
 * pause, next, and the progress line. While it shows, it is where the full
 * player grows from and closes back into, so it reports its place the same
 * way the floating card does (`transition.miniCard` / `miniArt`).
 */
function SongInBar({
  track,
  isPlaying,
  isBuffering,
  onTogglePlayback,
  onNext,
  onPrevious,
  trackAfterSkip,
  onOpenPlayer,
  onOpenChange,
  transition,
}: NowPlaying) {
  const styles = useAppStyles();
  // The floating card's swipes: sideways to skip, up to pull the player out.
  const swipe = useTrackSwipe({
    track,
    onNext,
    onPrevious,
    trackAfterSkip,
    openDrag: { transition, onOpenChange },
  });
  // Trails `track` during a song change, so the swap happens out of sight.
  const shown = swipe.shownTrack;
  const cardRef = useRef<ComponentRef<typeof Animated.View>>(null);
  const artRef = useRef<ComponentRef<typeof Animated.View>>(null);
  // Only while the player is closed: with it open the app behind is shrunk.
  const measure = useCallback(() => {
    if (transition.progress.get() !== 0) {
      return;
    }
    cardRef.current?.measureInWindow((x, y, width, height) => transition.miniCard.set({ x, y, width, height }));
    artRef.current?.measureInWindow((x, y, width, height) => transition.miniArt.set({ x, y, width, height }));
  }, [transition]);
  // Hands over to the player sheet as it opens, as the floating card does,
  // and hides its cover while the big one is in flight.
  const handOffStyle = useAnimatedStyle(() => ({
    opacity: interpolate(transition.progress.get(), [0, 0.15], [1, 0], Extrapolation.CLAMP),
  }));
  const artStyle = useAnimatedStyle(() => ({ opacity: transition.progress.get() > 0.001 ? 0 : 1 }));
  // Once it has slid in, it is the spot the player opens from and closes into,
  // even when the player is opened from elsewhere (a Home card).
  useEffect(() => {
    const timer = setTimeout(measure, SETTLED_MS);
    return () => clearTimeout(timer);
  }, [measure]);
  const artist = shown.artist || shown.albumArtist || shown.album || shown.folderTitle || 'Unknown artist';

  return (
    <Animated.View ref={cardRef} collapsable={false} style={[localStyles.fill, handOffStyle]}>
      <View style={localStyles.song}>
        <GestureDetector gesture={swipe.gesture}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`Open full music player for ${shown.title} by ${artist}`}
            accessibilityHint="Swipe left or right to change the song"
            onPress={() => {
              measure();
              onOpenPlayer();
            }}
            style={[localStyles.songInfo, swipe.style]}
          >
            {/* Same corners as the floating card's cover, so the flying cover lands exactly. */}
            <Animated.View ref={artRef} collapsable={false} style={artStyle}>
              <AlbumArtwork track={shown} size={SONG_ART} radius={MINI_ART_RADIUS} />
            </Animated.View>
            <View style={localStyles.songCopy}>
              <Text numberOfLines={1} style={[styles.miniPlayerTitle, localStyles.songTitle]}>
                {shown.title}
              </Text>
              <Text numberOfLines={1} style={[styles.miniPlayerHint, localStyles.songArtist]}>
                {artist}
              </Text>
            </View>
          </AnimatedPressable>
        </GestureDetector>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause song' : 'Play song'}
          accessibilityState={{ busy: isBuffering }}
          onPress={onTogglePlayback}
          style={localStyles.songButton}
        >
          {isBuffering ? (
            <ActivityIndicator color={styles.miniPlayerTitle.color} size="small" />
          ) : (
            <PlaybackGlyph mode={isPlaying ? 'pause' : 'play'} color="text" size={20} />
          )}
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Next song"
          // Through the swipe, so a tap slides the song out like a swipe does.
          onPress={() => swipe.skip(1)}
          style={localStyles.songButton}
        >
          <PlaybackGlyph mode="next" color="text" size={16} />
        </PressableScale>
      </View>
      <MiniProgressLine fallbackDuration={track.duration} isPlaying={isPlaying} />
    </Animated.View>
  );
}

/**
 * The tab pill. A tap is a plain press, as before: the tinted capsule
 * glides to the new tab. Dragging sideways lifts a lens past the bar that
 * magnifies the icons under it; let go to open the tab under it.
 */
function TabPill({
  activeTab,
  onSelectTab,
  blurTarget,
}: {
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  blurTarget: BlurTarget;
}) {
  const styles = useAppStyles();
  const glass = useGlassColors();
  const shownTab = shownTabFor(activeTab);
  const index = Math.max(0, TABS.findIndex((item) => item.id === shownTab));
  const [rowWidth, setRowWidth] = useState(0);
  const tabWidth = rowWidth / TABS.length;

  /** Left edge of the capsule; -1 until first placed. */
  const capsuleX = useSharedValue(-1);
  /** 0 at rest, 1 lifted. */
  const press = useSharedValue(0);
  const dragging = useSharedValue(false);
  const under = useSharedValue(index);
  const [lensTab, setLensTab] = useState(index);

  /** Where the capsule was last sent, so the same target is never restarted. */
  const placed = useRef<number | null>(null);
  // Called straight from a tap, so the capsule glides on the UI thread at
  // once, while the new page is still rendering, instead of waiting for it.
  const moveCapsule = useCallback(
    (next: number) => {
      const target = next * tabWidth;
      if (tabWidth === 0 || target === placed.current) {
        return;
      }
      // The first placement jumps, so nothing slides in on launch.
      capsuleX.set(placed.current === null ? target : withSpring(target, CAPSULE_SPRING));
      placed.current = target;
    },
    [capsuleX, tabWidth],
  );
  // Page swipes and other tab changes that did not come from a tap.
  useEffect(() => {
    if (!dragging.get()) {
      moveCapsule(index);
    }
  }, [dragging, index, moveCapsule]);

  // The tapped tab lights at once; the new page renders as a transition
  // right after, so the bar never waits for the page. Forgotten as soon as
  // the real tab changes, so no effect is needed to clear it.
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null);
  const litIndex = pending && pending.from === index ? pending.to : index;
  const select = useCallback(
    (next: number) => {
      setPending({ from: index, to: next });
      startTransition(() => onSelectTab(TABS[next].id));
    },
    [index, onSelectTab],
  );
  // After a drag the capsule already springs to `next` on the UI thread.
  const selectAfterDrag = useCallback(
    (next: number) => {
      placed.current = next * tabWidth;
      select(next);
    },
    [select, tabWidth],
  );
  const follow = (x: number) => {
    'worklet';
    capsuleX.set(withSpring(clamp(x - tabWidth / 2, 0, rowWidth - tabWidth), FOLLOW_SPRING));
    const next = clamp(Math.floor(x / tabWidth), 0, TABS.length - 1);
    if (next === under.get()) {
      return false;
    }
    under.set(next);
    scheduleOnRN(setLensTab, next);
    return true;
  };
  // Only a real sideways drag starts it, so taps stay plain presses.
  const lens = usePanGesture({
    enabled: tabWidth > 0,
    // Wide enough that a slightly sliding tap stays a tap.
    activeOffsetX: [-14, 14],
    onActivate: (event) => {
      'worklet';
      dragging.set(true);
      press.set(withSpring(1, LIFT_SPRING));
      under.set(-1);
      follow(event.x);
    },
    onUpdate: (event) => {
      'worklet';
      if (follow(event.x)) {
        scheduleOnRN(hapticSelection);
      }
    },
    onDeactivate: (event) => {
      'worklet';
      dragging.set(false);
      const next = under.get();
      press.set(withSpring(0, CAPSULE_SPRING));
      capsuleX.set(withSpring(Math.max(0, next) * tabWidth, CAPSULE_SPRING));
      if (!event.canceled && next >= 0) {
        scheduleOnRN(selectAfterDrag, next);
      }
    },
  });

  // Smoothness rule: anything that moves on a tab change animates only
  // transform and opacity. Those reach the screen straight from the UI
  // thread (ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS in package.json), while
  // size or position props wait behind React drawing the new page, which
  // made the capsule jump instead of glide. Size changes only while dragging.
  const capsuleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, capsuleX.get()) }],
  }));
  // The lens's middle follows the capsule (transform only)...
  const lensAnchorStyle = useAnimatedStyle(() => ({
    opacity: clamp(press.get() * 2 - 0.2, 0, 1),
    transform: [{ translateX: Math.max(0, capsuleX.get()) + tabWidth / 2 }],
  }));
  // ...and its size reads only the lift, so a plain tab change never resizes
  // it. Real size, not scale: Android tears a scaled border and shadow.
  const lensBodyStyle = useAnimatedStyle(() => {
    const lift = press.get();
    const width = tabWidth * (1 + LENS_GROW * lift);
    const height = ROW_HEIGHT + LENS_RISE * 2 * lift;
    return { left: -width / 2, top: -LENS_RISE * lift, width, height, borderRadius: height / 2 };
  });
  // The icons drawn again inside the lens, larger: the magnifying glass.
  // Moved over the real row, then scaled about the lens's middle.
  const magnifyStyle = useAnimatedStyle(() => {
    const lift = press.get();
    const width = tabWidth * (1 + LENS_GROW * lift);
    const left = Math.max(0, capsuleX.get()) + tabWidth / 2 - width / 2;
    const top = -LENS_RISE * lift;
    const pivot = width / 2 + left - rowWidth / 2;
    return {
      transform: [
        { translateX: -left },
        { translateY: -top },
        { translateX: pivot },
        { scale: 1 + MAGNIFY * lift },
        { translateX: -pivot },
      ],
    };
  });

  return (
    <Glass blurTarget={blurTarget} radius={SLOT / 2} style={styles.bottomTabs}>
      <GestureDetector gesture={lens}>
        <View
          accessibilityRole="tablist"
          style={styles.bottomTabRow}
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        >
          {tabWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.bottomTabCapsule,
                {
                  top: 0,
                  width: tabWidth,
                  height: ROW_HEIGHT,
                  borderRadius: ROW_HEIGHT / 2,
                  backgroundColor: glass.capsule,
                  borderColor: glass.capsuleEdge,
                  boxShadow: glass.capsuleShadow,
                },
                capsuleStyle,
              ]}
            />
          )}
          {TABS.map((item, tabIndex) => {
            const selected = tabIndex === litIndex;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  moveCapsule(tabIndex);
                  select(tabIndex);
                }}
                style={styles.bottomTab}
              >
                {({ pressed }) => <TabFace tab={item} lit={selected} pressed={pressed} />}
              </Pressable>
            );
          })}
          {tabWidth > 0 && (
            <Animated.View pointerEvents="none" style={[localStyles.lensAnchor, lensAnchorStyle]}>
              <Animated.View
                style={[
                  localStyles.lens,
                  {
                    backgroundColor: glass.lensFill,
                    borderColor: glass.lensEdge,
                    borderTopColor: glass.lensRim,
                    boxShadow: glass.lensShadow,
                  },
                  lensBodyStyle,
                ]}
              >
                <Animated.View style={[localStyles.magnified, { width: rowWidth }, magnifyStyle]}>
                  {TABS.map((item, tabIndex) => (
                    <View key={item.id} style={styles.bottomTab}>
                      <TabFace tab={item} lit={tabIndex === lensTab} />
                    </View>
                  ))}
                </Animated.View>
                <View style={[localStyles.sheen, { backgroundColor: glass.lensSheen }]} />
              </Animated.View>
            </Animated.View>
          )}
        </View>
      </GestureDetector>
    </Glass>
  );
}

/**
 * Icon and label. Sinks a little under the finger and pops back with a
 * small bounce when it lights up. Scale only, so it never waits on React.
 */
function TabFace({ tab, lit, pressed = false }: { tab: (typeof TABS)[number]; lit: boolean; pressed?: boolean }) {
  const styles = useAppStyles();
  // Filled on every tab (iOS 26); the color alone says which is selected.
  const name = tab.iconSelected;
  const scale = useSharedValue(1);
  const wasLit = useRef(lit);
  useEffect(() => {
    if (pressed) {
      scale.set(withSpring(PRESSED_SCALE, PRESS_SPRING));
    } else if (lit && !wasLit.current) {
      // Lit without a press (a swipe, or the lens crossing it): pop anyway.
      scale.set(withSequence(withTiming(PRESSED_SCALE, { duration: 70 }), withSpring(1, POP_SPRING)));
    } else {
      scale.set(withSpring(1, POP_SPRING));
    }
    wasLit.current = lit;
  }, [lit, pressed, scale]);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={[localStyles.face, scaleStyle]}>
      <Ionicons
        accessible={false}
        name={name}
        size={opticalSize(name, 24)}
        style={[styles.bottomTabIcon, lit && styles.bottomTabIconActive]}
      />
      <Text numberOfLines={1} style={[styles.bottomTabLabel, lit && styles.bottomTabLabelActive]}>
        {tab.label}
      </Text>
    </Animated.View>
  );
}

/**
 * Hides the floating mini player while the bar is shrunk (the song sits in
 * the bar then). Its own component, so a fold redraws only this.
 */
export function HideWhenBarFolded({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const hidden = useBarMinimized() && enabled;
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(hidden ? 0 : 1, { duration: 160 }),
    transform: [{ translateY: withTiming(hidden ? 16 : 0, { duration: 200 }) }],
  }));
  return (
    <Animated.View style={style} pointerEvents={hidden ? 'none' : 'auto'}>
      {children}
    </Animated.View>
  );
}

const localStyles = StyleSheet.create({
  dock: {
    paddingHorizontal: SIDE,
  },
  // Every layout fills this one slot, so the fade swaps them in place.
  slot: {
    height: SLOT,
  },
  layout: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SLOT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
  },
  fill: {
    flex: 1,
  },
  songPill: {
    flex: 1,
    height: SLOT,
  },
  searchSpace: {
    width: SLOT,
  },
  searchCircle: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  /** A zero-width point at the lens's middle; the lens hangs around it. */
  lensAnchor: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: ROW_HEIGHT,
  },
  lens: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 1,
  },
  magnified: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: ROW_HEIGHT,
    flexDirection: 'row',
  },
  sheen: {
    position: 'absolute',
    left: '14%',
    right: '14%',
    top: 3,
    height: '36%',
    borderRadius: 999,
  },
  song: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 2,
    // Room under the cover for the progress line.
    paddingBottom: 2,
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  songCopy: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    fontSize: 14,
  },
  songArtist: {
    fontSize: 12,
    marginTop: 0,
  },
  songButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
});
