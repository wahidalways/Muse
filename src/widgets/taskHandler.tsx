import { registerWidgetTaskHandler, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { renderMuseWidget } from './MuseWidgets';
import { getWidgetPlayer, loadWidgetState } from './state';
import { freshForToday } from './today';

/**
 * Android asks for a widget to be drawn (added, resized, its refresh every few hours)
 * or reports a tap. With Muse running, taps reach its player; without it,
 * the buttons were drawn to open Muse, so nothing is lost.
 */
async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') {
    return;
  }
  const player = getWidgetPlayer();
  // Android redraws every few hours, so after midnight today's minutes start again at 0.
  let state = freshForToday(await loadWidgetState());
  if (widgetAction === 'WIDGET_CLICK' && player) {
    if (clickAction === 'PLAY_PAUSE') {
      player.togglePlayback();
      // Answer the tap at once; Muse redraws with the real state a moment later.
      state = { ...state, isPlaying: !state.isPlaying };
    } else if (clickAction === 'NEXT') {
      player.skipNext();
    } else if (clickAction === 'PREVIOUS') {
      player.skipPrevious();
    }
  }
  renderWidget(renderMuseWidget(widgetInfo.widgetName, state, widgetInfo, player !== null));
}

export function registerMuseWidgets() {
  registerWidgetTaskHandler(widgetTaskHandler);
}
