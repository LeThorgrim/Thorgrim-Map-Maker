import { create } from 'zustand';
import type { Lang, Localized } from '../i18n';
import { pick } from '../i18n';
import { zonesOf, type Level, type Loadout, type MapData } from '../map/loadMap';
import { paddedLength } from '../map/renderer';

export type Tool = 'paint' | 'erase' | 'pick';

export interface Country {
  /** Stable identifier, never reused: this is the value stored in `owner`. */
  id: number;
  name: string;
  color: string;
  /** Names from a loadout, in every language; dropped as soon as the user renames the country. */
  label?: Localized;
}

/** Name of a country in a language (loadout countries follow the interface language). */
export const countryName = (c: Country, lang: Lang) => (c.label ? pick(c.label, lang) : c.name);

interface Change {
  zones: number[];
  before: number[];
  after: number[];
}

interface Snapshot {
  owner: Uint16Array;
  countries: Country[];
  nextId: number;
  activeId: number | null;
}

type Command =
  | { kind: 'paint'; change: Change }
  | { kind: 'deleteCountry'; country: Country; index: number; change: Change }
  | { kind: 'replace'; before: Snapshot; after: Snapshot };

export interface SavedState {
  version: 1;
  locations: number;
  countries: Country[];
  nextId: number;
  activeId: number | null;
  /** Owners of the locations, run-length encoded: [value, length, value, length, …] */
  owner: number[];
}

export const COLORS = [
  '#3E6FB0', '#B5473A', '#D8A62E', '#4F8A4B', '#7B4E9C', '#2E9A9A', '#C86F2D', '#9C3D6B',
  '#6B7F2A', '#2F4E8C', '#A88B5A', '#5B9BD5', '#D45E80', '#3C6E57', '#8E5A3C', '#E0C14A',
];

const HISTORY_LIMIT = 300;

interface State {
  map: MapData | null;
  owner: Uint16Array;
  countries: Country[];
  nextId: number;
  activeId: number | null;
  tool: Tool;
  level: Level;
  hover: number;
  past: Command[];
  future: Command[];
  /** Incremented on every change of `owner` (the array is mutated in place). */
  revision: number;

  setMap(map: MapData): void;
  setTool(tool: Tool): void;
  setLevel(level: Level): void;
  setHover(zone: number): void;
  setActive(id: number): void;

  beginStroke(): void;
  applyAt(zone: number, level?: Level): void;
  endStroke(): void;
  pickAt(zone: number): void;

  addCountry(name: string): void;
  renameCountry(id: number, name: string): void;
  recolorCountry(id: number, color: string): void;
  deleteCountry(id: number): void;
  /** Removes every country and every painted location. */
  clearMap(): void;
  /** Replaces the whole map with a loadout (or with a blank map when `loadout` is null). */
  applyLoadout(loadout: Loadout | null): void;

  undo(): void;
  redo(): void;

  serialize(): SavedState;
  restore(saved: SavedState): boolean;
}

// Changes of the stroke in progress: location → owner before the stroke.
let stroke: Map<number, number> | null = null;

function applyChange(owner: Uint16Array, c: Change, dir: 'before' | 'after') {
  const vals = c[dir];
  c.zones.forEach((z, i) => (owner[z] = vals[i]));
}

/** Fills `owner` from [value, length, …] runs. */
function decodeRuns(owner: Uint16Array, runs: number[], count: number) {
  owner.fill(0);
  let z = 0;
  for (let i = 0; i + 1 < runs.length; i += 2) {
    owner.fill(runs[i], z, Math.min(count, z + runs[i + 1]));
    z += runs[i + 1];
  }
}

