'use client'

import type { ReactNode } from 'react'
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
import Autoplay from 'embla-carousel-autoplay'
import useEmblaCarousel from 'embla-carousel-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Loading from '@/app/components/base/loading'
import { Markdown } from '@/app/components/base/markdown'
import { useMarketplaceContainerScroll } from '@/app/components/plugins/marketplace/hooks'
import { fetchSkillDetail, fetchSkillList, fetchSkillRecommendations, getSkillDownloadUrl, recordSkillCopy } from '@/service/skills'
import { getSkillSourceTypeLabel } from './source-type'
import { getDisplaySourceUrl, stripSkillMetadataBlock } from './utils'

const DEFAULT_LIMIT = 30
const SKILL_GRID_CLASS_NAME = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
const RECOMMENDATION_GRID_CLASS_NAME = SKILL_GRID_CLASS_NAME
const RECOMMENDATION_PAGE_SIZE = 8
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

function getTaxonomyDisplayName(item: SkillTaxonomy) {
  return item.cn_name?.trim() || item.name?.trim() || item.slug
}

function sortSkillsByGithubStars(skills: Skill[]) {
  return [...skills].sort((left, right) => {
    const starsDelta = (right.github_stars ?? 0) - (left.github_stars ?? 0)
    if (starsDelta !== 0)
      return starsDelta

    const positionDelta = (left.position ?? 0) - (right.position ?? 0)
    if (positionDelta !== 0)
      return positionDelta

    return left.name.localeCompare(right.name)
  })
}

