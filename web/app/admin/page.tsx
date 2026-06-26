'use client'

import type { FormEvent } from 'react'
import type { AdminResourceName } from '@/features/admin/resources'
import type {
  AdminAccount,
  AdminApp,
  AdminPagination,
  AdminRecommendedApp,
  AdminResourceItemMap,
  AdminSkill,
  AdminSkillCreatePayload,
} from '@/features/admin/service'
import type { I18nKeysWithPrefix } from '@/types/i18n'
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogCancelButton,
  AlertDialogConfirmButton,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@langgenius/dify-ui/alert-dialog'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import { Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@langgenius/dify-ui/dialog'
import { Input } from '@langgenius/dify-ui/input'
import { Select, SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectTrigger } from '@langgenius/dify-ui/select'
import { Switch } from '@langgenius/dify-ui/switch'
import { Textarea } from '@langgenius/dify-ui/textarea'
import { toast } from '@langgenius/dify-ui/toast'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { adminResourceLimit, adminResources, getAdminResource } from '@/features/admin/resources'
import {
  createAdminResource,
  deleteAdminResource,
  fetchAdminResourceDetail,
  fetchAdminResourceList,
  updateAdminResource,
  uploadAdminSkillAsset,
} from '@/features/admin/service'
import useDocumentTitle from '@/hooks/use-document-title'

const ADMIN_API_KEY_STORAGE_KEY = 'dify-admin-api-key'

const adminApiKeyListeners = new Set<() => void>()

type AdminItem = AdminAccount | AdminRecommendedApp | AdminApp | AdminSkill

type EditableValue = string | number | boolean | null | undefined
type AdminFieldLabelKey = I18nKeysWithPrefix<'admin', 'fields.'>

type FieldConfig = {
  name: string
  labelKey: AdminFieldLabelKey
  type: 'text' | 'textarea' | 'number' | 'switch' | 'select'
  value: EditableValue
  options?: Array<{
    value: string
    labelKey: AdminFieldLabelKey
  }>
}

type CreateSkillFormValues = {
  name: string
  slug: string
  description: string
  author_name: string
  source_type: string
  source_url: string
  install_command: string
  publication_status: string
  audit_status: string
  audit_notes: string
  categories: string
  tags: string
  install_count: string
  github_stars: string
  position: string
  content_type: string
  skill_markdown: string
}

type SkillFilters = {
  category: string
  source_type: string
  publication_status: string
  updated_at_start: string
  updated_at_end: string
}

type SkillLabelKind = 'sourceType' | 'publicationStatus' | 'contentType'
type AdminFieldTranslator = (key: AdminFieldLabelKey) => string

const skillSourceTypeOptions = [
  { value: 'github', labelKey: 'fields.sourceTypeGithub' },
  { value: 'official', labelKey: 'fields.sourceTypeOfficial' },
  { value: 'site', labelKey: 'fields.sourceTypeSite' },
  { value: 'other', labelKey: 'fields.sourceTypeOther' },
] satisfies FieldConfig['options']

const skillPublicationStatusOptions = [
  { value: 'draft', labelKey: 'fields.publicationStatusDraft' },
  { value: 'published', labelKey: 'fields.publicationStatusPublished' },
  { value: 'unlisted', labelKey: 'fields.publicationStatusUnlisted' },
  { value: 'archived', labelKey: 'fields.publicationStatusArchived' },
] satisfies FieldConfig['options']

const skillAuditStatusOptions = [
  { value: 'pending', labelKey: 'fields.auditStatusPending' },
  { value: 'passed', labelKey: 'fields.auditStatusPassed' },
  { value: 'failed', labelKey: 'fields.auditStatusFailed' },
  { value: 'manual', labelKey: 'fields.auditStatusManual' },
] satisfies FieldConfig['options']

const skillContentTypeOptions = [
  { value: 'remote_reference', labelKey: 'fields.contentTypeRemote' },
  { value: 'zip_package', labelKey: 'fields.contentTypeZip' },
  { value: 'markdown_file', labelKey: 'fields.contentTypeMarkdown' },
] satisfies FieldConfig['options']

const createSkillInitialValues: CreateSkillFormValues = {
  name: '',
  slug: '',
  description: '',
  author_name: '',
  source_type: 'other',
  source_url: '',
  install_command: '',
  publication_status: 'draft',
  audit_status: 'pending',
  audit_notes: '',
  categories: '',
  tags: '',
  install_count: '0',
  github_stars: '0',
  position: '0',
  content_type: 'remote_reference',
  skill_markdown: '',
}

const skillFilterInitialValues: SkillFilters = {
  category: '',
  source_type: '',
  publication_status: '',
  updated_at_start: '',
  updated_at_end: '',
}

function getItemTitle(resource: AdminResourceName, item: AdminItem) {
  if (resource === 'skills')
    return (item as AdminSkill).name || item.id
  if (resource === 'recommendedApps') {
    const recommendedApp = item as AdminRecommendedApp
    return recommendedApp.app?.name ?? recommendedApp.app_id
  }
  return (item as AdminAccount | AdminApp).name || item.id
}

function getItemSubtitle(resource: AdminResourceName, item: AdminItem) {
  if (resource === 'skills')
    return (item as AdminSkill).slug
  if (resource === 'accounts')
    return (item as AdminAccount).email ?? item.id
  if (resource === 'recommendedApps')
    return (item as AdminRecommendedApp).language
  return (item as AdminApp).mode ?? item.id
}

