import { useLang, useT } from '../i18n';
import { namesIn, type MapData } from '../map/loadMap';
import { countryName, useStore } from '../state/store';

export function HoverCard({ map }: { map: MapData }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const hover = useStore((s) => s.hover);
  const ownerId = useStore((s) => (s.hover ? s.owner[s.hover] : 0));
  useStore((s) => s.revision);
  const country = useStore((s) => s.countries.find((c) => c.id === ownerId));

  if (!hover) return null;
  const names = namesIn(map, lang);
  const p = map.locations.province[hover];
  const a = map.provinces.area[p];
  const r = map.areas.region[a];

  return (
    <div className="hover-card" aria-live="polite">
      <h3>{names.locations[hover]}</h3>
      <dl>
        <dt>{t.hover.province}</dt>
        <dd>{names.provinces[p]}</dd>
        <dt>{t.hover.area}</dt>
        <dd>{names.areas[a]}</dd>
        <dt>{t.hover.region}</dt>
        <dd>{names.regions[r]}</dd>
        <dt>{t.hover.today}</dt>
        <dd>{names.countries[map.provinces.country[p]]}</dd>
      </dl>
      <p className="owner">
        {country ? (
          <>
            <span className="dot" style={{ '--c': country.color } as React.CSSProperties} />
            {countryName(country, lang)}
          </>
        ) : (
          <span className="unclaimed">{t.hover.unclaimed}</span>
        )}
      </p>
    </div>
  );
}
