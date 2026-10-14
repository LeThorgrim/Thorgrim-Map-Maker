// Generates a playable map from real-world geographic data.
//
//   npm run generate -- [--id=europe] [--zones=5000] [--width=4096] [--seed=1337]
//
// 1. Coastlines (OpenStreetMap) → land/sea mask.
// 2. Administrative units (Natural Earth admin-1): départements, provinces, counties…
//    Units too small to hold a location are merged with a neighbour.
// 3. Each unit is split into evenly sized locations (density-weighted k-means; the density
//    fades towards the far north, the steppes and the deserts), then the EU rule is enforced:
//    no location is more than twice the size of any of its land neighbours.
// 4. Names: each location takes the name of the largest real town it contains.
// 5. Hierarchy: province = administrative unit (or a part of it when large),
//    area = administrative region, region = historical macro-region.
//
// Every user-facing name is written in each language of LANGS (see realdata.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createNoise2D } from 'simplex-noise';
import { encode } from 'fast-png';
import { FRAME, connectGraph, edt, graphKMeans, labelComponents, makeProjection, mulberry32, polygonsOf, scanRings } from './lib.mjs';
import { LANDSCAPE, LANGS, REGIONS, TOWN_CODES, historicRegion, regionLabel, townLabel } from './realdata.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'generator', '.cache');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const MAP_ID = String(args.id ?? 'europe');
const TARGET_ZONES = Number(args.zones ?? 5000);
const W = Number(args.width ?? 4096);
const SEED = Number(args.seed ?? 1337);
const OUT = path.join(ROOT, 'public', 'maps', MAP_ID);

const t0 = Date.now();
const log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s]`, ...m);
const rng = mulberry32(SEED);
const noise = createNoise2D(rng);

/** A label in every language. */
const same = (s) => Object.fromEntries(LANGS.map((l) => [l, s]));
const countryNames = Object.fromEntries(LANGS.map((l) => [l, new Intl.DisplayNames(l, { type: 'region' })]));
const countryLabel = (iso, fallback) =>
  Object.fromEntries(
    LANGS.map((l) => {
      try {
        return [l, countryNames[l].of(iso)];
      } catch {
        return [l, fallback];
      }
    }),
  );

// ================================================================ projection
const { projection, height: H } = makeProjection(W);
const N = W * H;
const stack = new Int32Array(N);
const comps = (same, labels) => labelComponents(W, H, same, labels, stack);
log(`Map ${W}×${H}`);

const inFrame = (coords) => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [lon, lat] of coords) (a = Math.min(a, lon)), (b = Math.max(b, lon)), (c = Math.min(c, lat)), (d = Math.max(d, lat));
  return b > -45 && a < 90 && d > 15 && c < 85;
};

// ================================================================ source data
async function cached(file, url) {
  const f = path.join(CACHE, file);
  if (!fs.existsSync(f)) {
    log(`Downloading ${url}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  return f;
}

function loadCoastline() {
  const f = path.join(CACHE, 'europe-land.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  log('Reading OSM coastlines (134 MB, only once)…');
  const geo = JSON.parse(fs.readFileSync(require.resolve('@geo-maps/earth-lands-10m/map.geo.json'), 'utf8'));
  const polys = [];
  for (const g of geo.geometries) for (const poly of polygonsOf(g)) if (inFrame(poly[0])) polys.push(poly);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(polys));
  return polys;
}

// Large inland waters missing from the coastline data.
const LAKES = [
  [[46.7, 44.5], [47.5, 45.6], [49.2, 46.4], [51.3, 47.0], [53.0, 46.8], [53.2, 45.3], [51.3, 44.5], [50.3, 44.3], [51.2, 43.2], [52.8, 41.8], [53.0, 40.6], [52.8, 39.3], [53.9, 37.3], [51.9, 36.6], [50.0, 37.3], [49.0, 38.4], [49.5, 40.2], [50.4, 40.4], [49.0, 41.2], [48.0, 42.4], [47.5, 43.1], [46.7, 44.5]],
  [[29.9, 60.0], [31.0, 59.95], [32.6, 60.5], [32.9, 61.2], [31.5, 61.6], [30.2, 61.3], [29.4, 60.6], [29.9, 60.0]],
  [[34.7, 60.9], [36.2, 61.2], [36.0, 62.0], [35.3, 62.9], [34.4, 62.5], [34.6, 61.6], [34.7, 60.9]],
];

const proj = (ring) => ring.map((pt) => projection(pt));

// ================================================================ land mask
const land = new Uint8Array(N);
{
  const rings = loadCoastline().flat().map(proj);
  scanRings(rings, W, H, (r, a, b) => land.fill(1, r * W + a, r * W + b + 1));
  scanRings(LAKES.map(proj), W, H, (r, a, b) => land.fill(0, r * W + a, r * W + b + 1));
  const lab = new Int32Array(N);
  // fill small lakes (< 120 px), remove specks of land (≤ 6 px)
  let { sizes } = comps((a, b) => !land[a] && !land[b], lab);
  for (let p = 0; p < N; p++) if (!land[p] && sizes[lab[p]] < 120) land[p] = 1;
  ({ sizes } = comps((a, b) => land[a] && land[b], lab));
  for (let p = 0; p < N; p++) if (land[p] && sizes[lab[p]] <= 6) land[p] = 0;
}
log('Land/sea mask ready');

