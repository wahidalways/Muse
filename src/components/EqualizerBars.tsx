import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppStyles } from '../theme/styles';

/** Each bar bounces at its own pace so the three never move in step. */
const BAR_SPEEDS = [420, 560, 360];
const REST = 0.3;

/** Three small bars that bounce while music plays and rest when paused. */
export function EqualizerBars({ playing, size = 12 }: { playing: boolean; size?: number }) {
  return (
    <View style={[barStyles.row, { height: size }]} accessible={false}>
      {BAR_SPEEDS.map((speed, index) => (
        <Bar key={index} playing={playing} speed={speed} height={size} />
      ))}
    </View>
  );
}

function Bar({ playing, speed, height }: { playing: boolean; speed: number; height: number }) {
  const styles = useAppStyles();
  const level = useSharedValue(REST);

  useEffect(() => {
    const ease = Easing.inOut(Easing.quad);
    level.set(
      playing
        ? withRepeat(
            withSequence(
              withTiming(1, { duration: speed, easing: ease }),
              withTiming(0.25, { duration: speed, easing: ease }),
            ),
            -1,
            true,
            undefined,
            ReduceMotion.System,
          )
        : withTiming(REST, { duration: 200 }),
    );
  }, [level, playing, speed]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: level.get() }] }));

  return <Animated.View style={[styles.chartFill, barStyles.bar, { height }, style]} />;
}

const barStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    transformOrigin: 'bottom',
  },
});
