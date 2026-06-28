'use client'

import type { Skill, SkillTaxonomy } from '@/models/skill'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from '@langgenius/dify-ui/dialog'
import { Input } from '@langgenius/dify-ui/input'
import { toast } from '@langgenius/dify-ui/toast'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Markdown } from '@/app/components/base/markdown'
import { useMarketplaceContainerScroll } from '@/app/components/plugins/marketplace/hooks'
import { fetchSkillDetail, fetchSkillList, getSkillDownloadUrl, recordSkillCopy } from '@/service/skills'
import { getSkillSourceTypeLabel } from './source-type'

const DEFAULT_LIMIT = 30
const SKILL_GRID_CLASS_NAME = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5'
const GENERIC_TAXONOMY_VALUES = new Set([
  'api',
  'apis',
  'github',
  'git-hub',
  'skill',
  'skills',
  'skill-sh',
  'skills-sh',
  'skills.sh',
  'skillssh',
])

function normalizeValue(value: object | string | null | undefined) {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value
  return String('value' in value ? value.value : value)
}

function getContentTypeLabel(contentType: string | null | undefined, t: ReturnType<typeof useTranslation>['t']) {
  if (contentType === 'zip_package')
    return t('skills.contentTypes.zip', { ns: 'explore' })
  if (contentType === 'markdown_file')
    return t('skills.contentTypes.markdown', { ns: 'explore' })
  return t('skills.contentTypes.remote', { ns: 'explore' })
}

function normalizeTaxonomyValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function isGenericTaxonomy(item: SkillTaxonomy) {
  return [item.slug, item.name].some((value) => {
    const normalizedValue = normalizeTaxonomyValue(value)
    return GENERIC_TAXONOMY_VALUES.has(normalizedValue)
  })
}

function SkillIcon({ skill }: { skill: Skill }) {
  if (skill.icon_url) {
    return (
      <img
        src={skill.icon_url}
        alt=""
        className="size-10 rounded-xl object-cover"
      />
    )
  }

  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-divider-subtle bg-background-section text-text-accent shadow-xs"
      aria-hidden="true"
    >
      <span className="i-custom-public-agent-building-blocks size-5" />
    </div>
  )
}

function TaxonomyPills({ items, limit = 3 }: { items: SkillTaxonomy[], limit?: number }) {
  const visibleItems = items.filter(item => !isGenericTaxonomy(item)).slice(0, limit)

  if (!visibleItems.length)
    return null

  return (
    <div className="flex min-h-6 flex-wrap items-center gap-1">
      {visibleItems.map(item => (
        <span key={item.slug} className="max-w-24 truncate rounded-md bg-background-section px-2 py-0.5 system-xs-medium text-text-tertiary">
          {item.name}
        </span>
      ))}
    </div>
  )
}

function SkillCardSkeleton() {
  return (
    <div
      className="flex h-[148px] flex-col overflow-hidden rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-on-panel-item-bg shadow-xs"
      aria-hidden="true"
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="size-10 shrink-0 animate-pulse rounded-xl bg-background-section-burn" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="h-4 w-2/3 animate-pulse rounded-md bg-background-section-burn" />
          <div className="h-3 w-2/5 animate-pulse rounded-md bg-background-section-burn" />
        </div>
      </div>
      <div className="mx-4 mt-1 space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded-md bg-background-section-burn" />
        <div className="h-3 w-4/5 animate-pulse rounded-md bg-background-section-burn" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 px-4 pt-2 pb-4">
        <div className="h-5 w-16 animate-pulse rounded-md bg-background-section-burn" />
        <div className="h-5 w-24 animate-pulse rounded-md bg-background-section-burn" />
      </div>
    </div>
  )
}

function SkillGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={SKILL_GRID_CLASS_NAME} role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <SkillCardSkeleton key={index} />
      ))}
    </div>
  )
}