// ================================================================ density
// Relative number of locations per unit of area: high in the heart of Europe, low in the far
// north, the steppes and the deserts. It varies slowly, which keeps neighbours of similar size.
function densityLonLat(lon, lat) {
  const k = Math.cos((lat * Math.PI) / 180);
  const blob = (lo, la, s, w) => w * Math.exp(-(((lon - lo) * k) ** 2 + (lat - la) ** 2) / (2 * s * s));
  let d = 1;
  d += blob(4, 50.5, 3.5, 1.6); // Low Countries, northern France
  d += blob(9, 50, 4, 1.0); // Rhineland, Holy Roman Empire
  d += blob(10, 45.3, 2.2, 1.4); // northern Italy
  d += blob(12.5, 42, 2.5, 0.7); // central Italy
  d += blob(-1, 52, 2.5, 0.7); // England
  d += blob(2, 46, 4, 0.5); // France
  d += blob(14, 50, 3, 0.5); // Bohemia
  d += blob(27, 40.5, 2.5, 0.6); // the Straits
  d += blob(31, 30.6, 1.2, 2.0); // Nile delta
  d += blob(36, 34, 2, 0.5); // Levant
  // smooth falloffs (no steps, so that neighbouring locations keep similar sizes)
  const ss = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  if (lat > 58) d *= Math.max(0.3, 1 - (lat - 58) * 0.09); // far north
  d *= 1 - 0.4 * ss(31, 35, lon) * ss(44.5, 47.5, lat); // steppes
  if (lon > 44) d *= Math.max(0.35, 1 - (lon - 44) * 0.08); // beyond the Volga
  const nile = Math.exp(-(((lon - 31.2) / 1.4) ** 2));
  d *= 1 - 0.8 * ss(33.5, 29.5, lat) * (1 - nile); // deserts, except the Nile valley
  d *= 1 - 0.4 * ss(35, 37.5, lon) * ss(34, 32, lat); // Arabia
  return d;
}
const GS = 8;
const gw = Math.ceil(W / GS) + 1, gh = Math.ceil(H / GS) + 1;
const densGrid = new Float32Array(gw * gh);
for (let j = 0; j < gh; j++)
  for (let i = 0; i < gw; i++) {
    const ll = projection.invert([i * GS, j * GS]);
    densGrid[j * gw + i] = densityLonLat(ll[0], ll[1]) * (1 + 0.12 * noise((i * GS) / 400, (j * GS) / 400));
  }
const densAt = (x, y) => densGrid[Math.min(gh - 1, Math.max(0, Math.round(y / GS))) * gw + Math.min(gw - 1, Math.max(0, Math.round(x / GS)))];
let densSum = 0;
for (let p = 0; p < N; p++) if (land[p]) densSum += densAt(p % W, (p / W) | 0);
const K = densSum / TARGET_ZONES;
/** Target area of a location around (x, y), in pixels. */
const targetAt = (x, y) => K / densAt(x, y);

// ================================================================ administrative units
const adminFile = await cached(
  'ne_admin1.geojson',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson',
);
const features = JSON.parse(fs.readFileSync(adminFile, 'utf8')).features.filter((f) =>
  polygonsOf(f.geometry).some((poly) => inFrame(poly[0])),
);
const adm = new Int32Array(N).fill(-1);
features.forEach((f, fi) => {
  for (const poly of polygonsOf(f.geometry)) {
    if (!inFrame(poly[0])) continue;
    scanRings(poly.map(proj), W, H, (r, a, b) => {
      for (let p = r * W + a; p <= r * W + b; p++) if (land[p]) adm[p] = fi;
    });
  }
});
// Natural Earth coastlines are coarser than OSM ones: uncovered land pixels take the nearest
// unit (first over land, then across water).
function bfsFill(through) {
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let p = 0; p < N; p++) if (adm[p] >= 0) q[qt++] = p;
  const seen = new Uint8Array(N);
  for (let i = 0; i < qt; i++) seen[q[i]] = 1;
  const lbl = Int32Array.from(adm);
  while (qh < qt) {
    const p = q[qh++];
    const x = p % W;
    for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
      if (n < 0 || n >= N || seen[n] || !through(n)) continue;
      seen[n] = 1;
      lbl[n] = lbl[p];
      if (land[n]) adm[n] = lbl[p];
      q[qt++] = n;
    }
  }
}
bfsFill((n) => land[n] === 1);
bfsFill(() => true);
log(`${features.length} administrative units rasterized`);

