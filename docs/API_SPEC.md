# Muse API and Onboarding Specification

## Scope

Muse currently has no backend API. First-run onboarding and music discovery run
locally on the Android device using the operating system media library.

## Onboarding flow

1. **Welcome** introduces Muse and does not request any permissions. It shows
   an album-style preview with a record, a music library label, and an
   on-device note. Welcome, audio guidance, and first-time folder setup use a
   three-step indicator. It is hidden when managing folders later from
   Settings.
2. **Guidance** explains audio-library access and the local-only handling of
   music before the user chooses to continue.
3. **Permission request** begins only after the user taps
   **Allow access**.
4. **Folder access** appears after permission is granted. Audio folders are
   listed with their track counts and start included. A summary shows included
   folder and track totals as choices change. Users can block folders or allow
   all folders.
5. After setup, the **Home** tab opens by default. It shows the included song
   count, included and hidden folder counts, and a chart of up to four included
   folders with the most songs. The chart uses local folder track counts.
   Home also shows a seven-day play chart, recent plays, and the current
   playback state when a song is selected. Before a song is selected, it shows
   a shortcut to the Library to start the player. It also offers shortcuts to
   browse the Library and scan for new music. The Muse logo and status badge
   appear on Home only. Home uses a direct “Welcome home.” heading without a
   separate “Your music” eyebrow label. Other tabs keep their screen titles
   without that header.
6. The bottom tab bar navigates between **Home**, **Library**, **Equalizer**,
   and **Settings**. A back button and left-edge swipe return to the previous
   setup step. Android back does the same. From a non-Home tab, Android back
   returns to Home.
   Settings uses a compact three-row Appearance group with a **Dark
   appearance** switch, a smaller one-line **Accent color** selector, and an
   **AMOLED black** switch. Its overlaid palette uses one full-width choice per
   row and offers **Muse Green**, **Ocean Blue**, **Sunset Amber**, **Lavender**,
   **Coral**, **Teal**, and a stronger saturated **Red**, alongside clearly grouped Display, Music
   Library, and About sections. The accent menu overlays the page rather than expanding
   the settings section. Its
   translucent scrim preserves the Light-mode page instead of washing it out;
   the Light-theme style transform preserves the scrim's alpha channel.
   Light is the
   default when no preference is saved. **AMOLED black** is always shown as a
   setting, but its switch is disabled and has no effect in Light mode. In Dark
   mode it can be enabled for true-black backgrounds. Appearance mode, color
   theme, and AMOLED preference are saved locally and
   restored on later launches. Before the saved preference is loaded, the first
   render follows Android's current light or dark appearance to avoid an
   inappropriate flash. Settings controls use Android-sized touch targets and
   explanatory supporting text for disabled and active states.
   Light mode uses a white-first surface system with neutral charcoal text and
   borders; accent colors are reserved for actions, selected states, and subtle
   tinted surfaces rather than tinting every card and page background. Muse
   Green uses the onboarding hue consistently in Light mode for buttons,
   accent writing, icons, borders, and selected states instead of a deep forest
   green. Red uses a clean, high-contrast red family rather than a soft coral
   treatment across Light, Dark, and AMOLED accents.
   The **Full screen** setting hides the status bar and is saved locally. The
   Android system navigation bar remains visible, and safe-area insets keep
   headers, content, and bottom tabs clear of system bars.
   Screen titles use a tighter gap below the header while retaining the same
   top safe-area spacing for the logo.
