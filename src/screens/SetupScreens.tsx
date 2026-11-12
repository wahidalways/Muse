import { Pressable, Text, View } from 'react-native';

import { FolderHeading, FolderPicker } from '../components/FolderPicker';
import { PrimaryButton, StatusArtwork } from '../components/setup';
import { useAppStyles } from '../theme/styles';
import type { Accent } from '../theme/theme';
import type { MusicFolder, MusicTrack } from '../types';

/** Settings › Included folders: the same picker as setup, with Save and Cancel (changes are a draft until saved). */
export function FoldersScreen({
  folders,
  tracks,
  blockedFolderIds,
  hasSavedFolderRules,
  isLoading,
  accent,
  onToggleFolder,
  onSave,
  onIncludeAll,
  onCancel,
}: {
  folders: MusicFolder[];
  tracks: MusicTrack[];
  blockedFolderIds: string[];
  hasSavedFolderRules: boolean;
  isLoading: boolean;
  accent: Accent;
  onToggleFolder: (folderId: string) => void;
  onSave: () => void;
  onIncludeAll: () => void;
  onCancel: () => void;
}) {
  const styles = useAppStyles();
  return (
    <View style={styles.screenBody}>
      <FolderHeading title="Choose your folders" text="Muse plays songs from the folders you keep on." />
      <FolderPicker
        folders={folders}
        tracks={tracks}
        blockedFolderIds={blockedFolderIds}
        onToggleFolder={onToggleFolder}
        onIncludeAllFolders={onIncludeAll}
        accent={accent}
      />
      <View style={styles.bottomArea}>
        <PrimaryButton label={isLoading ? 'Saving...' : 'Save'} onPress={onSave} disabled={isLoading} />
        {hasSavedFolderRules && (
          <Pressable accessibilityRole="button" disabled={isLoading} onPress={onCancel} style={styles.textButton}>
            <Text style={styles.textButtonLabel}>Cancel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function DeniedScreen({
  isLoading,
  onOpenSettings,
  onTryAgain,
}: {
  isLoading: boolean;
  onOpenSettings: () => void;
  onTryAgain: () => void;
}) {
  const styles = useAppStyles();
  return (
    <View style={styles.screenBody}>
      <StatusArtwork label="YOUR CHOICE" />
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>NO PROBLEM</Text>
        <Text style={styles.title}>
          You are in{'\n'}control.
        </Text>
        <Text style={styles.description}>
          Muse needs audio access to find your music. You can try again
          or turn it on in Settings.
        </Text>
      </View>

      <View style={styles.bottomArea}>
        <PrimaryButton label="Open Settings" onPress={onOpenSettings} />
        <Pressable
          accessibilityRole="button"
          onPress={onTryAgain}
          style={styles.textButton}
          disabled={isLoading}
        >
          <Text style={styles.textButtonLabel}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function BuildRequiredScreen({ onBack }: { onBack: () => void }) {
  const styles = useAppStyles();
  return (
    <View style={styles.screenBody}>
      <StatusArtwork label="APK REQUIRED" />
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>QUICK NOTE</Text>
        <Text style={styles.title}>
          Install Muse on{'\n'}your phone.
        </Text>
        <Text style={styles.description}>
          Expo Go cannot scan your phone&apos;s music library. Build and install
          the APK to use your songs.
        </Text>
      </View>
      <View style={styles.bottomArea}>
        <PrimaryButton label="Back to permission" onPress={onBack} />
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.textButton}
        >
          <Text style={styles.textButtonLabel}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}