function SkillCard({
  skill,
  onOpen,
}: {
  skill: Skill
  onOpen: (skill: Skill) => void
}) {
  const { t } = useTranslation()
  const contentType = normalizeValue(skill.latest_version?.content_type)
  const detailLabel = t('detailPanel.operation.detail', { ns: 'plugin' })
  const authorName = skill.author_name?.trim()
  const githubStars = skill.github_stars ?? 0

  return (
    <button
      type="button"
      className={cn(
        'group relative flex h-[148px] flex-col overflow-hidden rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-on-panel-item-bg text-left shadow-xs transition-all hover:bg-components-panel-on-panel-item-bg-hover hover:shadow-md focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden',
      )}
      aria-label={`${detailLabel}: ${skill.name}`}
      onClick={() => onOpen(skill)}
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <SkillIcon skill={skill} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <div className="flex h-5 min-w-0 items-center">
            <div className="truncate system-md-medium text-text-primary">{skill.name}</div>
          </div>
          <div className="flex h-4 min-w-0 items-center gap-2 system-xs-regular text-text-tertiary">
            {authorName && (
              <>
                <span className="truncate">{authorName}</span>
                <span className="shrink-0 text-text-quaternary" aria-hidden="true">/</span>
              </>
            )}
            <span className="shrink-0 tabular-nums">{t('skills.metrics', { ns: 'explore', count: skill.install_count })}</span>
            {githubStars > 0 && (
              <>
                <span className="shrink-0 text-text-quaternary" aria-hidden="true">/</span>
                <span className="flex shrink-0 items-center gap-0.5 tabular-nums" title={t('skills.stars', { ns: 'explore', count: githubStars })}>
                  <span className="i-ri-star-line size-3" aria-hidden="true" />
                  {githubStars}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mx-4 mt-1 line-clamp-2 min-h-9 system-xs-regular leading-[18px] text-text-secondary">
        {skill.description}
      </p>
      <div className="mt-auto flex min-w-0 items-center justify-between gap-2 px-4 pt-2 pr-5 pb-4">
        <TaxonomyPills items={skill.tags.length ? skill.tags : skill.categories} />
        <div className="ml-auto flex max-w-[48%] min-w-0 shrink-0 items-center gap-1 rounded-md bg-background-section px-2 py-0.5 system-xs-medium text-text-tertiary">
          <span className="truncate">{getSkillSourceTypeLabel(normalizeValue(skill.source_type), t)}</span>
          <span aria-hidden="true">/</span>
          <span className="truncate">{getContentTypeLabel(contentType, t)}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute right-[-0.5px] bottom-[-0.5px] left-[-0.5px] z-10 flex items-center justify-end rounded-b-xl bg-linear-to-t from-components-panel-on-panel-item-bg-hover from-[58%] to-background-gradient-mask-transparent px-4 pt-8 pb-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="flex h-8 items-center rounded-lg bg-components-panel-bg-blur px-3 system-sm-medium text-text-secondary shadow-xs backdrop-blur-[5px]">
          {detailLabel}
          <span aria-hidden className="ml-1 i-ri-arrow-right-up-line size-4" />
        </span>
      </div>
    </button>
  )
}

function ArticleMarkdown({
  markdown,
  isLoading,
  isError,
}: {
  markdown?: string | null
  isLoading?: boolean
  isError?: boolean
}) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-5 w-2/3 rounded-md bg-background-section-burn" />
        <div className="h-4 rounded-md bg-background-section-burn" />
        <div className="h-4 w-11/12 rounded-md bg-background-section-burn" />
        <div className="h-4 w-4/5 rounded-md bg-background-section-burn" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dashed border-divider-subtle bg-background-section p-6 text-center system-sm-regular text-text-tertiary">
        {t('skills.loadError', { ns: 'explore' })}
      </div>
    )
  }

  if (!markdown) {
    return (
      <div className="rounded-xl border border-dashed border-divider-subtle bg-background-section p-6 text-center system-sm-regular text-text-tertiary">
        {t('skills.emptyMarkdown', { ns: 'explore' })}
      </div>
    )
  }

  return (
    <Markdown
      content={markdown}
      className="max-w-none text-[14px]! leading-6!"
    />
  )
}

function DetailMetaItem({
  label,
  value,
}: {
  label: string
  value?: string | number | null
}) {
  return (
    <div className="min-w-0 rounded-lg bg-background-section px-3 py-2">
      <dt className="system-xs-medium text-text-tertiary">{label}</dt>
      <dd className="mt-1 truncate system-sm-medium text-text-secondary">{value || '-'}</dd>
    </div>
  )
}

