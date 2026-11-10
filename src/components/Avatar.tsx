import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { Profile } from '../settings/profile';
import { useAppStyles } from '../theme/styles';

const INK = '#15120B';
const CREAM = '#F7F1E3';
const BLUSH = '#F29C8F';
const GOLD = '#F2C14E';
const MINT = '#7CE0C3';
const STEEL = '#E4E7EB';
const GREY = '#9AA0A8';

/** The lower part of the circle in a deeper tone: the ground every character stands on. */
const GROUND = 'M1.6 42A32 32 0 0 0 62.4 42Z';

/** A small eighth note with its stem's left edge at x. */
const note = (x: number, y: number, color = INK) => (
  <G>
    <Rect x={x} y={y} width={1.6} height={7} rx={0.8} fill={color} />
    <Circle cx={x - 0.4} cy={y + 7.2} r={2} fill={color} />
    <Path d={`M${x + 1.4} ${y + 0.3}c2 .8 3 2 2.6 4`} stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
  </G>
);
const cheeks = (y: number, left: number, right: number, r = 2) => (
  <G fill={BLUSH} opacity={0.85}>
    <Circle cx={left} cy={y} r={r} />
    <Circle cx={right} cy={y} r={r} />
  </G>
);

/**
 * Twelve music characters on a 64 grid, each on its own two-tone circle so
 * it reads the same in light and dark. The first eight keep the slots of the
 * old object avatars (vinyl, headphones, cassette, levels, note, moon, sun,
 * wave), so a saved pick becomes the closest character.
 */
