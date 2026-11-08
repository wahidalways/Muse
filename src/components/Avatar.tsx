import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { Profile } from '../settings/profile';
import { useAppStyles } from '../theme/styles';

const INK = '#15120B';

/** Eight drawn avatars on a 64 grid: vinyl, headphones, cassette, the Muse bars, a note, moon, sun, wave. */
export const PRESETS: { name: string; background: string; shape: ReactNode }[] = [
  {
    name: 'Vinyl',
    background: 'hsl(18, 60%, 58%)',
    shape: (
      <>
        <Circle cx={32} cy={32} r={18} fill={INK} />
        <Circle cx={32} cy={32} r={12} fill="none" stroke="#4A4436" strokeWidth={1.5} />
        <Circle cx={32} cy={32} r={5} fill="#F3F1E8" />
      </>
    ),
  },
  {
    name: 'Headphones',
    background: 'hsl(200, 45%, 58%)',
    shape: (
      <>
        <Path d="M18 38v-6a14 14 0 0 1 28 0v6" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
        <Rect x={14} y={35} width={9} height={14} rx={4} fill={INK} />
        <Rect x={41} y={35} width={9} height={14} rx={4} fill={INK} />
      </>
    ),
  },
  {
    name: 'Cassette',
    background: 'hsl(42, 75%, 60%)',
    shape: (
      <>
        <Rect x={14} y={21} width={36} height={23} rx={4} fill={INK} />
        <Circle cx={25} cy={31} r={4} fill="#F3F1E8" />
        <Circle cx={39} cy={31} r={4} fill="#F3F1E8" />
        <Rect x={22} y={38} width={20} height={3} rx={1.5} fill="#4A4436" />
      </>
    ),
  },
  {
    name: 'Levels',
    background: '#0D0F0B',
    shape: (
      <G fill="#C4F078">
        <Rect x={16} y={27} width={6} height={10} rx={3} />
        <Rect x={25} y={22} width={6} height={20} rx={3} />
        <Rect x={34} y={15} width={6} height={34} rx={3} />
        <Rect x={43} y={22} width={6} height={20} rx={3} />
      </G>
    ),
  },
  {
    name: 'Note',
    background: 'hsl(280, 40%, 66%)',
    shape: <Path fill={INK} d="M27 44a5 5 0 1 1-3-4.6V20l18-4v20a5 5 0 1 1-3-4.6V23l-12 2.6z" />,
  },
  {
    name: 'Moon',
    background: 'hsl(230, 35%, 32%)',
    shape: <Path fill="#F3E7B0" d="M37 15a17 17 0 1 0 11 29A15 15 0 0 1 37 15z" />,
  },
  {
    name: 'Sun',
    background: 'hsl(330, 60%, 66%)',
    shape: (
      <>
        <Circle cx={32} cy={32} r={9} fill={INK} />
        <Path d="M32 12v6M32 46v6M12 32h6M46 32h6M18 18l4 4M42 42l4 4M18 46l4-4M42 22l4-4" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      </>
    ),
  },
  {
    name: 'Wave',
    background: 'hsl(150, 40%, 52%)',
    shape: <Path d="M11 34c5 0 5-9 10-9s5 13 10 13 5-17 10-17 5 13 11 13" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />,
  },
];

/** The profile's photo, preset or (with neither) a plain person shape. */
export function Avatar({ profile, size }: { profile: Pick<Profile, 'preset' | 'photoUri'>; size: number }) {
  const styles = useAppStyles();
  if (profile.photoUri) {
    return <Image accessible={false} source={{ uri: profile.photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const preset = PRESETS[profile.preset];
  const muted = String(styles.pulseLabel.color);
  return (
    <View accessible={false} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx={32} cy={32} r={32} fill={preset ? preset.background : String(styles.pulseMeter.backgroundColor)} />
        {preset ? (
          preset.shape
        ) : (
          <>
            <Circle cx={32} cy={25} r={9} fill={muted} />
            <Path d="M15 52a17 17 0 0 1 34 0z" fill={muted} />
          </>
        )}
      </Svg>
    </View>
  );
}
