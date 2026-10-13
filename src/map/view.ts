import type { MapRenderer } from './renderer';

/** Access to the map view from the rest of the interface (export, fit, zoom buttons). */
export const view = {
  renderer: null as MapRenderer | null,
  fit: () => {},
  zoomBy: (_factor: number) => {},
};
