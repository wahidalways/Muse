import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Reading speed, in points per second. */
const SCROLL_SPEED = 32;
/** Rest before each pass, so the start of the title can be read. */
const PAUSE_MS = 2000;
/** Space between the end of the title and its next copy. */
const GAP = 48;

/**
 * One line of text that scrolls when it is too long to fit, so the whole
 * title can be read. Short text stays still. It loops seamlessly with a
 * second copy, resting at the start between passes, and runs on the UI
 * thread. With reduced motion on, long text wraps onto two lines instead.
 */
export function MarqueeText({
  text,
  style,
  paused = false,
}: {
  text: string;
  style: StyleProp<TextStyle>;
  /** Stops scrolling, for example while the view is hidden, so no frames are drawn. */
  paused?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const offset = useSharedValue(0);
  const overflows =
    !paused && !reduceMotion && containerWidth > 0 && textWidth > containerWidth + 1;
  const distance = textWidth + GAP;

  useEffect(() => {
    cancelAnimation(offset);
    offset.set(0);
    if (!overflows) {
      return;
    }
    offset.set(
      withRepeat(
        withSequence(
          withDelay(
            PAUSE_MS,
            withTiming(-distance, {
              duration: (distance / SCROLL_SPEED) * 1000,
              easing: Easing.linear,
              // Reduced motion is handled above, by not scrolling at all.
              reduceMotion: ReduceMotion.Never,
            }),
          ),
          // The copy is now exactly where the title started: jump back
          // invisibly and go again.
          withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(offset);
  }, [distance, offset, overflows, text]);

  const scrollStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  if (reduceMotion) {
    return (
      <Text numberOfLines={2} style={style}>
        {text}
      </Text>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={text}
      onLayout={(event: LayoutChangeEvent) =>
        setContainerWidth(event.nativeEvent.layout.width)
      }
    >
      {/*
        A horizontal ScrollView does not limit its content's width, so the
        text lays out at its full length and can be measured. It never
        scrolls itself; the row inside is moved with a transform.
      */}
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[marqueeStyles.row, scrollStyle]}>
          <Text
            numberOfLines={1}
            style={style}
            onLayout={(event: LayoutChangeEvent) =>
              setTextWidth(event.nativeEvent.layout.width)
            }
          >
            {text}
          </Text>
          {overflows && (
            <Text numberOfLines={1} style={[style, marqueeStyles.copy]}>
              {text}
            </Text>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const marqueeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  copy: {
    marginLeft: GAP,
  },
});
