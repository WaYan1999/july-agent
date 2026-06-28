import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback } from 'react'
import { useLocale } from '@/context/i18n'
import { localeMap } from '@/i18n-config/language'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)

export const useFormatTimeFromNow = () => {
  const locale = useLocale()
  const formatTimeFromNow = useCallback((time: number) => {
    const dayjsLocale = localeMap[locale] ?? 'en'
    return dayjs(time).locale(dayjsLocale).fromNow()
  }, [locale])

  return { formatTimeFromNow }
}
