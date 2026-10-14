import { create } from 'zustand';
import type { Lang, Localized } from '../i18n';
import { pick } from '../i18n';
import { zonesOf, type Level, type Loadout, type MapData } from '../map/loadMap';
import { paddedLength } from '../map/renderer';

export type Tool = 'paint' | 'erase' | 'pick';

/**
 * The map has two layers painted independently:
 * - `country`: who owns each location (filled with the country colour);
 * - `overlay`: extra information drawn on top (alliances, occupations, claims, religions…).
 * The active layer is the one of the last country or overlay picked in the side panel.
 */
export type Layer = 'country' | 'overlay';

/**
 * How an overlay is drawn. Each style is a separate channel: a location can carry one outlined
 * overlay and one hatched overlay at the same time (e.g. an alliance and an occupation).
 */
export type OverlayStyle = 'outline' | 'hatch';
export const OVERLAY_STYLES: OverlayStyle[] = ['outline', 'hatch'];

/** What a change writes to: the country of each location, or one of the overlay channels. */
type Target = 'country' | OverlayStyle;

export interface Country {
  /** Stable identifier, never reused: this is the value stored in `owner`. */
  id: number;
  name: string;
  color: string;
  /** Names from a loadout, in every language; dropped as soon as the user renames the country. */
  label?: Localized;
}

export interface Overlay {
  /** Stable identifier, never reused: this is the value stored in its channel. */
  id: number;
  name: string;
  color: string;
  style: OverlayStyle;
}

/** Name of a country in a language (loadout countries follow the interface language). */
export const countryName = (c: Country, lang: Lang) => (c.label ? pick(c.label, lang) : c.name);

interface Change {
  target: Target;
  zones: number[];
  before: number[];
  after: number[];
}

interface Snapshot {
  owner: Uint16Array;
  outline: Uint16Array;
  hatch: Uint16Array;
  countries: Country[];
  nextId: number;
  activeId: number | null;
  overlays: Overlay[];
  nextOverlayId: number;
  activeOverlayId: number | null;
}

type Command =
  | { kind: 'paint'; change: Change }
  | { kind: 'deleteCountry'; country: Country; index: number; change: Change }
  | { kind: 'deleteOverlay'; overlay: Overlay; index: number; change: Change }
  | { kind: 'restyle'; before: Overlay[]; after: Overlay[]; changes: Change[] }
  | { kind: 'replace'; before: Snapshot; after: Snapshot };

export interface SavedState {
  version: 1;
  locations: number;
  countries: Country[];
  nextId: number;
  activeId: number | null;
  /** Owners of the locations, run-length encoded: [value, length, value, length, …] */
  owner: number[];
  // Overlays (absent from saves made before they existed)
  overlays?: Overlay[];
  nextOverlayId?: number;
  activeOverlayId?: number | null;
  /** Outlined and hatched overlay of each location, run-length encoded like `owner`. */
  outline?: number[];
  hatch?: number[];
  /** Single overlay channel of early saves, split by style when restored. */
  marks?: number[];
}

/** Locations where restyling an overlay would replace another overlay of the target style. */
export interface RestyleConflict {
  count: number;
  /** Overlays that would lose these locations. */
  overlays: Overlay[];
}

export const COLORS = [
  '#3E6FB0', '#B5473A', '#D8A62E', '#4F8A4B', '#7B4E9C', '#2E9A9A', '#C86F2D', '#9C3D6B',
  '#6B7F2A', '#2F4E8C', '#A88B5A', '#5B9BD5', '#D45E80', '#3C6E57', '#8E5A3C', '#E0C14A',
];
/** Overlays are drawn over country colours: saturated, contrasting colours read best. */
export const OVERLAY_COLORS = ['#C1121F', '#1D3557', '#F4D35E', '#111111', '#F7F7F2', '#2A9D8F', '#7B2CBF', '#F77F00'];

const HISTORY_LIMIT = 300;

interface State {
  map: MapData | null;
  owner: Uint16Array;
  /** Outlined overlay of each location (0 = none). */
  outline: Uint16Array;
  /** Hatched overlay of each location (0 = none). */
  hatch: Uint16Array;
  countries: Country[];
  nextId: number;
  activeId: number | null;
  overlays: Overlay[];
  nextOverlayId: number;
  activeOverlayId: number | null;
  layer: Layer;
  tool: Tool;
  level: Level;
  hover: number;
  past: Command[];
  future: Command[];
  /** Incremented on every change of `owner`, `outline` or `hatch` (mutated in place). */
  revision: number;

