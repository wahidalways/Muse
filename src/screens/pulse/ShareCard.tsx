import { Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, Keyframe } from 'react-native-reanimated';
import type { MusicTrack } from '../../types';
import { peakIndex, type ListeningStats } from '../../history/stats';
import { AlbumArtwork } from '../../components/AlbumArtwork';
import { Avatar } from '../../components/Avatar';
import type { Profile } from '../../settings/profile';
import { formatHour, formatListeningTime } from '../../utils/format';
import { EASE_OUT } from '../../motion/motion';

export type CardStyle = 'cover' | 'lime' | 'paper';
export type CardFormat = 'story' | 'square';
export type FactId = 'time' | 'song' | 'artist' | 'hour' | 'goal' | 'new' | 'genre';
type Fact = { value: string; sub: string; emoji: string };

export const FACTS: { id: FactId; label: string }[] = [
  { id: 'time', label: 'Listened' },
  { id: 'song', label: 'Top song' },
  { id: 'artist', label: 'Top artist' },
  { id: 'hour', label: 'Peak hour' },
  { id: 'goal', label: 'Goal days' },
  { id: 'new', label: 'New songs' },
  { id: 'genre', label: 'Top genre' },
];
export const DEFAULT_FACTS: FactId[] = ['time', 'song', 'artist', 'hour', 'goal'];

export type CardData = {
  kicker: string;
  /** Under the card: "Sat 31 Oct – Fri 6 Nov". */
  range: string;
  /** Paper's header bar: "Weekly" and a short range. */
  issue: string;
  short: string;
  topTrack: MusicTrack | null;
  /** Minutes per day (or week) for the chart, with day letters when there are seven. */
  chart: { seconds: number; label: string }[];
  facts: Record<FactId, Fact | null>;
};

/** What a stats range turns into on a card. Facts without data are null and can't be picked. */
export function cardFromStats(
  stats: ListeningStats,
  tracksById: Map<string, MusicTrack>,
  options: { kicker: string; range: string; issue: string; short: string; goal: Fact | null },
): CardData {
  const song = stats.topTracks[0];
  const artist = stats.topArtists[0];
  const genre = stats.topGenres[0];
  const peak = peakIndex(stats.hours);
  const plays = (count: number) => `${count} ${count === 1 ? 'play' : 'plays'}`;
  return {
    ...options,
    topTrack: song ? (tracksById.get(song.id) ?? null) : null,
    chart: stats.buckets.slice(-30).map((bucket) => ({
      seconds: bucket.seconds,
      label: stats.buckets.length === 7 ? bucket.label.slice(0, 1) : '',
    })),
    facts: {
      time: { value: formatListeningTime(stats.seconds).replace(/ /g, ''), sub: 'of music', emoji: '🎧' },
      song: song ? { value: song.title, sub: `${song.artist ? `${song.artist} · ` : ''}${plays(song.plays)}`, emoji: '🔁' } : null,
      artist: artist ? { value: artist.name, sub: plays(artist.plays), emoji: '💞' } : null,
      hour: peak >= 0 ? { value: formatHour(peak), sub: 'when I listen most', emoji: '🦉' } : null,
      goal: options.goal,
      new: stats.firstListens > 0 ? { value: String(stats.firstListens), sub: 'first listens', emoji: '🧭' } : null,
      genre: genre ? { value: genre.name, sub: `${Math.round((genre.plays / stats.genrePlays) * 100)}% of plays`, emoji: '🎸' } : null,
    },
  };
}

const PALETTES: Record<CardStyle, { bg: string; ink: string; hi: string; hero: string; bar: string; rule: string }> = {
  lime: { bg: '#0D0F0B', ink: '#F3F1E8', hi: '#C4F078', hero: '#C4F078', bar: '#C4F078', rule: 'rgba(243,241,232,0.16)' },
  cover: { bg: '', ink: '#15120B', hi: '#15120B', hero: '#15120B', bar: '#15120B', rule: 'rgba(21,18,11,0.2)' },
  paper: { bg: '#F1ECE1', ink: '#17150F', hi: '#D9480F', hero: '#17150F', bar: '#17150F', rule: 'rgba(23,21,15,0.22)' },
};

