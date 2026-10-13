// Builds the loadouts (ready-made starting maps) of a generated map.
//
//   npm run loadouts -- [--id=europe] [--only=1444]
//
// A loadout assigns each location to a country. Historical loadouts start from a snapshot of
// historical-basemaps (https://github.com/aourednik/historical-basemaps), then apply the rules of
// loadouts/<id>.mjs; the present-day loadout uses the Natural Earth country of each location.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from 'fast-png';
import { makeProjection, polygonsOf, scanRings } from './lib.mjs';
import { LANGS } from './realdata.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'generator', '.cache');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const MAP_ID = String(args.id ?? 'europe');
const SCENARIOS = args.only ? [String(args.only)] : ['1444', '1914', 'today'];
const DIR = path.join(ROOT, 'public', 'maps', MAP_ID);

const data = JSON.parse(fs.readFileSync(path.join(DIR, 'zones.json'), 'utf8'));
const { width: W, height: H, data: ids } = decode(fs.readFileSync(path.join(DIR, 'ids.png')));
const { projection } = makeProjection(data.projection.width, data.projection);
const NZ = data.locations.province.length;

// Locations as seen by the rules.
const locs = [null];
for (let z = 1; z < NZ; z++) {
  const [lon, lat] = projection.invert([data.locations.x[z], data.locations.y[z]]);
  const a = data.locations.admin[z];
  locs.push({
    id: z,
    lon,
    lat,
    iso: a >= 0 ? data.admin.iso[a] : 'XX',
    adm: a >= 0 ? data.admin.name[a] : '',
    region: a >= 0 ? data.admin.region[a] : '',
  });
}

