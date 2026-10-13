import { create } from 'zustand';
import { en, type Messages } from './en';
import { fr } from './fr';

/** Supported languages. Add one by writing its messages file and listing it here. */
export const MESSAGES = { en, fr } satisfies Record<string, Messages>;
export type Lang = keyof typeof MESSAGES;
export const LANGS = Object.keys(MESSAGES) as Lang[];
export const DEFAULT_LANG: Lang = 'en';

/** A text available in several languages, as found in map data files. */
export type Localized = Partial<Record<Lang, string>>;

const KEY = 'mapmaker:lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in MESSAGES) return saved as Lang;
  } catch {
    /* storage unavailable: use the default language */
  }
  return DEFAULT_LANG;
}

interface LangState {
  lang: Lang;
  setLang(lang: Lang): void;
}

export const useLang = create<LangState>()((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* the choice simply won't survive a reload */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));
document.documentElement.lang = useLang.getState().lang;

/** Messages of the current language. */
export const useT = (): Messages => MESSAGES[useLang((s) => s.lang)];

/** Picks the current language from a localized text, falling back to the default language. */
export const pick = (text: Localized | string | undefined, lang: Lang): string =>
  typeof text === 'string' ? text : (text?.[lang] ?? text?.[DEFAULT_LANG] ?? Object.values(text ?? {})[0] ?? '');

export const numberFormat = (lang: Lang) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB');
