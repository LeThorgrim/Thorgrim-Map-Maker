// Reports provinces, areas and regions that are split into several pieces by land: a smaller
// piece that touches, by land, another group containing land of the same present-day country.
// Islands and pieces that only border other countries (e.g. Zeelandic Flanders) are accepted.
//
//   node generator/check-continuity.mjs [--id=europe]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = (process.argv.find((a) => a.startsWith('--id=')) ?? '--id=europe').slice(5);
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'maps', id, 'zones.json'), 'utf8'));
const L = d.locations;
const NZ = L.province.length;
const levels = {
  province: (z) => L.province[z],
  area: (z) => d.provinces.area[L.province[z]],
  region: (z) => d.areas.region[d.provinces.area[L.province[z]]],
};
const names = { province: d.names.en.provinces, area: d.names.en.areas, region: d.names.en.regions };
let total = 0;
for (const [level, groupOf] of Object.entries(levels)) {
  const seen = new Uint8Array(NZ);
  const pieces = new Map(); // group → [{zones, foreign}]
  for (let z = 1; z < NZ; z++) {
    if (seen[z]) continue;
    const g = groupOf(z);
    const list = [z];
    seen[z] = 1;
    let foreign = false;
    const country = d.provinces.country[L.province[z]];
    for (let i = 0; i < list.length; i++)
      for (const n of L.neighbors[list[i]]) {
        if (groupOf(n) !== g) foreign ||= d.provinces.country[L.province[n]] === country;
        else if (!seen[n]) (seen[n] = 1), list.push(n);
      }
    if (!pieces.has(g)) pieces.set(g, []);
    pieces.get(g).push({ zones: list, foreign });
  }
  const bad = [];
  for (const [g, ps] of pieces) {
    if (ps.length < 2) continue;
    ps.sort((a, b) => b.zones.length - a.zones.length);
    const size = (p) => p.zones.reduce((s, z) => s + L.size[z], 0);
    const total = ps.reduce((s, p) => s + size(p), 0);
    const exclaves = ps.slice(1).filter((p) => p.foreign);
    if (exclaves.length)
      bad.push(`${names[level][g]} (${exclaves.map((p) => `${d.names.en.locations[p.zones[0]]} ${Math.round((100 * size(p)) / total)}%`).join(', ')})`);
  }
  total += bad.length;
  console.log(`${level}: ${bad.length} split by land${bad.length ? ': ' + bad.slice(0, 25).join('; ') : ''}`);
}
process.exitCode = total ? 1 : 0;
