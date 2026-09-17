import { EN } from './en';
import { JA } from './ja';

export { EN } from './en';
export { JA } from './ja';

export type Lang = 'en' | 'ja';
export type MsgKey = keyof typeof EN;

export const LANGS: readonly Lang[] = ['en', 'ja'];

const TABLES: Record<Lang, Record<string, string>> = { en: EN, ja: JA };

export function t(lang: Lang, key: MsgKey, params?: Record<string, string | number>): string {
  let s = TABLES[lang][key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
