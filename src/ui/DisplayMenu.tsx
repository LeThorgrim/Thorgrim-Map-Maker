import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useSettings, type DisplaySettings } from '../state/settings';
import { EyeIcon } from './icons';

const OPTIONS: (keyof DisplaySettings)[] = ['names', 'legend', 'overlays', 'locationBorders'];

/** Button and popover to choose what the map shows. */
export function DisplayMenu() {
  const t = useT();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="display-menu" ref={root}>
      <button
        className={`btn ${open ? 'on' : ''}`}
        aria-expanded={open}
        aria-controls="display-popover"
        title={t.display.title}
        aria-label={t.display.title}
        onClick={() => setOpen(!open)}
      >
        <EyeIcon />
      </button>
      {open && (
        <div id="display-popover" className="display-popover frame" role="group" aria-label={t.display.title}>
          <h2 className="rule-title">{t.display.title}</h2>
          {OPTIONS.map((key) => (
            <label key={key} className="toggle">
              <input type="checkbox" checked={settings[key]} onChange={() => settings.toggle(key)} />
              <span className="toggle-track" aria-hidden />
              {t.display[key]}
            </label>
          ))}
          <p className="hint">{t.display.exportNote}</p>
        </div>
      )}
    </div>
  );
}