7. **Library** prioritizes a searchable, flat list of individual tracks from
   included folders. Its heading summarizes the included track and folder
   counts. Search covers track metadata, filenames, and folder paths; a clear
   control appears while a query is entered, and the result count updates with
   the query. A compact sort button opens an overlaid menu with sort-field and
   ascending/descending choices; it does not expand the track list. The current
   sort field, order, and result count stay visible. The sorting overlay also
   uses one full-width choice per row. The sorting control remains
   high-contrast and visible on the white Light-mode library surface, including
   its icon and selected state.
   Tracks show album art when available, title, artist and folder, duration,
   and a compact play or pause action. Tracks without a playable local URI
   remain visible but disabled. Empty libraries and searches with no matches
   show explanatory states. Users can
   sort by title, artist, album, album artist, year, track number, filename,
   folder/path, duration, or date added. Folder allow/block rules remain
   available in Settings.
   When a track is selected, playback controls stay available on Home and in a
   compact player above the tabs on other screens. The compact player shows
   album art, track and artist details, playback progress, and spaced previous,
   play or pause, and next controls. Tap its artwork or details to open the full
   player. The full player places album art and track details above a
   touch-friendly seek bar with elapsed and total duration, prominent transport
   controls, and shuffle and repeat controls with visible active states. The
   sleep timer is in the top bar. A compact **Up Next** bar at the bottom
   expands to show the queue. Swipe up opens the full player, swipe down on its
   album art closes it, and swiping left or right changes songs. A sleep timer
   can pause playback after 15, 30, 45, or 60 minutes.
   The Home now-playing card keeps the title and artist block visually
   separated from the progress slider with dedicated spacing.
8. **Equalizer** provides selectable sound-profile previews. Audio effects are
   not applied yet.
9. **Settings** provides folder management, library rescan, and permission
   settings. Library rescan explicitly refreshes the local music snapshot.
10. On later launches, Muse checks the existing permission and restores the
    saved folder rules and cached library without prompting again or scanning
    the entire device. If no valid cache exists, the library is scanned once
    and the snapshot is saved locally.
11. **Access denied** explains why the library cannot be shown and offers device
   Settings and a retry action.
12. **Build required** explains that Expo Go does not provide full Android
   media-library access and directs the user to install an Android build.
13. **Error** presents an operation error and offers a retry.

## Device permission

- **Platform:** Android.
- **Permission:** audio media access only (`READ_MEDIA_AUDIO` on Android 13+;
  legacy `READ_EXTERNAL_STORAGE` on older Android versions).
- **Excluded permissions:** photos and videos.
- **Request timing:** user initiated, from the guidance screen.
- **User prompt:** Android shows the audio-library permission dialog after the
  user taps **Allow access**. If access is denied, Muse offers a retry and a
  link to device Settings.
- **Background playback:** the APK configures the audio playback foreground
  service and lock-screen media controls. Microphone and recording permissions
  are disabled.
- **Folder rules:** users manage included and blocked folders in Muse. The
  blocklist is stored locally with AsyncStorage.
- **Navigation:** Home, Library, Equalizer, and Settings are bottom tabs. Home
  is the default section after setup.
- **Appearance:** Light or Dark mode and Muse Green, Ocean Blue, or Sunset
  Amber accent are independent Settings choices. When no preference is saved,
  the initial render follows Android's current appearance; the saved Muse
  preference takes priority once loaded. AMOLED black is always visible, but
  only enabled and effective in Dark mode. All appearance preferences are
  saved locally with AsyncStorage.
- **Display:** Full screen hides the status bar and is saved locally with
  AsyncStorage. The Android system navigation bar remains visible; safe-area
  spacing prevents app content and bottom tabs from overlapping it.
- **Data handling:** audio metadata is read locally to identify audio folders,
  display track tags, and count tracks. Search and sorting run on-device.
  Android MediaStore provides the available audio tags; missing tags sort after
  populated values. Playback uses the local media URI. Play start times and
  track details are saved on-device in AsyncStorage, with up to 500 recent
  events. The Home listening chart counts play starts by day for the last seven
  days. The current queue, track, position, shuffle setting, and repeat setting
  are also saved on-device. Playback starts paused when Muse is reopened.
  The discovered folders and track metadata are cached on-device in
  AsyncStorage and restored on launch. The cache is replaced only after an
  explicit library rescan or when no valid snapshot exists.
  Album art is read from the local media library when available. No media,
  metadata, or listening history is uploaded.
- **Other platforms:** device music-library discovery is not available in this
  initial Android-focused implementation.
- **Expo Go:** full device media-library access is not available; use an
  Android development build or APK.

## Current limitations

The Home tab summarizes discovered folders, track counts, and local play
history. Android builds support background playback and lock-screen play,
pause, previous, and next controls. Active equalizer processing is not
implemented yet.
