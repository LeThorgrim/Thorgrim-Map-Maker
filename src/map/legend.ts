import type { Lang } from '../i18n';
import { countryName, type Country, type LegendBox, type Overlay } from '../state/store';
import { LABEL_FONT } from './labels';

/** Countries listed while the legend takes the height of its content; the others are summed up. */
export const LEGEND_MAX_COUNTRIES = 14;

export interface LegendEntries {
  /** Painted countries shown in the legend, most locations first. */
  countries: { id: number; name: string; color: string; count: number }[];
  /** Overlays in use shown in the legend, most locations first. */
  overlays: { id: number; name: string; color: string; style: Overlay['style']; count: number }[];
}

/** What the legend can show: painted countries and overlays in use, the largest first. */
export function legendEntries(
  countries: Country[],
  overlays: Overlay[],
  owner: Uint16Array,
  outline: Uint16Array,
  hatch: Uint16Array,
  count: number,
  lang: Lang,
): LegendEntries {
  const owned = new Map<number, number>(), marked = new Map<number, number>();
  for (let z = 1; z < count; z++) {
    if (owner[z]) owned.set(owner[z], (owned.get(owner[z]) ?? 0) + 1);
    if (outline[z]) marked.set(outline[z], (marked.get(outline[z]) ?? 0) + 1);
    if (hatch[z]) marked.set(hatch[z], (marked.get(hatch[z]) ?? 0) + 1);
  }
  return {
    countries: countries
      .filter((c) => !c.hideLegend && owned.get(c.id))
      .map((c) => ({ id: c.id, name: countryName(c, lang), color: c.color, count: owned.get(c.id)! }))
      .sort((a, b) => b.count - a.count),
    overlays: overlays
      .filter((o) => !o.hideLegend && marked.get(o.id))
      .map((o) => ({ id: o.id, name: o.name, color: o.color, style: o.style, count: marked.get(o.id)! }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Title written on the legend: the user's, or the default one; null when hidden. */
export const legendTitleOf = (s: { legendTitle: string; legendShowTitle: boolean }, fallback: string) =>
  s.legendShowTitle ? s.legendTitle.trim() || fallback : null;

export const isEmpty = (e: LegendEntries) => !e.countries.length && !e.overlays.length;

/** Size of one legend "pixel", in map pixels: the legend is drawn as on a 1600 px wide screen. */
export const legendUnit = (mapWidth: number) => mapWidth / 1600;

/** Smallest size of the legend, in legend pixels. */
export const LEGEND_MIN = { w: 130, h: 70 };

/**
 * Where to draw the legend, in map pixels. Without a saved box it sits at the bottom left, as
 * wide and as tall as its content.
 */
export function legendPlacement(legend: LegendBox | null, mapWidth: number, mapHeight: number): Placement {
  const u = legendUnit(mapWidth);
  return legend ?? { x: 24 * u, bottom: mapHeight - 24 * u, w: null, h: null };
}

export interface Placement {
  x: number;
  /** Top edge; when absent, the legend is laid upwards from `bottom`. */
  y?: number;
  bottom?: number;
  /** null: as wide as the content. */
  w: number | null;
  /** null: as tall as the content. */
  h: number | null;
}

const SHIELD = new Path2D('M0 0h20v11c0 6.5-4.6 10.8-10 13C4.6 21.8 0 17.5 0 11z');
const NAME_FONT = (u: number) => `500 ${15 * u}px Alegreya, Georgia, serif`;
const MORE_FONT = (u: number) => `italic 400 ${14 * u}px Alegreya, Georgia, serif`;

/** Shortens a text with an ellipsis until it fits the width (the font must already be set). */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > width) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

/**
 * Draws the legend, a parchment card framed in gold, in the coordinates of the context (map
 * pixels, whatever the transform). `unit` is the size of one legend pixel in those coordinates,
 * `layout` the text size and column spacing chosen in the display menu (and the size of the map,
 * which the legend never leaves), and `deviceScale` the size of one coordinate unit in device pixels (shadows ignore the transform).
 *
 * A wide enough legend lays its entries out in several columns, filled top to bottom: countries
 * first, then overlays below them. A legend too short for all its rows keeps the overlays and sums
 * up the countries left out. Returns the box actually drawn.
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  e: LegendEntries,
  /** `title` null: no title, the entries start at the top. */
  text: { title: string | null; more: (n: number) => string },
  place: Placement,
  unit: number,
  deviceScale: number,
  layout: { scale: number; columnGap: number; bounds?: { w: number; h: number } } = { scale: 1, columnGap: 18 },
) {
  // the text size scales every row; the column spacing is set on its own
  const u = unit * layout.scale;
  const pad = 14 * u, rowH = 22 * u, titleH = text.title == null ? 0 : 30 * u, gapH = 10 * u, colGap = layout.columnGap * unit, swatchW = 28 * u;
  ctx.save();

  // width: as wide as one column of content, unless set by the user
  ctx.font = NAME_FONT(u);
  const natural = Math.max(
    ...e.countries.map((c) => ctx.measureText(c.name).width),
    ...e.overlays.map((o) => ctx.measureText(o.name).width),
    e.countries.length > LEGEND_MAX_COUNTRIES ? ctx.measureText(text.more(e.countries.length)).width : 0,
    0,
  );
  const colNatural = Math.min(240 * u, Math.max(120 * u, natural + swatchW + 8 * u));
  const width = place.w ?? Math.max(180 * u, natural + swatchW + 8 * u + 2 * pad);
  const inner = width - 2 * pad;
  const cols = place.w == null ? 1 : Math.max(1, Math.floor((inner + colGap) / (colNatural + colGap)));
  const colW = (inner - colGap * (cols - 1)) / cols;

  // rows: countries fill `cRows` rows of every column, overlays `oRows` rows below them
  let countries = e.countries, more = 0;
  let overlays = e.overlays;
  const fitCountries = (capacity: number) => {
    if (countries.length > capacity) {
      const shown = Math.max(0, capacity - 1);
      more = capacity > 0 ? countries.length - shown : 0; // the summary takes the last slot
      countries = countries.slice(0, shown);
    }
  };
  const rowsOf = (n: number) => Math.ceil(n / cols);
  if (place.h == null) {
    fitCountries(LEGEND_MAX_COUNTRIES * cols);
  } else {
    const both = e.countries.length > 0 && e.overlays.length > 0;
    const rows = Math.max(0, Math.floor((place.h - 2 * pad - titleH - (both ? gapH : 0)) / rowH));
    overlays = overlays.slice(0, rows * cols);
    fitCountries((rows - rowsOf(overlays.length)) * cols);
  }
  const cRows = rowsOf(countries.length + (more ? 1 : 0));
  const oRows = rowsOf(overlays.length);
  const gap = cRows && oRows ? gapH : 0;
  const height = place.h ?? pad * 2 + titleH + (cRows + oRows) * rowH + gap;
  // a legend growing with its content (or its text size) stays on the map
  const x = layout.bounds ? Math.max(0, Math.min(place.x, layout.bounds.w - width)) : place.x;
  let y = place.y ?? (place.bottom ?? 0) - height;
  if (layout.bounds) y = Math.max(0, Math.min(y, layout.bounds.h - height));

  // card
  const grad = ctx.createLinearGradient(0, y, 0, y + height);
  grad.addColorStop(0, '#e9dcb8');
  grad.addColorStop(1, '#d8c69c');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgb(0 0 0 / 0.45)';
  ctx.shadowBlur = 24 * u * deviceScale;
  ctx.shadowOffsetY = 8 * u * deviceScale;
  ctx.fillRect(x, y, width, height);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#7d6233';
  ctx.lineWidth = u;
  ctx.strokeRect(x + 0.5 * u, y + 0.5 * u, width - u, height - u);
  ctx.strokeStyle = 'rgb(125 98 51 / 0.35)';
  ctx.lineWidth = 2 * u;
  ctx.strokeRect(x + 3 * u, y + 3 * u, width - 6 * u, height - 6 * u);

  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  // title
  ctx.textBaseline = 'middle';
  if (text.title != null) {
    ctx.fillStyle = '#2a1d12';
    ctx.font = `700 ${16 * u}px ${LABEL_FONT}`;
    ctx.fillText(fit(ctx, text.title.toUpperCase(), inner), x + pad, y + pad + 10 * u);
    ctx.fillStyle = '#c4ae7f';
    ctx.fillRect(x + pad, y + pad + titleH - 8 * u, inner, u);
  }

  // cell i of a block starting at `top`, laid out column by column
  const top0 = y + pad + titleH + rowH / 2;
  const cell = (i: number, rows: number, top: number) => ({
    cx: x + pad + Math.floor(i / rows) * (colW + colGap),
    cy: top + (i % rows) * rowH,
  });
  const nameW = colW - swatchW;

  ctx.font = NAME_FONT(u);
  countries.forEach((c, i) => {
    const { cx, cy } = cell(i, cRows, top0);
    ctx.save();
    ctx.translate(cx + 2 * u, cy - 8.5 * u);
    ctx.scale(0.72 * u, 0.72 * u);
    ctx.fillStyle = c.color;
    ctx.fill(SHIELD);
    ctx.strokeStyle = 'rgb(0 0 0 / 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke(SHIELD);
    ctx.restore();
    ctx.fillStyle = '#2a1d12';
    ctx.fillText(fit(ctx, c.name, nameW), cx + swatchW, cy);
  });
  if (more) {
    const { cx, cy } = cell(countries.length, cRows, top0);
    ctx.fillStyle = '#5c4732';
    ctx.font = MORE_FONT(u);
    ctx.fillText(fit(ctx, text.more(more), nameW), cx + swatchW, cy);
    ctx.font = NAME_FONT(u);
  }
  const top1 = top0 + cRows * rowH + gap;
  overlays.forEach((o, i) => {
    const { cx, cy } = cell(i, oRows, top1);
    const sx = cx + 1 * u, sy = cy - 8 * u, s = 16 * u;
    ctx.fillStyle = '#d8c69c';
    ctx.fillRect(sx, sy, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, s, s);
    ctx.clip();
    ctx.strokeStyle = o.color;
    if (o.style === 'hatch') {
      ctx.lineWidth = 2.5 * u;
      for (let k = -s; k < s * 2; k += 5 * u) {
        ctx.beginPath();
        ctx.moveTo(sx + k, sy + s);
        ctx.lineTo(sx + k + s, sy);
        ctx.stroke();
      }
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(sx + u, sy + u, s - 2 * u, s - 2 * u);
    } else {
      ctx.lineWidth = 6 * u;
      ctx.strokeRect(sx + 3 * u, sy + 3 * u, s - 6 * u, s - 6 * u);
    }
    ctx.restore();
    ctx.fillStyle = '#2a1d12';
    ctx.fillText(fit(ctx, o.name, nameW), cx + swatchW, cy);
  });
  ctx.restore();
  return { x, y, w: width, h: height };
}
