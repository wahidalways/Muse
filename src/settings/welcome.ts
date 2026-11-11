import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from '../library/savedStore';

/** Muse's one-time hello (components/WelcomeNote): true once it has been closed on this phone. */
const store = createSavedStore<boolean>(AsyncStorage, '@muse/welcome-seen/v1', false, (value) => (value === true ? true : null));

/** The hello is due: the saved flag has loaded, and the hello was never closed. */
export function useWelcomeDue(): boolean {
  return useSyncExternalStore(store.subscribe, () => store.loaded() && !store.get());
}

export function markWelcomeSeen() {
  store.update(() => true);
}