// Unit statistics
const F = features.length;
const fArea = new Float64Array(F), fW = new Float64Array(F), fX = new Float64Array(F), fY = new Float64Array(F);
const fAdj = Array.from({ length: F }, () => new Map());
for (let p = 0; p < N; p++) {
  const f = adm[p];
  if (f < 0) continue;
  const x = p % W, y = (p / W) | 0;
  fArea[f]++;
  fW[f] += 1 / targetAt(x, y);
  fX[f] += x;
  fY[f] += y;
  const link = (n) => {
    const g = adm[n];
    if (g >= 0 && g !== f) {
      fAdj[f].set(g, (fAdj[f].get(g) ?? 0) + 1);
      fAdj[g].set(f, (fAdj[g].get(f) ?? 0) + 1);
    }
  };
  if (x < W - 1) link(p + 1);
  if (p + W < N) link(p + W);
}
const props = features.map((f) => f.properties);
const isoOf = (fi) => {
  const p = props[fi];
  if (p.iso_a2 && p.iso_a2 !== '-1') return p.iso_a2;
  if (/Cyprus|Akrotiri|Dhekelia/i.test(`${p.admin} ${p.name}`)) return 'CY';
  return 'XX';
};
/** Localized, cleaned-up name of a Natural Earth unit ("Lesser Poland Voivodeship" → "Lesser Poland"). */
const unitLabel = (fi) => {
  const p = props[fi];
  const en = (p.name_en || p.name || p.admin)
    .replace(/\s+(Voivodeship|Oblast|Province|Governorate|County|Region|District|Municipality|Prefecture|Department|Canton)$/i, '')
    .replace(/\s*\(.*\)$/, '');
  const frRaw = p.name_fr && !/^(de |du |des |d')/i.test(p.name_fr) ? p.name_fr : en;
  const fr = frRaw
    .replace(/^(voïvodie|région|canton|voblast|oblast|province|gouvernorat|district) (de |du |des |d'|de la )/i, '')
    .replace(/\s*\(.*\)$/, '');
  return { en, fr };
};

// Merge units that are too small (under 0.85 expected location) with their administratively
// closest neighbour: same administrative region, otherwise same country, otherwise any.
const parent = Int32Array.from({ length: F }, (_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const uW = Float64Array.from(fW), uArea = Float64Array.from(fArea);
const uAdj = fAdj.map((m) => new Map(m));
const members = Array.from({ length: F }, (_, i) => [i]);
for (let changed = true; changed; ) {
  changed = false;
  const order = [...Array(F).keys()].filter((f) => find(f) === f && fArea[f] > 0).sort((a, b) => uW[a] - uW[b]);
  for (const u of order) {
    if (find(u) !== u || uW[u] >= 0.85) continue;
    const iso = isoOf(u), reg = props[u].region;
    let best = -1, bestScore = -1;
    for (const [v0, len] of uAdj[u]) {
      const v = find(v0);
      if (v === u) continue;
      const score = len * (isoOf(v) === iso ? (reg && props[v].region === reg ? 100 : 10) : 1);
      if (score > bestScore) (bestScore = score), (best = v);
    }
    if (best < 0) continue; // isolated island: stays on its own
    const [big, small] = uArea[best] >= uArea[u] ? [best, u] : [u, best];
    parent[small] = big;
    uW[big] += uW[small];
    uArea[big] += uArea[small];
    members[big].push(...members[small]);
    for (const [v, len] of uAdj[small]) if (find(v) !== big) uAdj[big].set(v, (uAdj[big].get(v) ?? 0) + len);
    changed = true;
  }
}

// Present-day countries and historical regions referenced by the units.
const countries = []; // { iso, label }
const countryIndex = new Map();
const countryOf = (iso, fallback) => {
  if (!countryIndex.has(iso)) {
    countryIndex.set(iso, countries.length);
    countries.push({ iso, label: countryLabel(iso, fallback) });
  }
  return countryIndex.get(iso);
};
const regionLabels = { ...REGIONS };

const unitIdx = new Int32Array(F).fill(-1);
const units = [];
for (let f = 0; f < F; f++) {
  if (find(f) !== f || fArea[f] === 0) continue;
  const mem = members[f].filter((m) => fArea[m] > 0).sort((a, b) => fArea[b] - fArea[a]);
  const lead = mem[0];
  let x = 0, y = 0;
  for (const m of mem) (x += fX[m]), (y += fY[m]);
  x /= uArea[f];
  y /= uArea[f];
  const [lon, lat] = projection.invert([x, y]);
  const iso = isoOf(lead);
  const country = countryOf(iso, props[lead].admin);
  // a group that gathers every unit of an administrative region takes that region's name
  const reg = props[lead].region;
  const sameReg = reg && mem.length >= 3 && mem.every((m) => props[m].region === reg);
  const regAll = sameReg && features.every((_, g) => props[g].region !== reg || fArea[g] === 0 || find(g) === f);
  let region = historicRegion(iso, lon, lat, props[lead]);
  if (!region) {
    region = `country-${iso}`;
    regionLabels[region] = countries[country].label;
  }
  units.push({
    name: (regAll && regionLabel(iso, reg)) || unitLabel(lead),
    iso,
    country,
    regionField: regionLabel(iso, reg),
    region,
    expected: uW[f],
    x,
    y,
  });
  unitIdx[f] = units.length - 1;
}
const unitOf = new Int32Array(N).fill(-1);
for (let p = 0; p < N; p++) if (adm[p] >= 0) unitOf[p] = unitIdx[find(adm[p])];
log(`${units.length} units after merging the smallest`);

// ================================================================ locations
// Pixels of each unit, grouped together (counting sort).
const U = units.length;
const uStart = new Int32Array(U + 1);
for (let p = 0; p < N; p++) if (unitOf[p] >= 0) uStart[unitOf[p] + 1]++;
for (let u = 0; u < U; u++) uStart[u + 1] += uStart[u];
const uPix = new Int32Array(uStart[U]);
{
  const fill = uStart.slice();
  for (let p = 0; p < N; p++) if (unitOf[p] >= 0) uPix[fill[unitOf[p]]++] = p;
}

// Seeds: density-weighted k-means in each unit, k = expected number of locations.
const seedX = [], seedY = [], seedUnit = [];
for (let u = 0; u < U; u++) {
  const a = uStart[u], b = uStart[u + 1];
  const k = Math.max(1, Math.round(units[u].expected));
  const step = Math.max(1, Math.floor((b - a) / 6000));
  const px = [], py = [], pw = [];
  for (let i = a; i < b; i += step) {
    const p = uPix[i], x = p % W, y = (p / W) | 0;
    px.push(x);
    py.push(y);
    pw.push(1 / targetAt(x, y));
  }
  const n = px.length;
  const cx = [], cy = [];
  // k-means++
  const d2 = new Float64Array(n).fill(Infinity);
  let i0 = Math.floor(rng() * n);
  for (let c = 0; c < Math.min(k, n); c++) {
    cx.push(px[i0]);
    cy.push(py[i0]);
    let tot = 0;
    for (let i = 0; i < n; i++) {
      d2[i] = Math.min(d2[i], ((px[i] - px[i0]) ** 2 + (py[i] - py[i0]) ** 2) * pw[i]);
      tot += d2[i];
    }
    let r = rng() * tot;
    for (let i = 0; i < n; i++) if ((r -= d2[i]) <= 0) {
      i0 = i;
      break;
    }
  }
  const assign = new Int32Array(n);
  for (let it = 0; it < 15; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < cx.length; c++) {
        const d = (px[i] - cx[c]) ** 2 + (py[i] - cy[c]) ** 2;
        if (d < bd) (bd = d), (best = c);
      }
      assign[i] = best;
    }
    const sx = new Float64Array(cx.length), sy = new Float64Array(cx.length), sw = new Float64Array(cx.length);
    for (let i = 0; i < n; i++) (sx[assign[i]] += px[i] * pw[i]), (sy[assign[i]] += py[i] * pw[i]), (sw[assign[i]] += pw[i]);
    for (let c = 0; c < cx.length; c++) if (sw[c]) (cx[c] = sx[c] / sw[c]), (cy[c] = sy[c] / sw[c]);
  }
  // each centre is snapped to the nearest pixel of the unit
  for (let c = 0; c < cx.length; c++) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (px[i] - cx[c]) ** 2 + (py[i] - cy[c]) ** 2;
      if (d < bd) (bd = d), (best = i);
    }
    seedX.push(px[best]);
    seedY.push(py[best]);
    seedUnit.push(u);
  }
}
// Every island (piece of a unit) large enough gets its own seed.
const piece = new Int32Array(N);
{
  const { sizes, first } = comps((a, b) => unitOf[a] >= 0 && unitOf[a] === unitOf[b], piece);
  const has = new Uint8Array(sizes.length);
  for (let s = 0; s < seedX.length; s++) has[piece[seedY[s] * W + seedX[s]]] = 1;
  for (let c = 0; c < sizes.length; c++) {
    const p = first[c], x = p % W, y = (p / W) | 0;
    if (!has[c] && sizes[c] >= 0.5 * targetAt(x, y)) {
      seedX.push(x);
      seedY.push(y);
      seedUnit.push(unitOf[p]);
    }
  }
}
log(`${seedX.length} seeds`);

// Noise-warped Voronoi, propagated pixel by pixel inside each unit.
const wx = new Float32Array(N), wy = new Float32Array(N);
for (let p = 0; p < N; p++) {
  if (unitOf[p] < 0) continue;
  const x = p % W, y = (p / W) | 0;
  wx[p] = x + 8 * noise(x / 45, y / 45) + 2.5 * noise(x / 13 + 40, y / 13 - 17);
  wy[p] = y + 8 * noise(x / 45 + 100, y / 45 + 50) + 2.5 * noise(x / 13 - 70, y / 13 + 23);
}
const cell = new Int32Array(N).fill(-1);
let cellX = Float64Array.from(seedX), cellY = Float64Array.from(seedY);
const cellUnit = [...seedUnit];
for (let s = 0; s < seedX.length; s++) cell[seedY[s] * W + seedX[s]] = s;

{
  const d2 = (p, s) => (wx[p] - cellX[s]) ** 2 + (wy[p] - cellY[s]) ** 2;
  for (let it = 0; it < 12; it++) {
    let changed = 0;
    for (const fwd of [true, false]) {
      const offs = fwd ? [-1, -W - 1, -W, -W + 1] : [1, W + 1, W, W - 1];
      const dxs = fwd ? [-1, -1, 0, 1] : [1, 1, 0, -1];
      for (let k = 0; k < N; k++) {
        const p = fwd ? k : N - 1 - k;
        if (unitOf[p] < 0) continue;
        const x = p % W, y = (p / W) | 0;
        let cur = cell[p];
        let best = cur >= 0 ? d2(p, cur) : Infinity;
        for (let t = 0; t < 4; t++) {
          const nx = x + dxs[t], ny = y + (t === 0 ? 0 : fwd ? -1 : 1);
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const n = p + offs[t];
          if (unitOf[n] !== unitOf[p]) continue;
          const c = cell[n];
          if (c < 0 || c === cur) continue;
          const d = d2(p, c);
          if (d < best) (best = d), (cur = c);
        }
        if (cur !== cell[p]) (cell[p] = cur), changed++;
      }
    }
    if (!changed) break;
  }
}

// Small islands without a seed join the nearest location of the same unit.
{
  const lab = new Int32Array(N);
  const { sizes, first } = comps((a, b) => unitOf[a] >= 0 && cell[a] < 0 && cell[b] < 0 && unitOf[a] === unitOf[b], lab);
  const target = sizes.map((_, c) => {
    const p = first[c], x = p % W, y = (p / W) | 0, u = unitOf[p];
    let best = -1, bd = Infinity;
    for (let s = 0; s < cellX.length; s++) {
      if (cellUnit[s] !== u) continue;
      const d = (cellX[s] - x) ** 2 + (cellY[s] - y) ** 2;
      if (d < bd) (bd = d), (best = s);
    }
    return best;
  });
  for (let p = 0; p < N; p++) if (lab[p] >= 0) cell[p] = target[lab[p]];
}

// ================================================================ location statistics
function cellStats(C = cellX.length) {
  const area = new Float64Array(C), sx = new Float64Array(C), sy = new Float64Array(C);
  const bx0 = new Int32Array(C).fill(W), by0 = new Int32Array(C).fill(H), bx1 = new Int32Array(C).fill(-1), by1 = new Int32Array(C).fill(-1);
  const adj = Array.from({ length: C }, () => new Map());
  for (let p = 0; p < N; p++) {
    const c = cell[p];
    if (c < 0) continue;
    const x = p % W, y = (p / W) | 0;
    area[c]++;
    sx[c] += x;
    sy[c] += y;
    if (x < bx0[c]) bx0[c] = x;
    if (x > bx1[c]) bx1[c] = x;
    if (y < by0[c]) by0[c] = y;
    if (y > by1[c]) by1[c] = y;
    const link = (n) => {
      const o = cell[n];
      if (o >= 0 && o !== c) {
        adj[c].set(o, (adj[c].get(o) ?? 0) + 1);
        adj[o].set(c, (adj[o].get(c) ?? 0) + 1);
      }
    };
    if (x < W - 1) link(p + 1);
    if (p + W < N) link(p + W);
  }
  for (let c = 0; c < C; c++) if (area[c]) (sx[c] /= area[c]), (sy[c] /= area[c]);
  return { area, cx: sx, cy: sy, bx0, by0, bx1, by1, adj };
}

// A detached fragment of a location joins the neighbour (of the same unit) it shares most border with.
function fixFragments() {
  const cc = new Int32Array(N);
  const { sizes } = comps((a, b) => cell[a] >= 0 && cell[a] === cell[b], cc);
  const ccCell = new Int32Array(sizes.length);
  for (let p = 0; p < N; p++) if (cc[p] >= 0) ccCell[cc[p]] = cell[p];
  const main = new Map();
  for (let c = 0; c < sizes.length; c++) {
    const m = main.get(ccCell[c]);
    if (m === undefined || sizes[c] > sizes[m]) main.set(ccCell[c], c);
  }
  const borders = new Map();
  const tally = (a, b) => {
    if (cc[a] === cc[b] || cc[b] < 0 || main.get(ccCell[cc[a]]) === cc[a]) return;
    if (unitOf[a] !== unitOf[b]) return;
    let m = borders.get(cc[a]);
    if (!m) borders.set(cc[a], (m = new Map()));
    m.set(cell[b], (m.get(cell[b]) ?? 0) + 1);
  };
  for (let p = 0; p < N; p++) {
    if (cc[p] < 0) continue;
    if (p % W < W - 1) tally(p, p + 1), cc[p + 1] >= 0 && tally(p + 1, p);
    if (p + W < N) tally(p, p + W), cc[p + W] >= 0 && tally(p + W, p);
  }
  const target = new Map();
  for (const [c, m] of borders) {
    let best = -1, bl = -1;
    for (const [z, l] of m) if (z !== ccCell[c] && l > bl) (bl = l), (best = z);
    if (best >= 0) target.set(c, best);
  }
  for (let p = 0; p < N; p++) if (cc[p] >= 0 && target.has(cc[p])) cell[p] = target.get(cc[p]);
  return target.size;
}
for (let i = 0; i < 4 && fixFragments() > 0; i++);

// ================================================================ the 2× rule
// No location may be more than twice the size of any of its land neighbours. Locations that are
// too small merge with a neighbour of the same unit; locations that are too large are cut in two.
function splitCell(c, st) {
  // Two halves of equal area, cut across the main axis of the location. The noise-warped
  // coordinates are projected so that the cut line stays organic.
  const pts = [];
  for (let y = st.by0[c]; y <= st.by1[c]; y++)
    for (let x = st.bx0[c]; x <= st.bx1[c]; x++) if (cell[y * W + x] === c) pts.push(y * W + x);
  if (pts.length < 8) return false;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = (p % W) - st.cx[c], dy = ((p / W) | 0) - st.cy[c];
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy); // main axis
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const along = pts.map((p) => wx[p] * ux + wy[p] * uy);
  const order = along.map((_, i) => i).sort((i, j) => along[i] - along[j]);
  const nc = cellX.length;
  let bx = 0, by = 0;
  for (let k = order.length >> 1; k < order.length; k++) {
    const p = pts[order[k]];
    cell[p] = nc;
    bx += p % W;
    by += (p / W) | 0;
  }
  const nb = order.length - (order.length >> 1);
  cellX = Float64Array.from([...cellX, bx / nb]);
  cellY = Float64Array.from([...cellY, by / nb]);
  cellUnit.push(cellUnit[c]);
  return true;
}

