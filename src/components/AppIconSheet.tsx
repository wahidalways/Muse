import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ICONS from '../../plugins/app-icons.json';
import { canSetAppIcon } from '../../modules/muse-audio-metadata';
import { setPreference, usePreferences, type AppIconId } from '../settings/preferences';
import { useTokens } from '../onboarding/previews';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

/** The launcher icons plugins/withAppIcons.js builds, in picker order. */
const APP_ICONS = ICONS as { id: AppIconId; label: string; note: string; background: string; bars: string }[];

const iconOf = (id: AppIconId) => APP_ICONS.find((icon) => icon.id === id) ?? APP_ICONS[0];

/** "Muse dark", "Lime bright": what the App icon row says. */
export const appIconName = (id: AppIconId) => {
  const icon = iconOf(id);
  return `${icon.label} ${icon.note.toLowerCase()}`;
};

/** Muse's four bars (heights 8, 13, 18, 11) on a tile, as the launcher shows them. */
export function AppIconMark({ id, size }: { id: AppIconId; size: number }) {
  const icon = iconOf(id);
  return (
    <View
      style={[
        local.tile,
        { width: size, height: size, borderRadius: size * 0.28, backgroundColor: icon.background },
      ]}
    >
      <View style={[local.bars, { gap: size * 0.065, height: size * 0.4 }]}>
        {[8, 13, 18, 11].map((height, index) => (
          <View
            key={index}
            style={{ width: size * 0.076, height: `${(height / 18) * 100}%`, borderRadius: size, backgroundColor: icon.bars }}
          />
        ))}
      </View>
    </View>
  );
}

type IonName = ComponentProps<typeof Ionicons>['name'];
/** Other apps on the sample home screens, so Muse is judged among neighbours. */
const NEIGHBOURS: ([string, IonName] | null)[] = [
  ['Clock', 'time'],
  null,
  ['Files', 'folder'],
  ['Camera', 'camera'],
  ['Photos', 'images'],
  ['Messages', 'chatbubble'],
];

function HomeScreen({ dark, icon }: { dark: boolean; icon: AppIconId }) {
  const wall = dark ? ['#141815', '#232924'] : ['#D5DECC', '#EEF2E8'];
  const text = dark ? '#EEF0EA' : '#1D241A';
  const app = dark ? ['#2C322D', '#D7DDD3'] : ['#FFFFFF', '#4B5548'];
  return (
    <View style={[local.home, { backgroundColor: wall[0] }]}>
      {/* A big soft circle: a simple wallpaper shape, so the screen reads as a phone. */}
      <View style={[local.wallShape, { backgroundColor: wall[1] }]} />
      <Text style={[local.homeTime, { color: text }]}>9:41</Text>
      <View style={local.homeGrid}>
        {NEIGHBOURS.map((neighbour, index) => (
          <View key={index} style={local.homeApp}>
            {neighbour ? (
              <View style={[local.neighbour, { backgroundColor: app[0] }]}>
                <Ionicons accessible={false} name={neighbour[1]} size={19} color={app[1]} />
              </View>
            ) : (
              <AppIconMark id={icon} size={38} />
            )}
            <Text numberOfLines={1} style={[local.homeLabel, { color: text }]}>
              {neighbour ? neighbour[0] : 'Muse'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Settings › Look & feel › App icon. The light and dark home screens show the
 * icon in use and follow each pick, so it is easy to see which one reads.
 */
export function AppIconSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useAppStyles();
  const tokens = useTokens();
  const { appIcon } = usePreferences();
  const available = canSetAppIcon();
  const pick = (id: AppIconId) => {
    if (id === appIcon) {
      return;
    }
    hapticSelection();
    // Switched once Muse is in the background (MuseApp): Android closes the
    // screen opened from the launcher entry that gets switched off.
    setPreference('appIcon', id);
    showToast('App icon set', { detail: `${appIconName(id)}, shows once you leave Muse` });
  };
  return (
    <Sheet visible={visible} eyebrow="APP ICON" title="Pick your icon" onClose={onClose} closeLabel="Done">
      <View style={[styles.sheetBody, local.body]}>
        <View style={local.homes} accessible accessibilityLabel={`Preview: ${appIconName(appIcon)} on a light and a dark home screen`}>
          <HomeScreen dark={false} icon={appIcon} />
          <HomeScreen dark icon={appIcon} />
        </View>
        <View style={local.captions}>
          <Text style={[local.caption, { color: tokens.muted }]}>Light home screen</Text>
          <Text style={[local.caption, { color: tokens.muted }]}>Dark home screen</Text>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="App icon" style={local.options}>
          {APP_ICONS.map((icon) => {
            const selected = icon.id === appIcon;
            return (
              <Pressable
                key={icon.id}
                accessibilityRole="radio"
                accessibilityLabel={`${icon.label}, ${icon.note}`}
                accessibilityState={{ checked: selected, disabled: !available }}
                disabled={!available}
                onPress={() => pick(icon.id)}
                style={({ pressed }) => [
                  local.option,
                  selected && { backgroundColor: tokens.card },
                  pressed && { opacity: 0.7 },
                  !available && { opacity: 0.45 },
                ]}
              >
                <View style={[local.ring, { borderColor: selected ? tokens.accent : 'transparent' }]}>
                  <AppIconMark id={icon.id} size={50} />
                </View>
                <Text style={[local.optionLabel, { color: selected ? tokens.text : tokens.muted }]}>{icon.label}</Text>
                <Text style={[local.optionNote, { color: tokens.muted }]}>{icon.note}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[local.note, { color: tokens.muted }]}>
          {available
            ? 'The new icon shows once you leave Muse. If your home screen loses its Muse shortcut, add it again from the app list.'
            : 'Needs the Muse app. Not available in Expo Go.'}
        </Text>
      </View>
    </Sheet>
  );
}

const local = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128, 128, 128, 0.3)',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  // The previews start below the title, not against it.
  body: {
    marginTop: 18,
  },
  homes: {
    flexDirection: 'row',
    gap: 10,
  },
  home: {
    flex: 1,
    height: 176,
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  wallShape: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -70,
    bottom: -90,
  },
  homeTime: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
    marginBottom: 12,
  },
  homeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  homeApp: {
    width: '33.33%',
    alignItems: 'center',
    gap: 5,
  },
  neighbour: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  captions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  caption: {
    flex: 1,
    fontSize: 12,
    textAlign: 'center',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    rowGap: 6,
  },
  option: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
  },
  ring: {
    borderWidth: 2,
    borderRadius: 18,
    padding: 3,
  },
  optionLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  optionNote: {
    fontSize: 11,
  },
  note: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
  },
});
