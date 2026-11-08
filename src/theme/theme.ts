import { createContext } from 'react';

export type Theme = 'light' | 'dark';
/** What the person chose: a theme, or follow the phone. */
export type Appearance = Theme | 'system';

export type Accent =
  | 'muse'
  | 'ocean'
  | 'sunset'
  | 'rose'
  | 'coral'
  | 'teal'
  | 'red';

type ThemeContextValue = { theme: Theme; accent: Accent; isAmoled: boolean };

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  accent: 'muse',
  isAmoled: false,
});

export const ACCENT_OPTIONS: {
  id: Accent;
  label: string;
  swatch: string;
  lightText: string;
  darkText: string;
  lightSurface: string;
  darkSurface: string;
}[] = [
  {
    id: 'muse',
    label: 'Muse Green',
    swatch: '#739B42',
    lightText: '#739B42',
    darkText: '#B9E77B',
    lightSurface: '#EAF2E1',
    darkSurface: '#2D3A22',
  },
  {
    id: 'ocean',
    label: 'Ocean Blue',
    swatch: '#4D9DD1',
    lightText: '#176A9A',
    darkText: '#8BD7FF',
    lightSurface: '#E4F2FB',
    darkSurface: '#193247',
  },
  {
    id: 'sunset',
    label: 'Sunset Amber',
    swatch: '#C88732',
    lightText: '#87520F',
    darkText: '#FFD18A',
    lightSurface: '#FFF0D9',
    darkSurface: '#3B2A18',
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: '#E2558A',
    lightText: '#B0275B',
    darkText: '#FF8FB8',
    lightSurface: '#FFF0F5',
    darkSurface: '#45192B',
  },
  {
    id: 'coral',
    label: 'Coral',
    swatch: '#D56B68',
    lightText: '#A64643',
    darkText: '#FFB0A8',
    lightSurface: '#FFF1EF',
    darkSurface: '#422625',
  },
  {
    id: 'teal',
    label: 'Teal',
    swatch: '#4C9B91',
    lightText: '#28766E',
    darkText: '#8DE1D5',
    lightSurface: '#EAF8F6',
    darkSurface: '#1C3835',
  },
  {
    id: 'red',
    label: 'Red',
    swatch: '#E11D2A',
    lightText: '#C3121C',
    darkText: '#FF4D4D',
    lightSurface: '#FFF1F1',
    darkSurface: '#3D1214',
  },
];