async function cached(file, url) {
  const f = path.join(CACHE, file);
  if (!fs.existsSync(f)) {
    console.log(`Downloading ${url}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  return f;
}

/** Country key of each location according to a historical-basemaps snapshot (majority of pixels). */
async function fromBasemap(file, names) {
  const f = await cached(file, `https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/${file.replace(/^hb_/, 'world_')}`);
  const features = JSON.parse(fs.readFileSync(f, 'utf8')).features;
  const keys = [];
  const raster = new Int16Array(W * H).fill(-1);
  const unknown = new Map();
  for (const ft of features) {
    const p = ft.properties;
    const key = names[p.NAME] ?? names[p.SUBJECTO];
    if (key === undefined) {
      if (p.NAME) unknown.set(p.NAME, (unknown.get(p.NAME) ?? 0) + 1);
      continue;
    }
    let k = keys.indexOf(key);
    if (k < 0) k = keys.push(key) - 1;
    for (const poly of polygonsOf(ft.geometry)) {
      const rings = poly.map((ring) => ring.map((pt) => projection(pt)));
      scanRings(rings, W, H, (r, a, b) => {
        for (let q = r * W + a; q <= r * W + b; q++) if (ids[q]) raster[q] = k;
      });
    }
  }
  const counts = Array.from({ length: NZ }, () => new Map());
  for (let q = 0; q < W * H; q++) if (ids[q] && raster[q] >= 0) counts[ids[q]].set(raster[q], (counts[ids[q]].get(raster[q]) ?? 0) + 1);
  const owner = new Array(NZ).fill(null);
  for (let z = 1; z < NZ; z++) {
    let best = -1, bc = 0;
    for (const [k, c] of counts[z]) if (c > bc) (bc = c), (best = k);
    if (best >= 0 && bc >= 0.4 * data.locations.size[z]) owner[z] = keys[best];
  }
  return { owner, unknown };
}

/** Distinct colours for countries without a fixed one: never the colour of a neighbour. */
const PALETTE = ['#B5473A', '#3E6FB0', '#D8A62E', '#4F8A4B', '#7B4E9C', '#2E9A9A', '#C86F2D', '#9C3D6B', '#6B7F2A', '#2F4E8C', '#A88B5A', '#5B9BD5', '#D45E80', '#3C6E57', '#8E5A3C', '#E0C14A', '#6E6E9E', '#B0B05A', '#9E5A5A', '#5A9E8C'];

async function build(name) {
  const def = (await import(`./loadouts/${name}.mjs`)).default;
  let owner;
  if (def.presentDay) owner = locs.map((l) => (l ? l.iso : null));
  else {
    const base = await fromBasemap(def.base, def.baseNames);
    owner = base.owner;
    if (base.unknown.size) console.log(`  ${name}: base names without a country:`, [...base.unknown.keys()].slice(0, 30).join(', '));
  }
  for (const [key, ...selectors] of def.rules) for (let z = 1; z < NZ; z++) if (selectors.some((s) => s(locs[z]))) owner[z] = key;
  if (def.fillGaps)
    for (let it = 0; it < 4; it++)
      for (let z = 1; z < NZ; z++) {
        if (owner[z]) continue;
        const nb = data.locations.neighbors[z].map((n) => owner[n]).filter(Boolean);
        const tally = new Map();
        for (const k of nb) tally.set(k, (tally.get(k) ?? 0) + 1);
        for (const [k, c] of tally) if (c > data.locations.neighbors[z].length / 2) owner[z] = k;
      }
  if (def.fillGaps) {
    // islands missing from the base map take the country of the nearest owned location (≤ 250 km)
    const km = (a, b) => 111 * Math.hypot((a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180), a.lat - b.lat);
    for (let z = 1; z < NZ; z++) {
      if (owner[z] || data.locations.neighbors[z].length) continue;
      let best = null, bd = 250;
      for (let o = 1; o < NZ; o++) if (owner[o] && data.locations.neighbors[o].length && km(locs[z], locs[o]) < bd) (bd = km(locs[z], locs[o])), (best = owner[o]);
      owner[z] = best;
    }
  }

  // countries, largest first
  const size = new Map();
  for (let z = 1; z < NZ; z++) if (owner[z]) size.set(owner[z], (size.get(owner[z]) ?? 0) + 1);
  const keys = [...size.keys()].sort((a, b) => size.get(b) - size.get(a));
  const labelOf = (key) => {
    if (def.countries?.[key]) return Object.fromEntries(LANGS.map((l) => [l, def.countries[key][l]]));
    return Object.fromEntries(
      LANGS.map((l) => {
        try {
          return [l, new Intl.DisplayNames(l, { type: 'region' }).of(key)];
        } catch {
          return [l, key];
        }
      }),
    );
  };
  const colors = new Map(keys.map((k) => [k, def.countries?.[k]?.color ?? def.colors?.[k]]));
  const nbOf = new Map(keys.map((k) => [k, new Set()]));
  for (let z = 1; z < NZ; z++)
    for (const n of data.locations.neighbors[z]) if (owner[z] && owner[n] && owner[n] !== owner[z]) nbOf.get(owner[z]).add(owner[n]);
  const used = new Map();
  for (const k of keys) {
    if (colors.get(k)) continue;
    const taken = new Set([...nbOf.get(k)].map((n) => colors.get(n)).filter(Boolean));
    const choice = PALETTE.filter((c) => !taken.has(c)).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0] ?? PALETTE[0];
    colors.set(k, choice);
    used.set(choice, (used.get(choice) ?? 0) + 1);
  }

  // run-length encoding of 1-based country indices
  const index = new Map(keys.map((k, i) => [k, i + 1]));
  const runs = [];
  for (let z = 0; z < NZ; ) {
    const v = owner[z] ? index.get(owner[z]) : 0;
    let len = 1;
    while (z + len < NZ && (owner[z + len] ? index.get(owner[z + len]) : 0) === v) len++;
    runs.push(v, len);
    z += len;
  }
  const out = {
    id: def.id,
    year: def.year,
    name: def.name,
    description: def.description,
    locations: NZ,
    countries: keys.map((k) => ({ name: labelOf(k), color: colors.get(k) })),
    owner: runs,
  };
  fs.mkdirSync(path.join(DIR, 'loadouts'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'loadouts', `${def.id}.json`), JSON.stringify(out));
  const unowned = owner.slice(1).filter((o) => !o).length;
  console.log(
    `${def.id}: ${keys.length} countries, ${unowned} unclaimed locations. Largest: ${keys
      .slice(0, 12)
      .map((k) => `${labelOf(k).en} ${size.get(k)}`)
      .join(', ')}`,
  );
  return { id: def.id, year: def.year, name: def.name, description: def.description };
}

const built = [];
for (const s of SCENARIOS) built.push(await build(s));

// list the loadouts in the map index
const indexFile = path.join(ROOT, 'public', 'maps', 'index.json');
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const entry = index.maps.find((m) => m.id === MAP_ID);
if (entry) {
  const others = (entry.loadouts ?? []).filter((l) => !built.some((b) => b.id === l.id));
  entry.loadouts = [...others, ...built].sort((a, b) => a.year - b.year);
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
}
