import type { MapData } from './loadMap';

/**
 * Placement of a country name, in map pixels. Computed once per paint (it does not depend on
 * the name or the language); the font size is fitted to the text when drawing.
 */
export interface Label {
  country: number;
  /** Centre of the text. */
  x: number;
  y: number;
  /** Direction of the text, in radians (always reads left to right). */
  angle: number;
  /** Length available along that direction, inside the country. */
  length: number;
  /** Thickness of the country at that point (twice the distance to its border). */
  thickness: number;
}

/** Resolution of the computation: one cell for F × F map pixels. */
const F = 4;
/** Pieces smaller than this (in cells) get no name. */
const MIN_CELLS = 10;

/** Exact Euclidean distance transform (Felzenszwalb & Huttenlocher), in place on squared distances. */
function edt(g: Float32Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float32Array(n), d = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = 0;
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
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
}

/**
 * Where to write the name of each country: on its largest piece, at the point farthest from its
 * borders (the "pole of inaccessibility"), along the main axis of the piece.
 */
export function computeLabels(map: MapData, owner: Uint16Array): Label[] {
  const w = Math.ceil(map.width / F), h = Math.ceil(map.height / F);
  const N = w * h;
  // country and location of each cell (0 = sea or unclaimed)
  const own = new Uint16Array(N), loc = new Uint16Array(N);
  const locCells = new Uint32Array(map.count);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = Math.min(map.width - 1, x * F + (F >> 1)), py = Math.min(map.height - 1, y * F + (F >> 1));
      const z = map.ids[py * map.width + px];
      loc[y * w + x] = z;
      own[y * w + x] = z ? owner[z] : 0;
      locCells[z]++;
    }

  // connected pieces of each country
  const comp = new Int32Array(N).fill(-1);
  // weight of a piece = its number of locations (a vast desert colony weighs less than the
  // densely divided homeland, whatever their surfaces)
  const sizes: number[] = [], owners: number[] = [], weights: number[] = [];
  const stack = new Int32Array(N);
  for (let p = 0; p < N; p++) {
    if (comp[p] !== -1 || !own[p]) continue;
    const id = sizes.length, o = own[p];
    let sp = 0, size = 0, weight = 0;
    stack[sp++] = p;
    comp[p] = id;
    while (sp) {
      const q = stack[--sp];
      size++;
      weight += 1 / locCells[loc[q]];
      const x = q % w;
      for (const n of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, q - w, q + w])
        if (n >= 0 && n < N && comp[n] === -1 && own[n] === o) {
          comp[n] = id;
          stack[sp++] = n;
        }
    }
    sizes.push(size);
    owners.push(o);
    weights.push(weight);
  }
  // the main piece of each country (most locations), plus any other piece that is large too
  // (Algeria for France in 1914), each labelled on its own
  const main = new Map<number, number>();
  sizes.forEach((s, c) => {
    const o = owners[c], b = main.get(o);
    if (s >= MIN_CELLS && (b === undefined || weights[c] > weights[b])) main.set(o, c);
  });
  if (!main.size) return [];
  const kept = new Uint8Array(sizes.length);
  const pieces: [number, number][] = []; // [country, piece]
  sizes.forEach((s, c) => {
    const m = main.get(owners[c]);
    if (m === undefined) return;
    if (c === m || (s >= 25 * MIN_CELLS && weights[c] >= 0.3 * weights[m])) {
      kept[c] = 1;
      pieces.push([owners[c], c]);
    }
  });

  // distance of every cell to the border of its piece
  const dist = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    const c = comp[p], x = p % w, y = (p / w) | 0;
    const inside = c >= 0 && x > 0 && y > 0 && x < w - 1 && y < h - 1 &&
      comp[p - 1] === c && comp[p + 1] === c && comp[p - w] === c && comp[p + w] === c;
    dist[p] = inside ? 1e9 : 0;
  }
  edt(dist, w, h);

  // pole, centroid and covariance of each kept piece
  const C = sizes.length;
  const pole = new Int32Array(C).fill(-1), poleD = new Float32Array(C);
  const sx = new Float64Array(C), sy = new Float64Array(C), sxx = new Float64Array(C), syy = new Float64Array(C), sxy = new Float64Array(C);
  for (let p = 0; p < N; p++) {
    const c = comp[p];
    if (c < 0 || !kept[c]) continue;
    const x = p % w, y = (p / w) | 0;
    sx[c] += x;
    sy[c] += y;
    sxx[c] += x * x;
    syy[c] += y * y;
    sxy[c] += x * y;
    if (dist[p] > poleD[c]) {
      poleD[c] = dist[p];
      pole[c] = p;
    }
  }

  const inPiece = (x: number, y: number, c: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < w && yi < h && comp[yi * w + xi] === c;
  };
  /** Length of the straight run through (x, y) along (ux, uy) that stays in piece c. */
  const run = (x: number, y: number, ux: number, uy: number, c: number) => {
    let a = 0, b = 0;
    while (inPiece(x + ux * (a + 0.5), y + uy * (a + 0.5), c)) a += 0.5;
    while (inPiece(x - ux * (b + 0.5), y - uy * (b + 0.5), c)) b += 0.5;
    return { a, b };
  };

  const labels: Label[] = [];
  for (const [country, c] of pieces) {
    const n = sizes[c];
    const mx = sx[c] / n, my = sy[c] / n;
    const cxx = sxx[c] / n - mx * mx, cyy = syy[c] / n - my * my, cxy = sxy[c] / n - mx * my;
    let angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    // a nearly round country gets horizontal text
    const spread = Math.sqrt((cxx - cyy) ** 2 + 4 * cxy * cxy) / (cxx + cyy || 1);
    if (spread < 0.25) angle = 0;
    // reads left to right, and never steeper than 60°
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    angle = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, angle));
    const ux = Math.cos(angle), uy = Math.sin(angle);

    // two candidate anchors: the pole, and the centroid when it lies well inside
    const candidates: [number, number][] = [[pole[c] % w, (pole[c] / w) | 0]];
    const cIdx = Math.round(my) * w + Math.round(mx);
    if (inPiece(mx, my, c) && Math.sqrt(dist[cIdx]) >= 0.6 * Math.sqrt(poleD[c])) candidates.push([mx, my]);
    let chosen: Label | null = null;
    for (const [x, y] of candidates) {
      const { a, b } = run(x, y, ux, uy, c);
      const t = 2 * Math.sqrt(dist[Math.round(y) * w + Math.round(x)]);
      const length = a + b;
      // centre the text on the run; score = the room it leaves for a name of average length
      const score = Math.min(length / 6, t);
      if (!chosen || score > Math.min(chosen.length / 6, chosen.thickness))
        chosen = { country, x: x + (ux * (a - b)) / 2, y: y + (uy * (a - b)) / 2, angle, length, thickness: t };
    }
    if (chosen)
      labels.push({
        ...chosen,
        x: (chosen.x + 0.5) * F,
        y: (chosen.y + 0.5) * F,
        length: chosen.length * F,
        thickness: chosen.thickness * F,
      });
  }
  return labels;
}

