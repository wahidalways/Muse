import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { MusicTrack } from '../types';
import { AlbumArtwork } from '../components/AlbumArtwork';

/** The label (the song's cover) covers this much of the record's width. */
export const VINYL_LABEL = 0.42;
/** Groove rings, as a share of the record's radius. */
const GROOVES = [0.96, 0.88, 0.8, 0.72, 0.64, 0.56];
// A record is black in both themes, so these are set here, not in the theme.
const RECORD = '#121212';
const GROOVE = 'rgba(255, 255, 255, 0.06)';
const LABEL_RIM = '#0B0B0B';

/**
 * The Vinyl skin's record, with the cover as its label. Grooves and the
 * light on them are drawn once and stay still; only the label turns
 * (`spin`, in degrees), since turning round grooves looks the same.
 */
export const VinylDisc = memo(function VinylDisc({
  track,
  size,
  spin,
}: {
  track: MusicTrack;
  size: number;
  spin?: SharedValue<number>;
}) {
  const label = Math.round(size * VINYL_LABEL);
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin ? spin.get() : 0}deg` }],
  }));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: RECORD,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {GROOVES.map((share) => (
        <View
          key={share}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size * share,
            height: size * share,
            borderRadius: (size * share) / 2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: GROOVE,
          }}
        />
      ))}
      {/* Light falling across the record from the top left; it does not turn. */}
      <Svg pointerEvents="none" width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="vinylSheen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0.18" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.32" stopColor="#FFFFFF" stopOpacity={0.07} />
            <Stop offset="0.46" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.74" stopColor="#FFFFFF" stopOpacity={0.05} />
            <Stop offset="0.88" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#vinylSheen)" />
      </Svg>
      <Animated.View
        style={[
          {
            width: label,
            height: label,
            borderRadius: label / 2,
            overflow: 'hidden',
            borderWidth: Math.max(2, size * 0.012),
            borderColor: LABEL_RIM,
          },
          labelStyle,
        ]}
      >
        <AlbumArtwork track={track} size={label} radius={label / 2} />
      </Animated.View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: Math.max(6, size * 0.03),
          height: Math.max(6, size * 0.03),
          borderRadius: size,
          backgroundColor: LABEL_RIM,
        }}
      />
    </View>
  );
});
