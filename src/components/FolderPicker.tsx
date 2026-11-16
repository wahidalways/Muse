import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SettingsSection, SettingsSwitchRow, TILE } from './SettingsList';
import { showToast } from './Toast';
import { useTokens } from '../onboarding/previews';
import { formatOf } from '../library/library';
import { getPreferences, setPreference, usePreferences } from '../settings/preferences';
import { ACCENT_OPTIONS, type Accent } from '../theme/theme';
import { hapticSelection } from '../utils/haptics';
import type { MusicFolder, MusicTrack } from '../types';

/** Chips shown before "+N more": the most common types; a folder with one more than this shows them all. */
const FIRST_TYPES = 4;

/**
 * Turning music folders on and off. One look for setup and for Settings ›
 * Included folders: a summary line with "Turn all on", then one switch per
 * folder with its song count and where it sits on the phone (two folders can
 * share a name). Under each folder that is on, a chip per file type in it,
 * so voice recordings or WAVs can stay out of a music folder.
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
  /** Every song found, hidden file types included: places, types and counts come from these. */
  tracks: MusicTrack[];
  blockedFolderIds: string[];
  onToggleFolder: (folderId: string) => void;
  onIncludeAllFolders: () => void;
  accent: Accent;
  /** The scan has not finished yet. */
  waiting?: boolean;
}) {
  const tokens = useTokens();
  const { hiddenFormats } = usePreferences();
  /** Folders whose every type chip is open. */
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const swatch = (ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]).swatch;
  const { places, formats } = useMemo(() => {
    const byFolder = new Map<string, string>();
    /** Songs per file type in each folder, most common first. */
    const counts = new Map<string, Map<string, number>>();
    for (const track of tracks) {
      if (!byFolder.has(track.folderId)) {
        // "Music/Rock/song.flac" -> "Music"; the folder's own name is already the title.
        const parent = track.path.split('/').slice(0, -2).filter(Boolean).join('/');
        byFolder.set(track.folderId, parent);
      }
      const folderCounts = counts.get(track.folderId) ?? new Map<string, number>();
      const format = formatOf(track);
      folderCounts.set(format, (folderCounts.get(format) ?? 0) + 1);
      counts.set(track.folderId, folderCounts);
    }
    const sorted = new Map([...counts].map(([folderId, byFormat]) => [folderId, [...byFormat].sort((a, b) => b[1] - a[1])]));
    return { places: byFolder, formats: sorted };
  }, [tracks]);
  /** Songs a folder adds, its hidden file types left out. */
  const shownCount = (folder: MusicFolder) => {
    const types = formats.get(folder.id);
    const hidden = hiddenFormats[folder.id] ?? [];
    return types ? types.reduce((sum, [format, count]) => sum + (hidden.includes(format) ? 0 : count), 0) : folder.trackCount;
  };
  const kept = folders.filter((folder) => !blockedFolderIds.includes(folder.id));
  const songs = kept.reduce((sum, folder) => sum + shownCount(folder), 0);

  const toggleFormat = (folder: MusicFolder, format: string) => {
    const types = formats.get(folder.id) ?? [];
    const current = getPreferences().hiddenFormats;
    const hidden = current[folder.id] ?? [];
    const next = hidden.includes(format) ? hidden.filter((item) => item !== format) : [...hidden, format];
    // Counted from the types still in the folder: a hidden type whose files are gone does not count.
    if (types.every(([type]) => next.includes(type))) {
      showToast(types.length === 1 ? `Only ${format} files here` : 'Keep at least one type', {
        detail: `To leave ${folder.title} out, turn the folder off`,
      });
      return;
    }
    hapticSelection();
    const { [folder.id]: _old, ...others } = current;
    setPreference('hiddenFormats', next.length > 0 ? { ...others, [folder.id]: next } : others);
  };

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
          const shown = shownCount(folder);
          const count = `${shown.toLocaleString('en-US')} ${shown === 1 ? 'song' : 'songs'}`;
          const place = places.get(folder.id);
          const isOn = !blockedFolderIds.includes(folder.id);
          const types = formats.get(folder.id) ?? [];
          const hidden = hiddenFormats[folder.id] ?? [];
          // Many types: the most common first, the rest behind "+N more", which says how many of them are off.
          const isOpen = openFolders.includes(folder.id) || types.length <= FIRST_TYPES + 1;
          const shownTypes = isOpen ? types : types.slice(0, FIRST_TYPES);
          const tucked = isOpen ? [] : types.slice(FIRST_TYPES);
          const tuckedOff = tucked.filter(([format]) => hidden.includes(format)).length;
          return (
            // One child per folder, so the section's separator runs between folders, not above the chips.
            <View key={folder.id}>
              <SettingsSwitchRow
                icon="folder"
                tint={TILE.blue}
                title={folder.title}
                subtitle={place ? `${count} · ${place}` : count}
                value={isOn}
                onValueChange={() => onToggleFolder(folder.id)}
                accent={swatch}
              />
              {isOn && types.length > 0 && (
                <View accessibilityRole="list" accessibilityLabel={`File types in ${folder.title}`} style={local.chips}>
                  {shownTypes.map(([format, total]) => {
                    const on = !hidden.includes(format);
                    return (
                      <Pressable
                        key={format}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${format}, ${total} ${total === 1 ? 'file' : 'files'}`}
                        hitSlop={6}
                        onPress={() => toggleFormat(folder, format)}
                        style={[
                          local.chip,
                          on ? { backgroundColor: tokens.action, borderColor: tokens.action } : { borderColor: tokens.line },
                        ]}
                      >
                        {on && <Ionicons accessible={false} name="checkmark" size={14} color={tokens.onAction} />}
                        <Text style={[local.chipLabel, { color: on ? tokens.onAction : tokens.muted }]}>
                          {format} · {total.toLocaleString('en-US')}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {tucked.length > 0 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${tucked.length} more file types${tuckedOff > 0 ? `, ${tuckedOff} off` : ''}`}
                      hitSlop={6}
                      onPress={() => {
                        hapticSelection();
                        setOpenFolders((current) => [...current, folder.id]);
                      }}
                      style={[local.chip, { borderColor: tokens.line }]}
                    >
                      <Text style={[local.chipLabel, { color: tokens.text }]}>
                        +{tucked.length} more{tuckedOff > 0 ? ` · ${tuckedOff} off` : ''}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </SettingsSection>
    </>
  );
}

const local = StyleSheet.create({
  waiting: { marginTop: 40, alignItems: 'center' },
  caption: { marginTop: 10, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  left: { textAlign: 'left', marginLeft: 4 },
  summary: { marginTop: 20, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { flex: 1, fontSize: 15, fontWeight: '500' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  link: { fontSize: 14, fontWeight: '600' },
  // Lined up with the folder's name: the row's padding plus its icon tile and gap.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 58, paddingRight: 16, paddingBottom: 12 },
  chip: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1 },
  chipLabel: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