/** Bars rise from the baseline in the preview. */
const GROW = new Keyframe({
  0: { transform: [{ scaleY: 0 }] },
  100: { transform: [{ scaleY: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(900);
const DROP = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -40 }, { rotate: '-20deg' }, { scale: 0.8 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { rotate: '-5deg' }, { scale: 1 }], easing: Easing.bezier(0.2, 1.2, 0.3, 1) },
}).duration(900);

/**
 * A share card, drawn in "card pixels" (1080 wide) scaled to `width`, so the
 * preview and the saved image are the same layout. One typeface, the app's
 * Roboto, for every style. `animate` plays the entrance (preview only).
 */
export function ShareCard({
  data,
  style,
  format,
  facts,
  profile,
  caption,
  coverHue,
  width,
  animate,
}: {
  data: CardData;
  style: CardStyle;
  format: CardFormat;
  /** Picked facts in display order; the first becomes the big number. */
  facts: FactId[];
  /** Null hides the name and photo. */
  profile: Profile | null;
  caption: string;
  /** The top song's cover hue, for the Cover style's color. */
  coverHue: number | null;
  width: number;
  animate: boolean;
}) {
  const u = width / 1080;
  const story = format === 'story';
  const palette = { ...PALETTES[style], bg: style === 'cover' ? `hsl(${coverHue ?? 42}, 72%, 62%)` : PALETTES[style].bg };
  const shown = facts.filter((id) => data.facts[id]);
  const [heroId, ...rest] = shown.length > 0 ? shown : (['time'] as FactId[]);
  const hero = data.facts[heroId] as Fact;
  const heroSize = Math.min(story ? 250 : 135, Math.floor((story ? 1750 : 1000) / Math.max(4, hero.value.length))) * u;
  const label: TextStyle = { fontSize: (story ? 32 : 26) * u, fontWeight: '700', letterSpacing: (story ? 32 : 26) * u * 0.16, textTransform: 'uppercase', color: palette.hi };
  const hasCaption = caption.trim().length > 0;
  const enter = (order: number) => (animate ? FadeInDown.duration(700).delay(140 + order * 80).easing(EASE_OUT) : undefined);
  const name = profile?.name.trim();

  const chart = (height: number, squareCorners = false) => {
    const max = Math.max(1, ...data.chart.map((day) => day.seconds));
    const dense = data.chart.length > 7;
    return (
      <View style={{ flexDirection: 'row', height, gap: (dense ? 8 : style === 'paper' ? 18 : 36) * u * (story ? 1 : 0.45) }}>
        {data.chart.map((day, index) => (
          <View key={index} style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 16 * u }}>
            <Animated.View
              entering={animate ? GROW.delay(200 + index * 55) : undefined}
              style={{
                width: '100%',
                height: `${Math.max(5, (day.seconds / max) * 84)}%`,
                opacity: day.seconds > 0 ? 1 : 0.3,
                borderRadius: squareCorners ? 0 : 999,
                backgroundColor: palette.bar,
                transformOrigin: 'bottom',
              }}
            />
            {day.label && style !== 'paper' ? <Text style={[label, { letterSpacing: 0, opacity: 0.8, fontSize: (story ? 30 : 22) * u }]}>{day.label}</Text> : null}
          </View>
        ))}
      </View>
    );
  };

  const sticker = (size: number) =>
    data.topTrack ? (
      <Animated.View
        entering={animate ? DROP.delay(120) : undefined}
        style={{ transform: [{ rotate: '-5deg' }], shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 40 * u, shadowOffset: { width: 0, height: 40 * u }, elevation: 12 }}
      >
        <AlbumArtwork track={data.topTrack} size={size} radius={36 * u} />
      </Animated.View>
    ) : null;

  return (
    <View
      collapsable={false}
      style={{
        width,
        height: width * (story ? 16 / 9 : 1),
        backgroundColor: palette.bg,
        paddingTop: (story ? 96 : 76) * u,
        paddingHorizontal: (story ? 88 : 80) * u,
        paddingBottom: (story ? 84 : 68) * u,
        overflow: 'hidden',
      }}
    >
      <Animated.View entering={animate ? FadeIn.duration(600) : undefined} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 * u }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u, height: 58 * u }}>
            {[21, 36, 57, 36].map((height, index) => (
              <View key={index} style={{ width: 9 * u, height: height * u, borderRadius: 9 * u, backgroundColor: palette.hi }} />
            ))}
          </View>
          <Text style={{ fontSize: 58 * u, fontWeight: '700', letterSpacing: -2.3 * u, color: palette.ink }}>muse</Text>
        </View>
        {profile && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 * u }}>
            <Avatar profile={profile} size={(story ? 92 : 76) * u} />
            {name ? <Text style={{ fontSize: 36 * u, fontWeight: '700', color: palette.ink }}>{name}</Text> : null}
          </View>
        )}
      </Animated.View>

      {story && style === 'lime' && <View style={{ marginTop: (hasCaption ? 64 : 84) * u }}>{chart((hasCaption ? 300 : 400) * u)}</View>}
      {story && style === 'cover' && <View style={{ marginTop: (hasCaption ? 60 : 76) * u, alignSelf: 'flex-start' }}>{sticker((hasCaption ? 340 : 420) * u)}</View>}
      {style === 'paper' && (
        <View
          style={{
            marginTop: (story ? 64 : 30) * u,
            paddingVertical: (story ? 22 : 16) * u,
            borderTopWidth: 6 * u,
            borderBottomWidth: 3 * u,
            borderColor: palette.ink,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Text style={[label, { color: palette.ink }]}>{data.issue}</Text>
          <Text style={[label, { color: palette.ink }]}>{data.short}</Text>
        </View>
      )}
      {!story && style === 'lime' && <View style={{ position: 'absolute', right: 80 * u, top: 176 * u, width: 330 * u }}>{chart(250 * u)}</View>}
      {!story && style === 'cover' && <View style={{ position: 'absolute', right: 80 * u, top: 170 * u }}>{sticker(240 * u)}</View>}

      <Animated.View entering={enter(0)}>
        <Text style={[label, { marginTop: (story ? 72 : style === 'paper' ? 26 : 40) * u }]}>{data.kicker}</Text>
      </Animated.View>
      <Animated.View entering={enter(1)}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: heroSize,
            lineHeight: heroSize * 1.05,
            marginTop: 20 * u,
            color: palette.hero,
            fontWeight: style === 'paper' ? '200' : '900',
            fontStyle: style === 'paper' ? 'italic' : 'normal',
            letterSpacing: heroSize * (style === 'paper' ? -0.04 : -0.05),
          }}
        >
          {hero.value}
        </Text>
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <Text style={{ fontSize: (story ? 48 : 40) * u, fontWeight: '500', color: palette.ink, marginTop: 18 * u }}>
          {heroId === 'time' ? hero.sub : FACTS.find((fact) => fact.id === heroId)?.label.toLowerCase()} {hero.emoji}
        </Text>
      </Animated.View>
      {story && style === 'paper' && <View style={{ marginTop: 46 * u, borderBottomWidth: 4 * u, borderColor: palette.ink }}>{chart(170 * u, true)}</View>}
      {hasCaption && (
        <Animated.View entering={enter(3)}>
          <Text
            numberOfLines={story ? 2 : 1}
            style={{
              fontSize: (story ? 44 : 34) * u,
              lineHeight: (story ? 44 : 34) * u * 1.3,
              fontStyle: 'italic',
              color: palette.ink,
              marginTop: (story ? 32 : 16) * u,
              maxWidth: (story ? 900 : 620) * u,
            }}
          >
            “{caption.trim()}”
          </Text>
        </Animated.View>
      )}

      <View style={{ flex: 1 }} />
      <View style={story ? undefined : { flexDirection: 'row', flexWrap: 'wrap', columnGap: 56 * u }}>
        {rest.slice(0, story ? 5 : 4).map((id, index) => {
          const fact = data.facts[id] as Fact;
          const factLabel = FACTS.find((item) => item.id === id)?.label ?? '';
          return (
            <Animated.View
              key={id}
              entering={enter(4 + index)}
              style={
                story
                  ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 40 * u, paddingVertical: 26 * u, borderTopWidth: 3 * u, borderColor: palette.rule }
                  : { width: (1080 - 160 - 56) / 2 * u, gap: 10 * u, paddingTop: 22 * u, borderTopWidth: 3 * u, borderColor: palette.rule }
              }
            >
              <Text style={label}>
                {style === 'paper' ? <Text style={{ color: palette.ink }}>{`0${index + 1}  `}</Text> : null}
                {factLabel}
              </Text>
              <View style={story ? { flexShrink: 1, alignItems: 'flex-end' } : undefined}>
                <Text numberOfLines={1} style={{ fontSize: (story ? 54 : 46) * u, fontWeight: '700', letterSpacing: -1 * u, color: palette.ink }}>
                  {fact.value} {fact.emoji}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: (story ? 30 : 26) * u, color: palette.ink, opacity: 0.7, marginTop: 6 * u }}>
                  {fact.sub}
                </Text>
              </View>
            </Animated.View>
          );
        })}
      </View>
      <Animated.View
        entering={animate ? FadeIn.duration(600).delay(900) : undefined}
        style={{ marginTop: (story ? 44 : 30) * u, flexDirection: 'row', justifyContent: 'space-between', opacity: 0.7 }}
      >
        <Text style={{ fontSize: (story ? 26 : 22) * u, fontWeight: '500', letterSpacing: 1 * u, color: palette.ink }}>{data.range}</Text>
        <Text style={{ fontSize: (story ? 26 : 22) * u, fontWeight: '500', letterSpacing: 1 * u, color: palette.ink }}>
          © {new Date().getFullYear()} Muse
        </Text>
      </Animated.View>
    </View>
  );
}