function getItemStatus(resource: AdminResourceName, item: AdminItem) {
  if (resource === 'skills')
    return (item as AdminSkill).publication_status ?? '-'
  if (resource === 'recommendedApps')
    return (item as AdminRecommendedApp).is_listed ? 'listed' : 'hidden'
  return (item as AdminAccount | AdminApp).status ?? '-'
}

function getAccountSpaceIds(account: AdminAccount) {
  const spaceIds = account.workspaces?.map(workspace => workspace.tenant_id).filter((tenantId): tenantId is string => Boolean(tenantId)) ?? []
  return spaceIds.length > 0 ? spaceIds.join(', ') : '-'
}

function getItemMetric(resource: AdminResourceName, item: AdminItem) {
  if (resource === 'skills')
    return (item as AdminSkill).latest_version?.content_type ?? '-'
  if (resource === 'accounts')
    return getAccountSpaceIds(item as AdminAccount)
  if (resource === 'recommendedApps')
    return String((item as AdminRecommendedApp).position)
  const app = item as AdminApp
  return app.enable_api ? 'API' : '-'
}

function getItemMetricLabel(resource: AdminResourceName) {
  if (resource === 'skills')
    return 'table.resourceType'
  return resource === 'accounts' ? 'table.boundSpaceIds' : 'table.metric'
}

function getSkillLabelKey(kind: SkillLabelKind, value: string | null | undefined): AdminFieldLabelKey | null {
  if (kind === 'sourceType') {
    if (value === 'github')
      return 'fields.sourceTypeGithub'
    if (value === 'official')
      return 'fields.sourceTypeOfficial'
    if (value === 'site' || value === 'markdown' || value === 'zip')
      return 'fields.sourceTypeSite'
    if (value === 'other')
      return 'fields.sourceTypeOther'
    return null
  }
  if (kind === 'publicationStatus') {
    if (value === 'draft')
      return 'fields.publicationStatusDraft'
    if (value === 'published')
      return 'fields.publicationStatusPublished'
    if (value === 'unlisted')
      return 'fields.publicationStatusUnlisted'
    if (value === 'archived')
      return 'fields.publicationStatusArchived'
    return null
  }
  if (value === 'remote_reference')
    return 'fields.contentTypeRemote'
  if (value === 'zip_package')
    return 'fields.contentTypeZip'
  if (value === 'markdown_file')
    return 'fields.contentTypeMarkdown'
  return null
}

function getSkillDisplayLabel(
  t: AdminFieldTranslator,
  kind: SkillLabelKind,
  value: string | null | undefined,
) {
  const labelKey = getSkillLabelKey(kind, value)
  return labelKey ? t(labelKey) : value || '-'
}

function taxonomyToText(items: Array<{ slug: string }>) {
  return items.map(item => item.slug).join(', ')
}

function taxonomyToDisplayText(items: Array<{ name?: string | null, slug: string }>) {
  return items.map(item => item.name || item.slug).join(', ') || '-'
}

function formatDateTime(value: string | null | undefined) {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return date.toLocaleString()
}