let violations = 0;
let bestSeen = Infinity, stale = 0;
for (let round = 0; round < 40; round++) {
  const st = cellStats();
  const perUnit = new Map();
  for (let c = 0; c < cellX.length; c++) if (st.area[c]) perUnit.set(cellUnit[c], (perUnit.get(cellUnit[c]) ?? 0) + 1);
  const pairs = [];
  for (let a = 0; a < cellX.length; a++)
    for (const [b, len] of st.adj[a]) if (len >= 3 && st.area[a] > 2 * st.area[b]) pairs.push([a, b, st.area[a] / st.area[b]]);
  violations = pairs.length;
  if (!pairs.length) break;
  // stop once the number of pairs no longer decreases (cases that cannot be solved)
  if (pairs.length < bestSeen) (bestSeen = pairs.length), (stale = 0);
  else if (++stale >= 4) break;
  pairs.sort((p, q) => q[2] - p[2]);
  const busy = new Set();
  let acted = 0;
  for (const [a, b] of pairs) {
    if (busy.has(a) || busy.has(b)) continue;
    const small = st.area[b] < 0.6 * targetAt(st.cx[b], st.cy[b]);
    if (small) {
      // preferably a neighbour of the same unit; a location alone in its (too small) unit, or a
      // truly tiny one, may join a neighbouring unit
      const alone =
        (![...st.adj[b].keys()].some((c) => cellUnit[c] === cellUnit[b]) && (perUnit.get(cellUnit[b]) ?? 0) === 1) ||
        st.area[b] < 0.35 * targetAt(st.cx[b], st.cy[b]);
      let best = -1;
      for (const [c] of st.adj[b])
        if ((alone || cellUnit[c] === cellUnit[b]) && !busy.has(c) && (best < 0 || st.area[c] < st.area[best])) best = c;
      if (best >= 0) {
        for (let y = st.by0[b]; y <= st.by1[b]; y++)
          for (let x = st.bx0[b]; x <= st.bx1[b]; x++)
            if (cell[y * W + x] === b) (cell[y * W + x] = best), (unitOf[y * W + x] = cellUnit[best]);
        busy.add(b).add(best);
        acted++;
        continue;
      }
    }
    // a normally sized location is only cut when its small neighbour cannot grow
    if (!small || st.area[a] > 1.2 * targetAt(st.cx[a], st.cy[a])) {
      if (splitCell(a, st)) {
        busy.add(a);
        acted++;
      }
    }
  }
  if (!acted) break;
  for (let i = 0; i < 3 && fixFragments() > 0; i++);
}
log(`2× rule: ${violations} neighbouring pair(s) still outside the rule`);

