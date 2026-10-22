import vi from '../i18n/vi.json'

export type Locale = 'vi'
export type Dictionary = Record<string, string>
const DICTIONARIES: Record<Locale, Dictionary> = { vi }

/** This game ships only Vietnamese; browser and saved locale hints are intentionally ignored. */
export function detectLocale(_languages: readonly string[] | undefined): Locale { return 'vi' }
export function resolveLocale(_saved: string, _languages: readonly string[] | undefined): Locale { return 'vi' }

export class I18n {
  readonly locale: Locale = 'vi'
  private listeners = new Set<(locale: Locale) => void>()
  constructor(_locale: Locale = 'vi') { document.documentElement.lang = 'vi' }
  t(key: string, vars: Record<string, string | number> = {}): string {
    const text = DICTIONARIES.vi[key] ?? key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
  }
  set(_locale: Locale): void { document.documentElement.lang = 'vi' }
  onChange(fn: (locale: Locale) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }
}
export const DICTIONARY_KEYS = { vi: Object.keys(vi) }
