import { registerRootComponent } from 'expo';
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
