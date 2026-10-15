import { useMemo } from 'react';
import { useLang, useT } from '../i18n';
import { legendEntries } from '../map/legend';
import { useSettings } from '../state/settings';
import { useStore } from '../state/store';

/** Legend of the map: painted countries (largest first) and the overlays in use. */
export function Legend() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const show = useSettings((s) => s.legend);
  const revision = useStore((s) => s.revision);
  const countries = useStore((s) => s.countries);
  const overlays = useStore((s) => s.overlays);
  const entries = useMemo(() => {
    const { owner, outline, hatch, map } = useStore.getState();
    return legendEntries(countries, overlays, owner, outline, hatch, map?.count ?? 0, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, countries, overlays, lang]);

  if (!show || (!entries.countries.length && !entries.overlays.length)) return null;
  return (
    <aside className="legend" aria-label={t.legend.title}>
      <h2>{t.legend.title}</h2>
      {entries.countries.length > 0 && (
        <ul>
          {entries.countries.map((c) => (
            <li key={c.id}>
              <span className="dot" style={{ '--c': c.color } as React.CSSProperties} />
              {c.name}
            </li>
          ))}
          {entries.more > 0 && <li className="more">{t.legend.more(entries.more)}</li>}
        </ul>
      )}
      {entries.overlays.length > 0 && (
        <ul className="legend-overlays">
          {entries.overlays.map((o) => (
            <li key={o.id}>
              <span className={`overlay-swatch ${o.style}`} style={{ '--c': o.color } as React.CSSProperties} />
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
