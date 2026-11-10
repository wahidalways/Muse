/**
 * App icon choices (Settings › Look & feel › App icon).
 *
 * Android has no API to change a launcher icon, so each icon is an
 * <activity-alias> of MainActivity with its own icon. Exactly one alias is
 * enabled at a time; the app flips them with PackageManager (see
 * MuseAudioMetadataModule.setAppIcon). The launcher entry moves from
 * MainActivity to the aliases, so MainActivity keeps only its other filters.
 *
 * The icons are drawn as vectors here (Muse's four bars), so no PNGs are
 * needed. "muse" keeps the real launcher icon from app.json.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const ICONS = require('./app-icons.json');

const ALIAS_PREFIX = '.MuseIcon_';

// The four bars, from assets/android-icon-foreground.png (1024px = 108dp):
// centre x, top, and the shared bottom, in the 108dp adaptive-icon viewport.
const BAR_WIDTH = 6.54;
const BARS = [
  { x: 34.81, top: 53.79 },
  { x: 47.04, top: 44.4 },
  { x: 59.17, top: 34.91 },
  { x: 71.4, top: 48.1 },
];
const BOTTOM = 68.77;

function barsVector(color) {
  // Each bar is a line with round caps, so the ends sit inset by half the width.
  const r = BAR_WIDTH / 2;
  const paths = BARS.map(
    ({ x, top }) =>
      `  <path android:pathData="M${x},${(top + r).toFixed(2)} L${x},${(BOTTOM - r).toFixed(2)}" android:strokeWidth="${BAR_WIDTH}" android:strokeLineCap="round" android:strokeColor="${color}" />`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="108dp" android:height="108dp"
  android:viewportWidth="108" android:viewportHeight="108">
${paths}
</vector>
`;
}

function adaptiveIcon(id) {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/muse_icon_${id}_background" />
  <foreground android:drawable="@drawable/muse_icon_${id}_bars" />
  <monochrome android:drawable="@drawable/muse_icon_mono_bars" />
</adaptive-icon>
`;
}

const isLauncherFilter = (filter) =>
  (filter.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.MAIN') &&
  (filter.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.LAUNCHER');

function withAliases(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) {
      return mod;
    }
    const main = (application.activity ?? []).find((activity) => activity.$['android:name'] === '.MainActivity');
    if (!main) {
      throw new Error('withAppIcons: .MainActivity not found in AndroidManifest.xml');
    }
    main['intent-filter'] = (main['intent-filter'] ?? []).filter((filter) => !isLauncherFilter(filter));
    // Rebuilt every prebuild, so running it twice never doubles them.
    application['activity-alias'] = (application['activity-alias'] ?? []).filter(
      (alias) => !alias.$['android:name'].startsWith(ALIAS_PREFIX),
    );
    for (const icon of ICONS) {
      const own = icon.id === 'muse';
      application['activity-alias'].push({
        $: {
          'android:name': `${ALIAS_PREFIX}${icon.id}`,
          'android:targetActivity': '.MainActivity',
          'android:enabled': own ? 'true' : 'false',
          'android:exported': 'true',
          'android:icon': own ? '@mipmap/ic_launcher' : `@mipmap/muse_icon_${icon.id}`,
          'android:roundIcon': own ? '@mipmap/ic_launcher_round' : `@mipmap/muse_icon_${icon.id}`,
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
          },
        ],
      });
    }
    return mod;
  });
}

function withIconResources(config) {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const res = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      const write = (folder, name, text) => {
        fs.mkdirSync(path.join(res, folder), { recursive: true });
        fs.writeFileSync(path.join(res, folder, name), text);
      };
      const colors = ICONS.filter((icon) => icon.id !== 'muse')
        .map((icon) => `  <color name="muse_icon_${icon.id}_background">${icon.background}</color>`)
        .join('\n');
      write('values', 'muse_icon_colors.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${colors}\n</resources>\n`);
      write('drawable', 'muse_icon_mono_bars.xml', barsVector('#FFFFFF'));
      for (const icon of ICONS.filter((item) => item.id !== 'muse')) {
        write('drawable', `muse_icon_${icon.id}_bars.xml`, barsVector(icon.bars));
        write('mipmap-anydpi-v26', `muse_icon_${icon.id}.xml`, adaptiveIcon(icon.id));
        // Android 7 has no adaptive icons: a round tile with the bars on it.
        write('mipmap', `muse_icon_${icon.id}.xml`, `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item><shape android:shape="oval"><solid android:color="@color/muse_icon_${icon.id}_background" /></shape></item>
  <item android:drawable="@drawable/muse_icon_${icon.id}_bars" />
</layer-list>
`);
      }
      return mod;
    },
  ]);
}

module.exports = function withAppIcons(config) {
  return withIconResources(withAliases(config));
};