function commaSeparatedTextToArray(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function emptyStringToNull(value: string) {
  const nextValue = value.trim()
  return nextValue || null
}

function buildCreateSkillPayload(values: CreateSkillFormValues): AdminSkillCreatePayload {
  return {
    slug: values.slug.trim(),
    name: values.name.trim(),
    description: values.description.trim(),
    author_name: emptyStringToNull(values.author_name),
    source_type: values.source_type,
    source_url: emptyStringToNull(values.source_url),
    install_command: emptyStringToNull(values.install_command),
    publication_status: values.publication_status,
    audit_status: values.audit_status,
    audit_notes: emptyStringToNull(values.audit_notes),
    categories: commaSeparatedTextToArray(values.categories),
    tags: commaSeparatedTextToArray(values.tags),
    install_count: values.install_count.trim() ? Number(values.install_count) : 0,
    github_stars: values.github_stars.trim() ? Number(values.github_stars) : 0,
    position: values.position.trim() ? Number(values.position) : 0,
    content_type: values.content_type,
    skill_markdown: emptyStringToNull(values.skill_markdown),
  }
}

function buildFieldConfigs(resource: AdminResourceName, item: AdminItem): FieldConfig[] {
  if (resource === 'accounts') {
    const account = item as AdminAccount
    return [
      { name: 'name', labelKey: 'fields.name', type: 'text', value: account.name },
      { name: 'email', labelKey: 'fields.email', type: 'text', value: account.email },
      { name: 'interface_language', labelKey: 'fields.language', type: 'text', value: account.interface_language },
      { name: 'interface_theme', labelKey: 'fields.theme', type: 'text', value: account.interface_theme },
      { name: 'timezone', labelKey: 'fields.timezone', type: 'text', value: account.timezone },
      { name: 'status', labelKey: 'fields.status', type: 'text', value: account.status },
    ]
  }

  if (resource === 'recommendedApps') {
    const recommendedApp = item as AdminRecommendedApp
    return [
      { name: 'categories', labelKey: 'fields.categories', type: 'text', value: recommendedApp.categories.join(', ') },
      { name: 'position', labelKey: 'fields.position', type: 'number', value: recommendedApp.position },
      { name: 'is_listed', labelKey: 'fields.isListed', type: 'switch', value: recommendedApp.is_listed },
      { name: 'is_learn_dify', labelKey: 'fields.isLearnDify', type: 'switch', value: recommendedApp.is_learn_dify },
      { name: 'custom_disclaimer', labelKey: 'fields.customDisclaimer', type: 'textarea', value: recommendedApp.custom_disclaimer },
    ]
  }

  if (resource === 'skills') {
    const skill = item as AdminSkill
    return [
      { name: 'name', labelKey: 'fields.name', type: 'text', value: skill.name },
      { name: 'slug', labelKey: 'fields.slug', type: 'text', value: skill.slug },
      { name: 'description', labelKey: 'fields.description', type: 'textarea', value: skill.description },
      { name: 'author_name', labelKey: 'fields.author', type: 'text', value: skill.author_name },
      { name: 'source_type', labelKey: 'fields.sourceType', type: 'select', value: skill.source_type, options: skillSourceTypeOptions },
      { name: 'source_url', labelKey: 'fields.sourceUrl', type: 'text', value: skill.source_url },
      { name: 'install_command', labelKey: 'fields.installCommand', type: 'textarea', value: skill.install_command },
      { name: 'publication_status', labelKey: 'fields.publicationStatus', type: 'select', value: skill.publication_status, options: skillPublicationStatusOptions },
      { name: 'audit_status', labelKey: 'fields.auditStatus', type: 'select', value: skill.audit_status, options: skillAuditStatusOptions },
      { name: 'audit_notes', labelKey: 'fields.auditNotes', type: 'textarea', value: skill.audit_notes },
      { name: 'categories', labelKey: 'fields.categories', type: 'text', value: taxonomyToText(skill.categories) },
      { name: 'tags', labelKey: 'fields.tags', type: 'text', value: taxonomyToText(skill.tags) },
      { name: 'install_count', labelKey: 'fields.installCount', type: 'number', value: skill.install_count },
      { name: 'github_stars', labelKey: 'fields.githubStars', type: 'number', value: skill.github_stars },
      { name: 'position', labelKey: 'fields.position', type: 'number', value: skill.position },
    ]
  }

  const app = item as AdminApp
  return [
    { name: 'name', labelKey: 'fields.name', type: 'text', value: app.name },
    { name: 'description', labelKey: 'fields.description', type: 'textarea', value: app.description },
    { name: 'enable_site', labelKey: 'fields.enableSite', type: 'switch', value: app.enable_site },
    { name: 'enable_api', labelKey: 'fields.enableApi', type: 'switch', value: app.enable_api },
    { name: 'is_public', labelKey: 'fields.isPublic', type: 'switch', value: app.is_public },
    { name: 'maintainer', labelKey: 'fields.maintainer', type: 'text', value: app.maintainer },
    { name: 'max_active_requests', labelKey: 'fields.maxActiveRequests', type: 'number', value: app.max_active_requests },
  ]
}

function buildPayload(resource: AdminResourceName, fields: FieldConfig[], values: Record<string, EditableValue>) {
  const payload: Record<string, EditableValue | string[]> = {}

  for (const field of fields) {
    const value = values[field.name]
    if (field.type === 'number') {
      payload[field.name] = value === '' || value === null || value === undefined ? null : Number(value)
      continue
    }
    if (field.type === 'switch') {
      payload[field.name] = Boolean(value)
      continue
    }
    if (resource === 'recommendedApps' && field.name === 'categories') {
      payload.categories = String(value ?? '')
        .split(',')
        .map(category => category.trim())
        .filter(Boolean)
      continue
    }
    if (resource === 'skills' && (field.name === 'categories' || field.name === 'tags')) {
      payload[field.name] = String(value ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
      continue
    }
    payload[field.name] = value
  }

  return payload
}

function getStoredAdminApiKey() {
  if (typeof window === 'undefined')
    return ''

  return window.sessionStorage.getItem(ADMIN_API_KEY_STORAGE_KEY) ?? ''
}

function subscribeAdminApiKey(listener: () => void) {
  adminApiKeyListeners.add(listener)

  return () => {
    adminApiKeyListeners.delete(listener)
  }
}

function emitAdminApiKeyChange() {
  adminApiKeyListeners.forEach(listener => listener())
}

function useAdminApiKey() {
  const apiKey = useSyncExternalStore(subscribeAdminApiKey, getStoredAdminApiKey, () => '')

  const saveApiKey = (nextApiKey: string) => {
    window.sessionStorage.setItem(ADMIN_API_KEY_STORAGE_KEY, nextApiKey)
    emitAdminApiKeyChange()
  }

  const clearApiKey = () => {
    window.sessionStorage.removeItem(ADMIN_API_KEY_STORAGE_KEY)
    emitAdminApiKeyChange()
  }

  return { apiKey, saveApiKey, clearApiKey }
}

function SkeletonRows() {
  const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5']

  return (
    <div role="status" className="space-y-2 p-4">
      {skeletonRows.map(row => (
        <div key={row} className="h-12 rounded-lg bg-background-section-burn" />
      ))}
    </div>
  )
}

function EmptyState({ message, action }: { message: string, action: string }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="system-md-medium text-text-secondary">{message}</div>
      <div className="system-sm-regular text-text-tertiary">{action}</div>
    </div>
  )
}

function SkillFilterControls({
  values,
  onChange,
}: {
  values: SkillFilters
  onChange: (values: SkillFilters) => void
}) {
  const { t } = useTranslation('admin')

  return (
    <>
      <label className="min-w-40 system-sm-medium text-text-secondary">
        {t('filters.category')}
        <Input
          className="mt-1"
          value={values.category}
          placeholder={t('filters.categoryPlaceholder')}
          onChange={event => onChange({ ...values, category: event.target.value })}
        />
      </label>
      <label className="min-w-40 system-sm-medium text-text-secondary">
        {t('filters.sourceType')}
        <select
          className="mt-1 h-8 w-full rounded-lg border border-components-input-border bg-components-input-bg-normal px-2 system-sm-regular text-components-input-text-filled outline-hidden focus:border-components-input-border-active"
          value={values.source_type}
          onChange={event => onChange({ ...values, source_type: event.target.value })}
        >
          <option value="">{t('filters.all')}</option>
          {skillSourceTypeOptions.map(option => (
            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
          ))}
        </select>
      </label>
      <label className="min-w-40 system-sm-medium text-text-secondary">
        {t('filters.publicationStatus')}
        <select
          className="mt-1 h-8 w-full rounded-lg border border-components-input-border bg-components-input-bg-normal px-2 system-sm-regular text-components-input-text-filled outline-hidden focus:border-components-input-border-active"
          value={values.publication_status}
          onChange={event => onChange({ ...values, publication_status: event.target.value })}
        >
          <option value="">{t('filters.all')}</option>
          {skillPublicationStatusOptions.map(option => (
            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
          ))}
        </select>
      </label>
      <label className="min-w-36 system-sm-medium text-text-secondary">
        {t('filters.updatedAtStart')}
        <Input
          className="mt-1"
          type="date"
          value={values.updated_at_start}
          onChange={event => onChange({ ...values, updated_at_start: event.target.value })}
        />
      </label>
      <label className="min-w-36 system-sm-medium text-text-secondary">
        {t('filters.updatedAtEnd')}
        <Input
          className="mt-1"
          type="date"
          value={values.updated_at_end}
          onChange={event => onChange({ ...values, updated_at_end: event.target.value })}
        />
      </label>
    </>
  )
}

function ResourceTable({
  resource,
  data,
  onSelect,
  onDelete,
}: {
  resource: AdminResourceName
  data: AdminItem[]
  onSelect: (item: AdminItem) => void
  onDelete: (item: AdminItem) => void
}) {
  const { t } = useTranslation('admin')

  if (resource === 'skills') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-240 table-fixed">
          <thead>
            <tr className="border-b border-divider-subtle bg-background-section-burn text-left system-xs-medium text-text-tertiary">
              <th className="w-14 px-4 py-3">{t('table.index')}</th>
              <th className="w-[20%] px-4 py-3">{t('table.primary')}</th>
              <th className="w-[12%] px-4 py-3">{t('table.type')}</th>
              <th className="w-[14%] px-4 py-3">{t('table.category')}</th>
              <th className="w-[12%] px-4 py-3">{t('table.source')}</th>
              <th className="w-[10%] px-4 py-3">{t('table.downloads')}</th>
              <th className="w-[12%] px-4 py-3">{t('table.status')}</th>
              <th className="w-[14%] px-4 py-3">{t('table.updatedAt')}</th>
              <th className="w-[14%] px-4 py-3 text-right">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider-subtle">
            {data.map((item, index) => {
              const skill = item as AdminSkill
              return (
                <tr key={skill.id} className="bg-background-default">
                  <td className="px-4 py-3 system-sm-regular text-text-tertiary tabular-nums">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="truncate system-sm-medium text-text-primary">{skill.name}</div>
                    <div className="mt-1 truncate system-xs-regular text-text-tertiary">{skill.slug}</div>
                  </td>
                  <td className="px-4 py-3 system-sm-regular text-text-secondary">
                    {getSkillDisplayLabel(t, 'contentType', skill.latest_version?.content_type)}
                  </td>
                  <td className="px-4 py-3 system-sm-regular text-text-secondary">
                    <span className="line-clamp-2">{taxonomyToDisplayText(skill.categories)}</span>
                  </td>
                  <td className="px-4 py-3 system-sm-regular text-text-secondary">
                    {getSkillDisplayLabel(t, 'sourceType', skill.source_type)}
                  </td>
                  <td className="px-4 py-3 system-sm-regular text-text-secondary tabular-nums">{skill.install_count}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex max-w-full rounded-md bg-background-section-burn px-2 py-1 system-xs-medium text-text-secondary">
                      <span className="truncate">{getSkillDisplayLabel(t, 'publicationStatus', skill.publication_status)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 system-sm-regular text-text-secondary">{formatDateTime(skill.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="small" variant="secondary" onClick={() => onSelect(item)}>
                        {t('actions.details')}
                      </Button>
                      <Button size="small" variant="secondary" tone="destructive" onClick={() => onDelete(item)}>
                        {t(getAdminResource(resource).meta.deleteKey)}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-180 table-fixed">
        <thead>
          <tr className="border-b border-divider-subtle bg-background-section-burn text-left system-xs-medium text-text-tertiary">
            <th className="w-[36%] px-4 py-3">{t('table.primary')}</th>
            <th className="w-[22%] px-4 py-3">{t('table.status')}</th>
            <th className="w-[18%] px-4 py-3">{t(getItemMetricLabel(resource))}</th>
            <th className="w-[24%] px-4 py-3 text-right">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider-subtle">
          {data.map(item => (
            <tr key={item.id} className="bg-background-default">
              <td className="px-4 py-3">
                <div className="truncate system-sm-medium text-text-primary">{getItemTitle(resource, item)}</div>
                <div className="mt-1 truncate system-xs-regular text-text-tertiary">{getItemSubtitle(resource, item)}</div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex max-w-full rounded-md bg-background-section-burn px-2 py-1 system-xs-medium text-text-secondary">
                  <span className="truncate">{getItemStatus(resource, item)}</span>
                </span>
              </td>
              <td className="px-4 py-3 system-sm-regular text-text-secondary tabular-nums">
                {getItemMetric(resource, item)}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button size="small" variant="secondary" onClick={() => onSelect(item)}>
                    {t('actions.details')}
                  </Button>
                  <Button size="small" variant="secondary" tone="destructive" onClick={() => onDelete(item)}>
                    {t(getAdminResource(resource).meta.deleteKey)}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function getInitialFieldValues(fields: FieldConfig[]) {
  return fields.reduce<Record<string, EditableValue>>((nextValues, field) => {
    nextValues[field.name] = field.value ?? ''
    return nextValues
  }, {})
}

function getFieldStateKey(fields: FieldConfig[]) {
  return fields
    .map(field => `${field.name}:${String(field.value ?? '')}`)
    .join('|')
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldConfig
  value: EditableValue
  onChange: (value: EditableValue) => void
}) {
  const { t } = useTranslation('admin')

  if (field.type === 'textarea') {
    return (
      <Textarea
        className="mt-1"
        value={String(value ?? '')}
        onValueChange={onChange}
      />
    )
  }

  if (field.type === 'switch') {
    return (
      <span className="mt-2 flex items-center gap-2">
        <Switch
          checked={Boolean(value)}
          onCheckedChange={onChange}
        />
        <span className="system-xs-regular text-text-tertiary">
          {value ? t('states.enabled') : t('states.disabled')}
        </span>
      </span>
    )
  }

  if (field.type === 'select') {
    const options = field.options ?? []
    const selectedOption = options.find(option => option.value === String(value ?? ''))

    return (
      <Select
        value={selectedOption?.value ?? null}
        onValueChange={(nextValue) => {
          if (nextValue !== null)
            onChange(nextValue)
        }}
      >
        <SelectTrigger className="mt-1 w-full" aria-label={t(field.labelKey)}>
          {selectedOption ? t(selectedOption.labelKey) : t('placeholder.select', { ns: 'common' })}
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              <SelectItemText>{t(option.labelKey)}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <Input
      className="mt-1"
      type={field.type === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={event => onChange(event.target.value)}
    />
  )
}

function ResourceEditorForm({
  apiKey,
  resource,
  item,
  detailFields,
  initialValues,
  onCancel,
  onSuccess,
}: {
  apiKey: string
  resource: AdminResourceName
  item: AdminItem
  detailFields: FieldConfig[]
  initialValues: Record<string, EditableValue>
  onCancel: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation('admin')
  const [values, setValues] = useState(initialValues)
  const mutation = useMutation({
    mutationFn: () => updateAdminResource(apiKey, resource, item.id, buildPayload(resource, detailFields, values) as Partial<AdminResourceItemMap[typeof resource]>),
    onSuccess: () => {
      onSuccess()
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      {detailFields.map(field => (
        <label key={field.name} className="block system-sm-medium text-text-secondary">
          <span>{t(field.labelKey)}</span>
          <FieldInput
            field={field}
            value={values[field.name]}
            onChange={value => setValues(current => ({ ...current, [field.name]: value }))}
          />
        </label>
      ))}
      {mutation.error && (
        <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary">
          {t('states.saveError')}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          {t('actions.save')}
        </Button>
      </div>
    </form>
  )
}

function SkillAssetUpload({
  apiKey,
  skill,
  onUploaded,
}: {
  apiKey: string
  skill: AdminSkill
  onUploaded: () => void
}) {
  const { t } = useTranslation('admin')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mutation = useMutation({
    mutationFn: (nextFile: File) => uploadAdminSkillAsset(apiKey, skill.id, nextFile),
    onSuccess: () => {
      if (fileInputRef.current)
        fileInputRef.current.value = ''
      toast.success(t('states.uploadSuccess'))
      onUploaded()
    },
  })

  return (
    <section className="mb-6 rounded-lg border border-divider-subtle bg-background-section p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="system-md-semibold text-text-secondary">{t('drawer.assetUpload')}</h3>
          <p className="mt-1 system-xs-regular text-text-tertiary">{t('drawer.assetUploadHint')}</p>
        </div>
        <Button
          type="button"
          size="small"
          variant="primary"
          loading={mutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('actions.uploadAsset')}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        tabIndex={-1}
        accept=".zip,.md,.markdown,application/zip,application/x-zip-compressed,text/markdown,text/plain"
        aria-label={t('drawer.assetUpload')}
        onChange={(event) => {
          const nextFile = event.target.files?.[0]
          if (nextFile)
            mutation.mutate(nextFile)
        }}
      />
      {skill.latest_version && (
        <dl className="mt-4 grid grid-cols-1 gap-3 system-xs-regular text-text-tertiary sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt>{t('fields.contentType')}</dt>
          <dd className="min-w-0 text-text-secondary">
            {getSkillDisplayLabel(t, 'contentType', skill.latest_version.content_type)}
          </dd>
          <dt>{t('fields.packageFilename')}</dt>
          <dd className="min-w-0 truncate text-text-secondary">
            {skill.latest_version.package_filename ?? '-'}
          </dd>
          <dt>{t('fields.checksumSha256')}</dt>
          <dd className="min-w-0 break-all font-mono text-text-secondary">
            {skill.latest_version.checksum_sha256 ?? '-'}
          </dd>
        </dl>
      )}
      {!skill.latest_version && (
        <div className="mt-4 rounded-lg bg-background-default p-3 system-sm-regular text-text-tertiary">
          {t('drawer.noVersion')}
        </div>
      )}
      {mutation.error && (
        <div className="mt-3 rounded-lg bg-background-default p-3 system-sm-regular text-text-tertiary">
          {t('states.uploadError')}
        </div>
      )}
    </section>
  )
}

function ResourceEditor({
  apiKey,
  resource,
  item,
  onClose,
  onSaved,
}: {
  apiKey: string
  resource: AdminResourceName
  item: AdminItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('admin')
  const open = Boolean(item)
  const fields = useMemo(() => item ? buildFieldConfigs(resource, item) : [], [item, resource])
  const detailQuery = useQuery({
    queryKey: ['admin', 'detail', resource, item?.id, apiKey],
    queryFn: () => fetchAdminResourceDetail(apiKey, resource, item!.id),
    enabled: Boolean(apiKey && item),
    retry: false,
  })
  const detailItem = (detailQuery.data ?? item) as AdminItem | null
  const detailFields = useMemo(() => detailItem ? buildFieldConfigs(resource, detailItem) : fields, [detailItem, fields, resource])
  const initialValues = useMemo(() => getInitialFieldValues(detailFields), [detailFields])
  const fieldStateKey = useMemo(() => getFieldStateKey(detailFields), [detailFields])

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <DialogContent className="w-[720px]! max-w-[calc(100vw-2rem)]! overflow-hidden! border-none p-0! text-left align-middle">
        <div className="flex items-start justify-between gap-4 border-b border-divider-subtle p-6">
          <div className="min-w-0">
            <DialogTitle className="truncate title-xl-semi-bold text-text-primary">
              {detailItem ? getItemTitle(resource, detailItem) : t('drawer.title')}
            </DialogTitle>
            <p className="mt-1 system-sm-regular text-pretty text-text-tertiary">
              {t('drawer.description')}
            </p>
          </div>
          <DialogCloseButton aria-label={t('actions.close')} />
        </div>
        <div className="max-h-[calc(80dvh-5rem)] overflow-y-auto p-6">
          {detailQuery.isFetching && <SkeletonRows />}
          {detailQuery.error && (
            <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary">
              {t('states.error')}
            </div>
          )}
          {!detailQuery.isFetching && (
            detailItem && item && (
              <>
                {resource === 'skills' && (
                  <SkillAssetUpload
                    apiKey={apiKey}
                    skill={detailItem as AdminSkill}
                    onUploaded={() => {
                      detailQuery.refetch()
                      onSaved()
                    }}
                  />
                )}
                <ResourceEditorForm
                  key={`${resource}:${item.id}:${fieldStateKey}`}
                  apiKey={apiKey}
                  resource={resource}
                  item={item}
                  detailFields={detailFields}
                  initialValues={initialValues}
                  onCancel={onClose}
                  onSuccess={() => {
                    onSaved()
                    onClose()
                  }}
                />
              </>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConfirmDialog({
  apiKey,
  resource,
  item,
  onClose,
  onDeleted,
}: {
  apiKey: string
  resource: AdminResourceName
  item: AdminItem | null
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation('admin')
  const mutation = useMutation({
    mutationFn: () => deleteAdminResource(apiKey, resource, item!.id),
    onSuccess: () => {
      onDeleted()
      onClose()
    },
  })

  return (
    <AlertDialog open={Boolean(item)} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        <div className="p-6">
          <AlertDialogTitle className="title-lg-bold text-text-primary">
            {t('delete.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 system-sm-regular text-pretty text-text-tertiary">
            {t('delete.description')}
          </AlertDialogDescription>
          {mutation.error && (
            <div className="mt-4 rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary">
              {t('states.deleteError')}
            </div>
          )}
        </div>
        <AlertDialogActions>
          <AlertDialogCancelButton>{t('actions.cancel')}</AlertDialogCancelButton>
          <AlertDialogConfirmButton loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {item ? t(getAdminResource(resource).meta.deleteKey) : t('actions.confirm')}
          </AlertDialogConfirmButton>
        </AlertDialogActions>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CreateSkillDialog({
  apiKey,
  open,
  onClose,
  onCreated,
}: {
  apiKey: string
  open: boolean
  onClose: () => void
  onCreated: (skill: AdminSkill) => void
}) {
  const { t } = useTranslation('admin')
  const [values, setValues] = useState<CreateSkillFormValues>(createSkillInitialValues)
  const fields = useMemo<FieldConfig[]>(() => [
    { name: 'name', labelKey: 'fields.name', type: 'text', value: values.name },
    { name: 'slug', labelKey: 'fields.slug', type: 'text', value: values.slug },
    { name: 'description', labelKey: 'fields.description', type: 'textarea', value: values.description },
    { name: 'author_name', labelKey: 'fields.author', type: 'text', value: values.author_name },
    { name: 'source_type', labelKey: 'fields.sourceType', type: 'select', value: values.source_type, options: skillSourceTypeOptions },
    { name: 'source_url', labelKey: 'fields.sourceUrl', type: 'text', value: values.source_url },
    { name: 'install_command', labelKey: 'fields.installCommand', type: 'textarea', value: values.install_command },
    { name: 'publication_status', labelKey: 'fields.publicationStatus', type: 'select', value: values.publication_status, options: skillPublicationStatusOptions },
    { name: 'audit_status', labelKey: 'fields.auditStatus', type: 'select', value: values.audit_status, options: skillAuditStatusOptions },
    { name: 'audit_notes', labelKey: 'fields.auditNotes', type: 'textarea', value: values.audit_notes },
    { name: 'categories', labelKey: 'fields.categories', type: 'text', value: values.categories },
    { name: 'tags', labelKey: 'fields.tags', type: 'text', value: values.tags },
    { name: 'install_count', labelKey: 'fields.installCount', type: 'number', value: values.install_count },
    { name: 'github_stars', labelKey: 'fields.githubStars', type: 'number', value: values.github_stars },
    { name: 'position', labelKey: 'fields.position', type: 'number', value: values.position },
    { name: 'content_type', labelKey: 'fields.contentType', type: 'select', value: values.content_type, options: skillContentTypeOptions },
    { name: 'skill_markdown', labelKey: 'fields.skillMarkdown', type: 'textarea', value: values.skill_markdown },
  ], [values])
  const mutation = useMutation({
    mutationFn: () => createAdminResource(apiKey, 'skills', buildCreateSkillPayload(values)),
    onSuccess: (createdSkill) => {
      setValues(createSkillInitialValues)
      toast.success(t('states.createSuccess'))
      onCreated(createdSkill)
      onClose()
    },
  })
  const canSubmit = values.name.trim() && values.slug.trim() && values.description.trim()

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <DialogContent className="w-[760px]! max-w-[calc(100vw-2rem)]! overflow-hidden! border-none p-0! text-left align-middle">
        <div className="flex items-start justify-between gap-4 border-b border-divider-subtle p-6">
          <div className="min-w-0">
            <DialogTitle className="title-xl-semi-bold text-text-primary">
              {t('drawer.createSkillTitle')}
            </DialogTitle>
            <p className="mt-1 system-sm-regular text-pretty text-text-tertiary">
              {t('drawer.createSkillDescription')}
            </p>
          </div>
          <DialogCloseButton aria-label={t('actions.close')} />
        </div>
        <form
          className="max-h-[calc(80dvh-5rem)] space-y-4 overflow-y-auto p-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit)
              mutation.mutate()
          }}
        >
          {fields.map(field => (
            <label key={field.name} className="block system-sm-medium text-text-secondary">
              <span>{t(field.labelKey)}</span>
              <FieldInput
                field={field}
                value={values[field.name as keyof CreateSkillFormValues]}
                onChange={value => setValues(current => ({ ...current, [field.name]: String(value ?? '') }))}
              />
            </label>
          ))}
          {mutation.error && (
            <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary">
              {t('states.createError')}
            </div>
          )}
          <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-divider-subtle bg-background-default px-6 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={mutation.isPending}>
              {t('actions.createSkill')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AdminLockedState({ onUnlock }: { onUnlock: (apiKey: string) => void }) {
  const { t } = useTranslation('admin')
  const [apiKeyInput, setApiKeyInput] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextApiKey = apiKeyInput.trim()
    if (nextApiKey)
      onUnlock(nextApiKey)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background-body px-6 py-10">
      <section className="w-full max-w-110 rounded-lg border border-divider-subtle bg-background-default p-6 shadow-sm">
        <h1 className="title-2xl-semi-bold text-balance text-text-primary">{t('title')}</h1>
        <p className="mt-2 system-sm-regular text-pretty text-text-tertiary">{t('auth.empty')}</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block system-sm-medium text-text-secondary">
            {t('auth.apiKeyLabel')}
            <Input
              className="mt-1"
              value={apiKeyInput}
              type="password"
              onChange={event => setApiKeyInput(event.target.value)}
            />
          </label>
          <Button type="submit" variant="primary" className="w-full">
            {t('auth.connect')}
          </Button>
        </form>
      </section>
    </main>
  )
}

export default function AdminPage() {
  const { t } = useTranslation('admin')
  const title = t('title')
  const { apiKey, saveApiKey, clearApiKey } = useAdminApiKey()
  const [resource, setResource] = useState<AdminResourceName>('accounts')
  const [keywordDraft, setKeywordDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [skillFilterDraft, setSkillFilterDraft] = useState<SkillFilters>(skillFilterInitialValues)
  const [skillFilters, setSkillFilters] = useState<SkillFilters>(skillFilterInitialValues)
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<AdminItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<AdminItem | null>(null)
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false)
  const activeResource = getAdminResource(resource)
  const activeSkillFilters = useMemo(() => {
    if (resource !== 'skills')
      return undefined
    return {
      category: skillFilters.category,
      source_type: skillFilters.source_type,
      publication_status: skillFilters.publication_status,
      updated_at_start: skillFilters.updated_at_start,
      updated_at_end: skillFilters.updated_at_end,
    }
  }, [resource, skillFilters])

  useDocumentTitle(title)

  const listQuery = useQuery<AdminPagination<AdminItem>>({
    queryKey: ['admin', 'list', resource, apiKey, page, keyword, activeSkillFilters],
    queryFn: () => fetchAdminResourceList({
      apiKey,
      resource,
      page,
      limit: adminResourceLimit,
      keyword,
      filters: activeSkillFilters,
    }) as Promise<AdminPagination<AdminItem>>,
    enabled: Boolean(apiKey),
    retry: false,
  })

  if (!apiKey)
    return <AdminLockedState onUnlock={saveApiKey} />

  const data = listQuery.data?.data ?? []
  const total = listQuery.data?.total ?? 0

  return (
    <main className="min-h-dvh bg-background-body text-text-primary">
      <div className="flex min-h-dvh">
        <aside className="w-64 shrink-0 border-r border-divider-subtle bg-background-default px-4 py-5">
          <div className="px-2">
            <h1 className="title-xl-semi-bold text-balance text-text-primary">{title}</h1>
            <p className="mt-1 system-xs-regular text-pretty text-text-tertiary">{t('description')}</p>
          </div>
          <nav className="mt-6 space-y-1" aria-label={t('nav.resources')}>
            {adminResources.map(item => (
              <button
                key={item.name}
                type="button"
                className={cn(
                  'flex h-9 w-full items-center rounded-lg px-3 text-left system-sm-medium outline-hidden hover:bg-state-base-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid',
                  item.name === resource ? 'bg-state-accent-hover text-text-accent' : 'text-text-secondary',
                )}
                onClick={() => {
                  setResource(item.name)
                  setPage(1)
                  setSelectedItem(null)
                  setDeleteItem(null)
                  setIsCreateSkillOpen(false)
                  setKeywordDraft('')
                  setKeyword('')
                  setSkillFilterDraft(skillFilterInitialValues)
                  setSkillFilters(skillFilterInitialValues)
                }}
              >
                {t(item.meta.titleKey)}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex min-h-16 items-center justify-between gap-4 border-b border-divider-subtle bg-background-default px-6 py-3">
            <div className="min-w-0">
              <h2 className="truncate title-xl-semi-bold text-text-primary">{t(activeResource.meta.titleKey)}</h2>
              <p className="mt-1 truncate system-sm-regular text-text-tertiary">{t(activeResource.meta.descriptionKey)}</p>
            </div>
            <div className="flex items-center gap-3">
              {resource === 'skills' && (
                <Button variant="primary" size="small" onClick={() => setIsCreateSkillOpen(true)}>
                  {t('actions.createSkill')}
                </Button>
              )}
              <span className="rounded-md bg-background-section-burn px-2 py-1 system-xs-medium text-text-secondary">
                {t('auth.connected')}
              </span>
              <Button variant="secondary" size="small" onClick={clearApiKey}>
                {t('auth.disconnect')}
              </Button>
            </div>
          </header>

          <div className="p-6">
            <form
              className="mb-4 flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                setKeyword(keywordDraft)
                if (resource === 'skills')
                  setSkillFilters(skillFilterDraft)
                setPage(1)
              }}
            >
              <label className="min-w-64 flex-1 system-sm-medium text-text-secondary">
                {t('filters.search')}
                <Input
                  className="mt-1"
                  value={keywordDraft}
                  placeholder={t('filters.searchPlaceholder')}
                  onChange={event => setKeywordDraft(event.target.value)}
                />
              </label>
              {resource === 'skills' && (
                <SkillFilterControls values={skillFilterDraft} onChange={setSkillFilterDraft} />
              )}
              <Button type="submit" variant="primary">
                {t('filters.apply')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setKeywordDraft('')
                  setKeyword('')
                  setSkillFilterDraft(skillFilterInitialValues)
                  setSkillFilters(skillFilterInitialValues)
                  setPage(1)
                }}
              >
                {t('filters.reset')}
              </Button>
            </form>

            <div className="overflow-hidden rounded-lg border border-divider-subtle bg-background-default">
              <div className="flex items-center justify-between border-b border-divider-subtle px-4 py-3">
                <div className="system-sm-medium text-text-secondary">
                  {t('table.total', { total })}
                </div>
                {listQuery.isFetching && <div role="status" className="system-xs-regular text-text-tertiary">{t('states.loading')}</div>}
              </div>

              {listQuery.isLoading && <SkeletonRows />}
              {listQuery.error && (
                <EmptyState message={t('states.error')} action={t('states.retryHint')} />
              )}
              {!listQuery.isLoading && !listQuery.error && data.length === 0 && (
                <EmptyState message={t('states.empty')} action={t('states.emptyAction')} />
              )}
              {!listQuery.isLoading && !listQuery.error && data.length > 0 && (
                <ResourceTable
                  resource={resource}
                  data={data}
                  onSelect={setSelectedItem}
                  onDelete={setDeleteItem}
                />
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="system-xs-regular text-text-tertiary">
                {t('pagination.page', { page })}
              </div>
              <div className="flex gap-2">
                <Button size="small" variant="secondary" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>
                  {t('pagination.prev')}
                </Button>
                <Button size="small" variant="secondary" disabled={!listQuery.data?.has_more} onClick={() => setPage(current => current + 1)}>
                  {t('pagination.next')}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ResourceEditor
        apiKey={apiKey}
        resource={resource}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSaved={() => listQuery.refetch()}
      />
      <DeleteConfirmDialog
        apiKey={apiKey}
        resource={resource}
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDeleted={() => listQuery.refetch()}
      />
      <CreateSkillDialog
        apiKey={apiKey}
        open={isCreateSkillOpen}
        onClose={() => setIsCreateSkillOpen(false)}
        onCreated={(createdSkill) => {
          setPage(1)
          setSelectedItem(createdSkill)
          listQuery.refetch()
        }}
      />
    </main>
  )
}
