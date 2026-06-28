import type { Skill, SkillListParams, SkillPagination } from '@/models/skill'
import { API_PREFIX } from '@/config'

function buildConsoleUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = `${API_PREFIX.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const searchParams = new URLSearchParams()
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && String(value).trim() !== '')
      searchParams.set(key, String(value))
  })
  const query = searchParams.toString()
  return query ? `${url}?${query}` : url
}

async function consoleRequest<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const response = await fetch(buildConsoleUrl(path, params), {
    credentials: 'include',
  })
  if (!response.ok)
    throw new Error(`Console request failed with status ${response.status}.`)
  return response.json() as Promise<T>
}

export function fetchSkillList(params: SkillListParams = {}) {
  return consoleRequest<SkillPagination>('/explore/skills', params)
}

export function fetchSkillDetail(slug: string) {
  return consoleRequest<Skill>(`/explore/skills/${encodeURIComponent(slug)}`)
}

export function recordSkillCopy(skillId: string) {
  return fetch(buildConsoleUrl(`/explore/skills/${encodeURIComponent(skillId)}/copy-events`), {
    method: 'POST',
    credentials: 'include',
  })
}

export function getSkillDownloadUrl(skillId: string) {
  return buildConsoleUrl(`/explore/skills/${encodeURIComponent(skillId)}/download`)
}
