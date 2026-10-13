import { LANGS, MESSAGES, useLang, useT } from '../i18n';

/** Two-letter language buttons ("EN | FR"). */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();
  return (
    <div className={`lang-switch ${className}`} role="radiogroup" aria-label={t.panel.language}>
      {LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={l === lang}
          className={l === lang ? 'on' : ''}
          onClick={() => setLang(l)}
          title={MESSAGES[l].languageName}
          lang={l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
