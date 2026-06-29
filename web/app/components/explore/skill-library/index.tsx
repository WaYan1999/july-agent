'use client'

import type { Skill, SkillRecommendationGroups, SkillTaxonomy } from '@/models/skill'
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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Carousel } from '@/app/components/base/carousel'
import Loading from '@/app/components/base/loading'
import { Markdown } from '@/app/components/base/markdown'
import { useMarketplaceContainerScroll } from '@/app/components/plugins/marketplace/hooks'
import { fetchSkillDetail, fetchSkillList, fetchSkillRecommendations, getSkillDownloadUrl, recordSkillCopy } from '@/service/skills'
import { getSkillSourceTypeLabel } from './source-type'

const DEFAULT_LIMIT = 30
const SKILL_GRID_CLASS_NAME = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
const RECOMMENDATION_GRID_CLASS_NAME = SKILL_GRID_CLASS_NAME
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
        className="size-10 rounded-md object-cover"
      />
    )
  }

  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-md border border-divider-subtle bg-background-section text-text-accent shadow-xs"
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
  const showInstallCount = skill.install_count > 0
  const githubStars = skill.github_stars ?? 0
  const showGithubStars = githubStars > 0

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
              <span className="truncate">{authorName}</span>
            )}
            {showInstallCount && (
              <>
                {authorName && (
                  <span className="shrink-0 text-text-quaternary" aria-hidden="true">/</span>
                )}
                <span className="shrink-0 tabular-nums">{t('skills.metrics', { ns: 'explore', count: skill.install_count })}</span>
              </>
            )}
            {showGithubStars && (
              <>
                {(authorName || showInstallCount) && (
                  <span className="shrink-0 text-text-quaternary" aria-hidden="true">/</span>
                )}
                <span className="flex shrink-0 items-center gap-0.5 tabular-nums" title={t('skills.stars', { ns: 'explore', count: githubStars })}>
                  <span className="i-ri-star-line size-3" aria-hidden="true" />
                  {githubStars}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mx-4 mt-1 h-8 line-clamp-2 system-xs-regular text-text-secondary">
        {skill.description}
      </p>
      <div className="flex min-h-7 min-w-0 items-center gap-2 px-4 py-1 pr-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-hidden">
          <TaxonomyPills items={skill.tags.length ? skill.tags : skill.categories} />
        </div>
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
      className="max-w-none text-[15px]! leading-7!"
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
    <div className="min-w-0 py-3">
      <dt className="system-xs-medium text-text-tertiary">{label}</dt>
      <dd className="mt-1 system-sm-medium break-all text-text-secondary">{value || '-'}</dd>
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
  const showInstallCount = (detail?.install_count ?? 0) > 0

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
      <DialogContent className="h-[calc(100dvh-16px)] w-full max-w-[1120px] overflow-hidden p-0">
        {detail && (
          <div className="flex size-full min-h-0 flex-col overflow-hidden bg-background-body">
            <div className="relative shrink-0 overflow-hidden rounded-t-xl px-5 pt-5 pb-8">
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

              <div className="relative z-10 mb-8 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/30 bg-white/15 px-2.5 py-1 text-text-primary-on-surface shadow-xs backdrop-blur-[6px]">
                  <span aria-hidden="true" className="i-ri-article-line size-3.5 shrink-0" />
                  <DialogTitle className="truncate system-xs-medium uppercase">
                    {t('skills.preview', { ns: 'explore' })}
                  </DialogTitle>
                </div>
                <DialogCloseButton
                  aria-label={t('operation.close', { ns: 'common' })}
                  className="static size-8 rounded-lg bg-white/15 text-text-primary-on-surface hover:bg-white/25"
                />
              </div>

              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-[760px] min-w-0">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-white/15 p-2 shadow-md backdrop-blur-[6px]">
                      <SkillIcon skill={detail} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 system-sm-medium text-text-secondary-on-surface">
                        {authorName && (
                          <>
                            <span className="max-w-48 truncate">{authorName}</span>
                            <span aria-hidden="true" className="text-text-secondary-on-surface/60">/</span>
                          </>
                        )}
                        <span className="max-w-80 truncate">{detail.slug}</span>
                        {showInstallCount && (
                          <>
                            <span aria-hidden="true" className="text-text-secondary-on-surface/60">/</span>
                            <span className="shrink-0 tabular-nums">{t('skills.metrics', { ns: 'explore', count: detail.install_count })}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-white/15 px-2 py-0.5 system-xs-medium text-text-secondary-on-surface backdrop-blur-[6px]">
                          {getSkillSourceTypeLabel(normalizeValue(detail.source_type), t)}
                        </span>
                        <span className="rounded-md bg-white/15 px-2 py-0.5 system-xs-medium text-text-secondary-on-surface backdrop-blur-[6px]">
                          {getContentTypeLabel(contentType, t)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <h1 className="text-[34px] leading-[42px] font-semibold text-balance text-text-primary-on-surface md:text-[42px] md:leading-[50px]">
                    {detail.name}
                  </h1>
                  <p className="mt-4 max-w-[68ch] body-md-medium leading-7 text-pretty text-text-secondary-on-surface">
                    {detail.description}
                  </p>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:max-w-[320px] lg:justify-end">
                  {contentType !== 'remote_reference' && (
                    <a
                      className="flex h-9 items-center justify-center rounded-lg bg-white px-3 system-sm-medium text-text-accent shadow-md hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-hidden"
                      href={getSkillDownloadUrl(detail.id)}
                    >
                      {contentType === 'markdown_file' ? t('skills.downloadMarkdown', { ns: 'explore' }) : t('skills.downloadZip', { ns: 'explore' })}
                    </a>
                  )}
                  <Button
                    type="button"
                    variant={contentType === 'remote_reference' ? 'primary' : 'secondary'}
                    size="small"
                    className="h-9"
                    disabled={!detail.install_command}
                    onClick={handleCopyInstall}
                  >
                    {t('skills.copyInstall', { ns: 'explore' })}
                  </Button>
                  {contentType === 'markdown_file' && (
                    <Button type="button" size="small" variant="secondary" className="h-9" disabled={!markdown} onClick={handleCopyMarkdown}>
                      {t('skills.copyMarkdown', { ns: 'explore' })}
                    </Button>
                  )}
                  {detail.source_url && (
                    <a
                      className="flex h-9 items-center gap-1 rounded-lg border border-white/30 bg-white/15 px-3 system-sm-medium text-text-primary-on-surface backdrop-blur-[6px] hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-hidden"
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

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto grid w-full max-w-[1040px] grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-6 lg:py-8">
                <article className="min-w-0 rounded-xl bg-components-panel-bg px-5 py-6 shadow-xs md:px-8 md:py-8">
                  <ArticleMarkdown
                    markdown={markdown}
                    isLoading={detailQuery.isFetching}
                    isError={detailQuery.isError}
                  />
                </article>

                <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
                  <div className="space-y-3">
                    {detail.install_command && (
                      <section className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4 shadow-xs">
                        <h2 className="system-sm-semibold text-text-secondary">{t('skills.installCommand', { ns: 'explore' })}</h2>
                        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-background-section p-3 system-xs-regular text-text-secondary">
                          {detail.install_command}
                        </pre>
                      </section>
                    )}

                    <section className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4 shadow-xs">
                      <h2 className="system-sm-semibold text-text-secondary">{t('skills.categories', { ns: 'explore' })}</h2>
                      <div className="mt-3">
                        <TaxonomyPills items={detail.categories} limit={8} />
                      </div>
                    </section>

                    <section className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4 shadow-xs">
                      <h2 className="system-sm-semibold text-text-secondary">{t('skills.tags', { ns: 'explore' })}</h2>
                      <div className="mt-3">
                        <TaxonomyPills items={detail.tags} limit={10} />
                      </div>
                    </section>

                    <section className="rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg p-4 shadow-xs">
                      <h2 className="system-sm-semibold text-text-secondary">{t('skills.audit', { ns: 'explore' })}</h2>
                      <dl className="mt-1 divide-y divide-divider-subtle">
                        <DetailMetaItem label={t('skills.auditStatus', { ns: 'explore' })} value={detail.audit_status} />
                        <DetailMetaItem label={t('skills.sha256', { ns: 'explore' })} value={version?.checksum_sha256} />
                      </dl>
                    </section>
                  </div>
                </aside>
              </div>
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

function RecommendationSection({
  title,
  skills,
  onOpen,
}: {
  title: string
  skills: Skill[]
  onOpen: (skill: Skill) => void
}) {
  if (!skills.length)
    return null

  return (
    <section className="py-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="title-xl-semi-bold text-text-primary">{title}</h2>
        <span className="system-xs-medium text-text-tertiary tabular-nums">{skills.length}</span>
      </div>
      <div className={RECOMMENDATION_GRID_CLASS_NAME}>
        {skills.map(skill => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  )
}

function FeaturedRecommendationSection({
  title,
  skills,
  onOpen,
}: {
  title: string
  skills: Skill[]
  onOpen: (skill: Skill) => void
}) {
  const { t } = useTranslation()

  if (!skills.length)
    return null

  const plugins = skills.length > 1
    ? [Carousel.Plugin.Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })]
    : undefined

  return (
    <section className="py-3">
      <Carousel
        opts={{ align: 'start', loop: skills.length > 1 }}
        plugins={plugins}
        className="rounded-xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="title-xl-semi-bold text-text-primary">{title}</h2>
          {skills.length > 1 && (
            <div className="flex items-center gap-2">
              <Carousel.Previous
                className="flex size-8 items-center justify-center rounded-full border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg text-components-button-secondary-text shadow-xs transition-colors hover:bg-components-button-secondary-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t('skills.recommendations.previousFeatured', { ns: 'explore' })}
              >
                <span aria-hidden className="i-ri-arrow-left-s-line size-4" />
              </Carousel.Previous>
              <Carousel.Next
                className="flex size-8 items-center justify-center rounded-full border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg text-components-button-secondary-text shadow-xs transition-colors hover:bg-components-button-secondary-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t('skills.recommendations.nextFeatured', { ns: 'explore' })}
              >
                <span aria-hidden className="i-ri-arrow-right-s-line size-4" />
              </Carousel.Next>
            </div>
          )}
        </div>
        <Carousel.Content className="-ml-3">
          {skills.map(skill => (
            <Carousel.Item key={skill.id} className="basis-full pl-3 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
              <SkillCard
                skill={skill}
                onOpen={onOpen}
              />
            </Carousel.Item>
          ))}
        </Carousel.Content>
        {skills.length > 1 && (
          <div className="mt-3 flex justify-center gap-1">
            <Carousel.Dot className="h-1.5 w-1.5 rounded-full bg-components-button-secondary-border transition-all data-[state=active]:w-5 data-[state=active]:bg-components-button-primary-bg" />
          </div>
        )}
      </Carousel>
    </section>
  )
}

function SkillRecommendationGroupsView({
  groups,
  isLoading,
  isError,
  onRetry,
  onOpen,
}: {
  groups?: SkillRecommendationGroups
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (skill: Skill) => void
}) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="absolute top-1/2 left-1/2 -translate-1/2">
        <Loading />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
        <span aria-hidden="true" className="i-ri-error-warning-line size-6 text-text-quaternary" />
        <span>{t('skills.loadError', { ns: 'explore' })}</span>
        <Button type="button" variant="secondary" size="small" onClick={onRetry}>
          {t('operation.retry', { ns: 'common' })}
        </Button>
      </div>
    )
  }

  if (!groups)
    return null

  const hasAnyGroup = groups.featured.length || groups.top20.length || groups.latest.length || groups.hottest.length
  if (!hasAnyGroup) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
        <span aria-hidden="true" className="i-ri-search-line size-6 text-text-quaternary" />
        <span>{t('skills.empty', { ns: 'explore' })}</span>
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      <FeaturedRecommendationSection
        title={t('skills.recommendations.featured', { ns: 'explore' })}
        skills={groups.featured}
        onOpen={onOpen}
      />
      <RecommendationSection
        title={t('skills.recommendations.top20', { ns: 'explore' })}
        skills={groups.top20}
        onOpen={onOpen}
      />
      <RecommendationSection
        title={t('skills.recommendations.latest', { ns: 'explore' })}
        skills={groups.latest}
        onOpen={onOpen}
      />
      <RecommendationSection
        title={t('skills.recommendations.hottest', { ns: 'explore' })}
        skills={groups.hottest}
        onOpen={onOpen}
      />
    </div>
  )
}

export default function SkillLibrary() {
  const { t } = useTranslation()
  const [keywordDraft, setKeywordDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null)
  const cachedCategoriesRef = useRef<SkillTaxonomy[]>([])
  const shouldLoadRecommendationGroups = !keyword && !category
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
  const recommendationQuery = useQuery({
    queryKey: ['explore', 'skills', 'recommendations'],
    queryFn: fetchSkillRecommendations,
    enabled: shouldLoadRecommendationGroups,
    retry: false,
  })
  const showRecommendationGroups = shouldLoadRecommendationGroups && !recommendationQuery.isError
  const skills = listQuery.data?.pages.flatMap(page => page.data) ?? []
  const firstPage = listQuery.data?.pages[0]
  const categoriesFromPages = listQuery.data?.pages.find(page => page.filters?.categories?.length)?.filters?.categories
  const categories = categoriesFromPages ?? cachedCategoriesRef.current
  const isInitialLoading = listQuery.isLoading && !listQuery.data
  const { hasNextPage, fetchNextPage, isFetching } = listQuery

  useEffect(() => {
    if (categoriesFromPages?.length)
      cachedCategoriesRef.current = categoriesFromPages
  }, [categoriesFromPages])

  const handlePageChange = useCallback(() => {
    if (!showRecommendationGroups && hasNextPage && !isFetching)
      void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetching, showRecommendationGroups])

  useMarketplaceContainerScroll(handlePageChange, 'skills-library-container')

  return (
    <div id="skills-library-container" className="flex h-full min-h-0 flex-col overflow-y-auto border-l-[0.5px] border-divider-regular bg-background-default-subtle pr-1">
      <div className="flex min-h-full w-full grow flex-col pt-8 pb-6">
        <header className="relative z-0 mx-3 w-auto shrink-0 overflow-hidden rounded-lg px-5 pt-8 pb-6">
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

        <div className="sticky top-0 z-10 mt-4 bg-background-default-subtle px-8 pb-3">
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

        <div className="relative min-h-0 flex-1 px-8 pt-1">
          {showRecommendationGroups && (
            <SkillRecommendationGroupsView
              groups={recommendationQuery.data}
              isLoading={recommendationQuery.isLoading}
              isError={recommendationQuery.isError}
              onRetry={() => recommendationQuery.refetch()}
              onOpen={setDetailSkill}
            />
          )}
          {!showRecommendationGroups && isInitialLoading && (
            <div className="absolute top-1/2 left-1/2 -translate-1/2">
              <Loading />
            </div>
          )}
          {!showRecommendationGroups && listQuery.error && (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
              <span aria-hidden="true" className="i-ri-error-warning-line size-6 text-text-quaternary" />
              <span>{t('skills.loadError', { ns: 'explore' })}</span>
              <Button type="button" variant="secondary" size="small" onClick={() => listQuery.refetch()}>
                {t('operation.retry', { ns: 'common' })}
              </Button>
            </div>
          )}
          {!showRecommendationGroups && !listQuery.isLoading && !listQuery.error && skills.length === 0 && (
            <div className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
              <span aria-hidden="true" className="i-ri-search-line size-6 text-text-quaternary" />
              <span>{t('skills.empty', { ns: 'explore' })}</span>
            </div>
          )}
          {!showRecommendationGroups && !listQuery.isLoading && !listQuery.error && skills.length > 0 && (
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
              {listQuery.isFetchingNextPage && (
                <Loading className="my-3" />
              )}
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
