import type { AdminResourceName } from './resources'
import { ADMIN_API_PREFIX } from '@/config'
import { getAdminResource } from './resources'

export type AdminPagination<T> = {
  data: T[]
  has_more: boolean
  limit: number
  page: number
  total: number
}

export type AdminAccount = {
  id: string
  name?: string | null
  email?: string | null
  status?: string | null
  interface_language?: string | null
  interface_theme?: string | null
  timezone?: string | null
  workspace_count?: number | null
  workspaces?: Array<{
    tenant_id: string
    tenant_name?: string | null
    tenant_status?: string | null
    role?: string | null
    current: boolean
  }>
}

export type AdminRecommendedApp = {
  id: string
  app_id: string
  category?: string | null
  categories: string[]
  position: number
  is_listed: boolean
  is_learn_dify: boolean
  install_count: number
  language: string
  custom_disclaimer?: string | null
  app?: {
    id: string
    name?: string | null
    mode?: string | null
  } | null
  site?: {
    title?: string | null
    description?: string | null
    custom_disclaimer?: string | null
  } | null
}

export type AdminApp = {
  id: string
  tenant_id: string
  name?: string | null
  description?: string | null
  mode?: string | null
  status?: string | null
  enable_site: boolean
  enable_api: boolean
  is_public: boolean
  api_rpm?: number | null
  api_rph?: number | null
  max_active_requests?: number | null
  maintainer?: string | null
  site?: {
    title?: string | null
    status?: string | null
  } | null
}

export type AdminSkillTaxonomy = {
  id?: string | null
  slug: string
  name: string
}

export type AdminSkill = {
  id: string
  slug: string
  name: string
  description: string
  author_name?: string | null
  source_type?: string | null
  source_url?: string | null
  install_command?: string | null
  publication_status?: string | null
  audit_status?: string | null
  audit_notes?: string | null
  categories: AdminSkillTaxonomy[]
  tags: AdminSkillTaxonomy[]
  install_count: number
  github_stars: number
  position: number
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  latest_version?: {
    id?: string | null
    content_type?: string | null
    skill_markdown?: string | null
    package_filename?: string | null
    package_size?: number | null
    checksum_sha256?: string | null
  } | null
}

export type AdminSkillCreatePayload = {
  slug: string
  name: string
  description: string
  author_name?: string | null
  source_type?: string | null
  source_url?: string | null
  install_command?: string | null
  icon?: string | null
  icon_background?: string | null
  icon_url?: string | null
  publication_status?: string | null
  audit_status?: string | null
  audit_notes?: string | null
  categories?: string[]
  tags?: string[]
  install_count?: number | null
  github_stars?: number | null
  position?: number | null
  content_type?: string | null
  skill_markdown?: string | null
}

export type AdminResourceItemMap = {
  accounts: AdminAccount
  recommendedApps: AdminRecommendedApp
  apps: AdminApp
  skills: AdminSkill
}

type AdminCreateResourcePayloadMap = {
  accounts: Partial<AdminAccount>
  recommendedApps: Partial<AdminRecommendedApp>
  apps: Partial<AdminApp>
  skills: AdminSkillCreatePayload
}

export type AdminListParams = {
  apiKey: string
  resource: AdminResourceName
  page: number
  limit: number
  keyword?: string
  filters?: Record<string, string | boolean | undefined>
}

type AdminRequestOptions = {
  apiKey: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  searchParams?: URLSearchParams
}

function buildAdminUrl(path: string, searchParams?: URLSearchParams) {
  const url = new URL(`${ADMIN_API_PREFIX}${path}`)
  searchParams?.forEach((value, key) => {
    url.searchParams.set(key, value)
  })
  return url.toString()
}

export function createAdminResource<TResource extends AdminResourceName>(
  apiKey: string,
  resource: TResource,
  body: AdminCreateResourcePayloadMap[TResource],
) {
  const definition = getAdminResource(resource)
  return adminRequest<AdminResourceItemMap[TResource]>(definition.endpoint, {
    apiKey,
    method: 'POST',
    body,
  })
}

async function adminRequest<T>(path: string, {
  apiKey,
  method = 'GET',
  body,
  searchParams,
}: AdminRequestOptions): Promise<T> {
  const response = await fetch(buildAdminUrl(path, searchParams), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok)
    throw new Error(`Admin request failed with status ${response.status}.`)

  if (response.status === 204)
    return undefined as T

  return response.json() as Promise<T>
}

export async function fetchAdminResourceList<TResource extends AdminResourceName>({
  apiKey,
  resource,
  page,
  limit,
  keyword,
  filters,
}: AdminListParams): Promise<AdminPagination<AdminResourceItemMap[TResource]>> {
  const definition = getAdminResource(resource)
  const searchParams = new URLSearchParams()
  searchParams.set('page', String(page))
  searchParams.set('limit', String(limit))
  if (keyword?.trim())
    searchParams.set('keyword', keyword.trim())

  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '')
      searchParams.set(key, String(value))
  })

  return adminRequest<AdminPagination<AdminResourceItemMap[TResource]>>(definition.endpoint, {
    apiKey,
    searchParams,
  })
}

export function fetchAdminResourceDetail<TResource extends AdminResourceName>(
  apiKey: string,
  resource: TResource,
  id: string,
) {
  const definition = getAdminResource(resource)
  return adminRequest<AdminResourceItemMap[TResource]>(`${definition.endpoint}/${id}`, { apiKey })
}

export function updateAdminResource<TResource extends AdminResourceName>(
  apiKey: string,
  resource: TResource,
  id: string,
  body: Partial<AdminResourceItemMap[TResource]>,
) {
  const definition = getAdminResource(resource)
  return adminRequest<AdminResourceItemMap[TResource]>(`${definition.endpoint}/${id}`, {
    apiKey,
    method: 'PATCH',
    body,
  })
}

export function deleteAdminResource(apiKey: string, resource: AdminResourceName, id: string) {
  const definition = getAdminResource(resource)
  return adminRequest<void>(`${definition.endpoint}/${id}`, {
    apiKey,
    method: 'DELETE',
  })
}

export async function uploadAdminSkillAsset(apiKey: string, skillId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${ADMIN_API_PREFIX}/skills/${encodeURIComponent(skillId)}/assets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })
  if (!response.ok)
    throw new Error(`Admin upload failed with status ${response.status}.`)
  return response.json() as Promise<unknown>
}
