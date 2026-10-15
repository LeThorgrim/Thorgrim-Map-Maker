import { useMemo, useState, type ReactNode } from 'react';
import { useLang, useT } from '../i18n';
import { countryName, useStore, type OverlayStyle } from '../state/store';
import { useSettings } from '../state/settings';
import { confirmDialog } from './confirm';
import { ChevronIcon, CloseIcon, HatchIcon, NameIcon, OutlineIcon, PlusIcon } from './icons';

const OPEN_KEY = 'mapmaker:open-sections';

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** A panel section whose content can be folded away; the open/closed state is remembered. */
function Collapsible({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(() => readOpen()[id] ?? true);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: !open }));
    } catch {
      /* the state simply won't survive a reload */
    }
  };
  return (
    <section className={`group collapsible ${id} ${open ? 'open' : ''}`}>
      <h2 className="rule-title">
        <button className="collapse-toggle" aria-expanded={open} aria-controls={`section-${id}`} onClick={toggle}>
          <ChevronIcon />
          {title} <span className="count">{count}</span>
        </button>
      </h2>
      <div id={`section-${id}`} className="collapsible-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/**
 * Number of locations holding each id, recomputed on every paint. Overlay ids are unique across
 * the two overlay channels, so both channels can be counted together.
 */
function useCounts(which: 'country' | 'overlay') {
  const revision = useStore((s) => s.revision);
  return useMemo(() => {
    const { map, owner, outline, hatch } = useStore.getState();
    const arrays = which === 'country' ? [owner] : [outline, hatch];
    const m = new Map<number, number>();
    for (const values of arrays)
      for (let z = 1; z < (map?.count ?? 0); z++) if (values[z]) m.set(values[z], (m.get(values[z]) ?? 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, which]);
}

export function CountrySection() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const countries = useStore((s) => s.countries);
  const activeId = useStore((s) => s.activeId);
  const layer = useStore((s) => s.layer);
  const counts = useCounts('country');
  const namesOn = useSettings((st) => st.names);
  const s = useStore.getState();

  return (
    <Collapsible id="countries" title={t.panel.countries} count={countries.length}>
      {countries.length === 0 ? (
        <p className="empty">{t.panel.noCountries}</p>
      ) : (
        <ul className="country-list">
          {countries.map((c) => {
            const name = countryName(c, lang);
            const active = layer === 'country' && c.id === activeId;
            return (
              <li
                key={c.id}
                className={active ? 'country active' : 'country'}
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
                <span className={namesOn ? 'style-switch name-switch' : 'style-switch name-switch muted'}>
                  <button
                    role="switch"
                    aria-checked={!c.hideName}
                    className={c.hideName ? '' : 'on'}
                    title={namesOn ? t.panel.showName : `${t.panel.showName} — ${t.panel.namesOff}`}
                    aria-label={t.panel.showName}
                    onClick={(e) => {
                      e.stopPropagation();
                      s.toggleCountryName(c.id);
                    }}
                  >
                    <NameIcon />
                  </button>
                </span>
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
      <button className="btn add" onClick={() => s.addCountry(t.panel.newCountryName(useStore.getState().nextId))}>
        <PlusIcon /> {t.panel.newCountry}
      </button>
    </Collapsible>
  );
}

const STYLES: { id: OverlayStyle; icon: () => React.JSX.Element }[] = [
  { id: 'outline', icon: OutlineIcon },
  { id: 'hatch', icon: HatchIcon },
];

export function OverlaySection() {
  const t = useT();
  const overlays = useStore((s) => s.overlays);
  const activeId = useStore((s) => s.activeOverlayId);
  const layer = useStore((s) => s.layer);
  const counts = useCounts('overlay');
  const s = useStore.getState();

  // Each style is a channel: moving an overlay to the other style replaces the overlay of that
  // style where both meet. The user confirms first, and can undo it.
  const changeStyle = async (id: number, style: OverlayStyle) => {
    const conflict = s.restyleConflict(id, style);
    if (conflict) {
      const name = overlays.find((o) => o.id === id)?.name ?? '';
      const ok = await confirmDialog({
        title: t.panel.restyleTitle,
        message: t.panel.restyleConflict(name, t.panel.styles[style].toLowerCase(), conflict.count, conflict.overlays.map((o) => o.name)),
        confirmLabel: t.panel.restyle,
      });
      if (!ok) return;
    }
    s.setOverlayStyle(id, style);
  };

  return (
    <Collapsible id="overlays" title={t.panel.overlays} count={overlays.length}>
      {overlays.length === 0 ? (
        <p className="empty">{t.panel.noOverlays}</p>
      ) : (
        <ul className="country-list">
          {overlays.map((o) => {
            const active = layer === 'overlay' && o.id === activeId;
            return (
              <li
                key={o.id}
                className={active ? 'country overlay active' : 'country overlay'}
                style={{ '--c': o.color } as React.CSSProperties}
                onClick={() => s.setActiveOverlay(o.id)}
              >
                <label
                  className={`overlay-swatch ${o.style}`}
                  title={t.panel.changeColor}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input type="color" value={o.color} onChange={(e) => s.recolorOverlay(o.id, e.target.value)} />
                </label>
                <input
                  className="name"
                  value={o.name}
                  aria-label={t.panel.overlayName}
                  onFocus={() => s.setActiveOverlay(o.id)}
                  onChange={(e) => s.renameOverlay(o.id, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <span className="style-switch" role="radiogroup" aria-label={t.panel.style}>
                  {STYLES.map((st) => (
                    <button
                      key={st.id}
                      role="radio"
                      aria-checked={o.style === st.id}
                      className={o.style === st.id ? 'on' : ''}
                      title={t.panel.styles[st.id]}
                      aria-label={t.panel.styles[st.id]}
                      onClick={(e) => {
                        e.stopPropagation();
                        changeStyle(o.id, st.id);
                      }}
                    >
                      <st.icon />
                    </button>
                  ))}
                </span>
                <span className="n" title={t.panel.marked}>
                  {counts.get(o.id) ?? 0}
                </span>
                <button
                  className="del"
                  title={t.panel.remove(o.name)}
                  aria-label={t.panel.remove(o.name)}
                  onClick={(e) => {
                    e.stopPropagation();
                    s.deleteOverlay(o.id);
                  }}
                >
                  <CloseIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="btn add" onClick={() => s.addOverlay(t.panel.newOverlayName(useStore.getState().nextOverlayId))}>
        <PlusIcon /> {t.panel.newOverlay}
      </button>
    </Collapsible>
  );
}
