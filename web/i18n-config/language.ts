import type { DocLanguage } from '@/types/doc-paths'
import data from './languages'

export const languages = data.languages

export type SupportedLocale = typeof languages[number]['value']
export type Locale = SupportedLocale | 'en_US' | 'zh_Hans'
export type I18nText = Record<SupportedLocale, string>

export const LanguagesSupported = languages
  .filter(item => item.supported)
  .map(item => item.value) as SupportedLocale[]

export const getLanguage = (locale: Locale): 'en_US' | 'zh_Hans' => {
  if (locale === 'zh-Hans' || locale === 'zh_Hans')
    return 'zh_Hans'

  return 'en_US'
}

export const getSupportedLocale = (locale: string): SupportedLocale => {
  if (locale === 'zh-Hans' || locale === 'zh_Hans')
    return 'zh-Hans'

  return 'en-US'
}

const DOC_LANGUAGE: Record<SupportedLocale, DocLanguage> = {
  'zh-Hans': 'zh',
  'en-US': 'en',
}

export type AccessControlTemplateLanguage = 'zh' | 'en'

const ACCESS_CONTROL_TEMPLATE_LANGUAGE: Record<SupportedLocale, AccessControlTemplateLanguage> = {
  'zh-Hans': 'zh',
  'en-US': 'en',
}

export const localeMap: Record<Locale, string> = {
  'en-US': 'en',
  'en_US': 'en',
  'zh-Hans': 'zh-cn',
  'zh_Hans': 'zh-cn',
}

export const getDocLanguage = (locale: string): DocLanguage => {
  return DOC_LANGUAGE[locale as SupportedLocale] || 'en'
}

export const getPricingPageLanguage = () => ''

export const getAccessControlTemplateLanguage = (locale: string): AccessControlTemplateLanguage => {
  return ACCESS_CONTROL_TEMPLATE_LANGUAGE[locale as SupportedLocale] || 'en'
}

export const NOTICE_I18N = {
  title: {
    en_US: 'Important Notice',
    zh_Hans: '重要公告',
  },
  desc: {
    en_US:
      'Our system will be unavailable from 19:00 to 24:00 UTC on August 28 for an upgrade. For questions, kindly contact our support team (support@dify.ai). We value your patience.',
    zh_Hans:
      '为有效提升数据检索能力和稳定性，July 将进行服务升级。升级期间云端版及应用可能暂时无法访问，感谢您的耐心与支持。',
  },
  href: '#',
}
