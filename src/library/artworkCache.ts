import { Directory, Paths } from 'expo-file-system';
import { clearArtworkMemory } from '../components/AlbumArtwork';

/** Where the native module saves small cover JPEGs (one per song). */
function artworkDirectory(): Directory {
  return new Directory(Paths.cache, 'muse-artwork');
}

/** Bytes used by saved covers; 0 when there are none or it cannot be read. */
export function artworkCacheBytes(): number {
  try {
    const directory = artworkDirectory();
    return directory.exists ? (directory.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** Deletes saved covers. They are made again, one by one, as songs show up. */
export function clearArtworkCache(): void {
  const directory = artworkDirectory();
  if (directory.exists) {
    directory.delete();
  }
  clearArtworkMemory();
}
