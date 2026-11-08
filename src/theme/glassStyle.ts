import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContext, useSyncExternalStore } from 'react';
import { createSavedStore } from '../library/savedStore';
import { ThemeContext } from './theme';

/** How the floating tab bar and mini player are drawn. */
export type GlassStyle = 'frosted' | 'full' | 'solid';

/** What the person picks in Settings: blur, or a plain solid bar. */
export type GlassChoice = 'blur' | 'solid';

export const GLASS_CHOICES: { id: GlassChoice; label: string; hint: string }[] = [
  { id: 'blur', label: 'Blur', hint: 'See-through glass that blurs what scrolls behind it' },
  { id: 'solid', label: 'Solid', hint: 'No blur, easier on older phones' },
];

const store = createSavedStore<GlassChoice>(
  AsyncStorage,
  '@muse/glass-style/v1',
  'blur',
  // Older versions saved Frosted or Full blur; both are Blur now.
  (value) =>
    value === 'solid' ? 'solid' : value === 'blur' || value === 'frosted' || value === 'full' ? 'blur' : null,
);

export function useGlassChoice(): GlassChoice {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function setGlassChoice(choice: GlassChoice) {
  store.update(() => choice);
}

/**
 * The style in effect. Blur is frosted (light and see-through) on a light
 * page, and a full blur on a dark one, where frosted reads as grey haze.
 */
export function useGlassStyle(): GlassStyle {
  const choice = useGlassChoice();
  const { theme } = useContext(ThemeContext);
  return choice === 'solid' ? 'solid' : theme === 'dark' ? 'full' : 'frosted';
}
