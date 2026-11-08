# Muse

Muse is an Expo app being built into an offline-first music player for Android.
The app starts with a welcome screen, explains its audio permission before
asking, and then scans Android audio folders. You can include or block folders;
playback and persistent track browsing are the next implementation steps.

The app requests Android audio-library access only after the user taps
**Allow access**. It does not request photo, video, microphone, or recording
access.
Folder choices are saved on-device. On later launches, an existing permission
grant and saved choices are restored without another permission prompt.
After setup, Muse opens to Home by default. The bottom tabs provide Home,
Library, Equalizer, and Settings. Library displays individual tracks with a
single-line search and a Sort by dropdown. Sort by title, artist, album, album
artist, year, track number, filename, folder/path, duration, or date added,
and choose ascending or descending order. Folder inclusion rules are managed
from Settings.

The **Equalizer** (More, Settings or the full player) changes the real sound in
the installed app: a 10-band or 31-band graphic EQ, a parametric EQ with
draggable bands, tone (bass, mid, treble, volume boost), balance, compressor,
limiter, surround and room reverb. It has 20 built-in presets, your own saved
presets (share them as text), headphone correction for 76 models from AutoEQ,
a separate sound per output (speaker, wired, each Bluetooth device) and a
hold-to-compare button. Dolby Atmos and Android spatial audio belong to the
phone, so Muse shows their state and opens their settings. Expo Go shows the
screens only. Check the EQ math with `node scripts/check-eq.mjs`.
Choose **Light** or **Dark** mode independently from the **Muse Green**,
**Ocean Blue** or **Sunset Amber** color theme in
**Settings → Appearance**. Light is the default. In Dark mode, you can
optionally enable **AMOLED black** for true-black backgrounds. Muse saves all
appearance choices on the device. **Settings → Display → Full screen** hides
the status bar while keeping the Android system navigation visible; safe-area
spacing prevents app content and tabs from overlapping it.

Expo Go does not provide full access to the Android media library. It opens the
real app shell with an empty library so you can review the screens and
navigation. Install a development build or APK to test device music access.
The installed APK asks for Android audio-library access when you tap
**Allow access**. No photo, video, microphone, or recording permission is
requested.

## Run the app

```sh
npm start
```

Press `a` in the Expo terminal to open Android, or run `npm run android`.

## Build an Android APK

The `preview` EAS profile is configured to produce an installable APK:

```sh
npx eas-cli build --platform android --profile preview
```

An EAS account is needed to run a cloud build. The `production` profile is
configured for an Android App Bundle.
