import { Pressable, Text, View } from 'react-native';

import { MusicNote } from '../components/icons';
import { PrimaryButton, StatusArtwork } from '../components/setup';
import { countIncludedTracks } from '../library/library';
import { useAppStyles } from '../theme/styles';
import type { MusicFolder } from '../types';

export function FoldersScreen({
  folders,
  blockedFolderIds,
  hasSavedFolderRules,
  isLoading,
  onToggleFolder,
  onSave,
  onIncludeAll,
  onCancel,
}: {
  folders: MusicFolder[];
  blockedFolderIds: string[];
  hasSavedFolderRules: boolean;
  isLoading: boolean;
  onToggleFolder: (folderId: string) => void;
  onSave: () => void;
  onIncludeAll: () => void;
  onCancel: () => void;
}) {
  const styles = useAppStyles();
  return (
    <View style={styles.screenBody}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>PICK YOUR FOLDERS</Text>
        <Text style={styles.title}>
          Choose your{'\n'}music folders.
        </Text>
        <Text style={styles.description}>
          Pick the folders Muse can use. You can change this later in
          Settings.
        </Text>
      </View>

      <View style={styles.folderSummary}>
        <View style={styles.folderSummaryMetric}>
          <Text style={styles.folderSummaryValue}>
            {folders.filter((folder) => !blockedFolderIds.includes(folder.id)).length}
          </Text>
          <Text style={styles.folderSummaryLabel}>INCLUDED</Text>
        </View>
        <View style={styles.folderSummaryDivider} />
        <View style={styles.folderSummaryMetric}>
          <Text style={styles.folderSummaryValue}>
            {countIncludedTracks(folders, blockedFolderIds)}
          </Text>
          <Text style={styles.folderSummaryLabel}>TRACKS</Text>
        </View>
        <Text style={styles.folderSummaryHint}>Tap a folder to include or block it</Text>
      </View>

      {folders.length === 0 ? (
        <View style={styles.noFoldersCard}>
          <MusicNote />
          <Text style={styles.noFoldersTitle}>No music folders yet</Text>
          <Text style={styles.noFoldersDescription}>
            Add music to your phone, then scan again.
          </Text>
        </View>
      ) : (
        <View style={styles.folderList}>
          {folders.map((folder) => {
            const blocked = blockedFolderIds.includes(folder.id);
            return (
              <View key={folder.id} style={styles.folderRow}>
                <View style={styles.folderIcon}>
                  <Text style={styles.folderIconText}>♫</Text>
                </View>
                <View style={styles.folderCopy}>
                  <Text style={styles.folderTitle} numberOfLines={1}>
                    {folder.title}
                  </Text>
                  <Text style={styles.folderTrackCount}>
                    {folder.trackCount}{' '}
                    {folder.trackCount === 1 ? 'track' : 'tracks'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${blocked ? 'Include' : 'Block'} ${folder.title}`}
                  accessibilityState={{ selected: !blocked }}
                  onPress={() => onToggleFolder(folder.id)}
                  style={[
                    styles.folderRuleButton,
                    blocked ? styles.folderBlockedButton : styles.folderAllowedButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.folderRuleLabel,
                      blocked
                        ? styles.folderBlockedLabel
                        : styles.folderAllowedLabel,
                    ]}
                  >
                    {blocked ? 'Blocked' : 'Included'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.bottomArea}>
        <PrimaryButton
          label={isLoading ? 'Saving choices...' : 'Save choices'}
          onPress={onSave}
          disabled={isLoading}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={onIncludeAll}
          style={styles.textButton}
        >
          <Text style={styles.textButtonLabel}>Include all folders</Text>
        </Pressable>
        {hasSavedFolderRules && (
          <Pressable
            accessibilityRole="button"
            disabled={isLoading}
            onPress={onCancel}
            style={styles.textButton}
          >
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