// Renumbering: 0 = sea, 1..n = locations, in reading order.
const remap = new Int32Array(cellX.length).fill(-1);
let NZ = 1;
for (let p = 0; p < N; p++) if (cell[p] >= 0 && remap[cell[p]] === -1) remap[cell[p]] = NZ++;
if (NZ > 65535) throw new Error('Too many locations for a 16-bit identifier');
const ids = new Uint16Array(N);
for (let p = 0; p < N; p++) ids[p] = cell[p] >= 0 ? remap[cell[p]] : 0;
const locUnit = new Int32Array(NZ).fill(-1);
for (let c = 0; c < cellX.length; c++) if (remap[c] > 0) locUnit[remap[c]] = cellUnit[c];
for (let p = 0; p < N; p++) cell[p] = ids[p] || -1;
const st = cellStats(NZ);
log(`${NZ - 1} locations`);

// Natural Earth unit covering most of each location (used by the loadout rules).
const adminList = []; // { iso, name }
const locAdmin = new Int32Array(NZ).fill(-1);
{
  const counts = Array.from({ length: NZ }, () => new Map());
  for (let p = 0; p < N; p++) if (ids[p] && adm[p] >= 0) counts[ids[p]].set(adm[p], (counts[ids[p]].get(adm[p]) ?? 0) + 1);
  const index = new Map();
  for (let z = 1; z < NZ; z++) {
    let best = -1, bc = -1;
    for (const [f, c] of counts[z]) if (c > bc) (bc = c), (best = f);
    if (best < 0) continue;
    if (!index.has(best)) {
      index.set(best, adminList.length);
      adminList.push({ iso: isoOf(best), name: props[best].name, region: props[best].region ?? '' });
    }
    locAdmin[z] = index.get(best);
  }
}

// ================================================================ location names
// Each location takes the name of the largest real town it contains.
const towns = require('all-the-cities')
  .filter((t) => TOWN_CODES.has(t.featureCode))
  .map((t) => {
    const [x, y] = projection(t.loc.coordinates);
    return { label: townLabel(t.name), pop: t.population, x, y };
  })
  .filter((t) => t.x >= 0 && t.y >= 0 && t.x < W && t.y < H)
  .sort((a, b) => b.pop - a.pop);
