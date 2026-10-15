import type { Label } from './labels';
import type { MapRenderer } from './renderer';

/** Access to the map view from the rest of the interface (export, fit, zoom buttons). */
export const view = {
  renderer: null as MapRenderer | null,
  /** Current name placements, and how to resolve a country id into a name and a colour. */
  labels: null as null | (() => { labels: Label[]; countryOf: (id: number) => { name: string; color: string } | undefined }),
  fit: () => {},
  zoomBy: (_factor: number) => {},
};
