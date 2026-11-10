import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { getArtworkColor } from '../../../modules/muse-audio-metadata';
import { Avatar } from '../../components/Avatar';
import { hasProfile, useProfile } from '../../settings/profile';
import { hapticSelection } from '../../utils/haptics';
import { DEFAULT_FACTS, FACTS, ShareCard, type CardData, type CardFormat, type CardStyle, type FactId } from './ShareCard';
import { ProfileSheet } from './ProfileSheet';

const STYLES: { id: CardStyle; label: string }[] = [
  { id: 'cover', label: 'Cover' },
  { id: 'lime', label: 'Lime' },
  { id: 'paper', label: 'Paper' },
];
const GAP = 16;
const CAPTION_LIMIT = 80;
/** The saved image is exactly this many pixels wide. */
const EXPORT_PX = 1080;

/** Pick a style, size and facts, then save or share the card as an image. */
export function ShareSheet({ visible, title, data, onClose }: { visible: boolean; title: string; data: CardData; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {visible && <Composer title={title} data={data} onClose={onClose} />}
    </Modal>
  );
}

function Composer({ title, data, onClose }: { title: string; data: CardData; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const profile = useProfile();
  const [styleIndex, setStyleIndex] = useState(1);
  const [format, setFormat] = useState<CardFormat>('story');
  const [facts, setFacts] = useState<FactId[]>(DEFAULT_FACTS.filter((id) => data.facts[id]));
  const [showMe, setShowMe] = useState(true);
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // The preview replays its entrance on open, on swipe and on size; edits update in place.
  const [replay, setReplay] = useState(0);
  const [coverHue, setCoverHue] = useState<number | null>(null);
  const carousel = useRef<ComponentRef<typeof ScrollView>>(null);
  const exportRef = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    if (!data.topTrack) {
      return;
    }
    let active = true;
    void getArtworkColor(data.topTrack.id).then((color) => {
      if (active && color && color.colorfulness >= 0.12) {
        setCoverHue(color.hue);
      }
    });
    return () => {
      active = false;
    };
  }, [data.topTrack]);

  const story = format === 'story';
  const slotWidth = story ? 340 * (9 / 16) : Math.min(290, width - 80);
  const step = slotWidth + GAP;
  const style = STYLES[styleIndex].id;
  const me = showMe && hasProfile(profile) ? profile : null;
  const card = (cardWidth: number, cardStyle: CardStyle, animate: boolean) => (
    <ShareCard
      data={data}
      style={cardStyle}
      format={format}
      facts={facts}
      profile={me}
      caption={caption}
      coverHue={coverHue}
      width={cardWidth}
      animate={animate}
    />
  );

  const pickStyle = (index: number) => {
    if (index !== styleIndex) {
      hapticSelection();
      setStyleIndex(index);
      setReplay((count) => count + 1);
    }
  };
  const toggleFact = (id: FactId) => {
    if (facts.includes(id) && facts.length === 1) {
      setStatus('Keep at least one fact 🙂');
      return;
    }
    hapticSelection();
    setFacts(facts.includes(id) ? facts.filter((item) => item !== id) : FACTS.map((fact) => fact.id).filter((item) => item === id || facts.includes(item)));
  };

  const capture = () =>
    captureRef(exportRef, { format: 'png', quality: 1, result: 'tmpfile', width: EXPORT_PX, height: story ? EXPORT_PX * (16 / 9) : EXPORT_PX });

  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      const permission = await requestPermissionsAsync(true);
      if (!permission.granted) {
        setStatus('Muse needs permission to save to your photos.');
        return;
      }
      const image = await capture();
      try {
        await Asset.create(image);
      } finally {
        // The gallery keeps its own copy; the 1080 px temp file (a few MB) can go.
        releaseCapture(image);
      }
      setStatus('Saved to your photos ✅');
    } catch {
      setStatus('Could not save the image. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const shareImage = async () => {
    setBusy(true);
    setStatus('');
    try {
      if (!(await isAvailableAsync())) {
        setStatus('Sharing is not available on this phone.');
        return;
      }
      await shareAsync(await capture(), { mimeType: 'image/png', dialogTitle: title });
    } catch {
      setStatus('Could not share the image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[share.screen, { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* Drawn at exactly 1080 px wide, out of sight, for the saved image. */}
      <View style={share.offscreen} pointerEvents="none">
        <View ref={exportRef} collapsable={false}>
          {card(EXPORT_PX / PixelRatio.get(), style, false)}
        </View>
      </View>

      <View style={share.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={share.iconButton}>
          <Ionicons accessible={false} name="close" size={22} color={INK} />
        </Pressable>
        <View style={share.headerCopy}>
          <Text style={share.title}>{title}</Text>
          <Text style={share.muted}>{data.range}</Text>
        </View>
        <View style={share.segment} accessibilityRole="radiogroup" accessibilityLabel="Image size">
          {(['story', 'square'] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={option === 'story' ? 'Story, 9 by 16' : 'Square, 1 by 1'}
              accessibilityState={{ checked: format === option }}
              onPress={() => {
                if (format !== option) {
                  hapticSelection();
                  setFormat(option);
                  setReplay((count) => count + 1);
                }
              }}
              style={[share.segmentItem, format === option && share.segmentOn]}
            >
              <Ionicons accessible={false} name={option === 'story' ? 'phone-portrait-outline' : 'square-outline'} size={18} color={format === option ? INK : MUTED} />
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        ref={carousel}
        key={format}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentOffset={{ x: styleIndex * step, y: 0 }}
        contentContainerStyle={{ gap: GAP, paddingHorizontal: (width - slotWidth) / 2, paddingVertical: 18 }}
        style={share.carousel}
        onMomentumScrollEnd={(event) => pickStyle(Math.max(0, Math.min(2, Math.round(event.nativeEvent.contentOffset.x / step))))}
      >
        {STYLES.map((item, index) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} style`}
            onPress={() => carousel.current?.scrollTo({ x: index * step, animated: true })}
            style={[share.slot, index !== styleIndex && share.slotOff]}
          >
            <View key={index === styleIndex ? replay : 'still'}>{card(slotWidth, item.id, index === styleIndex)}</View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={share.swatches} accessibilityRole="radiogroup" accessibilityLabel="Card style">
        {STYLES.map((item, index) => {
          const on = index === styleIndex;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityLabel={item.label}
              accessibilityState={{ checked: on }}
              onPress={() => carousel.current?.scrollTo({ x: index * step, animated: true })}
              style={share.swatchButton}
            >
              <View style={[share.swatch, SWATCH[item.id], on && share.swatchOn]}>
                {item.id === 'cover' && <View style={share.swatchSticker} />}
                {item.id === 'lime' && [8, 14, 20, 14].map((height, bar) => <View key={bar} style={[share.swatchBar, { height }]} />)}
                {item.id === 'paper' && <Text style={share.swatchPaper}>Aa</Text>}
              </View>
              <Text style={[share.swatchLabel, on && { color: INK }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={share.body} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <View style={share.panel}>
          <Text style={share.panelLabel}>On the card</Text>
          <View style={share.chips}>
            {FACTS.filter((fact) => data.facts[fact.id]).map((fact) => {
              const on = facts.includes(fact.id);
              return (
                <Pressable
                  key={fact.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggleFact(fact.id)}
                  style={[share.chip, on && share.chipOn]}
                >
                  {on && <Ionicons accessible={false} name="checkmark" size={14} color="#11130F" />}
                  <Text style={[share.chipText, on && share.chipTextOn]}>{fact.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={share.row}>
            <Avatar profile={profile} size={32} />
            {hasProfile(profile) ? (
              <>
                <Text style={share.rowText}>Show {profile.name.trim() || 'my photo'} on the card</Text>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="Show my name and photo"
                  accessibilityState={{ checked: showMe }}
                  hitSlop={8}
                  onPress={() => {
                    hapticSelection();
                    setShowMe(!showMe);
                  }}
                  style={[share.switch, showMe && share.switchOn]}
                >
                  <View style={[share.thumb, showMe && share.thumbOn]} />
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[share.rowText, { color: MUTED }]}>Add your name and photo</Text>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setIsProfileOpen(true)}>
                  <Text style={share.link}>Add</Text>
                </Pressable>
              </>
            )}
          </View>
          <View style={share.row}>
            <TextInput
              accessibilityLabel="Caption"
              value={caption}
              onChangeText={setCaption}
              maxLength={CAPTION_LIMIT}
              placeholder="Add a caption (optional)"
              placeholderTextColor={MUTED}
              style={share.input}
            />
            <Text style={share.muted}>
              {caption.length}/{CAPTION_LIMIT}
            </Text>
          </View>
        </View>
        {status ? <Text style={[share.muted, { textAlign: 'center', marginTop: 10 }]}>{status}</Text> : null}
      </ScrollView>

      <View style={share.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Save image" disabled={busy} onPress={save} style={[share.action, share.save]}>
          <Ionicons accessible={false} name="download-outline" size={19} color={INK} />
          <Text style={share.actionText}>Save</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={shareImage} style={[share.action, share.send]}>
          <Ionicons accessible={false} name="share-outline" size={19} color="#11130F" />
          <Text style={[share.actionText, { color: '#11130F' }]}>{busy ? 'Making image...' : 'Share'}</Text>
        </Pressable>
      </View>

      <ProfileSheet visible={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </View>
  );
}

// Always dark, so the card is the brightest thing on screen.
const INK = '#F3F1E8';
const MUTED = '#9DA192';
const SWATCH: Record<CardStyle, object> = {
  cover: { backgroundColor: 'hsl(42, 72%, 62%)' },
  lime: { backgroundColor: '#0D0F0B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  paper: { backgroundColor: '#F1ECE1' },
};
const share = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0B09' },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 12 },
  headerCopy: { flex: 1, alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: INK, fontSize: 17, fontWeight: '800' },
  muted: { color: MUTED, fontSize: 12 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#1C2118' },
  segmentItem: { width: 38, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: '#2C3226' },
  carousel: { flexGrow: 0 },
  slot: { borderRadius: 18, overflow: 'hidden' },
  slotOff: { opacity: 0.45, transform: [{ scale: 0.88 }] },
  swatches: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingBottom: 6 },
  swatchButton: { alignItems: 'center', gap: 6, minWidth: 56 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2, overflow: 'hidden' },
  swatchOn: { borderWidth: 2, borderColor: '#C4F078' },
  swatchSticker: { width: 18, height: 18, borderRadius: 4, backgroundColor: 'hsl(42, 40%, 26%)', transform: [{ rotate: '-8deg' }] },
  swatchBar: { width: 4, borderRadius: 2, backgroundColor: '#C4F078' },
  swatchPaper: { color: '#17150F', fontSize: 18, fontStyle: 'italic', fontWeight: '200' },
  swatchLabel: { color: MUTED, fontSize: 12, fontWeight: '700' },
  body: { flex: 1, marginTop: 8 },
  panel: { borderRadius: 20, backgroundColor: '#161913', padding: 12, paddingBottom: 4 },
  panelLabel: { color: MUTED, fontSize: 12, fontWeight: '700', marginBottom: 8, marginLeft: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 11, borderRadius: 16, backgroundColor: '#1E221A' },
  chipOn: { backgroundColor: '#C4F078' },
  chipText: { color: MUTED, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#11130F' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  rowText: { flex: 1, color: INK, fontSize: 14, fontWeight: '600' },
  link: { color: '#C4F078', fontSize: 15, fontWeight: '700' },
  switch: { width: 50, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.14)', padding: 3 },
  switchOn: { backgroundColor: '#C4F078' },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' },
  thumbOn: { transform: [{ translateX: 20 }] },
  input: { flex: 1, height: 44, color: INK, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  action: { minHeight: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  save: { backgroundColor: '#1E221A' },
  send: { flex: 1, backgroundColor: '#C4F078' },
  actionText: { color: INK, fontSize: 16, fontWeight: '800' },
});