const locName = new Array(NZ).fill(null);
const locPop = new Float64Array(NZ);
const used = new Set(); // English names already taken
for (const t of towns) {
  const z = ids[Math.floor(t.y) * W + Math.floor(t.x)];
  if (!z || locName[z] || used.has(t.label.en)) continue;
  locName[z] = t.label;
  locPop[z] = t.pop;
  used.add(t.label.en);
}
// No town inside: the nearest free town within three location radii.
let unnamed = 0;
{
  const G = 64, gx = Math.ceil(W / G), grid = new Map();
  for (const t of towns) {
    const k = Math.floor(t.y / G) * gx + Math.floor(t.x / G);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
  }
  for (let z = 1; z < NZ; z++) {
    if (locName[z]) continue;
    const r = 3 * Math.sqrt(st.area[z]);
    let best = null, bd = r * r;
    const R = Math.ceil(r / G), cx = Math.floor(st.cx[z] / G), cy = Math.floor(st.cy[z] / G);
    for (let j = cy - R; j <= cy + R; j++)
      for (let i = cx - R; i <= cx + R; i++)
        for (const t of grid.get(j * gx + i) ?? []) {
          if (used.has(t.label.en)) continue;
          const d = (t.x - st.cx[z]) ** 2 + (t.y - st.cy[z]) ** 2;
          if (d < bd) (bd = d), (best = t);
        }
    if (best) {
      locName[z] = best.label;
      used.add(best.label.en);
    } else unnamed++;
  }
}
// Last resort (deserts, taiga): a landscape name after the nearest town.
for (let z = 1; z < NZ; z++) {
  if (locName[z]) continue;
  const region = units[locUnit[z]].region;
  const kind = Object.values(LANDSCAPE).find((k) => k.regions.includes(region)) ?? LANDSCAPE.country;
  const near = towns.map((t) => [(t.x - st.cx[z]) ** 2 + (t.y - st.cy[z]) ** 2, t.label]).sort((a, b) => a[0] - b[0]);
  for (const [, l] of near) {
    const label = Object.fromEntries(LANGS.map((lang) => [lang, kind[lang](l[lang])]));
    if (!used.has(label.en)) {
      locName[z] = label;
      used.add(label.en);
      break;
    }
  }
}
log(`Names assigned (${unnamed} location(s) without a nearby town)`);

// ================================================================ land continuity
/**
 * Makes groups (provinces, areas or regions) continuous by land. Each group keeps its largest
 * piece; every other piece that touches by land a group with the same parent (the provinces of
 * one unit, the areas of one region) joins the one it shares the longest border with, a group of
 * the same present-day country first. Failing
 * that, a small piece (under `maxShare` of the group) joins a neighbouring group of the same
 * present-day country. Islands, and pieces that only touch other countries (e.g. Zeelandic
 * Flanders), stay where they are.
 *
 * @param items     ids of the items (locations, provinces or areas)
 * @param groupOf   Map item → group, updated in place
 * @param landAdj   item → Map(neighbour item → border length in pixels, 0 = sea link)
 * @param size      item → area in pixels
 * @param country   item → present-day country index (or -1 when mixed)
 * @param parent    group → parent key (unit of a province, region of an area), or undefined
 * @param maxShare  largest share of its group that a piece may have to join another country group
 * @returns number of items moved
 */
function makeContiguous(items, groupOf, landAdj, size, country, parent = () => undefined, maxShare = 0.25) {
  let moved = 0;
  for (let round = 0; round < 10; round++) {
    const members = new Map();
    for (const it of items) {
      const g = groupOf.get(it);
      if (!members.has(g)) members.set(g, []);
      members.get(g).push(it);
    }
    const groupSize = new Map(), groupCountries = new Map();
    for (const [g, list] of members) {
      groupSize.set(g, list.reduce((s, it) => s + size(it), 0));
      groupCountries.set(g, new Set(list.map(country)));
    }
    const pieces = [];
    for (const [g, list] of members) {
      const seen = new Set();
      const ps = [];
      for (const start of list) {
        if (seen.has(start)) continue;
        const piece = [start];
        seen.add(start);
        for (let i = 0; i < piece.length; i++)
          for (const [n, len] of landAdj(piece[i]))
            if (len > 0 && !seen.has(n) && groupOf.get(n) === g) (seen.add(n), piece.push(n));
        ps.push(piece);
      }
      if (ps.length < 2) continue;
      ps.sort((a, b) => b.reduce((s, it) => s + size(it), 0) - a.reduce((s, it) => s + size(it), 0));
      for (const p of ps.slice(1)) pieces.push({ g, items: p, size: p.reduce((s, it) => s + size(it), 0) });
    }
    pieces.sort((a, b) => a.size - b.size);
    let changed = 0;
    for (const p of pieces) {
      const c = country(p.items[0]);
      const pp = parent(p.g);
      const border = new Map();
      for (const it of p.items)
        for (const [n, len] of landAdj(it)) {
          const h = groupOf.get(n);
          if (len > 0 && h !== undefined && h !== p.g) border.set(h, (border.get(h) ?? 0) + len);
        }
      const pickBest = (ok) => {
        let best, bl = 2;
        for (const [h, len] of border) if (ok(h) && len > bl) (bl = len), (best = h);
        return best;
      };
      const sameCountry = (h) => groupCountries.get(h)?.has(c);
      let best;
      if (pp !== undefined) best = pickBest((h) => parent(h) === pp && sameCountry(h)) ?? pickBest((h) => parent(h) === pp);
      if (best === undefined && p.size < maxShare * groupSize.get(p.g)) best = pickBest(sameCountry);
      if (best === undefined) continue;
      for (const it of p.items) groupOf.set(it, best);
      changed += p.items.length;
    }
    moved += changed;
    if (!changed) break;
  }
  return moved;
}

// ================================================================ provinces, areas, regions
const zoneAdj = st.adj.map((m) => new Map(m));
const provOf = new Int32Array(NZ).fill(-1);
const provinces = []; // { name, unit, zones[] }
const unitZones = Array.from({ length: U }, () => []);
for (let z = 1; z < NZ; z++) unitZones[locUnit[z]].push(z);
const BIG = 12;

