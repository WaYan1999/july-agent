'use client'

import type { Skill, SkillTaxonomy } from '@/models/skill'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import { Input } from '@langgenius/dify-ui/input'
import { toast } from '@langgenius/dify-ui/toast'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchSkillDetail, fetchSkillList, getSkillDownloadUrl, recordSkillCopy } from '@/service/skills'
import { getSkillSourceTypeLabel } from './source-type'

const DEFAULT_LIMIT = 30

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

function SkillIcon({ skill }: { skill: Skill }) {
  if (skill.icon_url) {
    return (
      <img
        src={skill.icon_url}
        alt=""
        className="size-10 rounded-lg object-cover"
      />
    )
  }

  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[15px] font-semibold text-white"
      style={{ background: skill.icon_background || '#2563eb' }}
      aria-hidden="true"
    >
      {(skill.icon || skill.name.slice(0, 1)).toUpperCase()}
    </div>
  )
}

function TaxonomyPills({ items, limit = 3 }: { items: SkillTaxonomy[], limit?: number }) {
  const visibleItems = items.slice(0, limit)
  const hiddenCount = items.length - visibleItems.length

  return (
    <div className="flex min-h-6 flex-wrap items-center gap-1">
      {visibleItems.map(item => (
        <span key={item.slug} className="max-w-24 truncate rounded-md bg-background-section px-2 py-1 system-xs-medium text-text-tertiary">
          {item.name}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-md bg-background-section px-2 py-1 system-xs-medium text-text-tertiary">
          +
          {hiddenCount}
        </span>
      )}
    </div>
  )
}

function SkillCard({
  skill,
  selected,
  onSelect,
}: {
  skill: Skill
  selected: boolean
  onSelect: (skill: Skill) => void
}) {
  const { t } = useTranslation()
  const contentType = normalizeValue(skill.latest_version?.content_type)

  return (
    <button
      type="button"
      className={cn(
        'group flex h-45 flex-col rounded-xl border-[0.5px] bg-components-panel-on-panel-item-bg p-4 text-left shadow-xs shadow-shadow-shadow-3 transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-divider-deep hover:shadow-md focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden motion-reduce:transform-none motion-reduce:transition-none',
        selected ? 'border-state-accent-solid ring-1 ring-state-accent-solid' : 'border-components-panel-border',
      )}
      onClick={() => onSelect(skill)}
    >
      <div className="flex items-start gap-3">
        <SkillIcon skill={skill} />
        <div className="min-w-0 flex-1">
          <div className="truncate system-md-semibold text-text-secondary">{skill.name}</div>
          <div className="mt-1 flex items-center gap-2 system-2xs-medium-uppercase text-text-tertiary">
            <span className="truncate">{getSkillSourceTypeLabel(normalizeValue(skill.source_type), t)}</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{getContentTypeLabel(contentType, t)}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-9 system-xs-regular text-text-tertiary">
        {skill.description}
      </p>
      <div className="mt-3">
        <TaxonomyPills items={skill.tags} />
      </div>
      <div className="mt-auto flex items-center justify-between pt-3 system-xs-regular text-text-tertiary">
        <span className="truncate">{skill.author_name || t('skills.unknownAuthor', { ns: 'explore' })}</span>
        <span className="shrink-0 tabular-nums">{t('skills.metrics', { ns: 'explore', count: skill.install_count })}</span>
      </div>
    </button>
  )
}

function MarkdownPreview({ markdown }: { markdown?: string | null }) {
  const { t } = useTranslation()
  if (!markdown) {
    return (
      <div className="rounded-lg border border-dashed border-divider-subtle bg-background-section p-4 system-sm-regular text-text-tertiary">
        {t('skills.emptyMarkdown', { ns: 'explore' })}
      </div>
    )
  }

  return (
    <pre className="max-h-90 overflow-auto rounded-lg bg-background-section p-4 system-xs-regular leading-5 whitespace-pre-wrap text-text-secondary">
      {markdown}
    </pre>
  )
}

function SkillDetail({
  skill,
  onBack,
}: {
  skill: Skill | null
  onBack: () => void
}) {
  const { t } = useTranslation()
  const detailQuery = useQuery({
    queryKey: ['explore', 'skills', 'detail', skill?.slug],
    queryFn: () => fetchSkillDetail(skill!.slug),
    enabled: Boolean(skill?.slug),
    retry: false,
  })
  const copyMutation = useMutation({
    mutationFn: (skillId: string) => recordSkillCopy(skillId),
  })
  const detail = detailQuery.data ?? skill
  const version = detail?.latest_version
  const contentType = normalizeValue(version?.content_type)
  const markdown = version?.skill_markdown

  if (!detail) {
    return (
      <aside className="hidden h-full min-h-0 w-96 shrink-0 border-l border-divider-subtle bg-background-default p-5 xl:block">
        <div className="flex h-full items-center justify-center text-center system-sm-regular text-text-tertiary">
          {t('skills.selectHint', { ns: 'explore' })}
        </div>
      </aside>
    )
  }

  const handleCopyInstall = async () => {
    if (!detail.install_command)
      return
    await navigator.clipboard.writeText(detail.install_command)
    copyMutation.mutate(detail.id)
    toast.success(t('skills.copySuccess', { ns: 'explore' }))
  }

  const handleCopyMarkdown = async () => {
    if (!markdown)
      return
    await navigator.clipboard.writeText(markdown)
    toast.success(t('skills.copySuccess', { ns: 'explore' }))
  }

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-l border-divider-subtle bg-background-default xl:w-[440px]">
      <div className="flex items-center gap-2 border-b border-divider-subtle px-5 py-4">
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-state-base-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden xl:hidden"
          aria-label={t('skills.backToList', { ns: 'explore' })}
          onClick={onBack}
        >
          <span className="i-ri-arrow-left-line size-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate title-md-semi-bold text-text-primary">{detail.name}</div>
          <div className="mt-1 truncate system-xs-regular text-text-tertiary">{detail.slug}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="flex items-start gap-3">
          <SkillIcon skill={detail} />
          <div className="min-w-0 flex-1">
            <p className="system-sm-regular text-text-secondary">{detail.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="rounded-md bg-background-section px-2 py-1 system-xs-medium text-text-tertiary">
                {getSkillSourceTypeLabel(normalizeValue(detail.source_type), t)}
              </span>
              <span className="rounded-md bg-background-section px-2 py-1 system-xs-medium text-text-tertiary">
                {getContentTypeLabel(contentType, t)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {contentType !== 'remote_reference' && (
            <a
              className="flex h-9 items-center justify-center rounded-lg bg-state-accent-solid px-3 system-sm-medium text-text-primary-on-surface hover:bg-state-accent-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
              href={getSkillDownloadUrl(detail.id)}
            >
              {contentType === 'markdown_file' ? t('skills.downloadMarkdown', { ns: 'explore' }) : t('skills.downloadZip', { ns: 'explore' })}
            </a>
          )}
          <Button
            type="button"
            variant={contentType === 'remote_reference' ? 'primary' : 'secondary'}
            disabled={!detail.install_command}
            onClick={handleCopyInstall}
          >
            {t('skills.copyInstall', { ns: 'explore' })}
          </Button>
          {contentType === 'markdown_file' && (
            <Button type="button" variant="secondary" disabled={!markdown} onClick={handleCopyMarkdown}>
              {t('skills.copyMarkdown', { ns: 'explore' })}
            </Button>
          )}
        </div>

        {detail.install_command && (
          <section className="mt-5">
            <h3 className="system-sm-semibold text-text-secondary">{t('skills.installCommand', { ns: 'explore' })}</h3>
            <pre className="mt-2 overflow-auto rounded-lg bg-background-section p-3 system-xs-regular text-text-secondary">
              {detail.install_command}
            </pre>
          </section>
        )}

        <section className="mt-5">
          <h3 className="system-sm-semibold text-text-secondary">{t('skills.preview', { ns: 'explore' })}</h3>
          <div className="mt-2">
            <MarkdownPreview markdown={detailQuery.isFetching ? t('skills.loadingDetail', { ns: 'explore' }) : markdown} />
          </div>
        </section>

        <section className="mt-5 space-y-3">
          <div>
            <h3 className="system-sm-semibold text-text-secondary">{t('skills.categories', { ns: 'explore' })}</h3>
            <div className="mt-2">
              <TaxonomyPills items={detail.categories} limit={8} />
            </div>
          </div>
          <div>
            <h3 className="system-sm-semibold text-text-secondary">{t('skills.tags', { ns: 'explore' })}</h3>
            <div className="mt-2">
              <TaxonomyPills items={detail.tags} limit={10} />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-lg bg-background-section p-4">
          <h3 className="system-sm-semibold text-text-secondary">{t('skills.audit', { ns: 'explore' })}</h3>
          <dl className="mt-3 space-y-2 system-xs-regular text-text-tertiary">
            <div className="flex justify-between gap-4">
              <dt>{t('skills.auditStatus', { ns: 'explore' })}</dt>
              <dd className="truncate text-text-secondary">{detail.audit_status || '-'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('skills.sha256', { ns: 'explore' })}</dt>
              <dd className="truncate text-text-secondary">{version?.checksum_sha256 || '-'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </aside>
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
        'h-8 rounded-lg px-2.5 system-sm-medium transition-colors hover:bg-state-base-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden',
        selected ? 'bg-state-base-active text-text-secondary' : 'text-text-tertiary',
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
  const [contentType, setContentType] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false)
  const listQuery = useQuery({
    queryKey: ['explore', 'skills', 'list', keyword, category, contentType],
    queryFn: () => fetchSkillList({
      page: 1,
      limit: DEFAULT_LIMIT,
      keyword,
      category,
      content_type: contentType,
    }),
    retry: false,
  })
  const skills = listQuery.data?.data ?? []
  const categories = listQuery.data?.filters?.categories ?? []
  const activeSkill = selectedSkill && skills.some(skill => skill.id === selectedSkill.id)
    ? selectedSkill
    : skills[0] ?? null

  const contentTypes = useMemo(() => [
    { value: '', label: t('skills.allResourceTypes', { ns: 'explore' }) },
    { value: 'remote_reference', label: t('skills.contentTypes.remote', { ns: 'explore' }) },
    { value: 'zip_package', label: t('skills.contentTypes.zip', { ns: 'explore' }) },
    { value: 'markdown_file', label: t('skills.contentTypes.markdown', { ns: 'explore' }) },
  ], [t])

  return (
    <div className="flex h-full min-h-0 overflow-hidden border-l-[0.5px] border-divider-regular bg-background-body">
      <div className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', isMobileDetailOpen && 'hidden xl:flex')}>
        <header className="border-b border-divider-subtle bg-background-default px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="title-2xl-semi-bold text-text-primary">{t('skills.title', { ns: 'explore' })}</h1>
              <p className="mt-1 max-w-180 system-sm-regular text-text-tertiary">{t('skills.description', { ns: 'explore' })}</p>
            </div>
            <div className="rounded-lg bg-background-section px-3 py-2 system-xs-medium text-text-tertiary">
              {t('skills.total', { ns: 'explore', total: listQuery.data?.total ?? 0 })}
            </div>
          </div>
          <form
            className="mt-5 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setKeyword(keywordDraft.trim())
            }}
          >
            <Input
              className="h-9 w-72"
              value={keywordDraft}
              placeholder={t('skills.searchPlaceholder', { ns: 'explore' })}
              onChange={event => setKeywordDraft(event.target.value)}
            />
            <Button type="submit" variant="primary">
              {t('skills.search', { ns: 'explore' })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setKeywordDraft('')
                setKeyword('')
                setCategory('')
                setContentType('')
              }}
            >
              {t('skills.reset', { ns: 'explore' })}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
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
          <div className="mt-2 flex flex-wrap gap-2">
            {contentTypes.map(item => (
              <FilterButton
                key={item.value || 'all'}
                label={item.label}
                selected={contentType === item.value}
                onClick={() => setContentType(item.value)}
              />
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {listQuery.isLoading && (
            <div role="status" className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-6'].map(card => (
                <div key={card} className="h-45 rounded-xl bg-background-section-burn" />
              ))}
            </div>
          )}
          {listQuery.error && (
            <div className="flex min-h-80 items-center justify-center rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
              {t('skills.loadError', { ns: 'explore' })}
            </div>
          )}
          {!listQuery.isLoading && !listQuery.error && skills.length === 0 && (
            <div className="flex min-h-80 items-center justify-center rounded-xl border border-divider-subtle bg-background-default text-center system-sm-regular text-text-tertiary">
              {t('skills.empty', { ns: 'explore' })}
            </div>
          )}
          {!listQuery.isLoading && !listQuery.error && skills.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {skills.map(skill => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  selected={activeSkill?.id === skill.id}
                  onSelect={(nextSkill) => {
                    setSelectedSkill(nextSkill)
                    setIsMobileDetailOpen(true)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={cn('hidden xl:block', isMobileDetailOpen && 'block w-full')}>
        <SkillDetail
          skill={activeSkill}
          onBack={() => setIsMobileDetailOpen(false)}
        />
      </div>
    </div>
  )
}
