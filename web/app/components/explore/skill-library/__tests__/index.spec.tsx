import type { Skill, SkillPagination, SkillRecommendationGroups } from '@/models/skill'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSkillDetail, fetchSkillList, fetchSkillRecommendations, recordSkillCopy } from '@/service/skills'
import SkillLibrary from '../index'
import { stripSkillMetadataBlock } from '../utils'

vi.mock('@/service/skills', () => ({
  fetchSkillDetail: vi.fn(),
  fetchSkillList: vi.fn(),
  fetchSkillRecommendations: vi.fn(),
  getSkillDownloadUrl: vi.fn((id: string) => `/download/${encodeURIComponent(id)}`),
  recordSkillCopy: vi.fn(),
}))

vi.mock('@/app/components/plugins/marketplace/hooks', () => ({
  useMarketplaceContainerScroll: vi.fn(),
}))

const createSkill = (overrides: Partial<Skill> = {}): Skill => ({
  id: 'skill-1',
  slug: 'skill-1',
  name: 'Skill One',
  description: 'A skill for testing.',
  author_name: 'July',
  source_type: 'official',
  source_url: null,
  install_command: 'july install skill-1',
  icon: null,
  icon_background: null,
  icon_url: null,
  publication_status: 'published',
  audit_status: 'approved',
  audit_notes: null,
  categories: [],
  tags: [],
  install_count: 0,
  github_stars: 0,
  is_featured: false,
  position: 0,
  published_at: null,
  created_at: null,
  updated_at: null,
  latest_version: {
    id: 'version-1',
    content_type: 'remote_reference',
    skill_markdown: null,
    package_filename: null,
    package_size: null,
    checksum_sha256: null,
    is_latest: true,
    published_at: null,
    created_at: null,
    updated_at: null,
  },
  ...overrides,
})

const createPagination = (skills: Skill[] = []): SkillPagination => ({
  data: skills,
  filters: {
    categories: [
      {
        id: 'category-1',
        slug: 'agent',
        name: 'Agent',
        cn_name: '智能体',
      },
    ],
    tags: [],
  },
  has_more: false,
  limit: 30,
  page: 1,
  total: skills.length,
})

const createRecommendationGroups = (
  overrides: Partial<SkillRecommendationGroups> = {},
): SkillRecommendationGroups => ({
  featured: [createSkill({ id: 'featured', name: 'Featured Skill', is_featured: true })],
  top20: [createSkill({ id: 'top20', name: 'Top Skill' })],
  latest: [createSkill({ id: 'latest', name: 'Latest Skill' })],
  hottest: [createSkill({ id: 'hottest', name: 'Hottest Skill' })],
  ...overrides,
})

const renderSkillLibrary = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SkillLibrary />
    </QueryClientProvider>,
  )
}