export const PRESETS: { name: string; background: string; ground: string; shape: ReactNode }[] = [
  {
    name: 'Vinyl Vic',
    background: '#F0A27A',
    ground: '#E38B63',
    shape: (
      <>
        <Circle cx={32} cy={34} r={19} fill={INK} />
        <Circle cx={32} cy={34} r={14} fill="none" stroke="#3A342A" strokeWidth={1.2} />
        <Circle cx={26} cy={29} r={2.8} fill={CREAM} />
        <Circle cx={38} cy={29} r={2.8} fill={CREAM} />
        <Circle cx={26.5} cy={29.6} r={1.3} fill={INK} />
        <Circle cx={38.5} cy={29.6} r={1.3} fill={INK} />
        {/* The label is a singing mouth. */}
        <Circle cx={32} cy={39.5} r={4.6} fill={GOLD} />
        <Circle cx={32} cy={39.5} r={1.1} fill={INK} />
        {cheeks(35, 21.5, 42.5, 2.2)}
        {note(48, 10)}
      </>
    ),
  },
  {
    name: 'Headphone Cat',
    background: '#8EC5E8',
    ground: '#72B1DA',
    shape: (
      <>
        {/* Tall ears, so they rise clear of the headphone band. */}
        <Path d="M18.5 30 20.5 10.5 31 21Z" fill={CREAM} />
        <Path d="M45.5 30 43.5 10.5 33 21Z" fill={CREAM} />
        <Path d="M21.3 14.8 22.2 20.5 26.6 19.6Z" fill={BLUSH} />
        <Path d="M42.7 14.8 41.8 20.5 37.4 19.6Z" fill={BLUSH} />
        <Circle cx={32} cy={36} r={15} fill={CREAM} />
        <Path d="M15 36a17 17 0 0 1 34 0" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Rect x={11} y={31} width={8} height={13} rx={4} fill={INK} />
        <Rect x={45} y={31} width={8} height={13} rx={4} fill={INK} />
        <Rect x={13} y={34} width={4} height={7} rx={2} fill={GOLD} />
        <Rect x={47} y={34} width={4} height={7} rx={2} fill={GOLD} />
        {/* Eyes closed, lost in the song. */}
        <Path d="M24.5 35.5q2.5-3 5 0M34.5 35.5q2.5-3 5 0" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M30.5 39h3l-1.5 1.8Z" fill={BLUSH} />
        <Path d="M29 42.2q1.5 1.5 3 0 1.5 1.5 3 0" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        {cheeks(40, 23.5, 40.5)}
      </>
    ),
  },
  {
    name: 'Sleepy Tape',
    background: '#F4C95D',
    ground: '#E7B23F',
    shape: (
      <>
        <Rect x={12} y={20} width={40} height={28} rx={5} fill={INK} />
        <Rect x={16} y={24} width={32} height={15} rx={3} fill={CREAM} />
        {/* The reels are half-closed eyes. */}
        <Circle cx={25} cy={31.5} r={4.5} fill={INK} />
        <Circle cx={39} cy={31.5} r={4.5} fill={INK} />
        <Circle cx={25} cy={33} r={1.4} fill={CREAM} />
        <Circle cx={39} cy={33} r={1.4} fill={CREAM} />
        <Rect x={20} y={26.6} width={10} height={4.9} fill={CREAM} />
        <Rect x={34} y={26.6} width={10} height={4.9} fill={CREAM} />
        <Path d="M20.5 31.5h9M34.5 31.5h9" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <Rect x={25} y={42} width={14} height={3} rx={1.5} fill="#4A4436" />
        <Path d="M44 9h5l-5 5h5M51.5 16.5h3.4l-3.4 3.4h3.4" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    name: 'DJ Bot',
    background: '#B9A6E8',
    ground: '#A28CDB',
    shape: (
      <>
        <Path d="M32 12.5v6" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
        <Circle cx={32} cy={11.5} r={2.6} fill={GOLD} />
        <Rect x={17} y={18.5} width={30} height={24} rx={7} fill={STEEL} />
        <Path d="M15 27a17 13 0 0 1 34 0" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Rect x={12} y={25} width={6} height={12} rx={3} fill={INK} />
        <Rect x={46} y={25} width={6} height={12} rx={3} fill={INK} />
        <Rect x={21} y={25} width={22} height={9} rx={4.5} fill={INK} />
        <Rect x={25} y={28} width={4.5} height={3} rx={1.5} fill={MINT} />
        <Rect x={34.5} y={28} width={4.5} height={3} rx={1.5} fill={MINT} />
        <Path d="M27 38.5q5 2.6 10 0" stroke={GREY} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Rect x={28} y={42} width={8} height={4} fill={GREY} />
        <Rect x={19} y={45.5} width={26} height={14} rx={5} fill={STEEL} />
        {/* Its chest is the Muse level meter. */}
        <G fill={MINT}>
          <Rect x={24} y={51} width={3} height={5} rx={1.5} />
          <Rect x={29} y={48.5} width={3} height={7.5} rx={1.5} />
          <Rect x={34} y={50} width={3} height={6} rx={1.5} />
          <Rect x={39} y={52} width={3} height={4} rx={1.5} />
        </G>
      </>
    ),
  },
  {
    name: 'Little Quaver',
    background: '#F2A6C2',
    ground: '#E58BAD',
    shape: (
      <>
        <Rect x={37} y={14} width={4} height={26} rx={2} fill={INK} />
        <Path d="M41 14c6 2 9 6 7 12-1-3-3-5-7-6Z" fill={INK} />
        <Ellipse cx={30} cy={42} rx={10.5} ry={8} fill={INK} transform="rotate(-20 30 42)" />
        <Circle cx={26.3} cy={41.4} r={1.7} fill={CREAM} />
        <Circle cx={32.6} cy={39.2} r={1.7} fill={CREAM} />
        <Path d="M27 45.6q3.4 2.4 6.4-1.4" stroke={CREAM} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <Circle cx={24.2} cy={45.2} r={1.6} fill={BLUSH} opacity={0.9} />
        {note(16, 14)}
      </>
    ),
  },
  {
    name: 'Moon Buds',
    background: '#3E4A7A',
    ground: '#33406B',
    shape: (
      <>
        <Path d="M38 13a19 19 0 1 0 13 33 16 16 0 0 1-13-33Z" fill="#F6E7A8" />
        <Path d="M21.5 29.5q3 2.6 6 0M23 37q3 2.6 6 0" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <Circle cx={21} cy={34} r={1.8} fill={BLUSH} opacity={0.85} />
        <Circle cx={16.4} cy={31} r={3} fill={CREAM} />
        <Circle cx={16.4} cy={31} r={1.2} fill={MINT} />
        <G fill={CREAM}>
          <Circle cx={46} cy={17} r={1.3} />
          <Circle cx={51} cy={25} r={0.9} />
          <Circle cx={42} cy={23} r={0.8} />
        </G>
      </>
    ),
  },
  {
    name: 'Cool Sun',
    background: '#7FD1B9',
    ground: '#62BFA4',
    shape: (
      <>
        <Path
          d="M32 10v5M32 47v5M11 31h5M48 31h5M17.2 16.2l3.5 3.5M43.3 42.3l3.5 3.5M17.2 45.8l3.5-3.5M43.3 19.7l3.5-3.5"
          stroke={GOLD}
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        <Circle cx={32} cy={31} r={13} fill="#F6C453" />
        <Rect x={20.5} y={25.5} width={10} height={6.5} rx={3.2} fill={INK} />
        <Rect x={33.5} y={25.5} width={10} height={6.5} rx={3.2} fill={INK} />
        <Path d="M30.5 27.8h3" stroke={INK} strokeWidth={1.6} />
        <Path d="M22.6 27.4h2.4M35.6 27.4h2.4" stroke="#5C5547" strokeWidth={1.2} strokeLinecap="round" />
        <Path d="M27 36q5 4 10 0" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    name: 'Singing Ghost',
    background: '#9FD39A',
    ground: '#85C27F',
    shape: (
      <>
        <Path d="M19 50V31a13 13 0 0 1 26 0v19l-4.3-3-4.4 3-4.3-3-4.3 3-4.4-3Z" fill={CREAM} />
        <Ellipse cx={27.5} cy={31} rx={2} ry={2.6} fill={INK} />
        <Ellipse cx={36.5} cy={31} rx={2} ry={2.6} fill={INK} />
        <Ellipse cx={32} cy={38.5} rx={2.6} ry={3.2} fill={INK} />
        {cheeks(36, 24, 40, 1.8)}
        {note(47, 13)}
        {note(51.5, 24, '#2E5A2A')}
      </>
    ),
  },
  {
    name: 'Boombox Bo',
    background: '#F08A7E',
    ground: '#E07063',
    shape: (
      <>
        <Path d="M22 22v-4h20v4" stroke={INK} strokeWidth={3} fill="none" strokeLinejoin="round" />
        <Rect x={11} y={22} width={42} height={24} rx={5} fill={INK} />
        <Circle cx={22} cy={35} r={7} fill="#3A342A" />
        <Circle cx={42} cy={35} r={7} fill="#3A342A" />
        <Circle cx={22} cy={35} r={4} fill={CREAM} />
        <Circle cx={42} cy={35} r={4} fill={CREAM} />
        <Circle cx={22.8} cy={34.2} r={2} fill={INK} />
        <Circle cx={42.8} cy={34.2} r={2} fill={INK} />
        <Rect x={28} y={25.5} width={8} height={4} rx={1} fill={MINT} />
        <Path d="M29 40q3 2.4 6 0" stroke={CREAM} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    name: 'Mic Mo',
    background: '#FFB86B',
    ground: '#F29F45',
    shape: (
      <>
        <Rect x={27} y={33} width={10} height={20} rx={5} fill={INK} />
        <Rect x={24.5} y={31.5} width={15} height={4} rx={2} fill="#3A342A" />
        <Circle cx={32} cy={23} r={10.5} fill={STEEL} />
        <Path d="M26.5 16.5h11M24.5 19.5h15" stroke="#B4B9C1" strokeWidth={1.2} strokeLinecap="round" />
        <Circle cx={28} cy={24} r={1.8} fill={INK} />
        <Circle cx={36} cy={24} r={1.8} fill={INK} />
        <Path d="M28.5 28q3.5 2.6 7 0" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        {cheeks(27.2, 25.2, 38.8, 1.4)}
        <Path d="M46 18q3 5 0 10M50 15q5 8 0 16" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    name: 'Drum Dee',
    background: '#E7C6A0',
    ground: '#D9AF82',
    shape: (
      <>
        <Path d="M19 11 33 25M45 11 31 25" stroke="#8A5A33" strokeWidth={3} strokeLinecap="round" />
        <Circle cx={19} cy={11} r={2.4} fill="#8A5A33" />
        <Circle cx={45} cy={11} r={2.4} fill="#8A5A33" />
        <Rect x={16} y={29} width={32} height={21} rx={3} fill="#E5484D" />
        <Rect x={16} y={45.5} width={32} height={4.5} rx={2} fill="#B8323A" />
        <Ellipse cx={32} cy={29} rx={16} ry={5} fill={CREAM} />
        <Circle cx={26.5} cy={37.5} r={2} fill={INK} />
        <Circle cx={37.5} cy={37.5} r={2} fill={INK} />
        <Path d="M28 41.5q4 3 8 0" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <G fill="#F7B3A8">
          <Circle cx={22.8} cy={41} r={1.8} />
          <Circle cx={41.2} cy={41} r={1.8} />
        </G>
      </>
    ),
  },
  {
    name: 'Tweet',
    background: '#B8E07A',
    ground: '#A0CF5C',
    shape: (
      <>
        <Path d="M27 50v3.5M33 50v3.5" stroke="#F08A3E" strokeWidth={2} strokeLinecap="round" />
        <Path d="M28 22.5q2-5 5-2" stroke="#E0A82E" strokeWidth={2} fill="none" strokeLinecap="round" />
        <Circle cx={30} cy={36} r={14} fill={GOLD} />
        <Ellipse cx={30} cy={40.5} rx={8} ry={7} fill={CREAM} />
        <Path d="M18 37q-4 5 2 9 4-2 4-7Z" fill="#E0A82E" />
        <Circle cx={34} cy={31} r={2.3} fill={INK} />
        <Circle cx={34.8} cy={30.3} r={0.7} fill={CREAM} />
        {/* Mid-song: the beak is open. */}
        <Path d="M42 31.5l7-2.2-6 4 6 2.2-7-.2Z" fill="#F08A3E" />
        <Circle cx={30} cy={35} r={1.6} fill={BLUSH} opacity={0.85} />
        {note(49, 13)}
      </>
    ),
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
          <>
            <Path d={GROUND} fill={preset.ground} />
            {preset.shape}
          </>
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
