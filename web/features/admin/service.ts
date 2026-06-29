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

export type AdminSkillCategory = AdminSkillTaxonomy & {
  id: string
  position: number
  created_at?: string | null
  updated_at?: string | null
}

export type AdminSkillTag = AdminSkillTaxonomy & {
  id: string
  created_at?: string | null
  updated_at?: string | null
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
  is_featured: boolean
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

export type AdminAutoServiceRunLog = {
  id: string
  auto_service_id: string
  status: string
  trigger_type: string
  celery_task_id?: string | null
  started_at?: string | null
  finished_at?: string | null
  duration_ms?: number | null
  result?: Record<string, unknown> | null
  error?: string | null
  snapshot_path?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type AdminAutoService = {
  id: string
  code: string
  name: string
  description?: string | null
  service_type: string
  status: string
  schedule_type: string
  interval_minutes?: number | null
  cron_expression?: string | null
  timezone: string
  config: Record<string, unknown>
  last_run_at?: string | null
  last_run_status?: string | null
  next_run_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  latest_run_log?: AdminAutoServiceRunLog | null
}

export type AdminAutoServiceCreatePayload = {
  code: string
  name: string
  description?: string | null
  service_type: string
  status?: string
  schedule_type?: string
  interval_minutes?: number | null
  cron_expression?: string | null
  timezone?: string
  config?: Record<string, unknown>
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
  is_featured?: boolean | null
  position?: number | null
  content_type?: string | null
  skill_markdown?: string | null
}

export type AdminSkillVersionCreatePayload = {
  content_type?: string | null
  skill_markdown?: string | null
  is_latest?: boolean
}

export type AdminSkillBatchPublishPayload = {
  skill_ids?: string[]
  keyword?: string
  category?: string
  publication_status?: string
  source_type?: string
  audit_status?: string
  min_github_stars?: number
  updated_at_start?: string
  updated_at_end?: string
}

export type AdminSkillBatchPublishResponse = {
  updated_count: number
}

export type AdminResourceItemMap = {
  accounts: AdminAccount
  recommendedApps: AdminRecommendedApp
  apps: AdminApp
  skills: AdminSkill
  skillCategories: AdminSkillCategory
  skillTags: AdminSkillTag
  autoServices: AdminAutoService
}

type AdminCreateResourcePayloadMap = {
  accounts: Partial<AdminAccount>
  recommendedApps: Partial<AdminRecommendedApp>
  apps: Partial<AdminApp>
  skills: AdminSkillCreatePayload
  skillCategories: Partial<AdminSkillCategory>
  skillTags: Partial<AdminSkillTag>
  autoServices: AdminAutoServiceCreatePayload
}

export type AdminListParams = {
  apiKey: string
  resource: AdminResourceName
  page: number
  limit: number
  keyword?: string
  filters?: Record<string, string | boolean | undefined>
  sort?: string
}

type AdminRequestOptions = {
  apiKey: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  searchParams?: URLSearchParams
}

export class AdminRequestError extends Error {
  status: number
  responseMessage?: string

  constructor(status: number, responseMessage?: string) {
    super(responseMessage ? `Admin request failed with status ${status}: ${responseMessage}` : `Admin request failed with status ${status}.`)
    this.name = 'AdminRequestError'
    this.status = status
    this.responseMessage = responseMessage
  }
}

async function readAdminErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json() as unknown
      if (payload && typeof payload === 'object') {
        const errorPayload = payload as Record<string, unknown>
        const message = errorPayload.message ?? errorPayload.error ?? errorPayload.detail
        if (typeof message === 'string')
          return message
        if (Array.isArray(message))
          return message.map(item => String(item)).join(', ')
        if (message && typeof message === 'object')
          return JSON.stringify(message)
      }
    }
    catch {
      return undefined
    }
  }

  try {
    const message = await response.text()
    return message.trim() || undefined
  }
  catch {
    return undefined
  }
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
    throw new AdminRequestError(response.status, await readAdminErrorMessage(response))

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
  sort,
}: AdminListParams): Promise<AdminPagination<AdminResourceItemMap[TResource]>> {
  const definition = getAdminResource(resource)
  const searchParams = new URLSearchParams()
  searchParams.set('page', String(page))
  searchParams.set('limit', String(limit))
  if (keyword?.trim())
    searchParams.set('keyword', keyword.trim())
  if (sort?.trim())
    searchParams.set('sort', sort.trim())

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

export function createAdminSkillVersion(apiKey: string, skillId: string, body: AdminSkillVersionCreatePayload) {
  return adminRequest<NonNullable<AdminSkill['latest_version']>>(`/skills/${encodeURIComponent(skillId)}/versions`, {
    apiKey,
    method: 'POST',
    body,
  })
}

export function batchPublishAdminSkills(apiKey: string, body: AdminSkillBatchPublishPayload) {
  return adminRequest<AdminSkillBatchPublishResponse>('/skills/batch-publish', {
    apiKey,
    method: 'POST',
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
    throw new AdminRequestError(response.status, await readAdminErrorMessage(response))
  return response.json() as Promise<unknown>
}

export function runAdminAutoService(apiKey: string, serviceId: string) {
  return adminRequest<AdminAutoServiceRunLog>(`/auto-services/${encodeURIComponent(serviceId)}/run`, {
    apiKey,
    method: 'POST',
  })
}

export function fetchAdminAutoServiceLogs(
  apiKey: string,
  serviceId: string,
  page: number,
  limit: number,
) {
  const searchParams = new URLSearchParams()
  searchParams.set('page', String(page))
  searchParams.set('limit', String(limit))
  return adminRequest<AdminPagination<AdminAutoServiceRunLog>>(
    `/auto-services/${encodeURIComponent(serviceId)}/logs`,
    {
      apiKey,
      searchParams,
    },
  )
}
