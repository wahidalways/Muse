import { useEffect, useState, type RefObject } from 'react';
import { Keyboard } from 'react-native';

type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

/**
 * How far to raise `target` so its content sits right on the keyboard.
 *
 * It measures the real overlap instead of trusting the keyboard height:
 * some phones shrink the window for the keyboard and some do not, and
 * adding the height on top of a shrink lifts the view twice.
 */
export function useKeyboardLift(
  target: RefObject<Measurable | null>,
  enabled: boolean,
  /** Padding under the content (the navigation bar), allowed under the keyboard. */
  bottomInset: number,
): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const keyboardTop = event.endCoordinates.screenY;
      target.current?.measureInWindow((_x, y, _width, height) => {
        // The measured bottom already includes the current lift.
        setLift((current) => Math.max(0, current + y + height - bottomInset - keyboardTop));
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
      setLift(0);
    };
  }, [bottomInset, enabled, target]);
  return lift;
}