export const useStore = create<State>()((set, get) => {
  const snapshot = (): Snapshot => {
    const { owner, countries, nextId, activeId } = get();
    return { owner: owner.slice(), countries, nextId, activeId };
  };
  const applySnapshot = (s: Snapshot) => {
    get().owner.set(s.owner);
    set({ countries: s.countries, nextId: s.nextId, activeId: s.activeId, revision: get().revision + 1 });
  };
  const push = (cmd: Command) => set({ past: [...get().past, cmd].slice(-HISTORY_LIMIT), future: [] });

  return {
    map: null,
    owner: new Uint16Array(0),
    countries: [],
    nextId: 1,
    activeId: null,
    tool: 'paint',
    level: 'location',
    hover: 0,
    past: [],
    future: [],
    revision: 0,

    // Every map starts blank; persist.ts then restores the saved version of that map.
    setMap: (map) =>
      set({
        map,
        owner: new Uint16Array(paddedLength(map.count)),
        countries: [],
        nextId: 1,
        activeId: null,
        tool: 'paint',
        hover: 0,
        past: [],
        future: [],
        revision: get().revision + 1,
      }),
    setTool: (tool) => set({ tool }),
    setLevel: (level) => set({ level }),
    setHover: (hover) => get().hover !== hover && set({ hover }),
    setActive: (id) => set({ activeId: id, tool: get().tool === 'pick' ? 'paint' : get().tool }),

    beginStroke: () => {
      stroke = new Map();
    },

    applyAt: (zone, level) => {
      const { map, owner, tool, activeId, revision } = get();
      if (!map || !stroke || zone <= 0) return;
      const target = tool === 'erase' ? 0 : activeId;
      if (target === null) return;
      let changed = false;
      for (const z of zonesOf(map, level ?? get().level, zone)) {
        if (owner[z] === target) continue;
        if (!stroke.has(z)) stroke.set(z, owner[z]);
        owner[z] = target;
        changed = true;
      }
      if (changed) set({ revision: revision + 1 });
    },

    endStroke: () => {
      const s = stroke;
      stroke = null;
      if (!s) return;
      const { owner } = get();
      const change: Change = { zones: [], before: [], after: [] };
      for (const [z, before] of s) {
        if (owner[z] === before) continue;
        change.zones.push(z);
        change.before.push(before);
        change.after.push(owner[z]);
      }
      if (change.zones.length) push({ kind: 'paint', change });
    },

    pickAt: (zone) => {
      const o = get().owner[zone];
      if (zone > 0 && o > 0) set({ activeId: o, tool: 'paint' });
    },

    addCountry: (name) => {
      const { countries, nextId } = get();
      const used = new Set(countries.map((c) => c.color));
      const color = COLORS.find((c) => !used.has(c)) ?? COLORS[nextId % COLORS.length];
      set({ countries: [...countries, { id: nextId, name, color }], nextId: nextId + 1, activeId: nextId, tool: 'paint' });
    },

    renameCountry: (id, name) =>
      set({ countries: get().countries.map((c) => (c.id === id ? { id: c.id, color: c.color, name } : c)) }),

    recolorCountry: (id, color) => set({ countries: get().countries.map((c) => (c.id === id ? { ...c, color } : c)) }),

    deleteCountry: (id) => {
      const { countries, owner, activeId, revision } = get();
      const index = countries.findIndex((c) => c.id === id);
      if (index < 0) return;
      const change: Change = { zones: [], before: [], after: [] };
      for (let z = 1; z < owner.length; z++)
        if (owner[z] === id) {
          change.zones.push(z);
          change.before.push(id);
          change.after.push(0);
          owner[z] = 0;
        }
      const rest = countries.filter((c) => c.id !== id);
      set({
        countries: rest,
        activeId: activeId === id ? (rest[Math.min(index, rest.length - 1)]?.id ?? null) : activeId,
        revision: revision + 1,
      });
      push({ kind: 'deleteCountry', country: countries[index], index, change });
    },

    // Removes every country and every painted location (undoable as one step).
    clearMap: () => {
      const { countries, owner } = get();
      if (countries.length === 0 && !owner.some((o) => o > 0)) return;
      get().applyLoadout(null);
    },

    applyLoadout: (loadout) => {
      const { map } = get();
      if (!map) return;
      const before = snapshot();
      const owner = new Uint16Array(get().owner.length);
      let countries: Country[] = [];
      if (loadout) {
        decodeRuns(owner, loadout.owner, map.count);
        countries = loadout.countries.map((c, i) => ({ id: i + 1, name: pick(c.name, 'en'), label: c.name, color: c.color }));
      }
      const after: Snapshot = { owner, countries, nextId: countries.length + 1, activeId: countries[0]?.id ?? null };
      applySnapshot(after);
      push({ kind: 'replace', before, after });
    },

    undo: () => {
      const { past, future, owner, countries, revision } = get();
      const cmd = past[past.length - 1];
      if (!cmd) return;
      set({ past: past.slice(0, -1), future: [...future, cmd] });
      if (cmd.kind === 'replace') return applySnapshot(cmd.before);
      let next = countries;
      if (cmd.kind === 'deleteCountry') {
        next = [...countries];
        next.splice(cmd.index, 0, cmd.country);
      }
      applyChange(owner, cmd.change, 'before');
      set({ countries: next, revision: revision + 1 });
    },

    redo: () => {
      const { past, future, owner, countries, activeId, revision } = get();
      const cmd = future[future.length - 1];
      if (!cmd) return;
      set({ past: [...past, cmd], future: future.slice(0, -1) });
      if (cmd.kind === 'replace') return applySnapshot(cmd.after);
      let next = countries;
      let active = activeId;
      if (cmd.kind === 'deleteCountry') {
        next = countries.filter((c) => c.id !== cmd.country.id);
        if (active === cmd.country.id) active = next[0]?.id ?? null;
      }
      applyChange(owner, cmd.change, 'after');
      set({ countries: next, activeId: active, revision: revision + 1 });
    },

    serialize: () => {
      const { map, owner, countries, nextId, activeId } = get();
      const runs: number[] = [];
      const n = map?.count ?? owner.length;
      for (let z = 0; z < n; ) {
        let len = 1;
        while (z + len < n && owner[z + len] === owner[z]) len++;
        runs.push(owner[z], len);
        z += len;
      }
      return { version: 1, locations: n, countries, nextId, activeId, owner: runs };
    },

    restore: (saved) => {
      const { map, owner, revision } = get();
      if (!map || saved?.version !== 1 || saved.locations !== map.count) return false;
      decodeRuns(owner, saved.owner, map.count);
      set({ countries: saved.countries, nextId: saved.nextId, activeId: saved.activeId, past: [], future: [], revision: revision + 1 });
      return true;
    },
  };
});
