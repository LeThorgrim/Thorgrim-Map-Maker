import { useRef, useState } from 'react';
import { pick, useLang, useT } from '../i18n';
import type { Level, LoadoutInfo, MapData } from '../map/loadMap';
import { view } from '../map/view';
import { download, openFile, saveToFile } from '../state/persist';
import { startFrom } from '../state/scenarios';
import { useStore, type Tool } from '../state/store';
import { BackIcon, BrushIcon, CloseIcon, EraserIcon, PipetteIcon, RedoIcon, UndoIcon } from './icons';
import { CountrySection, OverlaySection } from './Layers';
import { confirmDialog } from './confirm';
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
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const s = useStore.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

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
      await startFrom(map, lo, t);
    } catch (e) {
      setMessage(t.errors.scenarioFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(null);
    }
  };

  return (
    <aside className="panel frame">
      <header className="panel-head">
        <div className="panel-top">
          <a className="back" href="#/">
            <BackIcon /> {t.editor.backToList}
          </a>
          <LanguageSwitch />
        </div>
        <h1>{pick(map.name, lang)}</h1>
      </header>

      {loadouts.length > 0 && (
        <section className="group">
          <h2 className="rule-title">{t.panel.startFrom}</h2>
          <div className="scenarios">
            <button className="btn" onClick={() => choose(null)} disabled={loading !== null}>
              {loading === 'blank' ? t.panel.loadingScenario : t.panel.blank}
            </button>
            {loadouts.map((lo) => (
              <button key={lo.id} className="btn" onClick={() => choose(lo)} disabled={loading !== null} title={pick(lo.description, lang)}>
                {loading === lo.id ? t.panel.loadingScenario : lo.id === 'today' ? pick(lo.name, lang) : lo.year}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="group">
        <h2 className="rule-title">{t.panel.tool}</h2>
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
        <h2 className="rule-title">{t.panel.scope}</h2>
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
        <p className="hint" title={t.panel.scopeHintStart}>
          <kbd>{t.panel.keys.shift}</kbd> {t.panel.levels.province.toLowerCase()} <kbd>{t.panel.keys.ctrl}</kbd>{' '}
          {t.panel.levels.area.toLowerCase()} <kbd>{t.panel.keys.alt}</kbd> {t.panel.levels.region.toLowerCase()}
        </p>
      </section>

      <div className="layers">
        <CountrySection />
        <OverlaySection />
      </div>

      <footer className="panel-foot">
        <div className="foot-row">
          <button className="btn icon" onClick={() => s.undo()} disabled={!canUndo} title={t.panel.undo} aria-label={t.panel.undo}>
            <UndoIcon />
          </button>
          <button className="btn icon" onClick={() => s.redo()} disabled={!canRedo} title={t.panel.redo} aria-label={t.panel.redo}>
            <RedoIcon />
          </button>
          <button className="btn" onClick={saveToFile}>
            {t.panel.save}
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            {t.panel.open}
          </button>
        </div>
        <button className="btn-banner" onClick={exportImage} disabled={exporting}>
          {exporting ? t.panel.exporting : t.panel.exportPng}
        </button>
        <button
          className="danger"
          onClick={async () => {
            const ok = await confirmDialog({ title: t.panel.clearTitle, message: t.panel.confirmClear, confirmLabel: t.panel.clear, danger: true });
            if (ok) s.clearMap();
          }}
        >
          {t.panel.clear}
        </button>
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
