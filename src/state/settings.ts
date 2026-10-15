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
}

export const DEFAULT_SETTINGS: DisplaySettings = { names: true, legend: true, overlays: true, locationBorders: true };

const KEY = 'mapmaker:display';

function load(): DisplaySettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsState extends DisplaySettings {
  toggle(key: keyof DisplaySettings): void;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  ...load(),
  toggle: (key) => {
    set({ [key]: !get()[key] } as Partial<DisplaySettings>);
    const { names, legend, overlays, locationBorders } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ names, legend, overlays, locationBorders }));
    } catch {
      /* the choice simply won't survive a reload */
    }
  },
}));
