import { useMemo, useRef, useState } from 'react';
import { pick, useLang, useT } from '../i18n';
import type { Level, LoadoutInfo, MapData } from '../map/loadMap';
import { view } from '../map/view';
import { download, openFile, saveToFile } from '../state/persist';
import { startFrom } from '../state/scenarios';
import { countryName, useStore, type Tool } from '../state/store';
import { BackIcon, BrushIcon, CloseIcon, EraserIcon, PipetteIcon, PlusIcon, RedoIcon, UndoIcon } from './icons';
import { LanguageSwitch } from './LanguageSwitch';

const TOOLS: { id: Tool; key: string; icon: () => React.JSX.Element }[] = [
  { id: 'paint', key: 'B', icon: BrushIcon },
  { id: 'erase', key: 'E', icon: EraserIcon },
  { id: 'pick', key: 'I', icon: PipetteIcon },
];

const LEVELS: { id: Level; key: string }[] = [
  { id: 'location', key: '1' },
  { id: 'province', key: '2' },
  { id: 'area', key: '3' },
  { id: 'region', key: '4' },
];

export function Sidebar({ map, loadouts }: { map: MapData; loadouts: LoadoutInfo[] }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const tool = useStore((s) => s.tool);
  const level = useStore((s) => s.level);
  const countries = useStore((s) => s.countries);
  const activeId = useStore((s) => s.activeId);
  const revision = useStore((s) => s.revision);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const s = useStore.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const counts = useMemo(() => {
    const { owner, map } = useStore.getState();
    const m = new Map<number, number>();
    for (let z = 1; z < (map?.count ?? 0); z++) if (owner[z]) m.set(owner[z], (m.get(owner[z]) ?? 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  const exportImage = async () => {
    if (!view.renderer) return;
    setExporting(true);
    try {
      download(await view.renderer.exportPng(), `${map.id}.png`);
    } catch {
      setMessage(t.errors.exportFailed);
    } finally {
      setExporting(false);
    }
  };

  const choose = async (lo: LoadoutInfo | null) => {
    setLoading(lo?.id ?? 'blank');
    try {
      await startFrom(map, lo, t.panel.confirmReplace, t.panel.blank);
    } catch (e) {
      setMessage(t.errors.scenarioFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(null);
    }
  };

  return (
    <aside className="panel">
      <header className="panel-head">
        <div className="panel-top">
          <a className="back" href="#/">
            <BackIcon /> {t.editor.backToList}
          </a>
          <LanguageSwitch />
        </div>
        <h1>{pick(map.name, lang)}</h1>
        <p>{t.panel.intro}</p>
      </header>

      {loadouts.length > 0 && (
        <section className="group">
          <h2>{t.panel.startFrom}</h2>
          <div className="scenarios">
            <button onClick={() => choose(null)} disabled={loading !== null}>
              {loading === 'blank' ? t.panel.loadingScenario : t.panel.blank}
            </button>
            {loadouts.map((lo) => (
              <button key={lo.id} onClick={() => choose(lo)} disabled={loading !== null} title={pick(lo.description, lang)}>
                {loading === lo.id ? t.panel.loadingScenario : lo.id === 'today' ? pick(lo.name, lang) : lo.year}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="group">
        <h2>{t.panel.tool}</h2>
        <div className="seg seg-tools" role="radiogroup" aria-label={t.panel.tool}>
          {TOOLS.map((tl) => (
            <button
              key={tl.id}
              role="radio"
              aria-checked={tool === tl.id}
              className={tool === tl.id ? 'on' : ''}
              onClick={() => s.setTool(tl.id)}
              title={`${t.panel.tools[tl.id]} (${tl.key})`}
            >
              <tl.icon />
              <span>{t.panel.tools[tl.id]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="group">
        <h2>{t.panel.scope}</h2>
        <div className="seg" role="radiogroup" aria-label={t.panel.scope}>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={level === l.id}
              className={level === l.id ? 'on' : ''}
              onClick={() => s.setLevel(l.id)}
              title={`${t.panel.levels[l.id]} (${l.key})`}
            >
              {t.panel.levels[l.id]}
            </button>
          ))}
        </div>
        <p className="hint">
          {t.panel.scopeHintStart} <kbd>{t.panel.keys.shift}</kbd> {t.panel.levels.province.toLowerCase()},{' '}
          <kbd>{t.panel.keys.ctrl}</kbd> {t.panel.levels.area.toLowerCase()}, <kbd>{t.panel.keys.alt}</kbd>{' '}
          {t.panel.levels.region.toLowerCase()}.
        </p>
      </section>

      <section className="group countries">
        <h2>
          {t.panel.countries} <span className="count">{countries.length}</span>
        </h2>
        {countries.length === 0 ? (
          <p className="empty">{t.panel.noCountries}</p>
        ) : (
          <ul className="country-list">
            {countries.map((c) => {
              const name = countryName(c, lang);
              return (
                <li
                  key={c.id}
                  className={c.id === activeId ? 'country active' : 'country'}
                  style={{ '--c': c.color } as React.CSSProperties}
                  onClick={() => s.setActive(c.id)}
                >
                  <label className="swatch" title={t.panel.changeColor} onClick={(e) => e.stopPropagation()}>
                    <input type="color" value={c.color} onChange={(e) => s.recolorCountry(c.id, e.target.value)} />
                  </label>
                  <input
                    className="name"
                    value={name}
                    aria-label={t.panel.countryName}
                    onFocus={() => s.setActive(c.id)}
                    onChange={(e) => s.renameCountry(c.id, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <span className="n" title={t.panel.owned}>
                    {counts.get(c.id) ?? 0}
                  </span>
                  <button
                    className="del"
                    title={t.panel.remove(name)}
                    aria-label={t.panel.remove(name)}
                    onClick={(e) => {
                      e.stopPropagation();
                      s.deleteCountry(c.id);
                    }}
                  >
                    <CloseIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button className="add" onClick={() => s.addCountry(t.panel.newCountryName(useStore.getState().nextId))}>
          <PlusIcon /> {t.panel.newCountry}
        </button>
      </section>

      <footer className="panel-foot">
        <div className="history">
          <button onClick={() => s.undo()} disabled={!canUndo} title={t.panel.undo} aria-label={t.panel.undo}>
            <UndoIcon />
          </button>
          <button onClick={() => s.redo()} disabled={!canRedo} title={t.panel.redo} aria-label={t.panel.redo}>
            <RedoIcon />
          </button>
        </div>
        <div className="files">
          <button className="primary" onClick={exportImage} disabled={exporting}>
            {exporting ? t.panel.exporting : t.panel.exportPng}
          </button>
          <button onClick={saveToFile}>{t.panel.save}</button>
          <button onClick={() => fileInput.current?.click()}>{t.panel.open}</button>
          <button
            className="danger"
            onClick={() => {
              if (confirm(t.panel.confirmClear)) s.clearMap();
            }}
          >
            {t.panel.clear}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const error = await openFile(f);
            setMessage(error ? t.errors[error] : null);
          }}
        />
        {message && (
          <p className="message" role="alert">
            {message}
            <button onClick={() => setMessage(null)} aria-label={t.panel.close}>
              <CloseIcon />
            </button>
          </p>
        )}
      </footer>
    </aside>
  );
}
