import { useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView } from 'react-native-gesture-handler';
import { ACCENT_OPTIONS, type Accent } from '../theme/theme';
import { useAppStyles } from '../theme/styles';
import { opticalSize } from '../components/icons';
import { SettingsRow, SettingsSection, SettingsSwitchRow, TILE } from '../components/SettingsList';
import { hapticSelection } from '../utils/haptics';
import { effectsSupported, openPhoneEqualizer } from '../../modules/muse-audio-metadata/effects';
import { BANDS, BASS_BOOST_MAX, GAIN_RANGE, formatDb } from '../equalizer/sound';
import { editSound, setEqualizerEnabled, useEqualizer } from '../equalizer/equalizerStore';
import { BandSliders, EqSlider } from '../equalizer/ui/Sliders';
import { PresetSheet } from '../equalizer/ui/EqualizerSheets';
import { useBarScroll } from '../motion/barScroll';
import { ConfirmSheet, type ConfirmRequest } from '../components/ConfirmSheet';

/** On/off, a preset, 10 bands and a bass boost; the phone's own equalizer one tap away. */
export function EqualizerTab({
  accent,
  onBack,
  contentContainerStyle,
}: {
  accent: Accent;
  onBack: () => void;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const styles = useAppStyles();
  const barScroll = useBarScroll();
  const { enabled, sound } = useEqualizer();
  const [presetsOpen, setPresetsOpen] = useState(false);
  const switchColor = (ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]).swatch;
  const presetLabel = sound.presetName ?? 'Custom';
  const flat = sound.gains.every((gain) => gain === 0);

  const [notice, setNotice] = useState<ConfirmRequest | null>(null);
  const openPhone = () => {
    if (!openPhoneEqualizer()) {
      setNotice({
        eyebrow: 'EQUALIZER',
        title: 'Could not open the phone equalizer',
        message: 'Open your phone settings and look for Sound quality and effects.',
        confirmLabel: 'OK',
        cancelLabel: null,
      });
    }
  };

  return (
    <ScrollView
      style={styles.mainScroll}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      onScroll={barScroll}
      scrollEventThrottle={32}
    >
      <View style={styles.screenBody}>
        <View style={styles.tabBody}>
          <View style={[styles.moreTopBar, styles.intro]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={onBack}
              style={styles.headerBackButton}
            >
              <Ionicons accessible={false} name="chevron-back" size={opticalSize('chevron-back', 24)} style={styles.headerBackIcon} />
            </Pressable>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.eqHeaderTitle}>
              Equalizer
            </Text>
          </View>

          {!effectsSupported && (
            <Text style={styles.eqStatus}>
              This is a preview. Sound changes work in the installed Muse app, not in Expo Go.
            </Text>
          )}

          <SettingsSection>
            <SettingsSwitchRow
              icon="options"
              tint={TILE.pink}
              title="Equalizer"
              subtitle={enabled ? presetLabel : 'Off. Your music plays as recorded.'}
              value={enabled}
              onValueChange={setEqualizerEnabled}
              accent={switchColor}
            />
            <SettingsRow
              icon="bookmark"
              tint={TILE.orange}
              title="Preset"
              detail={presetLabel}
              onPress={() => setPresetsOpen(true)}
            />
          </SettingsSection>

          <View style={styles.eqEditorCard}>
            <View style={styles.eqEditorHeader}>
              <Text accessibilityRole="header" style={styles.eqEditorTitle}>
                Bands
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset bands to flat"
                accessibilityState={{ disabled: flat }}
                disabled={flat}
                onPress={() => {
                  hapticSelection();
                  editSound((current) => ({ ...current, gains: current.gains.map(() => 0), presetName: 'Flat' }), {
                    custom: false,
                  });
                }}
                style={[styles.eqTextButton, flat && styles.prefRowDisabled]}
              >
                <Text style={styles.eqTextButtonLabel}>Flat</Text>
              </Pressable>
            </View>
            <BandSliders
              freqs={BANDS}
              gains={sound.gains}
              range={GAIN_RANGE}
              height={200}
              onChange={(index, gain, live) =>
                editSound(
                  (current) => ({ ...current, gains: current.gains.map((value, at) => (at === index ? gain : value)) }),
                  { live },
                )
              }
            />
          </View>

          <SettingsSection footer="Muse lowers the level by your biggest boost, so loud parts never distort.">
            <EqSlider
              title="Bass boost"
              value={sound.bassBoost}
              min={0}
              max={BASS_BOOST_MAX}
              step={0.5}
              format={(value) => (value === 0 ? 'Off' : formatDb(value))}
              onChange={(bassBoost, live) => editSound((current) => ({ ...current, bassBoost }), { live, custom: false })}
            />
          </SettingsSection>

          <SettingsSection footer="Your phone's own sound effects, such as Dolby Atmos or the maker's equalizer, if it has them.">
            <SettingsRow icon="phone-portrait" tint={TILE.indigo} title="Phone equalizer" onPress={openPhone} />
          </SettingsSection>
        </View>
      </View>

      <PresetSheet visible={presetsOpen} onClose={() => setPresetsOpen(false)} />
      <ConfirmSheet request={notice} onClose={() => setNotice(null)} />
    </ScrollView>
  );
}
