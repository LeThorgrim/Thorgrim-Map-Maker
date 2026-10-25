import { create } from 'zustand';

/** What the map shows. Applies to the screen and to the PNG export alike. */
export interface DisplaySettings {
  /** Country names written on the map. */
  names: boolean;
  /** Legend box (countries and overlays). */
  legend: boolean;
  /** Outline and hatching overlays. */
  overlays: boolean;
  /** Thin borders between the locations of a same country. */
  locationBorders: boolean;
  /** Size of the legend's text (and of its rows), 1 = default. */
  legendScale: number;
  /** Space between the columns of the legend, in legend pixels. */
  legendColumnGap: number;
}

export type DisplayToggle = 'names' | 'legend' | 'overlays' | 'locationBorders';

export const DEFAULT_SETTINGS: DisplaySettings = {
  names: true,
  legend: true,
  overlays: true,
  locationBorders: true,
  legendScale: 1,
  legendColumnGap: 18,
};

/** Bounds and step of the numeric settings. */
export const LEGEND_SCALE = { min: 0.1, max: 1, step: 0.05 };
export const LEGEND_COLUMN_GAP = { min: 0, max: 120, step: 6 };

const KEY = 'mapmaker:display';

const clamp = (v: unknown, b: { min: number; max: number }, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(b.max, Math.max(b.min, v)) : fallback;

function load(): DisplaySettings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // values saved under other bounds are brought back within the current ones
    s.legendScale = clamp(s.legendScale, LEGEND_SCALE, DEFAULT_SETTINGS.legendScale);
    s.legendColumnGap = clamp(s.legendColumnGap, LEGEND_COLUMN_GAP, DEFAULT_SETTINGS.legendColumnGap);
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsState extends DisplaySettings {
  toggle(key: DisplayToggle): void;
  setValue(key: 'legendScale' | 'legendColumnGap', value: number): void;
}

export const useSettings = create<SettingsState>()((set, get) => {
  const save = () => {
    const s = get();
    const data = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, s[k as keyof DisplaySettings]]));
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* the choice simply won't survive a reload */
    }
  };
  return {
    ...load(),
    toggle: (key) => {
      set({ [key]: !get()[key] } as Partial<DisplaySettings>);
      save();
    },
    setValue: (key, value) => {
      set({ [key]: value } as Partial<DisplaySettings>);
      save();
    },
  };
});
