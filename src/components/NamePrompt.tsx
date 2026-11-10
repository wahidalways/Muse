import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Sheet } from './Sheet';
import { colors, useAppStyles } from '../theme/styles';

/** Asks for a playlist name. Save explains itself when the name is empty. */
export function NamePrompt({
  visible,
  title,
  initialName = '',
  actionLabel,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialName?: string;
  actionLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} eyebrow="PLAYLIST" title={title} onClose={onClose}>
      {/* Inside the modal, so the field starts fresh each time it opens. */}
      <NameForm initialName={initialName} actionLabel={actionLabel} onSubmit={onSubmit} />
    </Sheet>
  );
}

function NameForm({
  initialName,
  actionLabel,
  onSubmit,
}: {
  initialName: string;
  actionLabel: string;
  onSubmit: (name: string) => void;
}) {
  const styles = useAppStyles();
  const [name, setName] = useState(initialName);
  const [showHint, setShowHint] = useState(false);

  const submit = () => {
    if (name.trim().length === 0) {
      setShowHint(true);
      return;
    }
    onSubmit(name.trim());
  };

  return (
    <View style={styles.sheetForm}>
      <TextInput
        accessibilityLabel="Playlist name"
        autoFocus
        maxLength={60}
        onChangeText={(text) => {
          setName(text);
          setShowHint(false);
        }}
        onSubmitEditing={submit}
        placeholder="My playlist"
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        style={styles.sheetInput}
        value={name}
      />
      {showHint && <Text style={styles.sheetHint}>Give your playlist a name first.</Text>}
      <Pressable accessibilityRole="button" onPress={submit} style={styles.primaryButton}>
        <Text style={styles.primaryButtonLabel}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
