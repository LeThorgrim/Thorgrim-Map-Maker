import type { Label } from './labels';
import type { MapRenderer } from './renderer';

/** A box in map pixels. */
export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Access to the map view from the rest of the interface (export, fit, zoom buttons, legend). */
export const view = {
  renderer: null as MapRenderer | null,
  /** Current name placements, and how to resolve a country id into a name and a colour. */
  labels: null as null | (() => { labels: Label[]; countryOf: (id: number) => { name: string; color: string } | undefined }),
  fit: () => {},
  zoomBy: (_factor: number) => {},
  /** Current zoom (screen pixels per map pixel). */
  zoom: () => 1,
  /** Zooms like the mouse wheel over the map (used by elements laid over it). */
  wheel: (_e: WheelEvent) => {},
  /** The element laid over the legend to move and resize it; positioned on every frame. */
  legendEl: null as HTMLElement | null,
  /** Where the legend was last drawn, in map pixels (null when hidden). */
  legendRect: null as MapRect | null,
};
