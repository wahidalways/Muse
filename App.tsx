import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ACCENT_KEY, AMOLED_KEY, FULL_SCREEN_KEY, THEME_KEY } from './src/constants';
import { ACCENT_OPTIONS, type Accent, type Appearance, ThemeContext } from './src/theme/theme';
import { MuseApp } from './src/MuseApp';
import { usePlayback } from './src/playback/usePlayback';
import { usePreferences } from './src/settings/preferences';
import { accentForCover } from './src/theme/dynamicAccent';
import { getArtworkColor } from './modules/muse-audio-metadata';

// Start loading the icon font at launch so controls do not appear late.
// Icons render on their own once it is ready, so a failure is not fatal.
Ionicons.loadFont().catch(() => undefined);

export default function App() {
  const systemColorScheme = useColorScheme();
  // Follows the phone until a choice is saved; System keeps following it.
  const [appearance, setAppearance] = useState<Appearance>('system');
  const theme =
    appearance === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : appearance;
  const [accent, setAccent] = useState<Accent>('muse');
  const [isAmoled, setIsAmoled] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [amoledError, setAmoledError] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fullScreenError, setFullScreenError] = useState('');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(ACCENT_KEY),
      AsyncStorage.getItem(AMOLED_KEY),
    ])
      .then(([savedTheme, savedAccent, savedAmoled]) => {
        const legacyAmoled = savedAmoled === 'true' || savedTheme === 'amoled';
        // Nothing saved yet means System. Older versions saved accent names.
        setAppearance(
          savedTheme === null || savedTheme === 'system'
            ? 'system'
            : legacyAmoled ||
                savedTheme === 'dark' ||
                savedTheme === 'muse' ||
                savedTheme === 'ocean' ||
                savedTheme === 'sunset' ||
                savedTheme === 'rose'
              ? 'dark'
              : 'light',
        );
        setIsAmoled(legacyAmoled);

        const accentFromLegacyTheme =
          savedTheme === 'ocean' ||
          savedTheme === 'sunset'
            ? savedTheme
            : 'muse';
        const savedAccentOption = ACCENT_OPTIONS.find(
          (option) => option.id === savedAccent,
        );
        if (savedAccentOption) {
          setAccent(savedAccentOption.id);
        } else {
          setAccent(accentFromLegacyTheme);
        }
      })
      .catch((error: unknown) => {
        setThemeError(
          error instanceof Error ? error.message : 'Could not load the saved appearance.',
        );
      });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(FULL_SCREEN_KEY)
      .then((savedValue) => {
        setIsFullScreen(savedValue === 'true');
      })
      .catch((error: unknown) => {
        setFullScreenError(
          error instanceof Error ? error.message : 'Could not load the full screen setting.',
        );
      });
  }, []);

  // AMOLED stays as chosen: it only shows while the theme is dark.
  const selectAppearance = (nextAppearance: Appearance) => {
    setAppearance(nextAppearance);
    setThemeError('');
    AsyncStorage.setItem(THEME_KEY, nextAppearance).catch((error: unknown) => {
      setThemeError(
        error instanceof Error ? error.message : 'Could not save the appearance.',
      );
    });
  };

  const selectAccent = (nextAccent: Accent) => {
    setAccent(nextAccent);
    setThemeError('');
    AsyncStorage.setItem(ACCENT_KEY, nextAccent).catch((error: unknown) => {
      setThemeError(
        error instanceof Error ? error.message : 'Could not save the color theme.',
      );
    });
  };

  const toggleAmoled = () => {
    if (theme !== 'dark') {
      return;
    }
    const nextAmoled = !isAmoled;
    setIsAmoled(nextAmoled);
    setAmoledError('');
    AsyncStorage.setItem(AMOLED_KEY, String(nextAmoled)).catch((error: unknown) => {
      setAmoledError(
        error instanceof Error ? error.message : 'Could not save the AMOLED setting.',
      );
    });
  };

  const toggleFullScreen = () => {
    const nextValue = !isFullScreen;
    setIsFullScreen(nextValue);
    setFullScreenError('');
    AsyncStorage.setItem(FULL_SCREEN_KEY, String(nextValue)).catch((error: unknown) => {
      setFullScreenError(
        error instanceof Error ? error.message : 'Could not save the full screen setting.',
      );
    });
  };

  // Dynamic accent: the closest Muse color to the playing song's cover. It
  // keeps the last cover's color while the next one is read, so it never
  // flashes back to the chosen accent between songs.
  const { dynamicAccent } = usePreferences();
  const playingTrackId = usePlayback().currentTrack?.id ?? null;
  const [coverAccent, setCoverAccent] = useState<Accent | null>(null);
  useEffect(() => {
    if (!dynamicAccent || !playingTrackId) {
      return;
    }
    let isActive = true;
    void getArtworkColor(playingTrackId).then((color) => {
      if (isActive) {
        setCoverAccent(accentForCover(color, accent, ACCENT_OPTIONS));
      }
    });
    return () => {
      isActive = false;
    };
  }, [accent, dynamicAccent, playingTrackId]);
  const shownAccent = dynamicAccent && playingTrackId && coverAccent ? coverAccent : accent;

  return (
    // Gestures do nothing, with no error, unless this wraps the app.
    <GestureHandlerRootView style={rootStyles.root}>
      <ThemeContext.Provider value={{ theme, accent: shownAccent, isAmoled }}>
        <SafeAreaProvider>
          <MuseApp
            theme={theme}
            appearance={appearance}
            accent={accent}
            isAmoled={isAmoled}
            themeError={themeError}
            amoledError={amoledError}
            onSelectAppearance={selectAppearance}
            onSelectAccent={selectAccent}
            onToggleAmoled={toggleAmoled}
            isFullScreen={isFullScreen}
            fullScreenError={fullScreenError}
            onToggleFullScreen={toggleFullScreen}
          />
        </SafeAreaProvider>
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}

const rootStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
