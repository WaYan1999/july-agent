import type { I18nKeysWithPrefix } from '@/types/i18n'

export type AdminResourceName = 'accounts' | 'recommendedApps' | 'apps' | 'skills' | 'skillCategories' | 'skillTags' | 'autoServices' | 'translationSettings'

type AdminResourceTextKey = I18nKeysWithPrefix<'admin', 'resources.'>
type AdminNavigationTextKey = I18nKeysWithPrefix<'admin', 'nav.'>

export type AdminResourceDefinition = {
  name: AdminResourceName
  endpoint: string
  meta: {
    titleKey: AdminResourceTextKey
    descriptionKey: AdminResourceTextKey
    deleteKey: AdminResourceTextKey
  }
}

export const adminResourceLimit = 20

export const adminResources = [
  {
    name: 'accounts',
    endpoint: '/accounts',
    meta: {
      titleKey: 'resources.accounts.title',
      descriptionKey: 'resources.accounts.description',
      deleteKey: 'resources.accounts.deleteAction',
    },
  },
  {
    name: 'recommendedApps',
    endpoint: '/recommended-apps',
    meta: {
      titleKey: 'resources.recommendedApps.title',
      descriptionKey: 'resources.recommendedApps.description',
      deleteKey: 'resources.recommendedApps.deleteAction',
    },
  },
  {
    name: 'apps',
    endpoint: '/apps',
    meta: {
      titleKey: 'resources.apps.title',
      descriptionKey: 'resources.apps.description',
      deleteKey: 'resources.apps.deleteAction',
    },
  },
  {
    name: 'skills',
    endpoint: '/skills',
    meta: {
      titleKey: 'resources.skills.title',
      descriptionKey: 'resources.skills.description',
      deleteKey: 'resources.skills.deleteAction',
    },
  },
  {
    name: 'skillCategories',
    endpoint: '/skill-categories',
    meta: {
      titleKey: 'resources.skillCategories.title',
      descriptionKey: 'resources.skillCategories.description',
      deleteKey: 'resources.skillCategories.deleteAction',
    },
  },
  {
    name: 'skillTags',
    endpoint: '/skill-tags',
    meta: {
      titleKey: 'resources.skillTags.title',
      descriptionKey: 'resources.skillTags.description',
      deleteKey: 'resources.skillTags.deleteAction',
    },
  },
  {
    name: 'autoServices',
    endpoint: '/auto-services',
    meta: {
      titleKey: 'resources.autoServices.title',
      descriptionKey: 'resources.autoServices.description',
      deleteKey: 'resources.autoServices.deleteAction',
    },
  },
  {
    name: 'translationSettings',
    endpoint: '/translation-settings/google',
    meta: {
      titleKey: 'resources.translationSettings.title',
      descriptionKey: 'resources.translationSettings.description',
      deleteKey: 'resources.translationSettings.deleteAction',
    },
  },
] as const satisfies readonly AdminResourceDefinition[]

export const adminResourceGroups = [
  {
    titleKey: 'nav.userManagement',
    resources: ['accounts', 'apps'],
  },
  {
    titleKey: 'nav.skillsManagement',
    resources: ['skills', 'skillCategories', 'skillTags'],
  },
  {
    titleKey: 'nav.system',
    resources: ['recommendedApps', 'autoServices', 'translationSettings'],
  },
] as const satisfies readonly (
  | {
    name: AdminResourceName
  }
  | {
    titleKey: AdminNavigationTextKey
    resources: readonly AdminResourceName[]
  }
)[]

export function getAdminResource(name: AdminResourceName) {
  return adminResources.find(resource => resource.name === name) ?? adminResources[0]
}
