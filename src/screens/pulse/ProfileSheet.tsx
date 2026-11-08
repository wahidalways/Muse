import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { Sheet } from '../../components/Sheet';
import { Avatar, PRESETS } from '../../components/Avatar';
import { PressableScale } from '../../components/PressableScale';
import {
  NAME_LIMIT,
  clearProfileImage,
  setProfileName,
  setProfilePhoto,
  setProfilePreset,
  useProfile,
} from '../../settings/profile';
import { greeting } from '../../utils/greeting';
import { hapticSelection } from '../../utils/haptics';
import { useAppStyles } from '../../theme/styles';

const PRESET_SIZE = 60;
const PRESET_GAP = 12;

/**
 * A contact card: tap the big avatar for a photo, type your name under it and
 * see the greeting it makes, or pick a drawn avatar. Saves as you go.
 */
export function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useAppStyles();
  const profile = useProfile();
  const [error, setError] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const name = profile.name.trim();
  const accentText = String(styles.pulseNewText.color);

  const pickPhoto = async () => {
    setError('');
    try {
      const result = await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (!result.canceled && result.assets[0]) {
        await setProfilePhoto(result.assets[0].uri);
      }
    } catch {
      setError('Could not use that photo. Please try another one.');
    }
  };

  return (
    <Sheet visible={visible} eyebrow="Home" title="Your profile" onClose={onClose}>
      <View style={styles.pulseProfileCard}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={profile.photoUri ? 'Change photo' : 'Choose a photo'}
          onPress={pickPhoto}
        >
          <Avatar profile={profile} size={112} />
          <View style={[styles.pulseCamBadge, styles.pulseFill]}>
            <Ionicons accessible={false} name="camera" size={18} color="#11130F" />
          </View>
        </PressableScale>

        <TextInput
          accessibilityLabel="Listening name"
          value={profile.name}
          onChangeText={setProfileName}
          onFocus={() => setIsTyping(true)}
          onBlur={() => setIsTyping(false)}
          maxLength={NAME_LIMIT}
          placeholder="Your name"
          placeholderTextColor={String(styles.pulseSub.color)}
          autoComplete="nickname"
          autoCapitalize="words"
          returnKeyType="done"
          textAlign="center"
          style={[styles.pulseNameInput, isTyping && styles.pulseNameInputFocus]}
        />
        <View style={styles.pulseNameMeta}>
          <Text numberOfLines={1} style={[styles.pulseTinyLabel, { flex: 1 }]}>
            Home says “{greeting(new Date().getHours(), name)}”
          </Text>
          <Text style={styles.pulseTinyLabel}>
            {profile.name.length}/{NAME_LIMIT}
          </Text>
        </View>
        {error ? <Text style={[styles.pulseSub, { textAlign: 'center' }]}>{error}</Text> : null}
      </View>

      <Text style={styles.pulseSectionLabel}>Or pick an avatar</Text>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pulsePresetStrip}
        // Opens with the chosen avatar in view.
        onLayout={() => profile.preset > 1 && strip.current?.scrollTo({ x: (profile.preset - 1) * (PRESET_SIZE + 8 + PRESET_GAP), animated: false })}
        accessibilityRole="radiogroup"
        accessibilityLabel="Avatars"
      >
        {PRESETS.map((preset, index) => {
          const on = !profile.photoUri && profile.preset === index;
          return (
            <Pressable
              key={preset.name}
              accessibilityRole="radio"
              accessibilityLabel={preset.name}
              accessibilityState={{ checked: on }}
              onPress={() => {
                hapticSelection();
                setProfilePreset(index);
              }}
              style={[styles.pulseStripItem, on && styles.pulseStripItemOn]}
            >
              <Avatar profile={{ preset: index, photoUri: null }} size={PRESET_SIZE} />
              {on && (
                <View style={[styles.pulseCheck, styles.pulseFill]}>
                  <Ionicons accessible={false} name="checkmark" size={13} color="#11130F" />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {(profile.photoUri || profile.preset >= 0) && (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={clearProfileImage} style={styles.pulseLinkButton}>
          <Text style={[styles.pulseLinkText, { color: accentText }]}>Remove picture</Text>
        </Pressable>
      )}
      <Text style={styles.pulseNote}>🔒 Optional. Stays on this phone and only goes on a share card if you switch it on.</Text>
    </Sheet>
  );
}