export const LABEL_FONT = "'Cinzel', 'Trajan Pro', Georgia, serif";

/** Relative luminance of a #rrggbb colour (0 = black, 1 = white). */
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface LabelView {
  /** Screen (or image) pixels per map pixel. */
  scale: number;
  /** Map point drawn at the origin of the context. */
  originX: number;
  originY: number;
  /** Labels whose text would be smaller than this, in context pixels, are not drawn. */
  minSize: number;
  /**
   * Labels larger than this fade out (fully gone at twice the size): zoomed in, the names of
   * large countries would cover the map. Omitted for the export.
   */
  fadeFrom?: number;
}

/** Small words left out of initials ("Kingdom of France" → "KF"). */
const MINOR_WORDS = new Set([
  'OF', 'THE', 'AND', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'D', 'L', 'VON', 'DER', 'DIE', 'DI', 'DEL', 'DA', 'Y', 'E',
]);

/**
 * The forms a country name can take on the map, longest first: the full name, then initials for a
 * name of several words ("Holy Roman Empire" → "HRE"), or a cut word for a single word
 * ("Castile" → "CAST.", then "CAS.").
 */
export function nameForms(name: string): string[] {
  const full = name.trim().toUpperCase();
  if (!full) return [];
  const words = full.split(/[\s\-–'’]+/).filter(Boolean);
  if (words.length > 1) {
    const major = words.filter((w) => !MINOR_WORDS.has(w));
    const initials = (major.length >= 2 ? major : words).map((w) => [...w][0]).join('');
    return [full, initials];
  }
  const letters = [...full];
  const forms = [full];
  for (const n of [4, 3]) if (letters.length > n + 1) forms.push(letters.slice(0, n).join('') + '.');
  return forms;
}

/**
 * Draws the country names, EU style: Roman capitals spaced out, dark ink on light countries and
 * light text on dark ones, sized to fit the country and following its main axis.
 */
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: Label[],
  countryOf: (id: number) => { name: string; color: string } | undefined,
  view: LabelView,
) {
  const spacing = 0.14; // letter spacing, in em
  const hasSpacing = 'letterSpacing' in ctx;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const l of labels) {
    const country = countryOf(l.country);
    if (!country) continue;
    // the full name first, then shorter forms when it does not fit
    let text = '';
    let size = 0;
    ctx.font = `700 100px ${LABEL_FONT}`;
    if (hasSpacing) ctx.letterSpacing = '0px';
    for (const candidate of nameForms(country.name)) {
      // width of the text at 100 px, letter spacing included
      const em = ctx.measureText(candidate).width / 100 + (hasSpacing ? spacing * candidate.length : 0);
      const s = Math.min((0.82 * l.length) / em, 0.62 * l.thickness) * view.scale;
      if (s >= view.minSize) {
        text = candidate;
        size = s;
        break;
      }
    }
    if (!text) continue;
    const fade = view.fadeFrom ? Math.min(1, Math.max(0, (2 * view.fadeFrom - size) / view.fadeFrom)) : 1;
    if (fade <= 0) continue;
    const x = (l.x - view.originX) * view.scale, y = (l.y - view.originY) * view.scale;
    const dark = luminance(country.color) < 0.18;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y);
    ctx.rotate(l.angle);
    ctx.font = `700 ${size}px ${LABEL_FONT}`;
    if (hasSpacing) ctx.letterSpacing = `${size * spacing}px`;
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.strokeStyle = dark ? 'rgb(18 13 9 / 0.55)' : 'rgb(240 226 190 / 0.35)';
    ctx.fillStyle = dark ? 'rgb(243 230 196 / 0.92)' : 'rgb(42 29 18 / 0.82)';
    // letter spacing adds a trailing space: shift by half of it to stay centred
    const shift = hasSpacing ? (size * spacing) / 2 : 0;
    ctx.strokeText(text, shift, 0);
    ctx.fillText(text, shift, 0);
    ctx.restore();
  }
  ctx.restore();
}
