import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { LEGEND_MIN, legendUnit } from '../map/legend';
import { view, type MapRect } from '../map/view';
import { useStore } from '../state/store';

/** Edges and corners that resize the legend; 'move' drags it. */
type Grip = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const GRIPS: Grip[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/**
 * Invisible frame laid over the legend drawn on the map (see MapCanvas): dragging it moves the
 * legend, its edges and corners resize it. The legend keeps the height of its content until it
 * is resized vertically. Double-click puts it back at its default place.
 */
export function LegendHandle() {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    el.hidden = true; // shown by MapCanvas once the legend is drawn
    view.legendEl = el;
    // the wheel zooms the map, as anywhere else on it
    const wheel = (e: WheelEvent) => view.wheel(e);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', wheel);
      view.legendEl = null;
    };
  }, []);

  const start = (e: React.PointerEvent, grip: Grip) => {
    if (e.button !== 0 || !view.legendRect) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const s = useStore.getState();
    const map = s.map!;
    const from: MapRect = { ...view.legendRect };
    const autoHeight = !s.legend || s.legend.h == null;
    const zoom = view.zoom();
    const u = legendUnit(map.width);
    const minW = LEGEND_MIN.w * u, minH = LEGEND_MIN.h * u;
    const x0 = e.clientX, y0 = e.clientY;
    setActive(true);

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / zoom, dy = (ev.clientY - y0) / zoom;
      let { x, y, w, h } = from;
      if (grip === 'move') {
        x += dx;
        y += dy;
      } else {
        if (grip.includes('e')) w = Math.max(minW, w + dx);
        if (grip.includes('w')) {
          w = Math.max(minW, w - dx);
          x = from.x + from.w - w;
        }
        if (grip.includes('s')) h = Math.max(minH, h + dy);
        if (grip.includes('n')) {
          h = Math.max(minH, h - dy);
          y = from.y + from.h - h;
        }
      }
      // the legend stays on the map
      w = Math.min(w, map.width);
      h = Math.min(h, map.height);
      x = Math.min(Math.max(0, x), map.width - w);
      y = Math.min(Math.max(0, y), map.height - h);
      const vertical = grip !== 'move' && /[ns]/.test(grip);
      useStore.getState().setLegend({ x, y, w, h: autoHeight && !vertical ? null : h });
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setActive(false);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  return (
    <div
      ref={ref}
      className={active ? 'legend-handle active' : 'legend-handle'}
      title={t.legend.handle}
      onPointerDown={(e) => start(e, 'move')}
      onDoubleClick={() => useStore.getState().setLegend(null)}
      onPointerEnter={() => useStore.getState().setHover(0)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {GRIPS.map((g) => (
        <span key={g} className={`grip ${g}`} onPointerDown={(e) => start(e, g)} />
      ))}
    </div>
  );
}
