import type { ReactNode } from 'react'
import * as React from 'react'

type TranslationResources = Record<string, string>

type TranslationOptions = {
  ns?: string | string[]
  defaultValue?: string
  [key: string]: unknown
}

type TranslationKey = string | string[]

const getNamespace = (options?: TranslationOptions) => {
  const ns = options?.ns
  if (Array.isArray(ns))
    return ns[0]
  return ns
}

const getKey = (key: TranslationKey) => {
  if (Array.isArray(key))
    return key[0] ?? ''
  return key
}

const getNamespacedKey = (key: TranslationKey, options?: TranslationOptions) => {
  const rawKey = getKey(key)
  const ns = getNamespace(options)
  return ns ? `${ns}:${rawKey}` : rawKey
}

const interpolate = (value: string, options?: TranslationOptions) => {
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const replacement = options?.[name]
    return replacement === undefined ? match : String(replacement)
  })
}

const createT = (resources: TranslationResources = {}) => {
  return (key: TranslationKey, options?: TranslationOptions) => {
    const rawKey = getKey(key)
    const namespacedKey = getNamespacedKey(key, options)
    const value = resources[namespacedKey] ?? resources[rawKey] ?? options?.defaultValue ?? namespacedKey
    return interpolate(value, options)
  }
}

const renderTransChildren = (children: ReactNode, fallback: string) => {
  if (children)
    return React.createElement(React.Fragment, null, children)
  return fallback
}

export const createReactI18nextMock = (resources: TranslationResources = {}) => {
  const t = createT(resources)

  return {
    useTranslation: () => ({
      t,
      i18n: {
        language: 'en-US',
        changeLanguage: () => Promise.resolve(),
      },
      ready: true,
    }),
    Trans: ({
      i18nKey,
      children,
      values,
      ns,
    }: {
      i18nKey?: string
      children?: ReactNode
      values?: TranslationOptions
      ns?: string | string[]
    }) => renderTransChildren(children, i18nKey ? t(i18nKey, { ...values, ns }) : ''),
    initReactI18next: {
      type: '3rdParty',
      init: () => undefined,
    },
  }
}
