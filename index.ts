import { isRunningInExpoGo, registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { preventAutoHideAsync, setOptions } from 'expo-splash-screen';

import App from './App';

// Android's splash (page colour + Muse bars) stays up until MuseApp knows what
// comes next, so it flows into Home, Welcome or our launch screen as one.
preventAutoHideAsync().catch(() => undefined);
setOptions({ fade: true, duration: 200 });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Home-screen widgets draw and take taps here, even while Muse is closed.
// The widget library needs Muse's own build, so Expo Go never loads it.
if (Platform.OS === 'android' && !isRunningInExpoGo()) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./src/widgets/taskHandler').registerMuseWidgets();
}