const bigUnits = new Set();
for (let u = 0; u < U; u++) {
  const zs = unitZones[u];
  if (!zs.length) continue;
  if (zs.length < BIG) {
    zs.forEach((z) => (provOf[z] = provinces.length));
    provinces.push({ name: units[u].name, unit: u, zones: zs });
    continue;
  }
  // large unit: split into provinces of ~5 locations, named after their main town
  bigUnits.add(u);
  connectGraph(zoneAdj, st.cx, st.cy, zs);
  const { group, centers } = graphKMeans(zs, zoneAdj, st.cx, st.cy, st.area, Math.round(zs.length / 5), rng);
  const base = provinces.length;
  centers.forEach(() => provinces.push({ name: null, unit: u, zones: [] }));
  for (const z of zs) {
    provOf[z] = base + group.get(z);
    provinces[provOf[z]].zones.push(z);
  }
  for (let g = base; g < provinces.length; g++) {
    const cap = provinces[g].zones.reduce((a, b) => (locPop[b] > locPop[a] ? b : a));
    provinces[g].name = locName[cap];
  }
}
{
  const items = [...Array(NZ).keys()].slice(1);
  const groupOf = new Map(items.map((z) => [z, provOf[z]]));
  const moved = makeContiguous(items, groupOf, (z) => st.adj[z], (z) => st.area[z], (z) => units[locUnit[z]].country, (g) => provinces[g].unit, 0.5);
  for (const p of provinces) p.zones = [];
  for (const z of items) {
    provOf[z] = groupOf.get(z);
    provinces[provOf[z]].zones.push(z);
  }
  log(`Province continuity: ${moved} location(s) moved`);
}
const P = provinces.length;
const pX = new Float64Array(P), pY = new Float64Array(P), pW = new Float64Array(P), pPop = new Float64Array(P);
const pAdj = Array.from({ length: P }, () => new Map());
const pLand = Array.from({ length: P }, () => new Map()); // land borders only, in pixels
for (let z = 1; z < NZ; z++) {
  const p = provOf[z];
  pX[p] += st.cx[z] * st.area[z];
  pY[p] += st.cy[z] * st.area[z];
  pW[p] += st.area[z];
  pPop[p] += locPop[z];
  for (const [o, l] of zoneAdj[z]) if (provOf[o] !== p) pAdj[p].set(provOf[o], Math.max(pAdj[p].get(provOf[o]) ?? 0, l));
  for (const [o, l] of st.adj[z]) if (provOf[o] !== p) pLand[p].set(provOf[o], (pLand[p].get(provOf[o]) ?? 0) + l);
}
for (let p = 0; p < P; p++) (pX[p] /= pW[p]), (pY[p] /= pW[p]);

// Areas: a large unit forms its own area; other provinces are grouped by administrative region
// (Natural Earth "region" field), otherwise by country, in batches of ~5.
const areas = []; // { name, region, provinces[] }
const areaOf = new Int32Array(P).fill(-1);
const groups = new Map();
for (let p = 0; p < P; p++) {
  const u = units[provinces[p].unit];
  if (bigUnits.has(provinces[p].unit)) {
    const key = `big:${provinces[p].unit}`;
    if (!groups.has(key)) groups.set(key, { name: u.name, region: u.region, list: [], fixed: true });
    groups.get(key).list.push(p);
    continue;
  }
  const key = `${u.region}|${u.iso}|${u.regionField?.en ?? ''}`;
  if (!groups.has(key)) groups.set(key, { name: u.regionField, region: u.region, iso: u.iso, list: [] });
  groups.get(key).list.push(p);
}
const provCountByIsoRegion = new Map();
for (let p = 0; p < P; p++) {
  const u = units[provinces[p].unit];
  provCountByIsoRegion.set(`${u.region}|${u.iso}`, (provCountByIsoRegion.get(`${u.region}|${u.iso}`) ?? 0) + 1);
}
for (const g of groups.values()) {
  // an administrative region stays whole up to 12 provinces; otherwise batches of ~5
  const k = g.fixed || g.list.length <= (g.name ? 12 : 8) ? 1 : Math.round(g.list.length / 5);
  let parts;
  if (k <= 1) parts = [g.list];
  else {
    connectGraph(pAdj, pX, pY, g.list);
    const { group, centers } = graphKMeans(g.list, pAdj, pX, pY, pW, k, rng);
    parts = centers.map(() => []);
    for (const p of g.list) parts[group.get(p)].push(p);
  }
  for (const part of parts) {
    if (!part.length) continue;
    const biggest = part.reduce((a, b) => (pPop[b] > pPop[a] ? b : a));
    let name = g.name;
    if (!name || parts.length > 1) {
      const wholeCountry = !g.fixed && parts.length === 1 && provCountByIsoRegion.get(`${g.region}|${g.iso}`) === part.length;
      name = wholeCountry ? countries[units[provinces[biggest].unit].country].label : provinces[biggest].name;
    }
    for (const p of part) areaOf[p] = areas.length;
    areas.push({ name, region: g.region, provinces: part, auto: !g.name || parts.length > 1 });
  }
}
{
  const items = [...Array(P).keys()];
  const groupOf = new Map(items.map((p) => [p, areaOf[p]]));
  const moved = makeContiguous(items, groupOf, (p) => pLand[p], (p) => pW[p], (p) => units[provinces[p].unit].country, (g) => areas[g].region);
  for (const a of areas) a.provinces = [];
  for (const p of items) {
    areaOf[p] = groupOf.get(p);
    areas[areaOf[p]].provinces.push(p);
  }
  // areas named after a province take the name of their largest remaining one
  for (const a of areas)
    if (a.auto && a.provinces.length) a.name = provinces[a.provinces.reduce((x, y) => (pPop[y] > pPop[x] ? y : x))].name;
  log(`Area continuity: ${moved} province(s) moved`);
}
{
  // regions: items are areas; an area's country is the one of most of its provinces
  const aLand = areas.map(() => new Map());
  const aSize = areas.map((a) => a.provinces.reduce((s, p) => s + pW[p], 0));
  const aCountry = areas.map((a) => {
    const n = new Map();
    for (const p of a.provinces) n.set(units[provinces[p].unit].country, (n.get(units[provinces[p].unit].country) ?? 0) + pW[p]);
    return [...n].sort((x, y) => y[1] - x[1])[0]?.[0] ?? -1;
  });
  for (let p = 0; p < P; p++)
    for (const [o, l] of pLand[p]) if (areaOf[o] !== areaOf[p]) aLand[areaOf[p]].set(areaOf[o], (aLand[areaOf[p]].get(areaOf[o]) ?? 0) + l);
  const items = areas.map((_, i) => i).filter((i) => areas[i].provinces.length);
  const groupOf = new Map(items.map((i) => [i, areas[i].region]));
  const moved = makeContiguous(items, groupOf, (i) => aLand[i], (i) => aSize[i], (i) => aCountry[i]);
  for (const i of items) areas[i].region = groupOf.get(i);
  log(`Region continuity: ${moved} area(s) moved`);
}
// Duplicate area names (e.g. two batches around the same city) get the name of a province.
for (const lang of LANGS) {
  const seen = new Map();
  for (const a of areas) seen.set(a.name[lang], (seen.get(a.name[lang]) ?? 0) + 1);
  for (const a of areas)
    if (seen.get(a.name[lang]) > 1) a.name = { ...a.name, [lang]: `${a.name[lang]} (${provinces[a.provinces[0]].name[lang]})` };
}
const regionKeys = [...new Set(areas.map((a) => a.region))].sort((a, b) => regionLabels[a].en.localeCompare(regionLabels[b].en));
log(`${P} provinces, ${areas.length} areas, ${regionKeys.length} regions`);

