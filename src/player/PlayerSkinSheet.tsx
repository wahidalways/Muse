import { useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { MusicTrack } from '../types';
import { Sheet } from '../components/Sheet';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { ControlIcon, PlaybackGlyph } from '../components/icons';
import { showToast } from '../components/Toast';
import { setPreference, usePreferences, type PlayerSkin } from '../settings/preferences';
import { ThemeContext } from '../theme/theme';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';
import { VinylDisc } from './VinylDisc';
import { MINIMAL_TITLE_LINES, minimalLabels, minimalTitleSize, minimalTitleStyle } from './minimalType';

export const PLAYER_SKINS: { id: PlayerSkin; label: string; hint: string }[] = [
  { id: 'classic', label: 'Classic', hint: 'Big cover, controls below' },
  { id: 'bleed', label: 'Full-bleed', hint: 'Cover edge to edge' },
  { id: 'vinyl', label: 'Vinyl', hint: 'A record that turns' },
  { id: 'minimal', label: 'Minimal type', hint: 'Small cover, huge title' },
];
export const skinLabel = (skin: PlayerSkin) => PLAYER_SKINS.find((item) => item.id === skin)?.label ?? 'Classic';

const PREVIEW_WIDTH = 136;
/** The header's height with its margins, as in the real player. */
const PREVIEW_HEADER = 68;
/** Shown when nothing is playing (Settings), so every skin still has a song to show. */
export const SKIN_SAMPLE: MusicTrack = {
  id: 'skin-preview',
  title: 'Harbour Lights',
  folderId: '',
  folderTitle: '',
  artist: 'Nadia Dune',
  album: 'Harbour Lights',
  albumArtist: null,
  year: 2021,
  trackNumber: 1,
  genre: null,
  filename: '',
  path: '',
  uri: null,
  albumArtUri: null,
  dateAdded: null,
  dateModified: null,
  duration: 0,
};

/**
 * Choose how the full player looks. Tapping a skin only changes the
 * preview (the song playing now, in that skin); "Use" saves it.
 */
export function PlayerSkinSheet({
  visible,
  track,
  tint = null,
  onClose,
}: {
  visible: boolean;
  /** The song to preview; a sample when nothing is playing. */
  track: MusicTrack | null;
  /** The player's background tones, top and bottom, if it has them. */
  tint?: [string, string] | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} eyebrow="PLAYER SKIN" title="Choose a skin" onClose={onClose}>
      {/* Mounts with each opening, so it starts on the skin in use. */}
      <Picker track={track ?? SKIN_SAMPLE} tint={tint} onClose={onClose} />
    </Sheet>
  );
}

