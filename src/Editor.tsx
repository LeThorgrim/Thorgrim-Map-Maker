import { useEffect, useState } from 'react';
import { pick, useLang, useT } from './i18n';
import { loadIndex, loadMap, type LoadoutInfo, type MapData } from './map/loadMap';
import { MapCanvas } from './map/MapCanvas';
import { view } from './map/view';
import { startAutosave } from './state/persist';
import { startFrom } from './state/scenarios';
import { useStore } from './state/store';
import { HoverCard } from './ui/HoverCard';
import { FitIcon, MinusIcon, PlusIcon } from './ui/icons';
import { DisplayMenu } from './ui/DisplayMenu';
import { LegendHandle } from './ui/LegendHandle';
import { Logo } from './ui/Logo';
import { Sidebar } from './ui/Sidebar';

/** The map editor. `start` is the id of a loadout to load right away (from the home screen). */
export function Editor({ mapId, start }: { mapId: string; start?: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [map, setMap] = useState<MapData | null>(null);
  const [loadouts, setLoadouts] = useState<LoadoutInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  // the panel gem shows the colour of what the brush paints: a country, or an overlay
  const accent = useStore((s) =>
    s.layer === 'overlay'
      ? (s.overlays.find((o) => o.id === s.activeOverlayId)?.color ?? '#5E6B70')
      : (s.countries.find((c) => c.id === s.activeId)?.color ?? '#5E6B70'),
  );

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    Promise.all([loadMap(mapId), loadIndex().catch(() => [])])
      .then(([m, maps]) => {
        if (cancelled) return;
        useStore.getState().setMap(m);
        stop = startAutosave(m.id);
        setMap(m);
        setLoadouts(maps.find((x) => x.id === mapId)?.loadouts ?? []);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      stop();
    };
  }, [mapId]);

  // A loadout chosen on the home screen is applied once, then removed from the address.
  useEffect(() => {
    if (!map || !start) return;
    const lo = loadouts.find((l) => l.id === start);
    window.history.replaceState(null, '', `#/map/${encodeURIComponent(map.id)}`);
    if (lo) startFrom(map, lo, t).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loadouts, start]);

  useEffect(() => {
    if (map) document.title = `${pick(map.name, lang)} · ${t.appName}`;
  }, [map, lang, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
      } else if (!mod && !e.altKey) {
        if (k === 'b') s.setTool('paint');
        else if (k === 'e') s.setTool('erase');
        else if (k === 'i') s.setTool('pick');
        else if (k === 'n') s.addCountry(t.panel.newCountryName(s.nextId));
        else if (k === '1') s.setLevel('location');
        else if (k === '2') s.setLevel('province');
        else if (k === '3') s.setLevel('area');
        else if (k === '4') s.setLevel('region');
        else if (k === '0') view.fit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [t]);

  if (error)
    return (
      <div className="splash">
        <p>
          {t.editor.loadError(error)}
          <br />
          <a href="#/">{t.editor.backToList}</a>
        </p>
      </div>
    );
  if (!map)
    return (
      <div className="splash">
        <p>
          <Logo className="splash-logo" size={96} />
          <br />
          {t.editor.loading}
        </p>
      </div>
    );

  return (
    <main className="app" style={{ '--accent': accent } as React.CSSProperties}>
      <MapCanvas map={map} />
      <LegendHandle />
      <Sidebar map={map} loadouts={loadouts} />
      <div className="zoom">
        <button className="btn" onClick={() => view.zoomBy(1.4)} title={t.editor.zoomIn} aria-label={t.editor.zoomIn}>
          <PlusIcon />
        </button>
        <button className="btn" onClick={() => view.zoomBy(1 / 1.4)} title={t.editor.zoomOut} aria-label={t.editor.zoomOut}>
          <MinusIcon />
        </button>
        <button className="btn" onClick={() => view.fit()} title={t.editor.fit} aria-label={t.editor.fit}>
          <FitIcon />
        </button>
        <DisplayMenu />
      </div>
      <HoverCard map={map} />
      <p className="attribution">{map.attribution}</p>
    </main>
  );
}
