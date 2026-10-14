import { useEffect, useState } from 'react';
import { numberFormat, pick, useLang, useT } from './i18n';
import { loadIndex, thumbnailUrl, type MapInfo } from './map/loadMap';
import { savedSummary } from './state/persist';
import { LanguageSwitch } from './ui/LanguageSwitch';

export function Home() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const fmt = numberFormat(lang);
  const [maps, setMaps] = useState<MapInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = t.appName;
  }, [t]);
  useEffect(() => {
    loadIndex().then(setMaps, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="home">
      <header className="home-head">
        <LanguageSwitch className="large" />
        <h1>{t.appName}</h1>
        <div className="ornament" aria-hidden>
          <span />
        </div>
        <p>{t.home.tagline}</p>
      </header>

      {error && (
        <p className="home-error">
          {t.home.loadError(error)} {t.home.generateHint}
        </p>
      )}
      {!maps && !error && <p className="home-loading">{t.home.loading}</p>}

      {maps && (
        <section aria-labelledby="maps-title">
          <h2 id="maps-title" className="rule-title">
            {t.home.available} <span className="count">{maps.length}</span>
          </h2>
          <ul className="map-list">
            {maps.map((m) => {
              const saved = savedSummary(m.id);
              const href = `#/map/${encodeURIComponent(m.id)}`;
              return (
                <li key={m.id} className="map-card frame">
                  <a className="map-card-image" href={href} tabIndex={-1} aria-hidden>
                    <img src={thumbnailUrl(m.id)} alt="" width={720} height={566} />
                  </a>
                  <div className="map-card-body">
                    <h3>
                      <a href={href}>{pick(m.name, lang)}</a>
                    </h3>
                    <p>{pick(m.description, lang)}</p>
                    <dl>
                      <div>
                        <dt>{t.home.locations}</dt>
                        <dd>{fmt.format(m.locations)}</dd>
                      </div>
                      <div>
                        <dt>{t.home.provinces}</dt>
                        <dd>{fmt.format(m.provinces)}</dd>
                      </div>
                      <div>
                        <dt>{t.home.areas}</dt>
                        <dd>{fmt.format(m.areas)}</dd>
                      </div>
                      <div>
                        <dt>{t.home.regions}</dt>
                        <dd>{fmt.format(m.regions)}</dd>
                      </div>
                    </dl>

                    {m.loadouts?.length > 0 && (
                      <nav aria-label={t.home.scenarios}>
                        <ol className="bookmarks">
                          {m.loadouts.map((lo) => (
                            <li key={lo.id}>
                              <a href={`${href}/${encodeURIComponent(lo.id)}`}>
                                <span className="year">{lo.year}</span>
                                <span>
                                  <strong>{pick(lo.name, lang)}</strong>
                                  <small>{pick(lo.description, lang)}</small>
                                </span>
                              </a>
                            </li>
                          ))}
                        </ol>
                      </nav>
                    )}

                    <div className="map-card-action">
                      <a className="btn-banner" href={href}>
                        {saved?.painted ? t.home.resume : t.home.open}
                      </a>
                      <span className="progress">
                        {saved?.painted ? t.home.progress(fmt.format(saved.painted), saved.countries) : t.home.blankHint}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
