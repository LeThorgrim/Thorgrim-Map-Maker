// Raster geometry and graph helpers shared by the generator scripts.

import { geoConicConformal } from 'd3-geo';

/** The map frame: the projection is rebuilt from these values by every script. */
export const FRAME = { lon0: -13, lon1: 45, lat0: 28.5, lat1: 67, parallels: [38, 60] };

/** Conic projection fitted to the frame at the given pixel width. Returns the projection and the height. */
export function makeProjection(width, frame = FRAME) {
  const { lon0, lon1, lat0, lat1, parallels } = frame;
  const boundary = [];
  for (let lon = lon0; lon <= lon1; lon += 0.5) boundary.push([lon, lat0], [lon, lat1]);
  for (let lat = lat0; lat <= lat1; lat += 0.5) boundary.push([lon0, lat], [lon1, lat]);
  const projection = geoConicConformal()
    .rotate([-(lon0 + lon1) / 2, 0])
    .parallels(parallels)
    .fitWidth(width, { type: 'MultiPoint', coordinates: boundary });
  let maxY = -Infinity;
  for (const p of boundary) maxY = Math.max(maxY, projection(p)[1]);
  return { projection, height: Math.ceil(maxY) };
}

export const polygonsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Even-odd scanline fill of rings already projected to pixels. Calls `span(row, x0, x1)` for
 * every inside run (inclusive bounds).
 */
export function scanRings(rings, W, H, span) {
  let y0 = Infinity, y1 = -Infinity;
  for (const ring of rings) for (const p of ring) (y0 = Math.min(y0, p[1])), (y1 = Math.max(y1, p[1]));
  const r0 = Math.max(0, Math.ceil(y0 - 0.5)), r1 = Math.min(H - 1, Math.ceil(y1 - 0.5) - 1);
  if (r1 < r0) return;
  const rows = Array.from({ length: r1 - r0 + 1 }, () => []);
  for (const ring of rings) {
    let prev = ring[ring.length - 1];
    for (const cur of ring) {
      const [xa, ya] = prev, [xb, yb] = cur;
      prev = cur;
      if (ya === yb) continue;
      const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
      const a = Math.max(r0, Math.ceil(lo - 0.5)), b = Math.min(r1, Math.ceil(hi - 0.5) - 1);
      const slope = (xb - xa) / (yb - ya);
      for (let r = a; r <= b; r++) rows[r - r0].push(xa + (r + 0.5 - ya) * slope);
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const xs = rows[i].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      if (b >= a) span(r0 + i, a, b);
    }
  }
}

/** 4-connected components of the pixels p where same(p, neighbour) holds. */
export function labelComponents(W, H, same, labels, stack) {
  const N = W * H;
  labels.fill(-1);
  const sizes = [];
  const first = [];
  for (let p = 0; p < N; p++) {
    if (labels[p] !== -1 || !same(p, p)) continue;
    const id = sizes.length;
    let sp = 0, size = 0;
    stack[sp++] = p;
    labels[p] = id;
    while (sp) {
      const q = stack[--sp];
      size++;
      const x = q % W;
      if (x > 0 && labels[q - 1] === -1 && same(q, q - 1)) (labels[q - 1] = id), (stack[sp++] = q - 1);
      if (x < W - 1 && labels[q + 1] === -1 && same(q, q + 1)) (labels[q + 1] = id), (stack[sp++] = q + 1);
      if (q >= W && labels[q - W] === -1 && same(q, q - W)) (labels[q - W] = id), (stack[sp++] = q - W);
      if (q + W < N && labels[q + W] === -1 && same(q, q + W)) (labels[q + W] = id), (stack[sp++] = q + W);
    }
    sizes.push(size);
    first.push(p);
  }
  return { sizes, first };
}

/** Exact Euclidean distance transform (Felzenszwalb & Huttenlocher), in place on g (squared distances). */
export function edt(g, W, H) {
  const L = Math.max(W, H);
  const f = new Float64Array(L), d = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  const pass = (n) => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s;
      for (;;) {
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s <= z[k]) k--;
        else break;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    pass(H);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    pass(W);
    for (let x = 0; x < W; x++) g[y * W + x] = d[x];
  }
}