// ================================================================ distance to the coast
const coast = new Uint8Array(N);
{
  const g = new Float64Array(N);
  for (let p = 0; p < N; p++) g[p] = ids[p] ? 0 : 1e12;
  edt(g, W, H);
  for (let p = 0; p < N; p++) coast[p] = Math.min(255, Math.round(Math.sqrt(g[p]) * 2));
}

// ================================================================ thumbnail
function thumbnail(tw) {
  const th = Math.round((tw * H) / W), s = W / tw;
  const rgb = new Uint8Array(tw * th * 3);
  const regionOfZone = (z) => (z ? regionKeys.indexOf(areas[areaOf[provOf[z]]].region) : -1);
  const tint = (i) => {
    const h = Math.imul(i + 11, 2654435761) >>> 0;
    return [196 + (h & 31) - 16, 192 + ((h >> 5) & 31) - 16, 170 + ((h >> 10) & 31) - 16];
  };
  for (let j = 0; j < th; j++)
    for (let i = 0; i < tw; i++) {
      const p = Math.floor(j * s) * W + Math.floor(i * s);
      const z = ids[p];
      let c;
      if (!z) {
        const d = Math.min(1, coast[p] / 140);
        c = [141 - 64 * d, 166 - 64 * d, 173 - 59 * d];
      } else {
        c = tint(regionOfZone(z));
        const r = regionOfZone(ids[p + Math.ceil(s)] ?? 0), b = regionOfZone(ids[p + Math.ceil(s) * W] ?? 0);
        if ((r >= 0 && r !== regionOfZone(z)) || (b >= 0 && b !== regionOfZone(z))) c = c.map((v) => v * 0.6);
      }
      rgb.set(c.map(Math.round), (j * tw + i) * 3);
    }
  return encode({ width: tw, height: th, data: rgb, depth: 8, channels: 3 });
}

// ================================================================ output
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'ids.png'), encode({ width: W, height: H, data: ids, depth: 16, channels: 1 }));
fs.writeFileSync(path.join(OUT, 'coast.png'), encode({ width: W, height: H, data: coast, depth: 8, channels: 1 }));
fs.writeFileSync(path.join(OUT, 'thumb.png'), thumbnail(720));
const r1 = (v) => Math.round(v * 10) / 10;
const zoneList = [...Array(NZ).keys()].slice(1);
const meta = {
  id: MAP_ID,
  name: args.name ? same(String(args.name)) : { en: 'Europe and the Mediterranean', fr: 'Europe et Méditerranée' },
  description: args.description
    ? same(String(args.description))
    : {
        en: 'From Iceland to the Nile and from Lisbon to the Volga: real towns, present-day provinces and historical regions.',
        fr: "De l'Islande au Nil et de Lisbonne à la Volga : villes réelles, provinces actuelles et grandes régions historiques.",
      },
  locations: NZ - 1,
  provinces: P,
  areas: areas.length,
  regions: regionKeys.length,
};
const namesIn = (lang) => ({
  locations: locName.map((l) => (l ? l[lang] : '')),
  provinces: provinces.map((p) => p.name[lang]),
  areas: areas.map((a) => a.name[lang]),
  regions: regionKeys.map((k) => regionLabels[k][lang]),
  countries: countries.map((c) => c.label[lang]),
});
const data = {
  version: 3,
  ...meta,
  width: W,
  height: H,
  projection: { ...FRAME, width: W },
  attribution: 'Coastlines © OpenStreetMap contributors (ODbL) · Boundaries: Natural Earth · Towns: GeoNames',
  languages: LANGS,
  locations: {
    province: [-1, ...zoneList.map((z) => provOf[z])],
    admin: [-1, ...zoneList.map((z) => locAdmin[z])],
    x: [0, ...zoneList.map((z) => r1(st.cx[z]))],
    y: [0, ...zoneList.map((z) => r1(st.cy[z]))],
    size: [0, ...zoneList.map((z) => st.area[z])],
    neighbors: [[], ...zoneList.map((z) => [...st.adj[z].keys()].sort((a, b) => a - b))],
  },
  provinces: {
    area: provinces.map((_, p) => areaOf[p]),
    country: provinces.map((p) => units[p.unit].country),
  },
  areas: { region: areas.map((a) => regionKeys.indexOf(a.region)) },
  regions: { key: regionKeys },
  countries: { iso: countries.map((c) => c.iso) },
  admin: { iso: adminList.map((a) => a.iso), name: adminList.map((a) => a.name), region: adminList.map((a) => a.region) },
  names: Object.fromEntries(LANGS.map((l) => [l, namesIn(l)])),
};
fs.writeFileSync(path.join(OUT, 'zones.json'), JSON.stringify(data));

// index of available maps (loadouts listed by the loadouts script are kept)
const indexFile = path.join(ROOT, 'public', 'maps', 'index.json');
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { maps: [] };
const previous = index.maps.find((m) => m.id === MAP_ID);
index.maps = [...index.maps.filter((m) => m.id !== MAP_ID), { ...meta, loadouts: previous?.loadouts ?? [] }].sort((a, b) =>
  a.id.localeCompare(b.id),
);
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
for (const f of ['ids.png', 'coast.png', 'thumb.png', 'zones.json'])
  log(`${MAP_ID}/${f}: ${(fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2)} MB`);
