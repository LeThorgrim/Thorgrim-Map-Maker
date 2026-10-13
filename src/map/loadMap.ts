import { decode } from 'fast-png';
import type { Lang, Localized } from '../i18n';

/** A ready-made starting map (historical or present-day borders). */
export interface LoadoutInfo {
  id: string;
  year: number;
  name: Localized;
  description: Localized;
}

/** A map listed in `maps/index.json`. */
export interface MapInfo {
  id: string;
  name: Localized;
  description: Localized;
  locations: number;
  provinces: number;
  areas: number;
  regions: number;
  loadouts: LoadoutInfo[];
}

/** Names of a map in one language, indexed like the corresponding entities. */
export interface MapNames {
  locations: string[];
  provinces: string[];
  areas: string[];
  regions: string[];
  countries: string[];
}

/** A map, as produced by `npm run generate`. */
export interface MapData {
  id: string;
  name: Localized;
  width: number;
  height: number;
  /** Number of identifiers, sea (0) included: locations go from 1 to count - 1. */
  count: number;
  /** Location identifier of each pixel (0 = sea). */
  ids: Uint16Array;
  /** Distance to the coast of each sea pixel, ×2, capped at 255. */
  coast: Uint8Array;
  locations: { province: number[]; x: number[]; y: number[]; size: number[]; neighbors: number[][] };
  provinces: { area: number[]; country: number[] };
  areas: { region: number[] };
  names: Partial<Record<Lang, MapNames>>;
  attribution: string;
  /** Locations of each province / area / region, precomputed. */
  provinceZones: number[][];
  areaZones: number[][];
  regionZones: number[][];
}

/** A loadout file: countries and the owner of every location (run-length encoded). */
export interface Loadout extends LoadoutInfo {
  locations: number;
  countries: { name: Localized; color: string }[];
  /** [value, length, value, length, …] of 1-based country indices (0 = unclaimed). */
  owner: number[];
}

export type Level = 'location' | 'province' | 'area' | 'region';

const base = `${import.meta.env.BASE_URL}maps/`;

export const thumbnailUrl = (id: string) => `${base}${encodeURIComponent(id)}/thumb.png`;

export async function loadIndex(): Promise<MapInfo[]> {
  const res = await fetch(`${base}index.json`);
  if (!res.ok) throw new Error(`maps/index.json not found (${res.status})`);
  return (await res.json()).maps;
}

export async function loadLoadout(mapId: string, loadoutId: string): Promise<Loadout> {
  const res = await fetch(`${base}${encodeURIComponent(mapId)}/loadouts/${encodeURIComponent(loadoutId)}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchPng(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} not found (${res.status})`);
  return decode(new Uint8Array(await res.arrayBuffer()));
}

export async function loadMap(id: string): Promise<MapData> {
  const dir = `${base}${encodeURIComponent(id)}/`;
  const [idsPng, coastPng, json] = await Promise.all([
    fetchPng(dir + 'ids.png'),
    fetchPng(dir + 'coast.png'),
    fetch(dir + 'zones.json').then((r) => {
      if (!r.ok) throw new Error(`zones.json not found (${r.status})`);
      return r.json();
    }),
  ]);
  if (idsPng.depth !== 16 || !(idsPng.data instanceof Uint16Array)) {
    throw new Error('ids.png must be a 16-bit greyscale image');
  }

  const count = json.locations.province.length as number;
  const provinceZones: number[][] = json.provinces.area.map(() => []);
  const areaZones: number[][] = json.areas.region.map(() => []);
  const regionZones: number[][] = json.regions.key.map(() => []);
  for (let z = 1; z < count; z++) {
    const p = json.locations.province[z];
    const a = json.provinces.area[p];
    provinceZones[p].push(z);
    areaZones[a].push(z);
    regionZones[json.areas.region[a]].push(z);
  }

  return {
    id,
    name: json.name,
    width: idsPng.width,
    height: idsPng.height,
    count,
    ids: idsPng.data,
    coast: coastPng.data as Uint8Array,
    locations: json.locations,
    provinces: json.provinces,
    areas: json.areas,
    names: json.names,
    attribution: json.attribution,
    provinceZones,
    areaZones,
    regionZones,
  };
}

/** Names of the map in a language, falling back to English. */
export const namesIn = (map: MapData, lang: Lang): MapNames => (map.names[lang] ?? map.names.en)!;

/** Every location affected by a click on `zone` at `level`. */
export function zonesOf(map: MapData, level: Level, zone: number): number[] {
  if (zone <= 0) return [];
  const p = map.locations.province[zone];
  switch (level) {
    case 'location':
      return [zone];
    case 'province':
      return map.provinceZones[p];
    case 'area':
      return map.areaZones[map.provinces.area[p]];
    case 'region':
      return map.regionZones[map.areas.region[map.provinces.area[p]]];
  }
}
