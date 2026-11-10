import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from './savedStore';
import type { SortDirection } from './sortTracks';

/** How one list is sorted: a sort id from that list's choices, and its order. */
export type ListSort = { by: string; direction: SortDirection };

/**
 * One saved sort per list kind ("collections:playlists", "library:albums"...),
 * so a choice survives restarts. Unknown ids are checked by the reader, since
 * each list knows its own choices.
 */
const store = createSavedStore<Record<string, ListSort>>(AsyncStorage, '@muse/list-sorts/v1', {}, (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, Partial<ListSort>>).filter(
          ([, sort]) =>
            typeof sort?.by === 'string' && (sort.direction === 'ascending' || sort.direction === 'descending'),
        ),
      ) as Record<string, ListSort>
    : null,
);

export function useListSorts(): Readonly<Record<string, ListSort>> {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function setListSort(key: string, sort: ListSort) {
  store.update((sorts) => ({ ...sorts, [key]: sort }));
}
