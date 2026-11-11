import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDocumentAsync } from 'expo-document-picker';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { ConfirmSheet, type ConfirmRequest } from '../../components/ConfirmSheet';
import { SurpriseButton } from '../../components/SurpriseButton';
import { funkyName } from '../../settings/funkyNames';
import { Sheet, SheetRow } from '../../components/Sheet';
import { Avatar, PRESETS } from '../../components/Avatar';
import { PressableScale } from '../../components/PressableScale';
import { usePlayButtonColors } from '../../components/icons';
import {
  NAME_LIMIT,
  clearProfileImage,
  setProfileName,
  setProfilePhoto,
  setProfilePreset,
  useProfile,
  type Profile,
} from '../../settings/profile';
import { greetingParts } from '../../utils/greeting';
import { hapticSelection, hapticSuccess } from '../../utils/haptics';
import { useAppStyles } from '../../theme/styles';

const COLUMNS = 5;
const CELL_GAP = 12;
/** The sheet's side padding and border, so the picture grid fills its width exactly. */
const SHEET_INSET = 2 * 22 + 2;

/**
 * Your name and picture. A preview at the top shows Home's greeting as you
 * edit; nothing changes until Save. Leaving with unsaved changes asks first,
 * however the sheet is closed.
 */
export function ProfileSheet({
  visible,
  onClose,
  onCustomize,
}: {
  visible: boolean;
  onClose: () => void;
  /** Customize lives here and at the end of the board, not in Home's header. Left out where it does not apply. */
  onCustomize?: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const leave = (then: () => void) => () => {
    if (!dirty) {
      then();
      return;
    }
    setConfirm({
      eyebrow: 'PROFILE',
      title: 'Discard changes?',
      message: 'Your new name and picture are not saved yet.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
      onConfirm: () => {
        setDirty(false);
        then();
      },
    });
  };
  return (
    <>
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
      <Sheet visible={visible} eyebrow="Home" title="Your profile" onClose={leave(onClose)} guarded={dirty}>
      {/* Inside the modal, so each opening starts from what is saved. */}
      <Editor
        onSaved={() => {
          setDirty(false);
          onClose();
        }}
        onDirty={setDirty}
        onCustomize={onCustomize && leave(onCustomize)}
      />
      </Sheet>
    </>
  );
}

function Editor({ onSaved, onDirty, onCustomize }: { onSaved: () => void; onDirty: (dirty: boolean) => void; onCustomize?: () => void }) {
  const styles = useAppStyles();
  const play = usePlayButtonColors();
  const { width } = useWindowDimensions();
  const saved = useProfile();
  const [draft, setDraft] = useState<Profile>(saved);
  // A photo picked in this sheet still sits in the picker's cache until Save copies it in.
  const [pickedPhoto, setPickedPhoto] = useState(false);
  // Surprise me picks a character only until you choose a picture: one saved before, or a tap here.
  const pictureChosen = useRef(saved.photoUri !== null || saved.preset >= 0);
  const [isTyping, setIsTyping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = draft.name.trim() !== saved.name.trim() || draft.preset !== saved.preset || draft.photoUri !== saved.photoUri;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const cell = Math.floor((width - SHEET_INSET - (COLUMNS - 1) * CELL_GAP) / COLUMNS);
  const muted = String(styles.pulseSub.color);
  const ink = String(styles.homeSongTitle.color);
  const accent = String(styles.eyebrow.color);

  // Both are Android's own pickers: Muse gets only the one picture chosen, so no permission is asked.
  const pickPicture = async (from: 'photos' | 'files') => {
    setError('');
    try {
      const uri =
        from === 'photos'
          ? await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.85 }).then((result) =>
              result.canceled ? null : (result.assets[0]?.uri ?? null),
            )
          : await getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true }).then((result) =>
              result.canceled ? null : (result.assets[0]?.uri ?? null),
            );
      if (uri) {
        pictureChosen.current = true;
        setDraft((current) => ({ ...current, photoUri: uri }));
        setPickedPhoto(true);
      }
    } catch {
      setError(from === 'photos' ? 'Could not open your photos. Please try again.' : 'Could not open that file. Please try another one.');
    }
  };
  const pickPhoto = () => void pickPicture('photos');

  // Each shuffle of the dice: a new funky name, and a new character until you choose a picture.
  const surprise = () => {
    const keepPicture = pictureChosen.current;
    setDraft((current) => ({
      ...current,
      name: funkyName(current.name),
      preset: keepPicture ? current.preset : Math.floor(Math.random() * PRESETS.length),
    }));
  };

  const choosePreset = (preset: number) => {
    hapticSelection();
    pictureChosen.current = true;
    setDraft((current) => ({ ...current, preset, photoUri: null }));
    setPickedPhoto(false);
  };

  const save = async () => {
    setError('');
    setIsSaving(true);
    try {
      if (pickedPhoto && draft.photoUri) {
        await setProfilePhoto(draft.photoUri);
      } else if (!draft.photoUri && (saved.photoUri || draft.preset !== saved.preset)) {
        if (draft.preset >= 0) {
          setProfilePreset(draft.preset);
        } else {
          clearProfileImage();
        }
      }
      setProfileName(draft.name.trim());
      hapticSuccess();
      onSaved();
    } catch {
      setError('Could not save that photo. Please pick another one.');
      setIsSaving(false);
    }
  };

  const name = draft.name.trim();
  const hello = greetingParts(new Date().getHours());
  const hasPhoto = draft.photoUri !== null;

  return (
    <>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* How Home will greet you, live as you edit. */}
        <View style={styles.profilePreview} accessible accessibilityLabel={`Preview: ${hello.before}${name ? `, ${name}` : ''}${hello.after}`}>
          <PressableScale accessibilityRole="button" accessibilityLabel={hasPhoto ? 'Change photo' : 'Choose a photo'} onPress={pickPhoto}>
            <Avatar profile={draft} size={72} />
            <View style={[styles.profileCamBadge, styles.pulseFill]}>
              <Ionicons accessible={false} name="camera" size={13} color="#11130F" />
            </View>
          </PressableScale>
          <View style={styles.homeSongCopy}>
            <Text style={styles.profilePreviewLabel}>On Home</Text>
            <Text numberOfLines={2} style={styles.profilePreviewHello}>
              {name ? `${hello.before},\n` : `${hello.before}${hello.after}`}
              {name ? <Text style={styles.pulseGreetingName}>{`${name}${hello.after}`}</Text> : null}
            </Text>
          </View>
        </View>

        {/* Surprise me sits on the label row, clear of the field, so the name keeps the whole width. */}
        <View style={styles.profileLabelRow}>
          <Text style={[styles.pulseSectionLabel, styles.profileLabelInRow]}>Name</Text>
          <SurpriseButton onRoll={surprise} color={accent} label="Surprise me" labelColor={ink} style={styles.profileSurprise} />
        </View>
        <View style={[styles.profileField, isTyping && styles.profileFieldFocus]}>
          <TextInput
            accessibilityLabel="Your name"
            value={draft.name}
            onChangeText={(text) => setDraft((current) => ({ ...current, name: text.slice(0, NAME_LIMIT) }))}
            onFocus={() => setIsTyping(true)}
            onBlur={() => setIsTyping(false)}
            maxLength={NAME_LIMIT}
            placeholder="What should Home call you?"
            placeholderTextColor={muted}
            autoComplete="nickname"
            autoCapitalize="words"
            returnKeyType="done"
            style={styles.profileInput}
          />
          {draft.name.length > 0 ? (
            <>
              <Text style={styles.profileCount}>
                {draft.name.length}/{NAME_LIMIT}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear name"
                hitSlop={10}
                onPress={() => setDraft((current) => ({ ...current, name: '' }))}
              >
                <Ionicons accessible={false} name="close-circle" size={18} color={muted} />
              </Pressable>
            </>
          ) : null}
        </View>

        <Text style={styles.pulseSectionLabel}>Picture</Text>
        <View style={styles.profileGrid} accessibilityRole="radiogroup" accessibilityLabel="Picture">
          {hasPhoto ? (
            <Choice size={cell} label="Your picture" on onPress={pickPhoto}>
              <Avatar profile={draft} size={cell} />
            </Choice>
          ) : null}
          {(['photos', 'files'] as const).map((from) => (
            <Pressable
              key={from}
              accessibilityRole="button"
              accessibilityLabel={from === 'photos' ? 'Pick from Photos' : 'Pick from Files'}
              onPress={() => void pickPicture(from)}
              style={({ pressed }) => [styles.profilePhotoCell, { width: cell, height: cell, borderRadius: cell / 2 }, pressed && { opacity: 0.8 }]}
            >
              <Ionicons accessible={false} name={from === 'photos' ? 'images-outline' : 'folder-open-outline'} size={Math.round(cell * 0.36)} color={ink} />
            </Pressable>
          ))}
          <Choice size={cell} label="No picture" on={!hasPhoto && draft.preset < 0} onPress={() => choosePreset(-1)}>
            <Avatar profile={{ preset: -1, photoUri: null }} size={cell} />
          </Choice>
          {PRESETS.map((preset, index) => (
            <Choice key={preset.name} size={cell} label={preset.name} on={!hasPhoto && draft.preset === index} onPress={() => choosePreset(index)}>
              <Avatar profile={{ preset: index, photoUri: null }} size={cell} />
            </Choice>
          ))}
        </View>
        {error ? (
          <Text style={styles.profileError}>{error}</Text>
        ) : (
          <Text style={styles.profileNote}>Or use your own from Photos or Files. Muse only sees the picture you choose.</Text>
        )}

        {onCustomize && (
          <View style={{ marginTop: 18 }}>
            <SheetRow
              icon={<Ionicons accessible={false} name="options-outline" size={20} color={ink} />}
              label="Customize Home"
              detail="Cards, order, sizes"
              onPress={onCustomize}
            />
          </View>
        )}
        <Text style={styles.profileNote}>Optional. Stays on this phone and only goes on a share card if you switch it on.</Text>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: isSaving }}
        disabled={isSaving}
        onPress={save}
        style={({ pressed }) => [styles.pulseSheetButton, styles.profileSave, { backgroundColor: play.background }, pressed && { opacity: 0.85 }]}
      >
        <Text style={[styles.pulseSheetButtonText, { color: play.glyph }]}>{isSaving ? 'Saving...' : 'Save'}</Text>
      </Pressable>
    </>
  );
}

/** One picture to choose: a ring and a tick when it is the one. */
function Choice({ size, label, on, onPress, children }: { size: number; label: string; on: boolean; onPress: () => void; children: ReactNode }) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2 }, pressed && { opacity: 0.8 }]}
    >
      {children}
      {on && <View pointerEvents="none" style={[styles.profileRing, { borderRadius: size / 2 + 4 }]} />}
      {on && (
        <View style={[styles.profileTick, styles.pulseFill]}>
          <Ionicons accessible={false} name="checkmark" size={11} color="#11130F" />
        </View>
      )}
    </Pressable>
  );
}