function Picker({ track, tint, onClose }: { track: MusicTrack; tint: [string, string] | null; onClose: () => void }) {
  const styles = useAppStyles();
  const { playerSkin: current } = usePreferences();
  const [chosen, setChosen] = useState<PlayerSkin>(current);
  const label = skinLabel(chosen);
  return (
    <View style={styles.sheetBody}>
      <View style={styles.playerSkinRow}>
        {/* A new preview fades in over the old (opacity only). */}
        <Animated.View key={chosen} entering={FadeIn.duration(180)} accessible accessibilityLabel={`Preview: ${label}`}>
          <SkinPreview skin={chosen} track={track} tint={tint} />
        </Animated.View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Player skin" style={styles.playerSkinOptions}>
          {PLAYER_SKINS.map((skin) => {
            const selected = skin.id === chosen;
            return (
              <Pressable
                key={skin.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${skin.label}${skin.id === current ? ', in use' : ''}`}
                accessibilityHint={skin.hint}
                onPress={() => {
                  if (!selected) {
                    hapticSelection();
                    setChosen(skin.id);
                  }
                }}
                style={({ pressed }) => [
                  styles.playerSkinOption,
                  selected && styles.playerSkinOptionOn,
                  pressed && !selected && styles.sortSheetOptionPressed,
                ]}
              >
                <View style={[styles.sortSheetRadio, selected && styles.playerSkinRadioOn]} />
                <View style={styles.flexSpacer}>
                  <Text style={styles.playerSkinLabel}>{skin.label}</Text>
                  <Text numberOfLines={2} style={styles.playerSkinHint}>
                    {skin.hint}
                  </Text>
                  {skin.id === current && <Text style={styles.playerSkinInUse}>IN USE</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (chosen !== current) {
            hapticSelection();
            setPreference('playerSkin', chosen);
            showToast('Player skin changed', { detail: label, icon: 'skin' });
          }
          onClose();
        }}
        style={({ pressed }) => [styles.primaryButton, styles.playerSkinUse, pressed && styles.primaryButtonPressed]}
      >
        <Text style={styles.primaryButtonLabel}>{chosen === current ? `Keep ${label}` : `Use ${label}`}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The player in `skin`, drawn at the phone's size and scaled down. Still:
 * no wave, no turning record, so the sheet costs nothing while it is open.
 */
export function SkinPreview({
  skin,
  track,
  tint,
  previewWidth = PREVIEW_WIDTH,
}: {
  skin: PlayerSkin;
  track: MusicTrack;
  tint: [string, string] | null;
  /** How wide the scaled-down phone is drawn (setup shows it larger). */
  previewWidth?: number;
}) {
  const styles = useAppStyles();
  const { theme } = useContext(ThemeContext);
  const { width, height } = useWindowDimensions();
  const scale = previewWidth / width;
  const art = width - 48;
  const line = theme === 'light' ? 'rgba(25, 34, 24, 0.18)' : 'rgba(255, 255, 255, 0.24)';
  const title = (
    <View style={[styles.fullPlayerTrackInfo, skin === 'bleed' && styles.playerBleedInfo]}>
      <View style={styles.fullPlayerTrackCopy}>
        <Text numberOfLines={1} style={[styles.fullPlayerTrackTitle, skin === 'bleed' && styles.playerBleedTitle]}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.fullPlayerTrackArtist}>
          {[track.artist, track.album].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
      <ControlIcon name="heart-outline" size={22} />
    </View>
  );
  let hero;
  if (skin === 'bleed') {
    hero = (
      <>
        {/* Up to the screen's top edge: the preview body's top padding and the header. */}
        <View style={[styles.playerBleedArt, { marginTop: -(62 + PREVIEW_HEADER) }]}>
          <AlbumArtwork track={track} size={width} radius={0} />
        </View>
        <View style={styles.playerTitleSpacer}>
          <Text style={styles.playerBleedFrom}>PLAYING FROM LIBRARY</Text>
          {title}
        </View>
      </>
    );
  } else if (skin === 'vinyl') {
    hero = (
      <>
        <VinylDisc track={track} size={Math.round(art * 0.92)} />
        <View style={styles.playerTitleSpacer}>{title}</View>
      </>
    );
  } else if (skin === 'minimal') {
    // As in the player (FullPlayer); a preview has no queue, so only genre and year show beside the cover.
    const [placeLabel, tagLabel] = minimalLabels(track, 0, 1);
    hero = (
      <>
        <View style={styles.playerMinimalTop}>
          <AlbumArtwork track={track} size={116} radius={16} />
          <View style={styles.playerMinimalSide}>
            <Text style={styles.playerMinimalLabel}>{placeLabel}</Text>
            <Text numberOfLines={2} style={styles.playerMinimalLabel}>
              {tagLabel}
            </Text>
          </View>
          <ControlIcon name="heart-outline" size={22} />
        </View>
        <View style={styles.playerMinimalWords}>
          <Text
            numberOfLines={MINIMAL_TITLE_LINES}
            textBreakStrategy="balanced"
            allowFontScaling={false}
            style={[styles.playerMinimalTitle, minimalTitleStyle(minimalTitleSize(track.title, width - 48))]}
          >
            {track.title}
          </Text>
          <Text numberOfLines={1} style={styles.playerMinimalArtist}>
            {track.artist ?? 'Unknown artist'}
          </Text>
          {track.album ? (
            <Text numberOfLines={1} style={styles.playerMinimalAlbum}>
              {track.album}
            </Text>
          ) : null}
        </View>
      </>
    );
  } else {
    hero = (
      <>
        <AlbumArtwork track={track} size={art} />
        <View style={styles.playerTitleSpacer}>{title}</View>
      </>
    );
  }
  return (
    <View style={[styles.playerSkinPreview, { width: previewWidth, height: Math.round(height * scale) }]}>
      {/* The phone at full size, then scaled: no flex here, or it would take the box's height instead. */}
      <View
        style={{
          width,
          height,
          backgroundColor: String(styles.screen.backgroundColor),
          transform: [{ scale }],
          transformOrigin: 'left top',
        }}
      >
        {tint && (
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="skinTint" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={tint[0]} />
                <Stop offset="1" stopColor={tint[1]} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#skinTint)" />
          </Svg>
        )}
        <View style={[styles.fullPlayer, styles.playerPreviewBody]}>
          <View style={[styles.fullPlayerHeader, skin === 'bleed' && styles.playerHeaderOver]}>
            <View style={[styles.fullPlayerClose, skin === 'bleed' && styles.playerBleedButton]}>
              <ControlIcon name="chevron-down" size={22} color={skin === 'bleed' ? '#FFFFFF' : undefined} />
            </View>
            <View style={styles.fullPlayerHeaderCopy}>
              {skin !== 'bleed' && (
                <>
                  <Text style={styles.fullPlayerHeaderTitle}>PLAYING FROM</Text>
                  <Text style={styles.fullPlayerHeaderSource}>Library</Text>
                </>
              )}
            </View>
            <View style={[styles.fullPlayerClose, skin === 'bleed' && styles.playerBleedButton]}>
              <ControlIcon name="more" size={20} color={skin === 'bleed' ? '#FFFFFF' : undefined} />
            </View>
          </View>
          <View style={styles.playerHeroArea}>{hero}</View>
          <View style={styles.fullPlayerPlayback}>
            <View style={styles.playerPreviewLine}>
              <View style={[styles.playerPreviewPlayed, { backgroundColor: String(styles.fullPlayerTrackTitle.color) }]} />
              <View style={[styles.playerPreviewRest, { backgroundColor: line }]} />
            </View>
            <View style={styles.fullPlayerControls}>
              <View style={styles.fullPlayerModeButton}>
                <ControlIcon name="shuffle" size={18} tone="muted" />
              </View>
              <View style={styles.playerControlSkip}>
                <PlaybackGlyph mode="previous" color="text" size={22} />
              </View>
              <View style={styles.fullPlayerPlayButton}>
                <PlaybackGlyph mode="pause" color="inverse" size={24} />
              </View>
              <View style={styles.playerControlSkip}>
                <PlaybackGlyph mode="next" color="text" size={22} />
              </View>
              <View style={styles.fullPlayerModeButton}>
                <ControlIcon name="repeat" size={18} tone="muted" />
              </View>
            </View>
          </View>
          <View style={styles.playerBar}>
            {['Lyrics', '1×', '', 'Up Next'].map((text, index) => (
              <View key={index} style={styles.playerBarButton}>
                {index === 0 && <ControlIcon name="lyrics" size={18} tone="muted" />}
                {index === 2 && <ControlIcon name="moon" size={18} tone="muted" />}
                {index === 3 && <ControlIcon name="queue" size={18} tone="muted" />}
                {text.length > 0 && <Text style={styles.playerBarLabel}>{text}</Text>}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
