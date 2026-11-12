import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsSection, SettingsSwitchRow, TILE } from './SettingsList';
import { useTokens } from '../onboarding/previews';
import { ACCENT_OPTIONS, type Accent } from '../theme/theme';
import type { MusicFolder, MusicTrack } from '../types';

/**
 * Turning music folders on and off. One look for setup and for Settings ›
 * Included folders: a summary line with "Turn all on", then one switch per
 * folder with its song count and where it sits on the phone (two folders can
 * share a name).
 */
export function FolderPicker({
  folders,
  tracks,
  blockedFolderIds,
  onToggleFolder,
  onIncludeAllFolders,
  accent,
  waiting = false,
}: {
  folders: MusicFolder[];
  /** For each folder's place on the phone. */
  tracks: MusicTrack[];
  blockedFolderIds: string[];
  onToggleFolder: (folderId: string) => void;
  onIncludeAllFolders: () => void;
  accent: Accent;
  /** The scan has not finished yet. */
  waiting?: boolean;
}) {
  const tokens = useTokens();
  const swatch = (ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]).swatch;
  const places = useMemo(() => {
    const byFolder = new Map<string, string>();
    for (const track of tracks) {
      if (!byFolder.has(track.folderId)) {
        // "Music/Rock/song.flac" -> "Music"; the folder's own name is already the title.
        const parent = track.path.split('/').slice(0, -2).filter(Boolean).join('/');
        byFolder.set(track.folderId, parent);
      }
    }
    return byFolder;
  }, [tracks]);
  const kept = folders.filter((folder) => !blockedFolderIds.includes(folder.id));
  const songs = kept.reduce((sum, folder) => sum + folder.trackCount, 0);

  if (waiting) {
    return (
      <View style={local.waiting}>
        <ActivityIndicator color={tokens.accent} />
        <Text style={[local.caption, { color: tokens.muted }]}>Still finding your music</Text>
      </View>
    );
  }
  if (folders.length === 0) {
    return (
      <Text style={[local.caption, local.left, { color: tokens.muted }]}>
        No music found yet. Add songs to your phone, then rescan from Settings.
      </Text>
    );
  }
  return (
    <>
      <View style={local.summary}>
        <Text style={[local.summaryText, { color: tokens.muted }]}>
          <Text style={{ color: tokens.text }}>{songs.toLocaleString('en-US')} songs</Text> · {kept.length} of {folders.length} folders on
        </Text>
        {blockedFolderIds.length > 0 && (
          <Pressable accessibilityRole="button" onPress={onIncludeAllFolders} style={local.linkButton}>
            <Text style={[local.link, { color: tokens.accent }]}>Turn all on</Text>
          </Pressable>
        )}
      </View>
      <SettingsSection>
        {folders.map((folder) => {
          const count = `${folder.trackCount.toLocaleString('en-US')} ${folder.trackCount === 1 ? 'song' : 'songs'}`;
          const place = places.get(folder.id);
          return (
            <SettingsSwitchRow
              key={folder.id}
              icon="folder"
              tint={TILE.blue}
              title={folder.title}
              subtitle={place ? `${count} · ${place}` : count}
              value={!blockedFolderIds.includes(folder.id)}
              onValueChange={() => onToggleFolder(folder.id)}
              accent={swatch}
            />
          );
        })}
      </SettingsSection>
    </>
  );
}

/** The title and line above the picker, as setup shows them. */
export function FolderHeading({ title, text }: { title: string; text: string }) {
  const tokens = useTokens();
  return (
    <View style={local.heading}>
      <Text accessibilityRole="header" style={[local.title, { color: tokens.text }]}>
        {title}
      </Text>
      <Text style={[local.lead, { color: tokens.muted }]}>{text}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  heading: { marginBottom: 4 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 },
  lead: { marginTop: 8, fontSize: 15, lineHeight: 22, maxWidth: 340 },
  waiting: { marginTop: 40, alignItems: 'center' },
  caption: { marginTop: 10, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  left: { textAlign: 'left', marginLeft: 4 },
  summary: { marginTop: 20, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { flex: 1, fontSize: 15, fontWeight: '500' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  link: { fontSize: 14, fontWeight: '600' },
});
