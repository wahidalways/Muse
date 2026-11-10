import { useEffect, useRef } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import type * as ThreeTypes from 'three';

/**
 * Welcome's "sound terrain": about 11k glowing points rippling outward on a
 * 100 BPM beat. Everything moves in the GPU's shaders; each frame the app
 * only sends the time. Capped at 30 fps, paused while Muse is in the
 * background, and freed when Welcome closes. Reduce motion draws one frame.
 */

const BEAT_GLSL = `
  float beatKick(float t) { return exp(-fract(t / 0.6) * 6.0); }`;

const VERTEX = `
  uniform float uT;
  uniform float uRise;
  uniform float uPx;
  varying float vH;
  varying float vFade;
  varying float vX;
  ${BEAT_GLSL}
  void main() {
    vec3 p = position;
    float d = length(p.xz - vec2(0.0, -2.0));
    float k = beatKick(uT - d * 0.12); // the beat travels out from the middle
    float h = sin(p.x * 0.9 + uT * 0.6) * 0.16
            + sin(p.z * 1.3 - uT * 0.8) * 0.12
            + sin(d * 3.0 - uT * 2.4) * exp(-d * 0.42) * (0.12 + 0.45 * k)
            + sin(p.x * 2.7 + p.z * 1.9 + uT * 1.4) * 0.04;
    h *= uRise;
    p.y += h;
    vH = h;
    vX = p.x;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = smoothstep(12.0, 3.5, -mv.z);
    gl_PointSize = uPx * (1.6 + 2.6 * clamp(h * 2.0 + 0.3, 0.0, 1.0)) * (8.8 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAGMENT = `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uLight;
  varying float vH;
  varying float vFade;
  varying float vX;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.1, r);
    vec3 col = mix(uB, uA, clamp(vH * 1.8 + 0.5 + vX * 0.05, 0.0, 1.0));
    float glow = 0.3 + clamp(vH * 1.6, 0.0, 0.7);
    gl_FragColor = vec4(col, a * vFade * glow * (1.0 + uLight * 0.4));
    #include <colorspace_fragment>
  }`;

const FRAME_MS = 1000 / 30;
/** Where a still frame lands: just after a beat, fully risen. */
const STILL_T = 6.05;

export function WelcomeScene({
  accent,
  second,
  dark,
  still,
  layoutWidth,
}: {
  /** The accent's strong color, for the crests. */
  accent: string;
  /** A second color for the valleys. */
  second: string;
  dark: boolean;
  /** Reduce motion: one frame, no loop. */
  still: boolean;
  /** The view's width in layout points, to size the points for the screen. */
  layoutWidth: number;
}) {
  const look = useRef({ accent, second, dark });
  const recolor = useRef<(() => void) | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    look.current = { accent, second, dark };
    recolor.current?.();
  }, [accent, second, dark]);
  useEffect(() => () => stop.current?.(), []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    // Required here, not at the top: three only loads the first time Welcome shows,
    // so returning listeners never pay for it at launch.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const THREE = require('three') as typeof ThreeTypes;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    // three expects a canvas; expo-gl hands over the context directly.
    const canvas = {
      width,
      height,
      style: {},
      clientWidth: width,
      clientHeight: height,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as unknown as WebGLRenderingContext,
      antialias: false,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    const geometry = new THREE.PlaneGeometry(11, 9, 120, 90);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -2);
    const uniforms = {
      uT: { value: 0 },
      uRise: { value: 0 },
      // Device pixels per layout point, so the dots keep their size on any screen.
      uPx: { value: layoutWidth > 0 ? width / layoutWidth : 2.5 },
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uLight: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Points(geometry, material));

    const applyColors = () => {
      const { accent: a, second: b, dark: isDark } = look.current;
      uniforms.uA.value.set(a);
      uniforms.uB.value.set(b);
      uniforms.uLight.value = isDark ? 0 : 1;
      // Glow adds light on dark pages; on light ones it would vanish, so it paints normally.
      material.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
      material.needsUpdate = true;
    };
    applyColors();

    const draw = (t: number) => {
      uniforms.uT.value = t;
      uniforms.uRise.value = 1 - (1 - Math.min(1, t / 1.8)) ** 3;
      camera.position.set(Math.sin(t * 0.1) * 0.6, 1.55 + Math.sin(t * 0.13) * 0.08, 5.4);
      camera.lookAt(0, 0.1, -2);
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    let raf = 0;
    let last = 0;
    let started = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS - 2) {
        return;
      }
      last = now;
      if (!started) {
        started = now;
      }
      draw((now - started) / 1000);
    };
    const play = () => {
      if (!still && !raf) {
        raf = requestAnimationFrame(frame);
      }
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const appState = AppState.addEventListener('change', (state) => (state === 'active' ? play() : pause()));

    recolor.current = () => {
      applyColors();
      if (still) {
        draw(STILL_T);
      }
    };
    stop.current = () => {
      pause();
      appState.remove();
      recolor.current = null;
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };

    if (still) {
      draw(STILL_T);
    } else {
      play();
    }
  };

  return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />;
}
