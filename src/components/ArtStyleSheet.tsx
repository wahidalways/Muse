import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Sheet } from './Sheet';
import { ART_SETS, MuseArtTile } from './MuseArt';
import { ControlIcon } from './icons';
import { setPreference, usePreferences, type ArtSet } from '../settings/preferences';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';

/** Made-up album names, so every style is previewed on the same shelf. */
const SAMPLES = ['Harbour Lights', 'Kite Season', 'Undertow', 'Static Bloom', 'Greenhouse', 'Polar'];

/**
 * Pick a Muse art style. Tapping a style only changes the preview; "Use"
 * saves it, so you can look through them all before anything changes.
 */
export function ArtStyleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} eyebrow="MUSE ART" title="Choose a style" tall onClose={onClose}>
      {/* The sheet's panel mounts with each opening, so the preview starts on the style in use;
          staying rendered keeps the content in place while the sheet fades out. */}
      <Picker onClose={onClose} />
    </Sheet>
  );
}

function Picker({ onClose }: { onClose: () => void }) {
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const { artSet: current, artworkStyle } = usePreferences();
  const [chosen, setChosen] = useState<ArtSet>(current);
  const info = ART_SETS.find((set) => set.id === chosen) ?? ART_SETS[0];
  // Three across, 10dp apart, from the grid's measured width: the sheet's
  // padding and border make a width worked out from the screen too wide.
  const [gridWidth, setGridWidth] = useState(width - 46);
  const tile = Math.floor((gridWidth - 20) / 3);

  return (
    <>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.artSheetBody}>
        <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
          {/* A new style fades in over the old (opacity only). */}
          <Animated.View
            key={chosen}
            entering={FadeIn.duration(180)}
            accessible
            accessibilityLabel={`Preview: ${info.label}`}
            style={styles.artPreviewGrid}
          >
            {SAMPLES.map((name) => (
              <View key={name} style={{ width: tile }}>
                <MuseArtTile name={name} set={chosen} size={tile} radius={12} />
                <Text numberOfLines={1} style={styles.artPreviewLabel}>
                  {name}
                </Text>
              </View>
            ))}
          </Animated.View>
        </View>
        <Text style={styles.artPreviewName}>{info.label}</Text>
        <Text style={styles.artPreviewHint}>{info.hint}</Text>
        <Text style={styles.artPreviewWhere}>
          {artworkStyle === 'generated' ? 'Shown on every song, playlist and mix.' : 'Shown on songs without a cover.'}
        </Text>

        <View accessibilityRole="radiogroup" accessibilityLabel="Muse art style" style={styles.artChoices}>
          {ART_SETS.map((set) => {
            const selected = set.id === chosen;
            return (
              <Pressable
                key={set.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${set.label}${set.id === current ? ', in use' : ''}`}
                accessibilityHint={set.hint}
                onPress={() => {
                  if (!selected) {
                    hapticSelection();
                    setChosen(set.id);
                  }
                }}
                style={({ pressed }) => [
                  styles.sortSheetOption,
                  selected && styles.sortSheetOptionSelected,
                  pressed && !selected && styles.sortSheetOptionPressed,
                ]}
              >
                <View style={styles.artChoiceTiles}>
                  {SAMPLES.slice(0, 3).map((name) => (
                    <MuseArtTile key={name} name={name} set={set.id} size={34} radius={7} />
                  ))}
                </View>
                <View style={styles.sortSheetOptionCopy}>
                  <Text style={[styles.sortSheetOptionLabel, selected && styles.sortSheetOptionLabelSelected]}>{set.label}</Text>
                  <Text numberOfLines={1} style={styles.sortSheetOptionHint}>
                    {set.id === current ? 'In use' : set.hint}
                  </Text>
                </View>
                {selected ? <ControlIcon name="check" size={18} tone="accent" /> : <View style={styles.sortSheetRadio} />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (chosen !== current) {
            hapticSelection();
            setPreference('artSet', chosen);
          }
          onClose();
        }}
        style={({ pressed }) => [styles.primaryButton, styles.artUseButton, pressed && styles.primaryButtonPressed]}
      >
        <Text style={styles.primaryButtonLabel}>{chosen === current ? `Keep ${info.label}` : `Use ${info.label}`}</Text>
      </Pressable>
    </>
  );
}
