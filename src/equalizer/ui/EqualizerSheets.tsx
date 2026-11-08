import { Pressable, ScrollView, Text } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { CheckIcon } from '../../components/icons';
import { useAppStyles } from '../../theme/styles';
import { hapticSelection } from '../../utils/haptics';
import { PRESETS, withPreset } from '../sound';
import { applySound, useEqualizer } from '../equalizerStore';

/** The built-in presets. Picking one keeps the bass boost. */
export function PresetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useAppStyles();
  const { sound } = useEqualizer();
  return (
    <Sheet visible={visible} eyebrow="EQUALIZER" title="Presets" onClose={onClose} tall>
      <ScrollView style={styles.sheetListFill} showsVerticalScrollIndicator={false}>
        {PRESETS.map((preset) => {
          const selected = sound.presetName === preset.name;
          return (
            <Pressable
              key={preset.name}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                hapticSelection();
                applySound(withPreset(sound, preset));
                onClose();
              }}
              style={({ pressed }) => [styles.eqPresetRow, pressed && styles.eqPresetRowPressed]}
            >
              <Text style={styles.eqPresetName}>{preset.name}</Text>
              {selected && <CheckIcon />}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