  setMap(map: MapData): void;
  setTool(tool: Tool): void;
  setLevel(level: Level): void;
  setHover(zone: number): void;
  /** Selects a country: painting now affects the country layer. */
  setActive(id: number): void;
  /** Selects an overlay: painting now affects the channel of its style. */
  setActiveOverlay(id: number): void;

  beginStroke(): void;
  applyAt(zone: number, level?: Level): void;
  endStroke(): void;
  pickAt(zone: number): void;

  addCountry(name: string): void;
  renameCountry(id: number, name: string): void;
  recolorCountry(id: number, color: string): void;
  deleteCountry(id: number): void;

  addOverlay(name: string): void;
  renameOverlay(id: number, name: string): void;
  recolorOverlay(id: number, color: string): void;
  /** What `setOverlayStyle` would overwrite (to warn the user first), or null if nothing. */
  restyleConflict(id: number, style: OverlayStyle): RestyleConflict | null;
  /** Moves an overlay to the other style; it replaces the overlay of that style where both meet. */
  setOverlayStyle(id: number, style: OverlayStyle): void;
  deleteOverlay(id: number): void;

  /** Removes every country, every overlay and everything painted. */
  clearMap(): void;
  /** Replaces the whole map with a loadout (or with a blank map when `loadout` is null). */
  applyLoadout(loadout: Loadout | null): void;

  undo(): void;
  redo(): void;

  serialize(): SavedState;
  restore(saved: SavedState): boolean;
}

// The stroke in progress: what it writes to, the value it writes, and location → value before.
let stroke: { target: Target; value: number; before: Map<number, number> } | null = null;

/** Fills `values` from [value, length, …] runs. */
function decodeRuns(values: Uint16Array, runs: number[] | undefined, count: number) {
  values.fill(0);
  if (!runs) return;
  let z = 0;
  for (let i = 0; i + 1 < runs.length; i += 2) {
    values.fill(runs[i], z, Math.min(count, z + runs[i + 1]));
    z += runs[i + 1];
  }
}

function encodeRuns(values: Uint16Array, count: number): number[] {
  const runs: number[] = [];
  for (let z = 0; z < count; ) {
    let len = 1;
    while (z + len < count && values[z + len] === values[z]) len++;
    runs.push(values[z], len);
    z += len;
  }
  return runs;
}

