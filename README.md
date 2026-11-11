# Muse

A free music player for Android that plays the songs already on your phone.
No account, no ads and no streaming. Just your music, a player that looks
good, and listening stats that are fun to check.

## Download

Get the latest `.apk` from the
[Releases](https://github.com/wahidalways/Muse/releases) page and open it on
your phone. If Android asks, allow installs from your browser or file manager.

- Needs Android 7.0 or newer on a 64-bit phone (most phones from recent years).
- The download is about 16 MB.
- For new versions, tap **Settings › App & data › Check for updates**. Muse
  looks at the Releases page and shows you what changed.

## Features

**Your music, your folders.** Muse asks for audio access only after you tap
Allow access. Then it lists the folders that hold music. Keep or skip any
folder, and change your mind later in Settings. Short clips like voice notes
and ringtones can be hidden.

**Home.** A board of listening stats you can rearrange: this week, your daily
goal and streak, top artist, album and song, peak hour, genres, longest
session, how much of your library you have explored, and mixes made from your
plays. A weekly recap story and share cards sum it all up. Add your name and a
picture, or tap Surprise me.

**Library and Collections.** Every song, with fast search and many ways to
sort. Collections holds your playlists, favorites, smart lists and folders.

**Player.**

- A mini player and a full player with four looks: Classic, Full-bleed, Vinyl
  and Minimal.
- An Up Next queue you can reorder, and Play next.
- Lyrics saved inside the song's tags.
- A sleep timer that fades out, crossfade, and a playback speed for each song.
- Lock screen, notification and headphone controls. Muse can pause when your
  headphones disconnect and play again when they come back.

**Covers.** Muse reads the best picture inside each file. You can pick
another one, use your own photo, or search for a cover online. Songs with no
cover get Muse art in five styles.

**Equalizer.** On or off, Flat plus 20 presets, 10 bands and bass boost. It
changes the real sound, and it can open your phone's own sound settings too.

**Make it yours.** Light, dark, AMOLED black, or follow your phone. Eight
accent colors, or one that follows the playing cover. Glass or solid bars.
Six app icons.

**Backup.** One file holds your settings, playlists, favorites, ratings,
history and chosen photos. Restore it on a new phone and Muse finds your songs
by their file path. Your music files are never part of it.

## Privacy

Muse has no account, no ads and no analytics. Your music, playlists, stats and
history are stored on your phone. Muse goes online only when you tap one of
these:

- **Cover search** sends the words you search for (usually the artist and
  album) to Apple (iTunes Search) and Deezer.
- **Check for updates** asks GitHub for the latest Muse release.

These are the permissions Muse asks for:

| Permission | Why |
| --- | --- |
| Music and audio (storage on Android 12 and older) | Find and play the songs on your phone |
| Media playback in the background | Keep playing when the screen is off |
| Keep the phone awake | Stop the music from cutting out while it plays |
| Change audio settings | The equalizer |
| Internet and network state | Cover search, update checks and the audio engine |
| Vibrate | Small taps you can feel (you can turn them off) |

## Build it yourself

You need [Node.js](https://nodejs.org) 22 or newer.

```sh
git clone https://github.com/wahidalways/Muse.git
cd Muse
npm install
npm start
```

Scan the QR code with Expo Go on your phone, or press `a` for an Android
emulator. Expo Go shows the screens with 15 test songs from `assets/demo`.
Reading your own music, the equalizer, covers from files and the lock screen
need a real build.

**Build in the cloud with EAS** (no Android Studio needed):

```sh
npx eas-cli build --platform android --profile preview
```

`preview` makes an APK you can install. `production` makes an App Bundle for
Google Play. To build with your own Expo account, first delete `owner` and
`extra.eas.projectId` from `app.json`, then run `npx eas-cli init`.

**Build on your computer** with Android Studio and JDK 17:

```sh
npx expo run:android --variant release
```

The `android/` folder is made from `app.json` and the config plugins in
`plugins/`, so change those instead of editing it by hand.

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

## Keeping the app small

Most of the APK is React Native itself. Please keep these in place:

- The app is built for 64-bit ARM phones only (`buildArchs` in `app.json`).
- R8 shrinks the Java and Kotlin code, and unused resources are removed.
- Native code is packed small inside the APK (`useLegacyPackaging` in
  `app.json`), which halves the download. Android unpacks it once, when it
  installs Muse.
- The test songs load only in development, so they never reach the APK.
- React Native's GIF and WebP add-ons are left out
  (`plugins/withoutGifWebp.js`), and so are unused data files from a library
  (`packagingOptions` in `app.json`).
- Import icons from `@expo/vector-icons/Ionicons`, never from
  `@expo/vector-icons`. The short import adds every icon font to the APK.

## Project layout

- `src/MuseApp.tsx`: the app shell, tabs and navigation
- `src/playback/`: the player engine (`PlaybackController.ts`)
- `src/screens/`: Home, Library, Collections, Search and Settings
- `src/player/`: the full and mini players
- `src/onboarding/`: the first-run setup
- `modules/muse-audio-metadata/`: Muse's own Kotlin code (library scan, tags,
  covers, lyrics, equalizer and app icons)
- `plugins/`: config plugins for the app icons and a smaller APK
- `scripts/`: checks and asset generators

Built with Expo SDK 58, React Native 0.88 (New Architecture and Hermes),
Reanimated 4, expo-audio and FlashList.

## Credits

Made by [wahidalways](https://github.com/wahidalways)
([@mrbrainaxes](https://x.com/mrbrainaxes) on X).

Online covers come from the iTunes Search API and the Deezer API. Muse is not
linked to Apple or Deezer. Icons are [Ionicons](https://ionic.io/ionicons).

## License

Muse is free for everyone to use, but it is not open source. In short:

- **Free:** install and use Muse for any purpose, at home or at work, and
  give the official APK to people you know.
- **Free:** read the code, and build or change it for your own private use.
- **Ask first:** sharing a changed version, uploading Muse anywhere else,
  selling it, reusing its code, design, name or icon, or using it to train
  AI.

Bug reports and ideas are welcome as
[issues](https://github.com/wahidalways/Muse/issues), and that is also where
to ask for permission. Muse doesn't take outside code, so pull requests may
be closed. The full terms are in [LICENSE](LICENSE).
