import type { SkillPagination } from '@/models/skill'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSkillDetail, fetchSkillList, fetchSkillRecommendations, getSkillDownloadUrl, recordSkillCopy } from '../skills'

vi.mock('@/config', () => ({
  API_PREFIX: '/console/api',
}))

const createJsonResponse = (body: unknown, init?: ResponseInit) => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const emptyPagination: SkillPagination = {
  data: [],
  filters: {
    categories: [],
    tags: [],
  },
  has_more: false,
  limit: 30,
  page: 1,
  total: 0,
}

describe('skills service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse(emptyPagination)))
  })

  it('should request skill list when API prefix is relative', async () => {
    await expect(fetchSkillList({
      page: 1,
      limit: 30,
      keyword: ' react ',
      category: '',
      sort: 'github_stars_desc',
    })).resolves.toEqual(emptyPagination)

    expect(fetch).toHaveBeenCalledWith(
      '/console/api/explore/skills?page=1&limit=30&keyword=+react+&sort=github_stars_desc',
      { credentials: 'include' },
    )
  })

  it('should request skill detail with encoded slug', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse({
      id: 'skill-1',
      slug: 'react/tests',
      name: 'React Tests',
      description: 'Write tests.',
      categories: [],
      tags: [],
      install_count: 0,
      github_stars: 0,
      position: 0,
    }))

    await fetchSkillDetail('react/tests')

    expect(fetch).toHaveBeenCalledWith(
      '/console/api/explore/skills/react%2Ftests',
      { credentials: 'include' },
    )
  })

  it('should request skill recommendation groups', async () => {
    const recommendationGroups = {
      featured: [],
      top20: [],
      latest: [],
      hottest: [],
    }
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(recommendationGroups))

    await expect(fetchSkillRecommendations()).resolves.toEqual(recommendationGroups)

    expect(fetch).toHaveBeenCalledWith(
      '/console/api/explore/skills/recommendations',
      { credentials: 'include' },
    )
  })

  it('should record copy event with credentials', async () => {
    await recordSkillCopy('skill/1')

    expect(fetch).toHaveBeenCalledWith(
      '/console/api/explore/skills/skill%2F1/copy-events',
      {
        method: 'POST',
        credentials: 'include',
      },
    )
  })

  it('should build download URL with encoded id', () => {
    expect(getSkillDownloadUrl('skill/1')).toBe('/console/api/explore/skills/skill%2F1/download')
  })
})