function buildRecommendationPages(skills: Skill[]) {
  const pages: Skill[][] = []

  for (let index = 0; index < skills.length; index += RECOMMENDATION_PAGE_SIZE)
    pages.push(skills.slice(index, index + RECOMMENDATION_PAGE_SIZE))

  return pages
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

function SkillHeroIcon({ skill }: { skill: Skill }) {
  if (skill.icon_url) {
    return (
      <img
        src={skill.icon_url}
        alt=""
        className="size-14 shrink-0 rounded-xl object-cover shadow-xs"
      />
    )
  }

  return (
    <div
      className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-divider-subtle bg-background-default text-text-accent shadow-xs"
      aria-hidden="true"
    >
      <span className="i-custom-public-agent-building-blocks size-7" />
    </div>
  )
}

function TaxonomyPills({
  items,
  limit = 3,
  emptyLabel,
  pillClassName,
}: {
  items: SkillTaxonomy[]
  limit?: number
  emptyLabel?: string
  pillClassName?: string
}) {
  const visibleItems = items.filter(item => !isGenericTaxonomy(item)).slice(0, limit)

  if (!visibleItems.length) {
    if (emptyLabel) {
      return (
        <span className="system-sm-regular text-text-quaternary">
          {emptyLabel}
        </span>
      )
    }
    return null
  }

  return (
    <div className="flex min-h-6 flex-wrap items-center gap-1">
      {visibleItems.map(item => (
        <span key={item.slug} className={cn('max-w-24 truncate rounded-md bg-background-section px-2 py-0.5 system-xs-medium text-text-tertiary', pillClassName)}>
          {getTaxonomyDisplayName(item)}
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
                <span className="flex shrink-0 items-center gap-0.5 tabular-nums" title={t('skills.installCount', { ns: 'explore' })}>
                  <span className="i-ri-download-2-line size-3" aria-hidden="true" />
                  {skill.install_count}
                </span>
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
      <p className="mx-4 mt-1 line-clamp-2 h-8 system-xs-regular text-text-secondary">
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
  const visibleMarkdown = stripSkillMetadataBlock(markdown)

  const content = (() => {
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

    if (!visibleMarkdown) {
      return (
        <div className="rounded-xl border border-dashed border-divider-subtle bg-background-section p-6 text-center system-sm-regular text-text-tertiary">
          {t('skills.emptyMarkdown', { ns: 'explore' })}
        </div>
      )
    }

    return (
      <Markdown
        content={visibleMarkdown}
        className="max-w-none text-[15px]! leading-7! text-pretty"
      />
    )
  })()

  return (
    <div className="min-w-0">
      <div className="mb-5 flex items-center gap-2 border-b border-divider-subtle pb-3">
        <span aria-hidden="true" className="i-ri-file-text-line size-4 text-text-tertiary" />
        <h2 className="title-xl-semi-bold text-text-primary text-balance">SKILL.md</h2>
      </div>
      <div className="text-pretty">
        {content}
      </div>
    </div>
  )
}

function InstallCommandBar({
  command,
  onCopy,
}: {
  command: string
  onCopy: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex max-w-[640px] items-center rounded-lg border border-divider-subtle bg-background-default shadow-xs">
      <code className="min-w-0 flex-1 truncate px-3 py-2 font-mono system-xs-regular text-text-secondary">
        {command}
      </code>
      <button
        type="button"
        className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-state-base-hover hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
        aria-label={t('skills.copyInstall', { ns: 'explore' })}
        onClick={onCopy}
      >
        <span aria-hidden="true" className="i-ri-file-copy-line size-4" />
      </button>
    </div>
  )
}

function DetailBadge({
  children,
  iconClassName,
}: {
  children: ReactNode
  iconClassName?: string
}) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-divider-subtle bg-background-default px-2.5 system-xs-medium text-text-tertiary shadow-xs">
      {iconClassName && (
        <span aria-hidden="true" className={cn(iconClassName, 'size-3.5 shrink-0 text-text-quaternary')} />
      )}
      <span className="truncate">{children}</span>
    </span>
  )
}

function DetailActionLink({
  href,
  iconClassName,
  children,
}: {
  href: string
  iconClassName: string
  children: ReactNode
}) {
  return (
    <a
      className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-components-button-secondary-border bg-components-button-secondary-bg px-3 system-sm-medium text-components-button-secondary-text shadow-xs transition-colors hover:bg-components-button-secondary-bg-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
      href={href}
    >
      <span aria-hidden="true" className={cn(iconClassName, 'size-4 shrink-0')} />
      <span className="truncate">{children}</span>
    </a>
  )
}

function DetailActionPanel({
  contentType,
  downloadUrl,
  markdown,
  onCopyMarkdown,
}: {
  contentType: string
  downloadUrl: string
  markdown?: string | null
  onCopyMarkdown: () => void
}) {
  const { t } = useTranslation()

  if (contentType === 'markdown_file') {
    return (
      <DetailSidebarSection title={t('skills.actions', { ns: 'explore' })}>
        <div className="grid gap-2">
          <Button
            type="button"
            variant="primary"
            size="small"
            className="h-9 w-full"
            disabled={!markdown}
            onClick={onCopyMarkdown}
          >
            <span aria-hidden="true" className="mr-1 i-ri-file-copy-line size-4" />
            {t('skills.copyMarkdown', { ns: 'explore' })}
          </Button>
          <DetailActionLink href={downloadUrl} iconClassName="i-ri-download-2-line">
            {t('skills.downloadMarkdown', { ns: 'explore' })}
          </DetailActionLink>
        </div>
      </DetailSidebarSection>
    )
  }

  if (contentType === 'zip_package') {
    return (
      <DetailSidebarSection title={t('skills.actions', { ns: 'explore' })}>
        <DetailActionLink href={downloadUrl} iconClassName="i-ri-download-cloud-2-line">
          {t('skills.downloadZip', { ns: 'explore' })}
        </DetailActionLink>
      </DetailSidebarSection>
    )
  }

  return null
}

function SkillMetricList({ skill }: { skill: Skill }) {
  const { t } = useTranslation()
  const showInstallCount = skill.install_count > 0
  const githubStars = skill.github_stars ?? 0
  const showGithubStars = githubStars > 0

  if (!showInstallCount && !showGithubStars)
    return null

  return (
    <dl className="space-y-3">
      {showInstallCount && (
        <DetailMetaItem
          iconClassName="i-ri-download-2-line"
          label={t('skills.installCount', { ns: 'explore' })}
          value={skill.install_count}
        />
      )}
      {showGithubStars && (
        <DetailMetaItem
          iconClassName="i-ri-star-fill"
          label={t('skills.githubStars', { ns: 'explore' })}
          value={githubStars}
        />
      )}
    </dl>
  )
}

function DetailMetaItem({
  label,
  value,
  iconClassName,
}: {
  label: string
  value?: string | number | null
  iconClassName?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="flex min-w-0 items-center gap-1.5 system-xs-medium text-text-tertiary">
        {iconClassName && (
          <span aria-hidden="true" className={cn(iconClassName, 'size-3.5 shrink-0 text-text-quaternary')} />
        )}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 system-sm-regular break-all text-text-secondary">{value || '-'}</dd>
    </div>
  )
}

function AuditStatusItem({ status }: { status?: string | null }) {
  const { t } = useTranslation()
  const normalizedStatus = status?.trim().toLowerCase()
  const isPassed = normalizedStatus === 'passed' || normalizedStatus === 'approved'

  return (
    <div className="min-w-0">
      <dt className="system-xs-medium text-text-tertiary">
        <span className="truncate">{t('skills.auditStatus', { ns: 'explore' })}</span>
      </dt>
      <dd className="mt-1 flex min-w-0 items-center gap-1.5 system-sm-regular text-text-secondary">
        {isPassed && (
          <span aria-hidden="true" className="i-ri-checkbox-circle-fill size-3.5 shrink-0 text-text-success" />
        )}
        <span className="truncate">
          {isPassed ? t('skills.auditStatusPassed', { ns: 'explore' }) : (status || '-')}
        </span>
      </dd>
    </div>
  )
}

function DetailSidebarSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-divider-subtle bg-background-section p-4 shadow-xs">
      <h2 className="mb-3 title-sm-semi-bold text-text-primary text-balance">{title}</h2>
      {children}
    </section>
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
  const visibleMarkdown = stripSkillMetadataBlock(markdown)
  const authorName = detail?.author_name?.trim()
  const installCount = detail?.install_count ?? 0
  const githubStars = detail?.github_stars ?? 0
  const showInstallCount = installCount > 0
  const showGithubStars = githubStars > 0
  const showDetailMetrics = showInstallCount || showGithubStars
  const displaySourceUrl = getDisplaySourceUrl(detail?.source_url)
  const downloadUrl = detail ? getSkillDownloadUrl(detail.id) : ''
  const shouldShowInstallCommand = contentType === 'remote_reference'

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
    if (!visibleMarkdown)
      return
    await navigator.clipboard.writeText(visibleMarkdown)
    toast.success(t('skills.copySuccess', { ns: 'explore' }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="h-[calc(100dvh-24px)] w-full max-w-[1160px] overflow-hidden p-0">
        {detail && (
          <div className="flex size-full min-h-0 flex-col overflow-hidden bg-background-default">
            <header className="shrink-0 border-b border-divider-subtle bg-background-section px-5 py-6 md:px-8 md:py-7">
              <div className="mx-auto flex w-full max-w-[1080px] items-start gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-5">
                  <div className="flex min-w-0 items-start gap-4">
                    <SkillHeroIcon skill={detail} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
                        {authorName && (
                          <DetailBadge iconClassName="i-ri-user-smile-line">{authorName}</DetailBadge>
                        )}
                        <DetailBadge iconClassName="i-ri-hashtag">{detail.slug}</DetailBadge>
                        <DetailBadge iconClassName="i-ri-price-tag-3-line">
                          {getSkillSourceTypeLabel(normalizeValue(detail.source_type), t)}
                        </DetailBadge>
                        <DetailBadge iconClassName="i-ri-file-text-line">
                          {getContentTypeLabel(contentType, t)}
                        </DetailBadge>
                      </div>
                      <DialogTitle
                        id="skill-detail-title"
                        className="title-4xl-semi-bold text-text-primary text-balance"
                      >
                        {detail.name}
                      </DialogTitle>
                      <p className="mt-2 max-w-[68ch] body-md-regular leading-6 text-text-secondary text-pretty">
                        {detail.description}
                      </p>
                    </div>
                  </div>

                  <div className="md:pl-[72px]">
                    {shouldShowInstallCommand && detail.install_command && (
                      <InstallCommandBar
                        command={detail.install_command}
                        onCopy={handleCopyInstall}
                      />
                    )}
                  </div>
                </div>

                <DialogCloseButton
                  aria-label={t('operation.close', { ns: 'common' })}
                  className="static size-9 shrink-0 rounded-lg text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary"
                />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background-default">
              <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-7 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10 lg:px-8 lg:py-8">
                <article
                  aria-label={detail.name}
                  className="min-w-0"
                >
                  <ArticleMarkdown
                    markdown={markdown}
                    isLoading={detailQuery.isFetching}
                    isError={detailQuery.isError}
                  />
                </article>

                <aside
                  aria-label={t('skills.metadata', { ns: 'explore' })}
                  className="min-w-0 lg:sticky lg:top-6 lg:self-start"
                >
                  <div className="space-y-3">
                    <DetailActionPanel
                      contentType={contentType}
                      downloadUrl={downloadUrl}
                      markdown={visibleMarkdown}
                      onCopyMarkdown={handleCopyMarkdown}
                    />

                    {showDetailMetrics && (
                      <DetailSidebarSection title={t('skills.stats', { ns: 'explore' })}>
                        <SkillMetricList skill={detail} />
                      </DetailSidebarSection>
                    )}

                    <DetailSidebarSection title={t('skills.tags', { ns: 'explore' })}>
                      <TaxonomyPills
                        items={detail.tags}
                        limit={10}
                        emptyLabel="-"
                        pillClassName="max-w-36 bg-background-default"
                      />
                    </DetailSidebarSection>

                    <DetailSidebarSection title={t('skills.resourceType', { ns: 'explore' })}>
                      <div className="system-sm-regular text-text-secondary">{getContentTypeLabel(contentType, t)}</div>
                      {version?.checksum_sha256 && (
                        <dl className="mt-3">
                          <DetailMetaItem label={t('skills.sha256', { ns: 'explore' })} value={version.checksum_sha256} />
                        </dl>
                      )}
                    </DetailSidebarSection>

                    {displaySourceUrl && detail.source_url && (
                      <DetailSidebarSection title={t('skills.source', { ns: 'explore' })}>
                        <a
                          className="inline-flex max-w-full items-center gap-1 system-sm-regular text-text-accent hover:underline focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
                          href={detail.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <span className="truncate">{displaySourceUrl}</span>
                          <span aria-hidden="true" className="i-ri-external-link-line size-3.5 shrink-0" />
                        </a>
                      </DetailSidebarSection>
                    )}

                    <DetailSidebarSection title={t('skills.audit', { ns: 'explore' })}>
                      <dl className="space-y-3">
                        <AuditStatusItem status={detail.audit_status} />
                      </dl>
                    </DetailSidebarSection>
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

function RecommendationCarouselSection({
  title,
  description,
  skills,
  onOpen,
  autoPlay = false,
}: {
  title: string
  description: string
  skills: Skill[]
  onOpen: (skill: Skill) => void
  autoPlay?: boolean
}) {
  const { t } = useTranslation()
  const sortedSkills = useMemo(() => sortSkillsByGithubStars(skills), [skills])
  const pages = useMemo(() => buildRecommendationPages(sortedSkills), [sortedSkills])
  const hasMultiplePages = pages.length > 1
  const plugins = useMemo(() => {
    if (!autoPlay || !hasMultiplePages)
      return []

    return [
      Autoplay({
        delay: 5000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    ]
  }, [autoPlay, hasMultiplePages])
  const [carouselRef, api] = useEmblaCarousel(
    { align: 'start', containScroll: 'trimSnaps', loop: hasMultiplePages },
    plugins,
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([])
  const scrollPrev = useCallback(() => {
    api?.scrollPrev()
  }, [api])
  const scrollNext = useCallback(() => {
    api?.scrollNext()
  }, [api])

  useEffect(() => {
    if (!api)
      return

    const handleSelect = () => {
      setSelectedIndex(api.selectedScrollSnap())
      setScrollSnaps(api.scrollSnapList())
    }

    handleSelect()
    api.on('reInit', handleSelect)
    api.on('select', handleSelect)

    return () => {
      api.off('reInit', handleSelect)
      api.off('select', handleSelect)
    }
  }, [api])

  if (!skills.length)
    return null

  return (
    <section
      className="py-3"
    >
      <div
        className="relative"
        role="region"
        aria-label={title}
        aria-roledescription="carousel"
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="title-xl-semi-bold text-text-primary">{title}</h2>
            <p className="mt-1 system-xs-regular text-text-tertiary">{description}</p>
          </div>
          {hasMultiplePages && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {scrollSnaps.map((snap, index) => (
                  <button
                    key={`${snap}-${index}`}
                    type="button"
                    className={cn(
                      'h-[5px] w-[5px] rounded-full transition-all focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden',
                      selectedIndex === index
                        ? 'w-4 bg-components-button-primary-bg'
                        : 'bg-components-button-secondary-border hover:bg-components-button-secondary-border-hover',
                    )}
                    aria-label={t('skills.recommendations.goToGroupPage', { ns: 'explore', page: index + 1 })}
                    onClick={() => api?.scrollTo(index)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg text-components-button-secondary-text shadow-xs transition-colors hover:bg-components-button-secondary-bg-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
                  aria-label={t('skills.recommendations.previousGroup', { ns: 'explore' })}
                  onClick={scrollPrev}
                >
                  <span aria-hidden className="i-ri-arrow-left-s-line size-4" />
                </button>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg text-components-button-secondary-text shadow-xs transition-colors hover:bg-components-button-secondary-bg-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
                  aria-label={t('skills.recommendations.nextGroup', { ns: 'explore' })}
                  onClick={scrollNext}
                >
                  <span aria-hidden className="i-ri-arrow-right-s-line size-4" />
                </button>
              </div>
            </div>
          )}
        </div>
        <div ref={carouselRef} className="overflow-hidden">
          <div className="flex gap-3">
            {pages.map(pageItems => (
              <div
                key={pageItems.map(skill => skill.id).join('-')}
                className="w-full min-w-0 shrink-0"
                role="group"
                aria-roledescription="slide"
              >
                <div className={RECOMMENDATION_GRID_CLASS_NAME}>
                  {pageItems.map(skill => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
      <RecommendationCarouselSection
        title={t('skills.recommendations.featured', { ns: 'explore' })}
        description={t('skills.recommendations.featuredDescription', { ns: 'explore' })}
        skills={groups.featured}
        onOpen={onOpen}
        autoPlay
      />
      <RecommendationCarouselSection
        title={t('skills.recommendations.top20', { ns: 'explore' })}
        description={t('skills.recommendations.top20Description', { ns: 'explore' })}
        skills={groups.top20}
        onOpen={onOpen}
      />
      <RecommendationCarouselSection
        title={t('skills.recommendations.latest', { ns: 'explore' })}
        description={t('skills.recommendations.latestDescription', { ns: 'explore' })}
        skills={groups.latest}
        onOpen={onOpen}
      />
      <RecommendationCarouselSection
        title={t('skills.recommendations.hottest', { ns: 'explore' })}
        description={t('skills.recommendations.hottestDescription', { ns: 'explore' })}
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
      sort: 'github_stars_desc',
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
  const sortedSkills = useMemo(() => sortSkillsByGithubStars(skills), [skills])
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
                label={getTaxonomyDisplayName(item)}
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
                {sortedSkills.map(skill => (
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