describe('SkillLibrary recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchSkillList).mockResolvedValue(createPagination())
    vi.mocked(fetchSkillDetail).mockResolvedValue(createSkill())
    vi.mocked(fetchSkillRecommendations).mockResolvedValue(createRecommendationGroups())
  })

  describe('Rendering', () => {
    it('should show recommendation groups when keyword and category are empty', async () => {
      renderSkillLibrary()

      expect(await screen.findByText('Featured Skill')).toBeInTheDocument()
      expect(screen.getByText('Top Skill')).toBeInTheDocument()
      expect(screen.getByText('Latest Skill')).toBeInTheDocument()
      expect(screen.getByText('Hottest Skill')).toBeInTheDocument()
      expect(screen.getByText('explore:skills.recommendations.featured')).toBeInTheDocument()
      expect(screen.getByText('explore:skills.recommendations.top20')).toBeInTheDocument()
      expect(fetchSkillRecommendations).toHaveBeenCalledTimes(1)
    })

    it('should hide zero install and star metrics while showing positive metrics', async () => {
      vi.mocked(fetchSkillRecommendations).mockResolvedValue(createRecommendationGroups({
        featured: [
          createSkill({
            id: 'zero-metrics',
            name: 'Zero Metrics Skill',
            install_count: 0,
            github_stars: 0,
          }),
          createSkill({
            id: 'positive-metrics',
            name: 'Positive Metrics Skill',
            install_count: 12,
            github_stars: 7,
          }),
        ],
        top20: [],
        latest: [],
        hottest: [],
      }))

      renderSkillLibrary()

      expect(await screen.findByText('Zero Metrics Skill')).toBeInTheDocument()
      const zeroMetricsCard = screen.getByRole('button', { name: 'plugin:detailPanel.operation.detail: Zero Metrics Skill' })
      const positiveMetricsCard = screen.getByRole('button', { name: 'plugin:detailPanel.operation.detail: Positive Metrics Skill' })

      expect(within(zeroMetricsCard).queryByText('explore:skills.metrics')).not.toBeInTheDocument()
      expect(within(zeroMetricsCard).queryByText('0')).not.toBeInTheDocument()
      expect(within(positiveMetricsCard).getByText('explore:skills.metrics')).toBeInTheDocument()
      expect(within(positiveMetricsCard).getByText('7')).toBeInTheDocument()
    })

    it('should open detail in a lightweight reading layout with metadata', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText,
        },
      })
      const detailSkill = createSkill({
        id: 'detail-skill',
        slug: 'detail-skill',
        name: 'Detail Skill',
        description: 'A focused skill detail for layout testing.',
        source_url: 'https://github.com',
        install_command: 'july install detail-skill',
        install_count: 42,
        github_stars: 7,
        categories: [
          {
            id: 'category-automation',
            slug: 'automation',
            name: 'Automation',
          },
        ],
        tags: [
          {
            id: 'tag-agent',
            slug: 'agent-tools',
            name: 'Agent tools',
          },
        ],
        latest_version: {
          id: 'detail-version',
          content_type: 'markdown_file',
          skill_markdown: [
            '---',
            'name: detail-skill',
            'description: A hidden metadata block.',
            'license: MIT',
            'metadata:',
            '  author: july',
            '  version: "1.0.0"',
            '---',
            '# Detail Skill',
            '',
            'Use this skill for layout testing.',
          ].join('\n'),
          package_filename: 'detail-skill.md',
          package_size: null,
          checksum_sha256: 'abc123',
          is_latest: true,
          published_at: null,
          created_at: null,
          updated_at: null,
        },
      })
      vi.mocked(fetchSkillRecommendations).mockResolvedValue(createRecommendationGroups({
        featured: [detailSkill],
        top20: [],
        latest: [],
        hottest: [],
      }))
      vi.mocked(fetchSkillDetail).mockResolvedValue(detailSkill)

      renderSkillLibrary()

      fireEvent.click(await screen.findByRole('button', { name: 'plugin:detailPanel.operation.detail: Detail Skill' }))

      expect(stripSkillMetadataBlock(detailSkill.latest_version?.skill_markdown)).toBe('# Detail Skill\n\nUse this skill for layout testing.')
      expect(await screen.findByRole('article', { name: 'Detail Skill' })).toBeInTheDocument()
      expect(screen.getByText('SKILL.md')).toBeInTheDocument()
      expect(screen.queryByText('name: detail-skill')).not.toBeInTheDocument()
      expect(screen.queryByText('license: MIT')).not.toBeInTheDocument()
      expect(screen.queryByText('explore:skills.preview')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'explore:skills.copyMarkdown' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'explore:skills.downloadMarkdown' })).not.toBeInTheDocument()
      expect(screen.queryByText('https://github.com')).not.toBeInTheDocument()

      expect(screen.queryByText('Automation')).not.toBeInTheDocument()

      const metadata = screen.getByRole('complementary', { name: 'explore:skills.metadata' })
      expect(within(metadata).getByText('explore:skills.stats')).toBeInTheDocument()
      expect(within(metadata).getByText('explore:skills.installCount')).toBeInTheDocument()
      expect(within(metadata).getByText('42')).toBeInTheDocument()
      const githubStarsLabel = within(metadata).getByText('explore:skills.githubStars')
      expect(githubStarsLabel).toBeInTheDocument()
      expect(githubStarsLabel.closest('div')?.querySelector('.i-ri-star-fill')).toBeInTheDocument()
      expect(within(metadata).getByText('7')).toBeInTheDocument()
      expect(within(metadata).getByText('explore:skills.resourceType')).toBeInTheDocument()

      expect(screen.getByText('july install detail-skill')).toBeInTheDocument()
      const copyInstallButton = screen.getByRole('button', { name: 'explore:skills.copyInstall' })
      expect(screen.getAllByRole('button', { name: 'explore:skills.copyInstall' })).toHaveLength(1)

      fireEvent.click(copyInstallButton)

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('july install detail-skill')
      })
      expect(recordSkillCopy).toHaveBeenCalledWith('detail-skill')
    })

    it('should prefer Chinese taxonomy names when available', async () => {
      vi.mocked(fetchSkillRecommendations).mockResolvedValue(createRecommendationGroups({
        featured: [
          createSkill({
            id: 'localized-taxonomy',
            name: 'Localized Taxonomy Skill',
            tags: [
              {
                id: 'tag-1',
                slug: 'automation',
                name: 'automation',
                cn_name: '自动化',
              },
            ],
          }),
        ],
        top20: [],
        latest: [],
        hottest: [],
      }))

      renderSkillLibrary()

      expect(await screen.findByText('智能体')).toBeInTheDocument()
      expect(screen.getByText('自动化')).toBeInTheDocument()
    })
  })

  describe('State Management', () => {
    it('should show the ordinary list after searching', async () => {
      vi.mocked(fetchSkillList).mockImplementation(async (params) => {
        if (params?.keyword === 'react')
          return createPagination([createSkill({ id: 'search-result', name: 'Search Result Skill' })])

        return createPagination()
      })

      renderSkillLibrary()

      expect(await screen.findByText('Featured Skill')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('explore:skills.searchPlaceholder'), {
        target: {
          value: 'react',
        },
      })
      fireEvent.click(screen.getByRole('button', { name: 'explore:skills.search' }))

      expect(await screen.findByText('Search Result Skill')).toBeInTheDocument()
      await waitFor(() => {
        expect(screen.queryByText('explore:skills.recommendations.featured')).not.toBeInTheDocument()
      })
    })
  })

  describe('Edge Cases', () => {
    it('should fall back to the ordinary list when recommendations fail', async () => {
      vi.mocked(fetchSkillList).mockResolvedValue(createPagination([
        createSkill({ id: 'ordinary-list-skill', name: 'Ordinary List Skill' }),
      ]))
      vi.mocked(fetchSkillRecommendations).mockRejectedValue(new Error('Not found'))

      renderSkillLibrary()

      expect(await screen.findByText('Ordinary List Skill')).toBeInTheDocument()
      expect(screen.queryByText('explore:skills.recommendations.featured')).not.toBeInTheDocument()
      expect(screen.queryByText('explore:skills.loadError')).not.toBeInTheDocument()
    })

    it('should hide featured section when featured recommendations are empty', async () => {
      vi.mocked(fetchSkillRecommendations).mockResolvedValue(createRecommendationGroups({
        featured: [],
      }))

      renderSkillLibrary()

      expect(await screen.findByText('Top Skill')).toBeInTheDocument()
      expect(screen.queryByText('explore:skills.recommendations.featured')).not.toBeInTheDocument()
    })
  })
})