export const useStore = create<State>()((set, get) => {
  const arrayOf = (target: Target) => (target === 'country' ? get().owner : get()[target]);
  const snapshot = (): Snapshot => {
    const s = get();
    return {
      owner: s.owner.slice(),
      outline: s.outline.slice(),
      hatch: s.hatch.slice(),
      countries: s.countries,
      nextId: s.nextId,
      activeId: s.activeId,
      overlays: s.overlays,
      nextOverlayId: s.nextOverlayId,
      activeOverlayId: s.activeOverlayId,
    };
  };
  const applySnapshot = (s: Snapshot) => {
    const { owner, outline, hatch, ...rest } = s;
    get().owner.set(owner);
    get().outline.set(outline);
    get().hatch.set(hatch);
    set({ ...rest, revision: get().revision + 1 });
  };
  const applyChange = (c: Change, dir: 'before' | 'after') => {
    const values = arrayOf(c.target);
    c.zones.forEach((z, i) => (values[z] = c[dir][i]));
  };
  /** Writes `value` wherever `where(z)` holds in a target array, and returns the change. */
  const writeWhere = (target: Target, where: (z: number) => boolean, value: number): Change => {
    const values = arrayOf(target);
    const change: Change = { target, zones: [], before: [], after: [] };
    for (let z = 1; z < values.length; z++)
      if (where(z) && values[z] !== value) {
        change.zones.push(z);
        change.before.push(values[z]);
        change.after.push(value);
        values[z] = value;
      }
    return change;
  };
  const push = (cmd: Command) => set({ past: [...get().past, cmd].slice(-HISTORY_LIMIT), future: [] });
  const freeColor = (palette: string[], used: string[], n: number) =>
    palette.find((c) => !used.includes(c)) ?? palette[n % palette.length];
  const overlayById = (id: number | null) => get().overlays.find((o) => o.id === id);

  return {
    map: null,
    owner: new Uint16Array(0),
    outline: new Uint16Array(0),
    hatch: new Uint16Array(0),
    countries: [],
    nextId: 1,
    activeId: null,
    overlays: [],
    nextOverlayId: 1,
    activeOverlayId: null,
    layer: 'country',
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
        outline: new Uint16Array(paddedLength(map.count)),
        hatch: new Uint16Array(paddedLength(map.count)),
        countries: [],
        nextId: 1,
        activeId: null,
        overlays: [],
        nextOverlayId: 1,
        activeOverlayId: null,
        layer: 'country',
        tool: 'paint',
        hover: 0,
        past: [],
        future: [],
        revision: get().revision + 1,
      }),
    setTool: (tool) => set({ tool }),
    setLevel: (level) => set({ level }),
    setHover: (hover) => get().hover !== hover && set({ hover }),
    setActive: (id) => set({ activeId: id, layer: 'country', tool: get().tool === 'pick' ? 'paint' : get().tool }),
    setActiveOverlay: (id) =>
      set({ activeOverlayId: id, layer: 'overlay', tool: get().tool === 'pick' ? 'paint' : get().tool }),

    // Painting writes the active country, or the active overlay into the channel of its style.
    // The eraser clears what the brush would paint: the country, or that channel only, so an
    // outline can be erased without touching the hatching of the same location.
    beginStroke: () => {
      const { layer, activeId, tool } = get();
      if (layer === 'country') {
        stroke = activeId === null && tool !== 'erase' ? null : { target: 'country', value: tool === 'erase' ? 0 : activeId!, before: new Map() };
        return;
      }
      const o = overlayById(get().activeOverlayId);
      stroke = o ? { target: o.style, value: tool === 'erase' ? 0 : o.id, before: new Map() } : null;
    },

    applyAt: (zone, level) => {
      const { map, revision } = get();
      if (!map || !stroke || zone <= 0) return;
      const values = arrayOf(stroke.target);
      let changed = false;
      for (const z of zonesOf(map, level ?? get().level, zone)) {
        if (values[z] === stroke.value) continue;
        if (!stroke.before.has(z)) stroke.before.set(z, values[z]);
        values[z] = stroke.value;
        changed = true;
      }
      if (changed) set({ revision: revision + 1 });
    },

    endStroke: () => {
      const s = stroke;
      stroke = null;
      if (!s) return;
      const values = arrayOf(s.target);
      const change: Change = { target: s.target, zones: [], before: [], after: [] };
      for (const [z, before] of s.before) {
        if (values[z] === before) continue;
        change.zones.push(z);
        change.before.push(before);
        change.after.push(values[z]);
      }
      if (change.zones.length) push({ kind: 'paint', change });
    },

    // The pipette works on the active layer. On a location with both an outline and a
    // hatching, it picks the one of the other style than the active overlay, so that clicking
    // twice cycles between the two.
    pickAt: (zone) => {
      if (zone <= 0) return;
      const { layer, owner, outline, hatch } = get();
      if (layer === 'country') {
        if (owner[zone] > 0) set({ activeId: owner[zone], tool: 'paint' });
        return;
      }
      const current = overlayById(get().activeOverlayId);
      const order = current?.style === 'outline' ? [hatch[zone], outline[zone]] : [outline[zone], hatch[zone]];
      const found = order.find((v) => v > 0);
      if (found) set({ activeOverlayId: found, tool: 'paint' });
    },

    addCountry: (name) => {
      const { countries, nextId } = get();
      const color = freeColor(COLORS, countries.map((c) => c.color), nextId);
      set({ countries: [...countries, { id: nextId, name, color }], nextId: nextId + 1, activeId: nextId, layer: 'country', tool: 'paint' });
    },
    renameCountry: (id, name) =>
      set({ countries: get().countries.map((c) => (c.id === id ? { id: c.id, color: c.color, name } : c)) }),
    recolorCountry: (id, color) => set({ countries: get().countries.map((c) => (c.id === id ? { ...c, color } : c)) }),
    deleteCountry: (id) => {
      const { countries, activeId, revision } = get();
      const index = countries.findIndex((c) => c.id === id);
      if (index < 0) return;
      const owner = get().owner;
      const change = writeWhere('country', (z) => owner[z] === id, 0);
      const rest = countries.filter((c) => c.id !== id);
      set({
        countries: rest,
        activeId: activeId === id ? (rest[Math.min(index, rest.length - 1)]?.id ?? null) : activeId,
        revision: revision + 1,
      });
      push({ kind: 'deleteCountry', country: countries[index], index, change });
    },

    addOverlay: (name) => {
      const { overlays, nextOverlayId } = get();
      const color = freeColor(OVERLAY_COLORS, overlays.map((o) => o.color), nextOverlayId);
      // A new overlay takes the style that has fewer overlays, so that it combines easily.
      const outlines = overlays.filter((o) => o.style === 'outline').length;
      const style: OverlayStyle = outlines < overlays.length - outlines ? 'outline' : 'hatch';
      const overlay: Overlay = { id: nextOverlayId, name, color, style };
      set({ overlays: [...overlays, overlay], nextOverlayId: nextOverlayId + 1, activeOverlayId: nextOverlayId, layer: 'overlay', tool: 'paint' });
    },
    renameOverlay: (id, name) => set({ overlays: get().overlays.map((o) => (o.id === id ? { ...o, name } : o)) }),
    recolorOverlay: (id, color) => set({ overlays: get().overlays.map((o) => (o.id === id ? { ...o, color } : o)) }),

    restyleConflict: (id, style) => {
      const o = overlayById(id);
      if (!o || o.style === style) return null;
      const from = arrayOf(o.style), to = arrayOf(style);
      let count = 0;
      const hit = new Set<number>();
      for (let z = 1; z < from.length; z++)
        if (from[z] === id && to[z] !== 0) {
          count++;
          hit.add(to[z]);
        }
      return count ? { count, overlays: get().overlays.filter((x) => hit.has(x.id)) } : null;
    },

    setOverlayStyle: (id, style) => {
      const o = overlayById(id);
      if (!o || o.style === style) return;
      const from = arrayOf(o.style);
      const zones = new Set<number>();
      for (let z = 1; z < from.length; z++) if (from[z] === id) zones.add(z);
      // write into the new channel first (replacing other overlays there), then clear the old one
      const changes = [writeWhere(style, (z) => zones.has(z), id), writeWhere(o.style, (z) => zones.has(z), 0)];
      const before = get().overlays;
      const after = before.map((x) => (x.id === id ? { ...x, style } : x));
      set({ overlays: after, revision: get().revision + 1 });
      push({ kind: 'restyle', before, after, changes });
    },

    deleteOverlay: (id) => {
      const { overlays, activeOverlayId, revision } = get();
      const index = overlays.findIndex((o) => o.id === id);
      if (index < 0) return;
      const values = arrayOf(overlays[index].style);
      const change = writeWhere(overlays[index].style, (z) => values[z] === id, 0);
      const rest = overlays.filter((o) => o.id !== id);
      set({
        overlays: rest,
        activeOverlayId: activeOverlayId === id ? (rest[Math.min(index, rest.length - 1)]?.id ?? null) : activeOverlayId,
        layer: rest.length ? get().layer : 'country',
        revision: revision + 1,
      });
      push({ kind: 'deleteOverlay', overlay: overlays[index], index, change });
    },

    // Removes everything (undoable as one step).
    clearMap: () => {
      const { countries, overlays, owner, outline, hatch } = get();
      const painted = owner.some((v) => v > 0) || outline.some((v) => v > 0) || hatch.some((v) => v > 0);
      if (!countries.length && !overlays.length && !painted) return;
      get().applyLoadout(null);
    },

    // A loadout (or a blank map) replaces the whole map: countries and overlays.
    applyLoadout: (loadout) => {
      const { map } = get();
      if (!map) return;
      const before = snapshot();
      const n = get().owner.length;
      const owner = new Uint16Array(n);
      let countries: Country[] = [];
      if (loadout) {
        decodeRuns(owner, loadout.owner, map.count);
        countries = loadout.countries.map((c, i) => ({ id: i + 1, name: pick(c.name, 'en'), label: c.name, color: c.color }));
      }
      const after: Snapshot = {
        owner,
        outline: new Uint16Array(n),
        hatch: new Uint16Array(n),
        countries,
        nextId: countries.length + 1,
        activeId: countries[0]?.id ?? null,
        overlays: [],
        nextOverlayId: 1,
        activeOverlayId: null,
      };
      applySnapshot(after);
      set({ layer: 'country' });
      push({ kind: 'replace', before, after });
    },

    undo: () => {
      const { past, future, countries, overlays, revision } = get();
      const cmd = past[past.length - 1];
      if (!cmd) return;
      set({ past: past.slice(0, -1), future: [...future, cmd] });
      if (cmd.kind === 'replace') return applySnapshot(cmd.before);
      if (cmd.kind === 'restyle') {
        for (const c of [...cmd.changes].reverse()) applyChange(c, 'before');
        set({ overlays: cmd.before, revision: revision + 1 });
        return;
      }
      if (cmd.kind === 'deleteCountry') {
        const next = [...countries];
        next.splice(cmd.index, 0, cmd.country);
        set({ countries: next });
      }
      if (cmd.kind === 'deleteOverlay') {
        const next = [...overlays];
        next.splice(cmd.index, 0, cmd.overlay);
        set({ overlays: next });
      }
      applyChange(cmd.change, 'before');
      set({ revision: revision + 1 });
    },

    redo: () => {
      const { past, future, revision } = get();
      const cmd = future[future.length - 1];
      if (!cmd) return;
      set({ past: [...past, cmd], future: future.slice(0, -1) });
      if (cmd.kind === 'replace') return applySnapshot(cmd.after);
      if (cmd.kind === 'restyle') {
        for (const c of cmd.changes) applyChange(c, 'after');
        set({ overlays: cmd.after, revision: revision + 1 });
        return;
      }
      if (cmd.kind === 'deleteCountry') {
        const next = get().countries.filter((c) => c.id !== cmd.country.id);
        set({ countries: next, activeId: get().activeId === cmd.country.id ? (next[0]?.id ?? null) : get().activeId });
      }
      if (cmd.kind === 'deleteOverlay') {
        const next = get().overlays.filter((o) => o.id !== cmd.overlay.id);
        set({
          overlays: next,
          activeOverlayId: get().activeOverlayId === cmd.overlay.id ? (next[0]?.id ?? null) : get().activeOverlayId,
        });
      }
      applyChange(cmd.change, 'after');
      set({ revision: revision + 1 });
    },

    serialize: () => {
      const s = get();
      const n = s.map?.count ?? s.owner.length;
      return {
        version: 1,
        locations: n,
        countries: s.countries,
        nextId: s.nextId,
        activeId: s.activeId,
        owner: encodeRuns(s.owner, n),
        overlays: s.overlays,
        nextOverlayId: s.nextOverlayId,
        activeOverlayId: s.activeOverlayId,
        outline: encodeRuns(s.outline, n),
        hatch: encodeRuns(s.hatch, n),
      };
    },

    restore: (saved) => {
      const { map, owner, outline, hatch, revision } = get();
      if (!map || saved?.version !== 1 || saved.locations !== map.count) return false;
      decodeRuns(owner, saved.owner, map.count);
      const overlays = saved.overlays ?? [];
      if (saved.outline || saved.hatch) {
        decodeRuns(outline, saved.outline, map.count);
        decodeRuns(hatch, saved.hatch, map.count);
      } else {
        // early saves kept every overlay in one channel: split it by style
        const marks = new Uint16Array(owner.length);
        decodeRuns(marks, saved.marks, map.count);
        const styleOf = new Map(overlays.map((o) => [o.id, o.style]));
        outline.fill(0);
        hatch.fill(0);
        for (let z = 0; z < map.count; z++)
          if (marks[z]) (styleOf.get(marks[z]) === 'outline' ? outline : hatch)[z] = marks[z];
      }
      set({
        countries: saved.countries,
        nextId: saved.nextId,
        activeId: saved.activeId,
        overlays,
        nextOverlayId: saved.nextOverlayId ?? overlays.reduce((m, o) => Math.max(m, o.id + 1), 1),
        activeOverlayId: saved.activeOverlayId ?? null,
        layer: 'country',
        past: [],
        future: [],
        revision: revision + 1,
      });
      return true;
    },
  };
});
