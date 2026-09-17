import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from '../locales/zh-CN.ts'
import enUS from '../locales/en-US.ts'

export const LOCALE_STORAGE_KEY = 'warehousesim.locale'
export const DEFAULT_LOCALE = 'zh-CN'
export type AppLocale = 'zh-CN' | 'en-US'

export function readStoredLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en-US') {
      return stored
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE
}

export function persistLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // ignore
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: typeof window !== 'undefined' ? readStoredLocale() : DEFAULT_LOCALE,
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
