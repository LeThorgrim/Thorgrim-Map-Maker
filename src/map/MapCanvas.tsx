import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { zonesOf, type Level, type MapData } from './loadMap';
import { MapRenderer, type Camera } from './renderer';
import { view } from './view';

const MAX_ZOOM = 4;
const PANEL = 312; // width of the side panel, kept clear when fitting the map

interface Mods {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}
function levelFor(e: Mods, base: Level): Level {
  if (e.altKey) return 'region';
  if (e.ctrlKey || e.metaKey) return 'area';
  if (e.shiftKey) return 'province';
  return base;
}

export function MapCanvas({ map }: { map: MapData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new MapRenderer(canvas, map);
    view.renderer = r;
    const cam: Camera = { x: map.width / 2, y: map.height / 2, zoom: 0.25 };
    let raf = 0;
    const request = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          r.draw(cam);
        });
    };

    const minZoom = () => Math.min(canvas.clientWidth / map.width, canvas.clientHeight / map.height) * 0.6;
    const clamp = () => {
      cam.zoom = Math.min(MAX_ZOOM, Math.max(minZoom(), cam.zoom));
      cam.x = Math.min(map.width, Math.max(0, cam.x));
      cam.y = Math.min(map.height, Math.max(0, cam.y));
    };
    const fit = () => {
      const w = canvas.clientWidth - PANEL, h = canvas.clientHeight;
      cam.zoom = Math.min(w / map.width, h / map.height) * 0.98;
      cam.x = map.width / 2 - PANEL / 2 / cam.zoom;
      cam.y = map.height / 2;
      request();
    };
    view.fit = fit;
    view.zoomBy = (f) => {
      cam.zoom *= f;
      clamp();
      request();
    };

    let fitted = false;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      if (!fitted) {
        fit();
        fitted = true;
      }
      request();
    });
    ro.observe(canvas);

    // ---------------------------------------------------------- store bindings
    const st = useStore.getState();
    r.setPalette(st.countries);
    r.setOwners(st.owner);
    r.setOverlays(st.overlays);
    r.setMarks(st.outline, st.hatch);
    let mods: Mods = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };
    let lastHighlight = '';
    const updateHighlight = () => {
      const s = useStore.getState();
      const lvl = s.tool === 'pick' ? 'location' : levelFor(mods, s.level);
      const zones = panning ? [] : zonesOf(map, lvl, s.hover);
      const key = `${lvl}:${zones[0] ?? 0}:${zones.length}`;
      if (key === lastHighlight) return;
      lastHighlight = key;
      r.setHighlight(zones);
      request();
    };
    const unsub = useStore.subscribe((s, p) => {
      if (s.revision !== p.revision) {
        r.setOwners(s.owner);
        r.setMarks(s.outline, s.hatch);
      }
      if (s.countries !== p.countries) r.setPalette(s.countries);
      if (s.overlays !== p.overlays) r.setOverlays(s.overlays);
      if (s.hover !== p.hover || s.level !== p.level || s.tool !== p.tool) updateHighlight();
      request();
    });

    // ---------------------------------------------------------- mouse
    const toMap = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: cam.x + (e.clientX - rect.left - rect.width / 2) / cam.zoom,
        y: cam.y + (e.clientY - rect.top - rect.height / 2) / cam.zoom,
      };
    };
    const zoneAt = (m: { x: number; y: number }) => {
      const x = Math.floor(m.x), y = Math.floor(m.y);
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
      return map.ids[y * map.width + x];
    };

    let painting = false;
    let panning = false;
    let space = false;
    let last = { x: 0, y: 0 };
    let downAt = { x: 0, y: 0, button: -1 };

    const paintAlong = (from: { x: number; y: number }, to: { x: number; y: number }, lvl: Level) => {
      const s = useStore.getState();
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 1.5));
      let prev = -1;
      for (let i = 1; i <= steps; i++) {
        const z = zoneAt({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
        if (z !== prev) s.applyAt(z, lvl);
        prev = z;
      }
    };

    const onDown = (e: PointerEvent) => {
      mods = e;
      canvas.setPointerCapture(e.pointerId);
      downAt = { x: e.clientX, y: e.clientY, button: e.button };
      last = { x: e.clientX, y: e.clientY };
      const s = useStore.getState();
      if (e.button === 1 || e.button === 2 || (e.button === 0 && space)) {
        panning = true;
        canvas.dataset.panning = '';
        updateHighlight();
        return;
      }
      if (e.button !== 0) return;
      const m = toMap(e);
      if (s.tool === 'pick') {
        s.pickAt(zoneAt(m));
        return;
      }
      painting = true;
      s.beginStroke();
      s.applyAt(zoneAt(m), levelFor(e, s.level));
    };

    const onMove = (e: PointerEvent) => {
      mods = e;
      if (panning) {
        cam.x -= (e.clientX - last.x) / cam.zoom;
        cam.y -= (e.clientY - last.y) / cam.zoom;
        clamp();
        request();
      } else {
        const m = toMap(e);
        const s = useStore.getState();
        if (painting) paintAlong(toMap({ clientX: last.x, clientY: last.y }), m, levelFor(e, s.level));
        s.setHover(zoneAt(m));
        updateHighlight();
      }
      last = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      // right click without dragging = pick
      if (downAt.button === 2 && e.button === 2 && moved < 4) useStore.getState().pickAt(zoneAt(toMap(e)));
      if (painting) useStore.getState().endStroke();
      painting = false;
      if (panning) {
        panning = false;
        delete canvas.dataset.panning;
        updateHighlight();
      }
    };

    const onLeave = () => {
      if (!painting && !panning) useStore.getState().setHover(0);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const before = toMap(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      cam.zoom *= Math.exp(-delta * 0.0018);
      clamp();
      const rect = canvas.getBoundingClientRect();
      cam.x = before.x - (e.clientX - rect.left - rect.width / 2) / cam.zoom;
      cam.y = before.y - (e.clientY - rect.top - rect.height / 2) / cam.zoom;
      clamp();
      request();
    };

    const onKey = (e: KeyboardEvent) => {
      mods = e;
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        space = e.type === 'keydown';
        canvas.toggleAttribute('data-grab', space);
        if (e.type === 'keydown') e.preventDefault();
      }
      if (e.key === 'Alt') e.preventDefault(); // keeps the browser menu bar from taking focus
      updateHighlight();
    };

    const noMenu = (e: Event) => e.preventDefault();
    // A single AbortController removes every listener on unmount. Without it, React's double
    // mount (StrictMode) left two sets of listeners with two different cameras, and every
    // click also painted a second, shifted location.
    const ac = new AbortController();
    const opts = { signal: ac.signal };
    canvas.addEventListener('pointerdown', onDown, opts);
    canvas.addEventListener('pointermove', onMove, opts);
    canvas.addEventListener('pointerup', onUp, opts);
    canvas.addEventListener('pointercancel', onUp, opts);
    canvas.addEventListener('pointerleave', onLeave, opts);
    canvas.addEventListener('wheel', onWheel, { passive: false, signal: ac.signal });
    canvas.addEventListener('contextmenu', noMenu, opts);
    window.addEventListener('keydown', onKey, opts);
    window.addEventListener('keyup', onKey, opts);

    return () => {
      ro.disconnect();
      unsub();
      cancelAnimationFrame(raf);
      ac.abort();
      r.dispose();
      view.renderer = null;
    };
  }, [map]);

  return <canvas ref={canvasRef} className="map-canvas" />;
}