// ------------------------------------------------------------------ binary heap
export function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const pi = (i - 1) >> 1;
    if (h[pi][0] <= h[i][0]) break;
    [h[pi], h[i]] = [h[i], h[pi]];
    i = pi;
  }
}
export function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}

/** Links each component of a graph (islands) to the nearest one with a "sea link" (weight 0). */
export function connectGraph(adj, cx, cy, nodes) {
  const inSet = new Set(nodes);
  for (;;) {
    const compOf = new Map();
    const comps = [];
    for (const s of nodes) {
      if (compOf.has(s)) continue;
      const list = [s];
      compOf.set(s, comps.length);
      for (let i = 0; i < list.length; i++)
        for (const n of adj[list[i]].keys())
          if (inSet.has(n) && !compOf.has(n)) {
            compOf.set(n, comps.length);
            list.push(n);
          }
      comps.push(list);
    }
    if (comps.length <= 1) return;
    comps.sort((a, b) => a.length - b.length);
    const list = comps[0];
    const c = compOf.get(list[0]);
    let best = Infinity, ba = -1, bb = -1;
    for (const a of list)
      for (const b of nodes) {
        if (compOf.get(b) === c) continue;
        const d = (cx[a] - cx[b]) ** 2 + (cy[a] - cy[b]) ** 2;
        if (d < best) (best = d), (ba = a), (bb = b);
      }
    adj[ba].set(bb, 0);
    adj[bb].set(ba, 0);
  }
}

/**
 * Groups `nodes` into k compact, connected clusters: k-means++ centres, assignment by Dijkstra
 * over the graph (distance between centroids), re-centring, and repeat.
 */
export function graphKMeans(nodes, adj, cx, cy, weight, k, rng) {
  const group = new Map();
  if (k <= 1 || nodes.length <= 1) {
    for (const n of nodes) group.set(n, 0);
    return { group, centers: [nodes[0]] };
  }
  const inSet = new Set(nodes);
  const dist = (a, b) => Math.hypot(cx[a] - cx[b], cy[a] - cy[b]);
  const centers = [nodes[Math.floor(rng() * nodes.length)]];
  const dmin = new Map(nodes.map((n) => [n, Infinity]));
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let total = 0;
    for (const n of nodes) {
      dmin.set(n, Math.min(dmin.get(n), dist(n, last) ** 2 * weight[n]));
      total += dmin.get(n);
    }
    if (total <= 0) break;
    let r = rng() * total;
    for (const n of nodes) {
      r -= dmin.get(n);
      if (r <= 0) {
        if (dmin.get(n) > 0) centers.push(n);
        break;
      }
    }
  }
  const K = centers.length;
  for (let it = 0; it < 10; it++) {
    const best = new Map();
    group.clear();
    const h = [];
    centers.forEach((c, g) => {
      best.set(c, 0);
      heapPush(h, [0, c, g]);
    });
    while (h.length) {
      const [d, n, g] = heapPop(h);
      if (d > (best.get(n) ?? Infinity) || group.has(n)) continue;
      group.set(n, g);
      for (const [o, len] of adj[n]) {
        if (!inSet.has(o)) continue;
        const nd = d + dist(n, o) * (len === 0 ? 1.5 : 1);
        if (nd < (best.get(o) ?? Infinity)) {
          best.set(o, nd);
          heapPush(h, [nd, o, g]);
        }
      }
    }
    const sx = new Float64Array(K), sy = new Float64Array(K), sw = new Float64Array(K);
    for (const n of nodes) {
      const g = group.get(n);
      sx[g] += cx[n] * weight[n];
      sy[g] += cy[n] * weight[n];
      sw[g] += weight[n];
    }
    const bd = new Float64Array(K).fill(Infinity);
    for (const n of nodes) {
      const g = group.get(n);
      const d = (cx[n] - sx[g] / sw[g]) ** 2 + (cy[n] - sy[g] / sw[g]) ** 2;
      if (d < bd[g]) (bd[g] = d), (centers[g] = n);
    }
  }
  return { group, centers };
}
