import type { I18nKeysWithPrefix } from '@/types/i18n'

export type AdminResourceName = 'accounts' | 'recommendedApps' | 'apps' | 'skills'

type AdminResourceTextKey = I18nKeysWithPrefix<'admin', 'resources.'>

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
] as const satisfies readonly AdminResourceDefinition[]

export function getAdminResource(name: AdminResourceName) {
  return adminResources.find(resource => resource.name === name) ?? adminResources[0]
}