function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill: Skill | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const skillSlug = skill?.slug
  const detailQuery = useQuery({
    queryKey: ['explore', 'skills', 'detail', skillSlug],
    queryFn: () => {
      if (!skillSlug)
        throw new Error('Skill is required.')
      return fetchSkillDetail(skillSlug)
    },
    enabled: open && Boolean(skillSlug),
    retry: false,
  })
  const copyMutation = useMutation({
    mutationFn: (skillId: string) => recordSkillCopy(skillId),
  })
  const detail = detailQuery.data ?? skill
  const version = detail?.latest_version
  const contentType = normalizeValue(version?.content_type)
  const markdown = version?.skill_markdown
  const authorName = detail?.author_name?.trim()

  const handleCopyInstall = async () => {
    if (!detail)
      return
    if (!detail.install_command)
      return
    await navigator.clipboard.writeText(detail.install_command)
    copyMutation.mutate(detail.id)
    toast.success(t('skills.copySuccess', { ns: 'explore' }))
  }

  const handleCopyMarkdown = async () => {
    if (!detail)
      return
    if (!markdown)
      return
    await navigator.clipboard.writeText(markdown)
    toast.success(t('skills.copySuccess', { ns: 'explore' }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="h-[calc(100dvh-16px)] w-full max-w-[920px] overflow-hidden p-0">
        {detail && (
          <div className="flex size-full min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 rounded-t-xl bg-background-body p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1">
                  <span aria-hidden="true" className="i-ri-article-line size-3 shrink-0 text-text-tertiary" />
                  <DialogTitle className="truncate text-xs font-medium text-text-tertiary uppercase">
                    {t('skills.preview', { ns: 'explore' })}
                  </DialogTitle>
                </div>
                <DialogCloseButton
                  aria-label={t('operation.close', { ns: 'common' })}
                  className="static size-8 rounded-lg"
                />
              </div>

              <div className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4">
                <div className="flex items-start gap-3">
                  <SkillIcon skill={detail} />
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate title-xl-semi-bold text-text-primary">{detail.name}</h1>
                    <div className="mt-1 flex min-w-0 items-center gap-2 system-xs-regular text-text-tertiary">
                      {authorName && (
                        <>
                          <span className="truncate">{authorName}</span>
                          <span aria-hidden="true" className="text-text-quaternary">/</span>
                        </>
                      )}
                      <span className="truncate">{detail.slug}</span>
                      <span aria-hidden="true" className="text-text-quaternary">/</span>
                      <span className="shrink-0 tabular-nums">{t('skills.metrics', { ns: 'explore', count: detail.install_count })}</span>
                    </div>
                    <p className="mt-3 max-w-[72ch] system-sm-regular leading-6 text-text-secondary">{detail.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      <span className="rounded-md bg-background-section px-2 py-0.5 system-xs-medium text-text-tertiary">
                        {getSkillSourceTypeLabel(normalizeValue(detail.source_type), t)}
                      </span>
                      <span className="rounded-md bg-background-section px-2 py-0.5 system-xs-medium text-text-tertiary">
                        {getContentTypeLabel(contentType, t)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {contentType !== 'remote_reference' && (
                    <a
                      className="flex h-8 items-center justify-center rounded-lg bg-state-accent-solid px-3 system-sm-medium text-text-primary-on-surface hover:bg-state-accent-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
                      href={getSkillDownloadUrl(detail.id)}
                    >
                      {contentType === 'markdown_file' ? t('skills.downloadMarkdown', { ns: 'explore' }) : t('skills.downloadZip', { ns: 'explore' })}
                    </a>
                  )}
                  <Button
                    type="button"
                    variant={contentType === 'remote_reference' ? 'primary' : 'secondary'}
                    size="small"
                    disabled={!detail.install_command}
                    onClick={handleCopyInstall}
                  >
                    {t('skills.copyInstall', { ns: 'explore' })}
                  </Button>
                  {contentType === 'markdown_file' && (
                    <Button type="button" size="small" variant="secondary" disabled={!markdown} onClick={handleCopyMarkdown}>
                      {t('skills.copyMarkdown', { ns: 'explore' })}
                    </Button>
                  )}
                  {detail.source_url && (
                    <a
                      className="flex h-8 items-center gap-1 rounded-lg border border-components-button-secondary-border bg-components-button-secondary-bg px-3 system-sm-medium text-components-button-secondary-text hover:bg-components-button-secondary-bg-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
                      href={detail.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {t('skills.viewSource', { ns: 'explore' })}
                      <span aria-hidden="true" className="i-ri-external-link-line size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <article className="mx-auto max-w-[760px]">
                {detail.install_command && (
                  <section className="mb-5 rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4">
                    <h2 className="system-sm-semibold text-text-secondary">{t('skills.installCommand', { ns: 'explore' })}</h2>
                    <pre className="mt-2 overflow-auto rounded-lg bg-background-section p-3 system-xs-regular text-text-secondary">
                      {detail.install_command}
                    </pre>
                  </section>
                )}

                <section className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-6">
                  <ArticleMarkdown
                    markdown={markdown}
                    isLoading={detailQuery.isFetching}
                    isError={detailQuery.isError}
                  />
                </section>

                <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4">
                    <h2 className="system-sm-semibold text-text-secondary">{t('skills.categories', { ns: 'explore' })}</h2>
                    <div className="mt-3">
                      <TaxonomyPills items={detail.categories} limit={8} />
                    </div>
                  </div>
                  <div className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4">
                    <h2 className="system-sm-semibold text-text-secondary">{t('skills.tags', { ns: 'explore' })}</h2>
                    <div className="mt-3">
                      <TaxonomyPills items={detail.tags} limit={10} />
                    </div>
                  </div>
                </section>

                <section className="mt-5 rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4">
                  <h2 className="system-sm-semibold text-text-secondary">{t('skills.audit', { ns: 'explore' })}</h2>
                  <dl className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <DetailMetaItem label={t('skills.auditStatus', { ns: 'explore' })} value={detail.audit_status} />
                    <DetailMetaItem label={t('skills.sha256', { ns: 'explore' })} value={version?.checksum_sha256} />
                  </dl>
                </section>
              </article>
            </div>
          </div>
        )}
        {!detail && (
          <div className="flex h-80 items-center justify-center p-6 text-center system-sm-regular text-text-tertiary">
            {t('skills.selectHint', { ns: 'explore' })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SkillSearchField({
  value,
  onChange,
  onSubmit,
  onClear,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClear: () => void
}) {
  const { t } = useTranslation()

  return (
    <form
      className="z-11 mx-auto flex w-full max-w-[640px] shrink-0 items-center"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex w-full items-center rounded-xl border border-components-chat-input-border bg-components-panel-bg-blur p-1.5 shadow-md transition-colors focus-within:border-components-input-border-active">
        <div className="flex h-9 min-w-0 grow items-center gap-x-2 rounded-[10px] px-2">
          <span className="i-ri-search-line size-4 shrink-0 text-components-input-text-placeholder" aria-hidden="true" />
          <Input
            aria-label={t('skills.searchPlaceholder', { ns: 'explore' })}
            className="h-7 min-w-0 grow border-0 bg-transparent! px-0 body-md-medium text-text-secondary shadow-none outline-hidden hover:border-transparent hover:bg-transparent focus:border-transparent focus:bg-transparent focus:shadow-none"
            value={value}
            placeholder={t('skills.searchPlaceholder', { ns: 'explore' })}
            onChange={event => onChange(event.target.value)}
          />
          {value && (
            <button
              type="button"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-state-base-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
              aria-label={t('skills.reset', { ns: 'explore' })}
              onClick={onClear}
            >
              <span className="i-ri-close-line size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <Button type="submit" variant="primary" size="small" className="ml-1 h-8">
          {t('skills.search', { ns: 'explore' })}
        </Button>
      </div>
    </form>
  )
}

function FilterButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-8 cursor-pointer items-center rounded-lg border border-transparent px-2.5 system-md-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden',
        selected
          ? 'border-components-main-nav-nav-button-border bg-components-main-nav-nav-button-bg-active! text-components-main-nav-nav-button-text-active! shadow-xs'
          : 'text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export default function SkillLibrary() {
  const { t } = useTranslation()
  const [keywordDraft, setKeywordDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null)
  const listQuery = useInfiniteQuery({
    queryKey: ['explore', 'skills', 'list', keyword, category],
    queryFn: ({ pageParam = 1 }) => fetchSkillList({
      page: pageParam,
      limit: DEFAULT_LIMIT,
      keyword,
      category,
    }),
    getNextPageParam: lastPage => lastPage.has_more ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    retry: false,
  })
  const skills = listQuery.data?.pages.flatMap(page => page.data) ?? []
  const firstPage = listQuery.data?.pages[0]
  const categories = firstPage?.filters?.categories ?? []
  const isInitialLoading = listQuery.isLoading && !listQuery.data
  const { hasNextPage, fetchNextPage, isFetching } = listQuery
  const handlePageChange = useCallback(() => {
    if (hasNextPage && !isFetching)
      void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetching])

  useMarketplaceContainerScroll(handlePageChange, 'skills-library-container')

  return (
    <div id="skills-library-container" className="h-full min-h-0 overflow-y-auto border-l-[0.5px] border-divider-regular bg-background-body">
      <div className="flex w-full flex-col pt-8 pb-6">
        <header className="relative z-0 mx-auto w-[calc(100%-24px)] max-w-[1440px] overflow-hidden rounded-lg px-5 pt-8 pb-6">
          <div className="absolute inset-0 bg-saas-dify-blue-static" />
          <div
            className="absolute inset-0 bg-no-repeat opacity-80 mix-blend-lighten"
            style={{
              backgroundImage: 'url(/marketplace/hero-bg.jpg)',
              backgroundPosition: 'center top',
              backgroundSize: '110% auto',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: 'url(/marketplace/hero-gradient-noise.svg)' }}
          />
          <div className="relative z-10 mx-auto flex max-w-[880px] flex-col items-center text-center">
            <h1 className="mb-2 shrink-0 text-[30px] leading-9 font-semibold text-text-primary-on-surface">
              {t('skills.title', { ns: 'explore' })}
            </h1>
            <p className="max-w-[720px] shrink-0 body-md-medium text-text-secondary-on-surface">
              {t('skills.description', { ns: 'explore' })}
            </p>
            <div className="mt-5 inline-flex h-9 items-center rounded-full border border-white/50 bg-white/20 px-4 system-sm-semibold text-text-primary-on-surface shadow-xs backdrop-blur-[6px]">
              {t('skills.total', { ns: 'explore', total: firstPage?.total ?? 0 })}
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-10 mt-4 bg-background-body px-3 pb-3">
          <SkillSearchField
            value={keywordDraft}
            onChange={setKeywordDraft}
            onSubmit={() => setKeyword(keywordDraft.trim())}
            onClear={() => {
              setKeywordDraft('')
              setKeyword('')
            }}
          />
          <div className="mt-3 flex shrink-0 items-center justify-start gap-2 overflow-x-auto px-1 md:justify-center">
            <FilterButton
              label={t('skills.allCategories', { ns: 'explore' })}
              selected={!category}
              onClick={() => setCategory('')}
            />
            {categories.map(item => (
              <FilterButton
                key={item.slug}
                label={item.name}
                selected={category === item.slug}
                onClick={() => setCategory(item.slug)}
              />
            ))}
          </div>
        </div>

        <div className="relative min-h-0 flex-1 px-3 pt-1">
          {isInitialLoading && (
            <SkillGridSkeleton />
          )}
          {listQuery.error && (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
              <span aria-hidden="true" className="i-ri-error-warning-line size-6 text-text-quaternary" />
              <span>{t('skills.loadError', { ns: 'explore' })}</span>
              <Button type="button" variant="secondary" size="small" onClick={() => listQuery.refetch()}>
                {t('operation.retry', { ns: 'common' })}
              </Button>
            </div>
          )}
          {!listQuery.isLoading && !listQuery.error && skills.length === 0 && (
            <div className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
              <span aria-hidden="true" className="i-ri-search-line size-6 text-text-quaternary" />
              <span>{t('skills.empty', { ns: 'explore' })}</span>
            </div>
          )}
          {!listQuery.isLoading && !listQuery.error && skills.length > 0 && (
            <>
              <div className="sr-only" role="status" aria-live="polite">
                {t('skills.resultCount', { ns: 'explore', count: firstPage?.total ?? skills.length })}
              </div>
              <div className={SKILL_GRID_CLASS_NAME}>
                {skills.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onOpen={setDetailSkill}
                  />
                ))}
              </div>
              <div className="mt-6 flex items-center justify-center pb-2">
                {hasNextPage
                  ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="medium"
                      loading={listQuery.isFetchingNextPage}
                      onClick={() => handlePageChange()}
                    >
                      {listQuery.isFetchingNextPage ? t('skills.loading', { ns: 'explore' }) : t('skills.loadMore', { ns: 'explore' })}
                    </Button>
                    )
                  : (
                    <p className="system-xs-regular text-text-quaternary">
                      {t('skills.endOfList', { ns: 'explore' })}
                    </p>
                    )}
              </div>
            </>
          )}
        </div>
      </div>

      <SkillDetailDialog
        skill={detailSkill}
        open={!!detailSkill}
        onOpenChange={(nextOpen) => {
          if (!nextOpen)
            setDetailSkill(null)
        }}
      />
    </div>
  )
}
