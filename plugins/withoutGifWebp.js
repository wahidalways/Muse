/**
 * Leaves React Native's GIF and WebP image add-ons out of the APK (about
 * 0.8 MB of native code). Muse shows no animated images, Android 7+ decodes
 * still WebP by itself, and a GIF picked as a picture shows its first frame.
 * https://docs.expo.dev/distribution/app-size/
 */
const { withGradleProperties } = require('expo/config-plugins');

const OFF = ['expo.gif.enabled', 'expo.webp.enabled'];

module.exports = function withoutGifWebp(config) {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter((item) => !(item.type === 'property' && OFF.includes(item.key)));
    mod.modResults.push(...OFF.map((key) => ({ type: 'property', key, value: 'false' })));
    return mod;
  });
};
