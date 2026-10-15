import type { Lang } from '../i18n';
import { countryName, type Country, type Overlay } from '../state/store';
import { LABEL_FONT } from './labels';

/** Countries listed in the legend; the others are summed up in one line. */
export const LEGEND_MAX_COUNTRIES = 14;

export interface LegendEntries {
  countries: { id: number; name: string; color: string; count: number }[];
  /** Painted countries not listed. */
  more: number;
  overlays: { id: number; name: string; color: string; style: Overlay['style']; count: number }[];
}

/** What the legend shows: painted countries, largest first, and the overlays in use. */
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
  const painted = countries
    .filter((c) => owned.get(c.id))
    .map((c) => ({ id: c.id, name: countryName(c, lang), color: c.color, count: owned.get(c.id)! }))
    .sort((a, b) => b.count - a.count);
  return {
    countries: painted.slice(0, LEGEND_MAX_COUNTRIES),
    more: Math.max(0, painted.length - LEGEND_MAX_COUNTRIES),
    overlays: overlays
      .filter((o) => marked.get(o.id))
      .map((o) => ({ id: o.id, name: o.name, color: o.color, style: o.style, count: marked.get(o.id)! })),
  };
}

const SHIELD = new Path2D('M0 0h20v11c0 6.5-4.6 10.8-10 13C4.6 21.8 0 17.5 0 11z');

/**
 * Draws the legend on a 2D canvas (used by the PNG export), with the look of the on-screen one:
 * a parchment card framed in gold. `u` is the size of one CSS pixel in canvas pixels.
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  e: LegendEntries,
  text: { title: string; more: (n: number) => string },
  x: number,
  bottom: number,
  u: number,
) {
  const rows = e.countries.length + (e.more ? 1 : 0) + e.overlays.length;
  if (!rows) return;
  const pad = 14 * u, rowH = 22 * u, titleH = 30 * u, gap = e.overlays.length && e.countries.length ? 10 * u : 0;
  ctx.save();
  ctx.font = `500 ${15 * u}px Alegreya, Georgia, serif`;
  const names = [...e.countries.map((c) => c.name), ...e.overlays.map((o) => o.name), e.more ? text.more(e.more) : ''];
  const width = Math.max(180 * u, ...names.map((n) => ctx.measureText(n).width + 36 * u)) + 2 * pad;
  const height = pad * 2 + titleH + rows * rowH + gap;
  const y = bottom - height;

  // card
  const grad = ctx.createLinearGradient(0, y, 0, y + height);
  grad.addColorStop(0, '#e9dcb8');
  grad.addColorStop(1, '#d8c69c');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgb(0 0 0 / 0.45)';
  ctx.shadowBlur = 24 * u;
  ctx.shadowOffsetY = 8 * u;
  ctx.fillRect(x, y, width, height);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#7d6233';
  ctx.lineWidth = u;
  ctx.strokeRect(x + 0.5 * u, y + 0.5 * u, width - u, height - u);
  ctx.strokeStyle = 'rgb(125 98 51 / 0.35)';
  ctx.lineWidth = 2 * u;
  ctx.strokeRect(x + 3 * u, y + 3 * u, width - 6 * u, height - 6 * u);

  // title
  ctx.fillStyle = '#2a1d12';
  ctx.font = `700 ${16 * u}px ${LABEL_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text.title.toUpperCase(), x + pad, y + pad + 10 * u);
  ctx.fillStyle = '#c4ae7f';
  ctx.fillRect(x + pad, y + pad + titleH - 8 * u, width - 2 * pad, u);

  let cy = y + pad + titleH + rowH / 2;
  const nameX = x + pad + 28 * u;
  ctx.font = `500 ${15 * u}px Alegreya, Georgia, serif`;
  for (const c of e.countries) {
    ctx.save();
    ctx.translate(x + pad + 2 * u, cy - 8.5 * u);
    ctx.scale(0.72 * u, 0.72 * u);
    ctx.fillStyle = c.color;
    ctx.fill(SHIELD);
    ctx.strokeStyle = 'rgb(0 0 0 / 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke(SHIELD);
    ctx.restore();
    ctx.fillStyle = '#2a1d12';
    ctx.fillText(c.name, nameX, cy);
    cy += rowH;
  }
  if (e.more) {
    ctx.fillStyle = '#5c4732';
    ctx.font = `italic 400 ${14 * u}px Alegreya, Georgia, serif`;
    ctx.fillText(text.more(e.more), nameX, cy);
    ctx.font = `500 ${15 * u}px Alegreya, Georgia, serif`;
    cy += rowH;
  }
  cy += gap;
  for (const o of e.overlays) {
    const sx = x + pad + 1 * u, sy = cy - 8 * u, s = 16 * u;
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
    ctx.fillText(o.name, nameX, cy);
    cy += rowH;
  }
  ctx.restore();
}
