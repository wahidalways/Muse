# Muse

Muse is an offline music player for Android, built with Expo and React
Native. It plays the music already on your phone. There is no account, no
streaming and no ads, and your listening history never leaves the phone.

## What it does

- **Your music, your folders.** Muse asks for audio access only after you tap
  Allow access, then lists your music folders. Include or skip any folder;
  you can change this later in Settings.
- **Home.** A board of listening stats you can rearrange: this week, your
  daily goal and streak, top artist, album and song, peak hour, genres,
  sessions, how much of your library you have explored, and mixes made from
  your plays. A weekly recap story and share cards sum it up.
- **Library and Collections.** Every song with search and many sort options.
  Collections holds your playlists, favorites, smart lists and folders.
- **Player.** A mini player and a full player with four looks (Classic,
  Full-bleed, Vinyl and Minimal type), lyrics stored in the song's tags, an
  Up Next queue you can reorder, a sleep timer, crossfade and a speed per
  song. Lock screen and headphone controls work in the background.
- **Covers.** Muse reads the best picture inside each file. You can pick
  another one, your own photo, or a cover found online (Apple Music and
  Deezer, only when you search). Songs with no cover get generated Muse art.
- **Equalizer.** On or off, 20 presets, 10 bands and bass boost. It changes
  the real sound, and it can open your phone's own sound effects too.
- **Make it yours.** Light, dark or AMOLED black, eight accent colors (or one
  that follows the playing cover), glass or solid bars, and six app icons.
- **Backup.** One file with your settings, playlists, favorites, ratings,
  history and chosen photos. Restoring on a new phone matches songs by their
  file path. Your music files are never part of it.

## Run it

```sh
npm install
npm start
```

Press `a` to open it on Android. Expo Go shows the screens with 15 test
songs (`assets/demo`, made by `node scripts/make-demo-audio.js assets/demo`).
They are never part of a release build. Reading your phone's music, the
equalizer, covers from files and the lock screen need a real build.

## Build an APK

```sh
npx eas-cli build --platform android --profile preview
```

The `preview` profile makes an installable APK, and `production` makes an
App Bundle for Google Play. You need an Expo account.

## Checks

Run these before a build:

```sh
npx tsc --noEmit
npx expo lint
node scripts/check-stats.mjs
node scripts/check-eq.mjs
node scripts/check-audio.mjs
```

`check-stats.mjs` covers the stats, mixes, sorting, search, backups and more.

## Where things live

- `src/MuseApp.tsx`: the app shell, tabs and navigation
- `src/playback/`: the player engine (`PlaybackController.ts`)
- `src/screens/`: Home, Library, Collections, Search and Settings
- `src/player/`: the full and mini players
- `modules/muse-audio-metadata/`: Muse's own native code (library scan,
  covers, lyrics, equalizer and audio details)
- `plugins/`: config plugins, such as the app icons
- `scripts/`: checks and asset generators
