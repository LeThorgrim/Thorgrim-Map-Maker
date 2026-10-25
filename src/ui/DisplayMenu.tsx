import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { LEGEND_COLUMN_GAP, LEGEND_SCALE, useSettings, type DisplayToggle } from '../state/settings';
import { EyeIcon, MinusIcon, PlusIcon } from './icons';

const OPTIONS: DisplayToggle[] = ['names', 'legend', 'overlays', 'locationBorders'];

/** A value with − and + buttons. */
function Stepper(props: {
  label: string;
  value: number;
  bounds: { min: number; max: number; step: number };
  format: (v: number) => string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const { min, max, step } = props.bounds;
  const go = (dir: number) => {
    // rounded to the step, so that repeated clicks don't drift (0.1 + 0.2…)
    const v = Math.round((props.value + dir * step) / step) * step;
    props.onChange(Math.min(max, Math.max(min, Number(v.toFixed(4)))));
  };
  return (
    <div className={props.disabled ? 'stepper disabled' : 'stepper'}>
      <span className="stepper-label">{props.label}</span>
      <button className="btn" disabled={props.disabled || props.value <= min} onClick={() => go(-1)} aria-label={`${props.label} −`}>
        <MinusIcon />
      </button>
      <output>{props.format(props.value)}</output>
      <button className="btn" disabled={props.disabled || props.value >= max} onClick={() => go(1)} aria-label={`${props.label} +`}>
        <PlusIcon />
      </button>
    </div>
  );
}

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
          <h3 className="display-sub">{t.display.legendSection}</h3>
          <Stepper
            label={t.display.legendScale}
            value={settings.legendScale}
            bounds={LEGEND_SCALE}
            format={(v) => `${Math.round(v * 100)} %`}
            disabled={!settings.legend}
            onChange={(v) => settings.setValue('legendScale', v)}
          />
          <Stepper
            label={t.display.legendColumnGap}
            value={settings.legendColumnGap}
            bounds={LEGEND_COLUMN_GAP}
            format={(v) => `${v} px`}
            disabled={!settings.legend}
            onChange={(v) => settings.setValue('legendColumnGap', v)}
          />
          <p className="hint">{t.display.exportNote}</p>
        </div>
      )}
    </div>
  );
}
