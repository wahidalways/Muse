import { useContext, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { ThemeContext } from '../theme/theme';
import { useGlassStyle, type GlassStyle } from '../theme/glassStyle';

/**
 * Divided by 4 on Android (expo-blur's default), so 100 is the strongest blur.
 * It also scales the tint overlay, so frosted stays light: shapes behind it
 * still read, instead of a milky (light) or muddy grey (dark) smear.
 */
const BLUR: Record<GlassStyle, number> = { frosted: 28, full: 100, solid: 0 };

/**
 * Theme colors for glass. Kept out of styles.ts on purpose: its theme
 * converter maps every background to a solid color and would drop the alpha.
 *
 * Dark glass stays clear and deep rather than grey: a dark, see-through
 * fill lets the colors behind it through, a bright rim and an inner top
 * highlight catch the light. All glass is neutral: the accent color is kept
 * for the selected tab, so it is the one colored thing on the bar.
 */
export function useGlassColors() {
  const { theme, isAmoled } = useContext(ThemeContext);
  const style = useGlassStyle();

  if (theme === 'light') {
    return {
      style,
      tint: 'light' as const,
      fill: `rgba(255, 255, 255, ${style === 'frosted' ? 0.5 : style === 'full' ? 0.78 : 1})`,
      edge: 'rgba(0, 0, 0, 0.08)',
      rim: 'rgba(255, 255, 255, 0.95)',
      shadow: '0px 8px 24px rgba(0, 0, 0, 0.12), inset 0px 1px 0px rgba(255, 255, 255, 0.7)',
      capsule: 'rgba(118, 118, 128, 0.14)',
      capsuleEdge: 'rgba(255, 255, 255, 0.95)',
      capsuleShadow: '0px 1px 4px rgba(0, 0, 0, 0.12)',
      // The pressed lens: nearly clear, bright rim, lifted shadow.
      // Nearly solid: it must hide the normal-size icons under the magnified ones.
      lensFill: 'rgba(250, 250, 250, 0.97)',
      lensRim: '#FFFFFF',
      lensEdge: 'rgba(0, 0, 0, 0.1)',
      lensShadow: '0px 10px 24px rgba(0, 0, 0, 0.2), inset 0px 1px 2px rgba(255, 255, 255, 0.9)',
      lensSheen: 'rgba(255, 255, 255, 0.6)',
    };
  }

  // True black shows no drop shadow, so AMOLED leans on a brighter edge.
  const base = isAmoled ? '8, 8, 8' : '22, 22, 24';
  // Blurred light text over a dark page averages to grey haze. Frosted keeps
  // its blur light so there is little haze to hide, and a medium fill keeps
  // it clear rather than murky; the rim keeps it reading as glass.
  const alpha = style === 'frosted' ? 0.6 : style === 'full' ? 0.84 : 1;
  return {
    style,
    // Android's "dark" tint is a grey wash; this one is black, so the blur
    // keeps its depth and the fill sets the tone.
    tint: 'systemChromeMaterialDark' as const,
    fill: `rgba(${base}, ${alpha})`,
    edge: `rgba(255, 255, 255, ${isAmoled ? 0.2 : 0.14})`,
    rim: `rgba(255, 255, 255, ${isAmoled ? 0.3 : 0.34})`,
    shadow: '0px 10px 30px rgba(0, 0, 0, 0.5), inset 0px 1px 1px rgba(255, 255, 255, 0.12)',
    capsule: 'rgba(255, 255, 255, 0.17)',
    capsuleEdge: 'rgba(255, 255, 255, 0.28)',
    capsuleShadow: '0px 2px 8px rgba(0, 0, 0, 0.45)',
    lensFill: isAmoled ? 'rgba(30, 30, 31, 0.97)' : 'rgba(44, 44, 46, 0.97)',
    lensRim: 'rgba(255, 255, 255, 0.8)',
    lensEdge: 'rgba(255, 255, 255, 0.22)',
    lensShadow: '0px 10px 26px rgba(0, 0, 0, 0.55), inset 0px 1px 2px rgba(255, 255, 255, 0.25)',
    lensSheen: 'rgba(255, 255, 255, 0.14)',
  };
}

/**
 * Frosted glass that blurs whatever scrolls behind it. On Android the blur
 * reads from `blurTarget`, the view wrapping the page content.
 *
 * Two layers: the outer one carries the rim, shadow and glow and does not
 * clip, so they can spill past the edge; the inner one clips the blur and
 * fill to the rounded shape.
 */
export function Glass({
  blurTarget,
  radius,
  style,
  children,
}: {
  blurTarget: RefObject<ComponentRef<typeof View> | null>;
  radius: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const glass = useGlassColors();
  return (
    <View
      style={[
        glassStyles.shell,
        {
          borderRadius: radius,
          borderColor: glass.edge,
          // Light catches the top edge first, as on real glass.
          borderTopColor: glass.rim,
          boxShadow: glass.shadow,
        },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, glassStyles.clip, { borderRadius: radius }]}>
        {glass.style !== 'solid' && (
          // Android 12+ blurs for real; older phones get the tint alone.
          <BlurView
            blurTarget={blurTarget}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={BLUR[glass.style]}
            tint={glass.tint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.fill }]} />
      </View>
      {children}
    </View>
  );
}

const glassStyles = StyleSheet.create({
  shell: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  clip: {
    overflow: 'hidden',
  },
});
