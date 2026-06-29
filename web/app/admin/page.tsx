'use client'

import type { TFunction } from 'i18next'
import type { FormEvent, ReactNode } from 'react'
import type { AdminResourceName } from '@/features/admin/resources'
import type {
  AdminAccount,
  AdminApp,
  AdminAutoService,
  AdminAutoServiceCreatePayload,
  AdminAutoServiceRunLog,
  AdminPagination,
  AdminRecommendedApp,
  AdminResourceItemMap,
  AdminSkill,
  AdminSkillBatchPublishPayload,
  AdminSkillCategory,
  AdminSkillCreatePayload,
  AdminSkillTag,
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
import { Checkbox } from '@langgenius/dify-ui/checkbox'
import { CheckboxGroup } from '@langgenius/dify-ui/checkbox-group'
import { cn } from '@langgenius/dify-ui/cn'
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxInputTrigger,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxItemText,
  ComboboxList,
  ComboboxStatus,
  ComboboxValue,
} from '@langgenius/dify-ui/combobox'
import { Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@langgenius/dify-ui/dialog'
import { Input } from '@langgenius/dify-ui/input'
import { Select, SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectTrigger } from '@langgenius/dify-ui/select'
import { Switch } from '@langgenius/dify-ui/switch'
import { Textarea } from '@langgenius/dify-ui/textarea'
import { toast } from '@langgenius/dify-ui/toast'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import JulyLogo from '@/app/components/base/logo/dify-logo'
import { adminResourceGroups, adminResourceLimit, adminResources, getAdminResource } from '@/features/admin/resources'
import {
  AdminRequestError,
  batchPublishAdminSkills,
  createAdminResource,
  createAdminSkillVersion,
  deleteAdminResource,
  fetchAdminAutoServiceLogs,
  fetchAdminResourceDetail,
  fetchAdminResourceList,
  runAdminAutoService,
  updateAdminResource,
  uploadAdminSkillAsset,
} from '@/features/admin/service'
import useDocumentTitle from '@/hooks/use-document-title'
import Link from '@/next/link'

const ADMIN_API_KEY_STORAGE_KEY = 'dify-admin-api-key'
const SELECT_ALL_VALUE = '__all__'
const DEFAULT_AUTO_SERVICE_TIMEZONE = 'Asia/Shanghai'

const adminApiKeyListeners = new Set<() => void>()

type AdminItem = AdminAccount | AdminRecommendedApp | AdminApp | AdminSkill | AdminSkillCategory | AdminSkillTag | AdminAutoService

type EditableValue = string | number | boolean | null | undefined
type EditableFieldValue = EditableValue | string[]
type EditablePayloadValue = EditableValue | string[] | Record<string, unknown>
type AdminFieldLabelKey = I18nKeysWithPrefix<'admin', 'fields.'>
type SkillSort = '' | 'downloads_desc' | 'downloads_asc' | 'github_stars_desc' | 'github_stars_asc'
type TaxonomyOption = {
  value: string
  label: string
}

type FieldConfig = {
  name: string
  labelKey: AdminFieldLabelKey
  type: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'taxonomy-multi'
  value: EditableFieldValue
  layout?: 'half' | 'full'
  inputClassName?: string
  required?: boolean
  submitName?: string
  includeInPayload?: boolean
  options?: Array<{
    value: string
    labelKey: AdminFieldLabelKey
  }>
  taxonomyResource?: TaxonomyResourceName
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
  categories: string[]
  tags: string[]
  install_count: string
  github_stars: string
  is_featured: boolean
  position: string
  content_type: string
  skill_markdown: string
}

type SkillFilters = {
  category: string
  source_type: string
  publication_status: string
  min_github_stars: string
  updated_at_start: string
  updated_at_end: string
  sort: SkillSort
}

type CreateAutoServiceFormValues = {
  code: string
  name: string
  description: string
  service_type: string
  status: string
  schedule_type: string
  interval_minutes: string
  cron_expression: string
  timezone: string
  config: string
}

type TaxonomyResourceName = 'skillCategories' | 'skillTags'

type CreateTaxonomyFormValues = {
  name: string
  slug: string
  position: string
}

type SkillLabelKind = 'sourceType' | 'publicationStatus' | 'contentType'
type AutoServiceLabelKind = 'serviceType' | 'serviceStatus' | 'scheduleType' | 'runStatus'
type AdminTranslator = TFunction<'admin'>
type AdminFieldTranslator = (_key: AdminFieldLabelKey) => string

const adminResourceIconClassNames = {
  accounts: 'i-ri-user-settings-line',
  recommendedApps: 'i-ri-layout-grid-line',
  apps: 'i-ri-apps-2-line',
  skills: 'i-ri-tools-line',
  skillCategories: 'i-ri-folder-3-line',
  skillTags: 'i-ri-price-tag-3-line',
  autoServices: 'i-ri-timer-line',
} as const satisfies Record<AdminResourceName, string>

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

const autoServiceTypeOptions = [
  { value: 'skill_crawler_sync', labelKey: 'fields.autoServiceTypeSkillCrawler' },
  { value: 'dataset_queue_monitor', labelKey: 'fields.autoServiceTypeDatasetQueue' },
] satisfies FieldConfig['options']

const autoServiceStatusOptions = [
  { value: 'enabled', labelKey: 'fields.autoServiceStatusEnabled' },
  { value: 'disabled', labelKey: 'fields.autoServiceStatusDisabled' },
] satisfies FieldConfig['options']

const autoServiceScheduleTypeOptions = [
  { value: 'interval', labelKey: 'fields.scheduleTypeInterval' },
  { value: 'cron', labelKey: 'fields.scheduleTypeCron' },
  { value: 'manual', labelKey: 'fields.scheduleTypeManual' },
] satisfies FieldConfig['options']

const adminUpdateFieldNamesByResource = {
  accounts: ['name', 'email', 'interface_language', 'interface_theme', 'timezone', 'status'],
  recommendedApps: ['categories', 'position', 'is_listed', 'is_learn_dify', 'custom_disclaimer', 'site'],
  apps: [
    'name',
    'description',
    'icon_type',
    'icon',
    'icon_background',
    'enable_site',
    'enable_api',
    'is_public',
    'maintainer',
    'max_active_requests',
    'api_rpm',
    'api_rph',
  ],
  skills: [
    'slug',
    'name',
    'description',
    'author_name',
    'source_type',
    'source_url',
    'install_command',
    'icon',
    'icon_background',
    'icon_url',
    'publication_status',
    'audit_status',
    'audit_notes',
    'categories',
    'tags',
    'install_count',
    'github_stars',
    'is_featured',
    'position',
  ],
  skillCategories: ['name', 'slug', 'position'],
  skillTags: ['name', 'slug'],
  autoServices: [
    'code',
    'name',
    'description',
    'service_type',
    'status',
    'schedule_type',
    'interval_minutes',
    'cron_expression',
    'config',
  ],
} satisfies Record<AdminResourceName, readonly string[]>

const fullWidthEditorFieldNames = new Set([
  'description',
  'install_command',
  'audit_notes',
  'skill_markdown',
  'config',
  'custom_disclaimer',
])

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
  categories: [],
  tags: [],
  install_count: '0',
  github_stars: '0',
  is_featured: false,
  position: '0',
  content_type: 'remote_reference',
  skill_markdown: '',
}

const skillFilterInitialValues: SkillFilters = {
  category: '',
  source_type: '',
  publication_status: '',
  min_github_stars: '',
  updated_at_start: '',
  updated_at_end: '',
  sort: '',
}

function getItemTitle(resource: AdminResourceName, item: AdminItem) {
  if (resource === 'skills')
    return (item as AdminSkill).name || item.id
  if (resource === 'skillCategories' || resource === 'skillTags')
    return (item as AdminSkillCategory | AdminSkillTag).name || item.id
  if (resource === 'autoServices')
    return (item as AdminAutoService).name || item.id
  if (resource === 'recommendedApps') {
    const recommendedApp = item as AdminRecommendedApp
    return recommendedApp.app?.name ?? recommendedApp.app_id
  }
  return (item as AdminAccount | AdminApp).name || item.id
}

function getItemSubtitle(resource: AdminResourceName, item: AdminItem) {
  if (resource === 'skills')
    return (item as AdminSkill).slug
  if (resource === 'skillCategories' || resource === 'skillTags')
    return (item as AdminSkillCategory | AdminSkillTag).slug
  if (resource === 'autoServices')
    return (item as AdminAutoService).code
  if (resource === 'accounts')
    return (item as AdminAccount).email ?? item.id
  if (resource === 'recommendedApps')
    return (item as AdminRecommendedApp).language
  return (item as AdminApp).mode ?? item.id
}

function getItemStatus(resource: AdminResourceName, item: AdminItem) {
  if (resource === 'skills')
    return (item as AdminSkill).publication_status ?? '-'
  if (resource === 'skillCategories' || resource === 'skillTags')
    return formatDateTime((item as AdminSkillCategory | AdminSkillTag).updated_at)
  if (resource === 'autoServices')
    return (item as AdminAutoService).status ?? '-'
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
  if (resource === 'skillCategories')
    return String((item as AdminSkillCategory).position)
  if (resource === 'skillTags')
    return formatDateTime((item as AdminSkillTag).created_at)
  if (resource === 'autoServices')
    return formatDateTime((item as AdminAutoService).next_run_at)
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
  if (resource === 'skillCategories')
    return 'fields.position'
  if (resource === 'skillTags')
    return 'table.createdAt'
  if (resource === 'autoServices')
    return 'table.nextRunAt'
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

function taxonomyToSlugs(items: Array<{ slug: string }>) {
  return items.map(item => item.slug)
}

function taxonomyToDisplayText(items: Array<{ name?: string | null, slug: string }>) {
  return items.map(item => item.name || item.slug).join(', ') || '-'
}

function parseBackendDateTime(value: string) {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized)
  return new Date(hasTimezone ? normalized : `${normalized}Z`)
}

function formatDateTime(value: string | null | undefined) {
  if (!value)
    return '-'
  const date = parseBackendDateTime(value)
  if (Number.isNaN(date.getTime()))
    return value
  return date.toLocaleString('zh-CN', {
    timeZone: DEFAULT_AUTO_SERVICE_TIMEZONE,
    hour12: false,
  })
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
    categories: values.categories,
    tags: values.tags,
    install_count: values.install_count.trim() ? Number(values.install_count) : 0,
    github_stars: values.github_stars.trim() ? Number(values.github_stars) : 0,
    is_featured: values.is_featured,
    position: values.position.trim() ? Number(values.position) : 0,
    content_type: values.content_type,
    skill_markdown: emptyStringToNull(values.skill_markdown),
  }
}

function buildSkillFilterBatchPublishPayload(keyword: string, filters: SkillFilters): AdminSkillBatchPublishPayload {
  return {
    skill_ids: [],
    keyword: keyword.trim() || undefined,
    category: filters.category || undefined,
    source_type: filters.source_type || undefined,
    publication_status: filters.publication_status || undefined,
    min_github_stars: filters.min_github_stars.trim() ? Number(filters.min_github_stars) : undefined,
    updated_at_start: filters.updated_at_start || undefined,
    updated_at_end: filters.updated_at_end || undefined,
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim())
    return {}
  const parsed = JSON.parse(value) as unknown
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw new Error('config must be a JSON object')
  return parsed as Record<string, unknown>
}

function getAutoServiceIntervalMinutesPayload(values: Pick<CreateAutoServiceFormValues, 'schedule_type' | 'interval_minutes'>) {
  if (values.schedule_type !== 'interval')
    return null
  return values.interval_minutes.trim() ? Number(values.interval_minutes) : null
}

function getAutoServiceCronExpressionPayload(values: Pick<CreateAutoServiceFormValues, 'schedule_type' | 'cron_expression'>) {
  if (values.schedule_type !== 'cron')
    return null
  return emptyStringToNull(values.cron_expression)
}

function buildCreateAutoServicePayload(values: CreateAutoServiceFormValues): AdminAutoServiceCreatePayload {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    description: emptyStringToNull(values.description),
    service_type: values.service_type,
    status: values.status,
    schedule_type: values.schedule_type,
    interval_minutes: getAutoServiceIntervalMinutesPayload(values),
    cron_expression: getAutoServiceCronExpressionPayload(values),
    timezone: DEFAULT_AUTO_SERVICE_TIMEZONE,
    config: parseJsonObject(values.config),
  }
}

function filterAutoServiceScheduleFields<T extends string>(fieldNames: T[], scheduleType: string): T[] {
  return fieldNames.filter((fieldName) => {
    if (fieldName === 'timezone')
      return false
    if (fieldName === 'interval_minutes')
      return scheduleType === 'interval'
    if (fieldName === 'cron_expression')
      return scheduleType === 'cron'
    return true
  })
}

function filterAutoServiceFieldsBySchedule(fields: FieldConfig[], scheduleType: string) {
  const visibleFieldNames = new Set(filterAutoServiceScheduleFields(fields.map(field => field.name), scheduleType))
  return fields.filter(field => visibleFieldNames.has(field.name))
}

function buildCreateTaxonomyPayload(resource: TaxonomyResourceName, values: CreateTaxonomyFormValues) {
  if (resource === 'skillCategories') {
    return {
      slug: values.slug.trim(),
      name: values.name.trim(),
      position: values.position.trim() ? Number(values.position) : 0,
    } satisfies Partial<AdminSkillCategory>
  }

  return {
    slug: values.slug.trim(),
    name: values.name.trim(),
  } satisfies Partial<AdminSkillTag>
}

function buildFieldConfigs(resource: AdminResourceName, item: AdminItem): FieldConfig[] {
  if (resource === 'accounts') {
    const account = item as AdminAccount
    return [
      { name: 'name', labelKey: 'fields.name', type: 'text', value: account.name, required: true },
      { name: 'email', labelKey: 'fields.email', type: 'text', value: account.email, required: true },
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
      { name: 'name', labelKey: 'fields.name', type: 'text', value: skill.name, required: true },
      { name: 'slug', labelKey: 'fields.slug', type: 'text', value: skill.slug, required: true },
      { name: 'description', labelKey: 'fields.description', type: 'textarea', value: skill.description, required: true },
      { name: 'author_name', labelKey: 'fields.author', type: 'text', value: skill.author_name },
      { name: 'source_type', labelKey: 'fields.sourceType', type: 'select', value: skill.source_type, options: skillSourceTypeOptions },
      { name: 'source_url', labelKey: 'fields.sourceUrl', type: 'text', value: skill.source_url },
      { name: 'install_command', labelKey: 'fields.installCommand', type: 'textarea', value: skill.install_command },
      { name: 'publication_status', labelKey: 'fields.publicationStatus', type: 'select', value: skill.publication_status, options: skillPublicationStatusOptions },
      { name: 'audit_status', labelKey: 'fields.auditStatus', type: 'select', value: skill.audit_status, options: skillAuditStatusOptions },
      { name: 'audit_notes', labelKey: 'fields.auditNotes', type: 'textarea', value: skill.audit_notes },
      { name: 'categories', labelKey: 'fields.categories', type: 'taxonomy-multi', value: taxonomyToSlugs(skill.categories), taxonomyResource: 'skillCategories' },
      { name: 'tags', labelKey: 'fields.tags', type: 'taxonomy-multi', value: taxonomyToSlugs(skill.tags), taxonomyResource: 'skillTags' },
      { name: 'install_count', labelKey: 'fields.installCount', type: 'number', value: skill.install_count },
      { name: 'github_stars', labelKey: 'fields.githubStars', type: 'number', value: skill.github_stars },
      { name: 'is_featured', labelKey: 'fields.isFeatured', type: 'switch', value: skill.is_featured },
      { name: 'position', labelKey: 'fields.position', type: 'number', value: skill.position },
      { name: 'content_type', labelKey: 'fields.contentType', type: 'select', value: skill.latest_version?.content_type ?? 'remote_reference', options: skillContentTypeOptions },
      { name: 'skill_markdown', labelKey: 'fields.skillMarkdown', type: 'textarea', value: skill.latest_version?.skill_markdown },
    ]
  }

  if (resource === 'skillCategories') {
    const category = item as AdminSkillCategory
    return [
      { name: 'name', labelKey: 'fields.name', type: 'text', value: category.name, required: true },
      { name: 'slug', labelKey: 'fields.slug', type: 'text', value: category.slug, required: true },
      { name: 'position', labelKey: 'fields.position', type: 'number', value: category.position },
    ]
  }

  if (resource === 'skillTags') {
    const tag = item as AdminSkillTag
    return [
      { name: 'name', labelKey: 'fields.name', type: 'text', value: tag.name, required: true },
      { name: 'slug', labelKey: 'fields.slug', type: 'text', value: tag.slug, required: true },
    ]
  }

  if (resource === 'autoServices') {
    const service = item as AdminAutoService
    return [
      { name: 'name', labelKey: 'fields.name', type: 'text', value: service.name, required: true },
      { name: 'code', labelKey: 'fields.code', type: 'text', value: service.code, required: true },
      { name: 'description', labelKey: 'fields.description', type: 'textarea', value: service.description },
      { name: 'service_type', labelKey: 'fields.autoServiceType', type: 'select', value: service.service_type, options: autoServiceTypeOptions, required: true },
      { name: 'status', labelKey: 'fields.autoServiceStatus', type: 'select', value: service.status, options: autoServiceStatusOptions },
      { name: 'schedule_type', labelKey: 'fields.scheduleType', type: 'select', value: service.schedule_type, options: autoServiceScheduleTypeOptions },
      { name: 'interval_minutes', labelKey: 'fields.intervalMinutes', type: 'number', value: service.interval_minutes },
      { name: 'cron_expression', labelKey: 'fields.cronExpression', type: 'text', value: service.cron_expression },
      {
        name: 'config',
        labelKey: 'fields.configJson',
        type: 'textarea',
        value: JSON.stringify(service.config ?? {}, null, 2),
        inputClassName: 'min-h-56',
      },
    ]
  }

  const app = item as AdminApp
  return [
    { name: 'name', labelKey: 'fields.name', type: 'text', value: app.name, required: true },
    { name: 'description', labelKey: 'fields.description', type: 'textarea', value: app.description },
    { name: 'enable_site', labelKey: 'fields.enableSite', type: 'switch', value: app.enable_site },
    { name: 'enable_api', labelKey: 'fields.enableApi', type: 'switch', value: app.enable_api },
    { name: 'is_public', labelKey: 'fields.isPublic', type: 'switch', value: app.is_public },
    { name: 'maintainer', labelKey: 'fields.maintainer', type: 'text', value: app.maintainer },
    { name: 'max_active_requests', labelKey: 'fields.maxActiveRequests', type: 'number', value: app.max_active_requests },
  ]
}

function buildPayload(resource: AdminResourceName, fields: FieldConfig[], values: Record<string, EditableFieldValue>) {
  const payload: Record<string, EditablePayloadValue> = {}
  const updateFieldNames = adminUpdateFieldNamesByResource[resource]

  for (const field of fields) {
    if (field.includeInPayload === false)
      continue

    const payloadName = field.submitName ?? field.name
    if (!updateFieldNames.includes(payloadName))
      continue

    const value = values[field.name]
    if (field.type === 'number') {
      payload[payloadName] = value === '' || value === null || value === undefined ? null : Number(value)
      continue
    }
    if (field.type === 'switch') {
      payload[payloadName] = Boolean(value)
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
      payload[payloadName] = Array.isArray(value)
        ? value
        : String(value ?? '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
      continue
    }
    if (resource === 'autoServices' && field.name === 'config') {
      payload.config = parseJsonObject(String(value ?? '{}'))
      continue
    }
    payload[payloadName] = value
  }

  if (resource === 'autoServices') {
    const scheduleType = String(values.schedule_type ?? payload.schedule_type ?? '')
    payload.timezone = DEFAULT_AUTO_SERVICE_TIMEZONE
    payload.interval_minutes = scheduleType === 'interval'
      ? (values.interval_minutes === '' || values.interval_minutes === null || values.interval_minutes === undefined
          ? null
          : Number(values.interval_minutes))
      : null
    payload.cron_expression = scheduleType === 'cron'
      ? emptyStringToNull(String(values.cron_expression ?? ''))
      : null
  }

  return payload
}

function getFieldLayout(field: FieldConfig) {
  if (field.layout)
    return field.layout
  if (field.type === 'textarea' || field.type === 'taxonomy-multi')
    return 'full'
  if (fullWidthEditorFieldNames.has(field.name))
    return 'full'
  return 'half'
}

function getFieldLayoutClassName(field: FieldConfig) {
  return getFieldLayout(field) === 'full' ? 'md:col-span-2' : undefined
}

function getAdminFieldErrorMessage(t: AdminTranslator, field: FieldConfig, errorType: 'required' | 'invalidJson') {
  const fieldLabel = t(field.labelKey)
  if (errorType === 'invalidJson')
    return t('errorMsg.invalidJson', { ns: 'workflow', field: fieldLabel })
  return t('errorMsg.fieldRequired', { ns: 'common', field: fieldLabel })
}

function validateResourceEditorValues(
  fields: FieldConfig[],
  values: Record<string, EditableFieldValue>,
  t: AdminTranslator,
) {
  for (const field of fields) {
    if (field.required && !String(values[field.name] ?? '').trim())
      return getAdminFieldErrorMessage(t, field, 'required')
  }

  const configField = fields.find(field => field.name === 'config')
  if (configField) {
    try {
      parseJsonObject(String(values.config ?? '{}'))
    }
    catch {
      return getAdminFieldErrorMessage(t, configField, 'invalidJson')
    }
  }

  return null
}

function getAdminMutationErrorMessage(error: unknown, fallbackMessage: string) {
  if (!(error instanceof AdminRequestError))
    return fallbackMessage

  const responseMessage = error.responseMessage?.trim()
  if (responseMessage)
    return `${fallbackMessage} (${error.status}): ${responseMessage}`

  return `${fallbackMessage} (${error.status})`
}

function getSkillVersionValue(values: Record<string, EditableFieldValue>, name: 'content_type' | 'skill_markdown') {
  return String(values[name] ?? '').trim()
}

function shouldCreateSkillVersion(
  initialValues: Record<string, EditableFieldValue>,
  values: Record<string, EditableFieldValue>,
) {
  return getSkillVersionValue(initialValues, 'content_type') !== getSkillVersionValue(values, 'content_type')
    || getSkillVersionValue(initialValues, 'skill_markdown') !== getSkillVersionValue(values, 'skill_markdown')
}

function buildSkillVersionPayload(values: Record<string, EditableFieldValue>) {
  return {
    content_type: getSkillVersionValue(values, 'content_type') || 'remote_reference',
    skill_markdown: emptyStringToNull(String(values.skill_markdown ?? '')),
    is_latest: true,
  }
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

  const saveApiKey = useCallback((nextApiKey: string) => {
    window.sessionStorage.setItem(ADMIN_API_KEY_STORAGE_KEY, nextApiKey)
    emitAdminApiKeyChange()
  }, [])

  const clearApiKey = useCallback(() => {
    window.sessionStorage.removeItem(ADMIN_API_KEY_STORAGE_KEY)
    emitAdminApiKeyChange()
  }, [])

  return { apiKey, saveApiKey, clearApiKey }
}

function getAutoServiceLabelKey(kind: AutoServiceLabelKind, value: string | null | undefined): AdminFieldLabelKey | null {
  if (kind === 'serviceType') {
    if (value === 'skill_crawler_sync')
      return 'fields.autoServiceTypeSkillCrawler'
    if (value === 'dataset_queue_monitor')
      return 'fields.autoServiceTypeDatasetQueue'
    return null
  }
  if (kind === 'serviceStatus') {
    if (value === 'enabled')
      return 'fields.autoServiceStatusEnabled'
    if (value === 'disabled')
      return 'fields.autoServiceStatusDisabled'
    return null
  }
  if (kind === 'scheduleType') {
    if (value === 'interval')
      return 'fields.scheduleTypeInterval'
    if (value === 'cron')
      return 'fields.scheduleTypeCron'
    if (value === 'manual')
      return 'fields.scheduleTypeManual'
    return null
  }
  if (value === 'queued')
    return 'fields.runStatusQueued'
  if (value === 'running')
    return 'fields.runStatusRunning'
  if (value === 'success')
    return 'fields.runStatusSuccess'
  if (value === 'failed')
    return 'fields.runStatusFailed'
  if (value === 'skipped')
    return 'fields.runStatusSkipped'
  return null
}

function getAutoServiceDisplayLabel(
  t: AdminFieldTranslator,
  kind: AutoServiceLabelKind,
  value: string | null | undefined,
) {
  const labelKey = getAutoServiceLabelKey(kind, value)
  return labelKey ? t(labelKey) : value || '-'
}

const createAutoServiceInitialValues: CreateAutoServiceFormValues = {
  code: '',
  name: '',
  description: '',
  service_type: 'skill_crawler_sync',
  status: 'disabled',
  schedule_type: 'interval',
  interval_minutes: '60',
  cron_expression: '',
  timezone: DEFAULT_AUTO_SERVICE_TIMEZONE,
  config: '{}',
}

const createTaxonomyInitialValues: CreateTaxonomyFormValues = {
  name: '',
  slug: '',
  position: '0',
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

function SelectField({
  label,
  value,
  options,
  onChange,
  allLabel,
  className,
}: {
  label: string
  value: string
  options: NonNullable<FieldConfig['options']>
  onChange: (_value: string) => void
  allLabel: string
  className?: string
}) {
  const { t } = useTranslation('admin')
  const selectedOption = options.find(option => option.value === value)
  const displayLabel = selectedOption ? t(selectedOption.labelKey) : allLabel

  return (
    <label className={cn('system-sm-medium text-text-secondary', className)}>
      {label}
      <Select
        value={value || SELECT_ALL_VALUE}
        onValueChange={nextValue => onChange(nextValue === SELECT_ALL_VALUE ? '' : nextValue ?? '')}
      >
        <SelectTrigger className="mt-1 w-full" aria-label={label}>
          {displayLabel}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SELECT_ALL_VALUE}>
            <SelectItemText>{allLabel}</SelectItemText>
            <SelectItemIndicator />
          </SelectItem>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              <SelectItemText>{t(option.labelKey)}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function SkillFilterControls({
  apiKey,
  values,
  onChange,
}: {
  apiKey: string
  values: SkillFilters
  onChange: (_values: SkillFilters) => void
}) {
  const { t } = useTranslation('admin')

  return (
    <>
      <label className="min-w-40 system-sm-medium text-text-secondary">
        {t('filters.category')}
        <TaxonomySingleFilter
          apiKey={apiKey}
          value={values.category}
          onChange={category => onChange({ ...values, category })}
        />
      </label>
      <SelectField
        className="min-w-40"
        label={t('filters.sourceType')}
        value={values.source_type}
        allLabel={t('filters.all')}
        options={skillSourceTypeOptions}
        onChange={source_type => onChange({ ...values, source_type })}
      />
      <SelectField
        className="min-w-40"
        label={t('filters.publicationStatus')}
        value={values.publication_status}
        allLabel={t('filters.all')}
        options={skillPublicationStatusOptions}
        onChange={publication_status => onChange({ ...values, publication_status })}
      />
      <label className="min-w-36 system-sm-medium text-text-secondary">
        {t('filters.updatedAtStart')}
        <Input
          className="mt-1"
          type="text"
          inputMode="numeric"
          placeholder={t('filters.datePlaceholder')}
          value={values.updated_at_start}
          onChange={event => onChange({ ...values, updated_at_start: event.target.value })}
        />
      </label>
      <label className="min-w-36 system-sm-medium text-text-secondary">
        {t('filters.updatedAtEnd')}
        <Input
          className="mt-1"
          type="text"
          inputMode="numeric"
          placeholder={t('filters.datePlaceholder')}
          value={values.updated_at_end}
          onChange={event => onChange({ ...values, updated_at_end: event.target.value })}
        />
      </label>
      <label className="min-w-36 system-sm-medium text-text-secondary">
        {t('filters.minGithubStars')}
        <Input
          className="mt-1"
          type="number"
          min={0}
          value={values.min_github_stars}
          onChange={event => onChange({ ...values, min_github_stars: event.target.value })}
        />
      </label>
      <SelectField
        className="min-w-40"
        label={t('filters.sort')}
        value={values.sort}
        allLabel={t('filters.defaultSort')}
        options={[
          { value: 'downloads_desc', labelKey: 'fields.sortDownloadsDesc' },
          { value: 'downloads_asc', labelKey: 'fields.sortDownloadsAsc' },
          { value: 'github_stars_desc', labelKey: 'fields.sortGithubStarsDesc' },
          { value: 'github_stars_asc', labelKey: 'fields.sortGithubStarsAsc' },
        ]}
        onChange={sort => onChange({ ...values, sort: sort as SkillSort })}
      />
    </>
  )
}

function ResourceTable({
  resource,
  data,
  selectedSkillIds,
  onSelectedSkillIdsChange,
  onSelect,
  onDelete,
  onRunAutoService,
  onViewAutoServiceLogs,
}: {
  resource: AdminResourceName
  data: AdminItem[]
  selectedSkillIds?: string[]
  onSelectedSkillIdsChange?: (_ids: string[]) => void
  onSelect: (_item: AdminItem) => void
  onDelete: (_item: AdminItem) => void
  onRunAutoService?: (_item: AdminAutoService) => void
  onViewAutoServiceLogs?: (_item: AdminAutoService) => void
}) {
  const { t } = useTranslation('admin')

  if (resource === 'skills') {
    const skillIds = data.map(item => item.id)
    return (
      <div className="overflow-x-auto">
        <CheckboxGroup
          value={selectedSkillIds ?? []}
          onValueChange={onSelectedSkillIdsChange ?? (() => {})}
          allValues={skillIds}
        >
          <table className="w-full min-w-280 table-fixed">
            <thead>
              <tr className="border-b border-divider-subtle bg-background-section text-left system-xs-medium text-text-tertiary">
                <th className="w-12 px-4 py-3">
                  <Checkbox parent aria-label={t('batch.selectCurrentPage')} />
                </th>
                <th className="w-14 px-4 py-3">{t('table.index')}</th>
                <th className="w-[20%] px-4 py-3">{t('table.primary')}</th>
                <th className="w-[12%] px-4 py-3">{t('table.type')}</th>
                <th className="w-[14%] px-4 py-3">{t('table.category')}</th>
                <th className="w-[12%] px-4 py-3">{t('table.source')}</th>
                <th className="w-[10%] px-4 py-3">{t('table.downloads')}</th>
                <th className="w-[10%] px-4 py-3">{t('table.githubStars')}</th>
                <th className="w-[10%] px-4 py-3">{t('table.featured')}</th>
                <th className="w-[12%] px-4 py-3">{t('table.status')}</th>
                <th className="w-[14%] px-4 py-3">{t('table.updatedAt')}</th>
                <th className="w-[14%] px-4 py-3 text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider-subtle">
              {data.map((item, index) => {
                const skill = item as AdminSkill
                const labelId = `admin-skill-${skill.id}`
                return (
                  <tr key={skill.id} className="bg-background-default transition-colors hover:bg-background-section">
                    <td className="px-4 py-3" onClick={event => event.stopPropagation()}>
                      <Checkbox value={skill.id} aria-labelledby={labelId} />
                    </td>
                    <td className="px-4 py-3 system-sm-regular text-text-tertiary tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div id={labelId} className="truncate system-sm-medium text-text-primary">{skill.name}</div>
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
                    <td className="px-4 py-3 system-sm-regular text-text-secondary tabular-nums">{skill.github_stars}</td>
                    <td className="px-4 py-3">
                      {skill.is_featured && (
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-state-accent-hover px-2 py-1 system-xs-medium text-text-accent">
                          <span aria-hidden="true" className="i-ri-sparkling-2-line size-3" />
                          <span className="truncate">{t('table.featured')}</span>
                        </span>
                      )}
                      {!skill.is_featured && <span className="system-sm-regular text-text-quaternary">-</span>}
                    </td>
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
        </CheckboxGroup>
      </div>
    )
  }

  if (resource === 'skillCategories' || resource === 'skillTags') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-180 table-fixed">
          <thead>
            <tr className="border-b border-divider-subtle bg-background-section text-left system-xs-medium text-text-tertiary">
              <th className="w-14 px-4 py-3">{t('table.index')}</th>
              <th className="w-[30%] px-4 py-3">{t('table.id')}</th>
              <th className="w-[24%] px-4 py-3">{t('table.primary')}</th>
              <th className="w-[20%] px-4 py-3">{t('table.createdAt')}</th>
              <th className="w-[18%] px-4 py-3 text-right">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider-subtle">
            {data.map((item, index) => {
              const taxonomy = item as AdminSkillCategory | AdminSkillTag
              return (
                <tr key={taxonomy.id} className="bg-background-default transition-colors hover:bg-background-section">
                  <td className="px-4 py-3 system-sm-regular text-text-tertiary tabular-nums">{index + 1}</td>
                  <td className="px-4 py-3">
                    <span className="block truncate system-sm-regular text-text-secondary">{taxonomy.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate system-sm-medium text-text-primary">{taxonomy.name}</div>
                  </td>
                  <td className="px-4 py-3 system-sm-regular text-text-secondary">{formatDateTime(taxonomy.created_at)}</td>
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
          <tr className="border-b border-divider-subtle bg-background-section text-left system-xs-medium text-text-tertiary">
            <th className="w-[36%] px-4 py-3">{t('table.primary')}</th>
            <th className="w-[22%] px-4 py-3">{t('table.status')}</th>
            <th className="w-[18%] px-4 py-3">{t(getItemMetricLabel(resource))}</th>
            <th className="w-[24%] px-4 py-3 text-right">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider-subtle">
          {data.map(item => (
            <tr key={item.id} className="bg-background-default transition-colors hover:bg-background-section">
              <td className="px-4 py-3">
                <div className="truncate system-sm-medium text-text-primary">{getItemTitle(resource, item)}</div>
                <div className="mt-1 truncate system-xs-regular text-text-tertiary">{getItemSubtitle(resource, item)}</div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex max-w-full rounded-md bg-background-section-burn px-2 py-1 system-xs-medium text-text-secondary">
                  <span className="truncate">
                    {resource === 'autoServices'
                      ? getAutoServiceDisplayLabel(t, 'serviceStatus', (item as AdminAutoService).status)
                      : getItemStatus(resource, item)}
                  </span>
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
                  {resource === 'autoServices' && (
                    <>
                      <Button size="small" variant="secondary" onClick={() => onRunAutoService?.(item as AdminAutoService)}>
                        {t('actions.run')}
                      </Button>
                      <Button size="small" variant="secondary" onClick={() => onViewAutoServiceLogs?.(item as AdminAutoService)}>
                        {t('actions.logs')}
                      </Button>
                    </>
                  )}
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
  return fields.reduce<Record<string, EditableFieldValue>>((nextValues, field) => {
    nextValues[field.name] = Array.isArray(field.value) ? field.value : field.value ?? ''
    return nextValues
  }, {})
}

function getFieldStateKey(fields: FieldConfig[]) {
  return fields
    .map(field => `${field.name}:${Array.isArray(field.value) ? field.value.join(',') : String(field.value ?? '')}`)
    .join('|')
}

function isUnauthorizedAdminError(error: unknown) {
  return error instanceof AdminRequestError && error.status === 401
}

function createTaxonomyOption(slug: string, label?: string | null): TaxonomyOption {
  return {
    value: slug,
    label: label || slug,
  }
}

function getTaxonomyOptionLabel(option: TaxonomyOption) {
  return option.label
}

function renderTaxonomyOption(option: TaxonomyOption) {
  return (
    <ComboboxItem key={option.value} value={option}>
      <ComboboxItemText>{option.label}</ComboboxItemText>
      <ComboboxItemIndicator />
    </ComboboxItem>
  )
}

function fetchAdminTaxonomyOptions({
  apiKey,
  resource,
  keyword,
}: {
  apiKey: string
  resource: TaxonomyResourceName
  keyword: string
}): Promise<AdminPagination<AdminSkillCategory | AdminSkillTag>> {
  if (resource === 'skillCategories') {
    return fetchAdminResourceList<'skillCategories'>({
      apiKey,
      resource,
      page: 1,
      limit: 100,
      keyword,
    })
  }

  return fetchAdminResourceList<'skillTags'>({
    apiKey,
    resource,
    page: 1,
    limit: 100,
    keyword,
  })
}

function TaxonomyMultiField({
  apiKey,
  field,
  value,
  onChange,
}: {
  apiKey: string
  field: FieldConfig
  value: string[]
  onChange: (_value: string[]) => void
}) {
  const { t } = useTranslation('admin')
  const [searchValue, setSearchValue] = useState('')
  const taxonomyResource = field.taxonomyResource ?? 'skillCategories'
  const selectedValues = useMemo(() => value.map(slug => createTaxonomyOption(slug)), [value])
  const taxonomyQuery = useQuery<AdminPagination<AdminSkillCategory | AdminSkillTag>>({
    queryKey: ['admin', 'taxonomy-options', taxonomyResource, apiKey, searchValue],
    queryFn: () => fetchAdminTaxonomyOptions({
      apiKey,
      resource: taxonomyResource,
      keyword: searchValue,
    }),
    enabled: Boolean(apiKey),
    retry: false,
  })
  const options = useMemo(() => {
    const optionMap = new Map<string, TaxonomyOption>()
    taxonomyQuery.data?.data.forEach(item => optionMap.set(item.slug, createTaxonomyOption(item.slug, item.name)))
    selectedValues.forEach(option => optionMap.set(option.value, option))
    const trimmedSearchValue = searchValue.trim()
    if (trimmedSearchValue && !optionMap.has(trimmedSearchValue))
      optionMap.set(trimmedSearchValue, createTaxonomyOption(trimmedSearchValue))
    return Array.from(optionMap.values())
  }, [searchValue, selectedValues, taxonomyQuery.data?.data])

  return (
    <Combobox
      items={options}
      itemToStringLabel={getTaxonomyOptionLabel}
      multiple
      filter={null}
      value={selectedValues}
      onValueChange={nextValues => onChange(nextValues.map(option => option.value))}
      onInputValueChange={(nextSearchValue, { reason }) => {
        if (reason !== 'item-press')
          setSearchValue(nextSearchValue)
      }}
    >
      <ComboboxInputGroup className="mt-1 h-auto min-h-8 items-start py-1">
        <ComboboxChips>
          <ComboboxValue>
            {(selectedOptions: TaxonomyOption[]) => (
              <>
                {selectedOptions.map(option => (
                  <ComboboxChip key={option.value} aria-label={option.label}>
                    <span className="max-w-36 truncate">{option.label}</span>
                    <ComboboxChipRemove aria-label={t('filters.removeTaxonomy', { name: option.label })} />
                  </ComboboxChip>
                ))}
                <ComboboxInput
                  aria-label={t(field.labelKey)}
                  placeholder={selectedOptions.length ? '' : t('filters.taxonomyPlaceholder')}
                  className="min-w-28 px-1 py-0.5"
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxInputTrigger className="mt-0.5 mr-1" aria-label={t('filters.openTaxonomyOptions')} />
      </ComboboxInputGroup>
      <ComboboxContent popupClassName="w-[420px]" popupProps={{ 'aria-busy': taxonomyQuery.isFetching || undefined }}>
        <ComboboxStatus className="border-b border-divider-subtle">
          {taxonomyQuery.isFetching ? t('states.loading') : t('filters.taxonomyStatus', { total: options.length })}
        </ComboboxStatus>
        <ComboboxList>{options.map(renderTaxonomyOption)}</ComboboxList>
        <ComboboxEmpty>{t('filters.taxonomyEmpty')}</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  )
}

function TaxonomySingleFilter({
  apiKey,
  value,
  onChange,
}: {
  apiKey: string
  value: string
  onChange: (_value: string) => void
}) {
  const { t } = useTranslation('admin')
  const searchValue = value
  const selectedOption = useMemo(() => value ? createTaxonomyOption(value) : null, [value])
  const taxonomyQuery = useQuery<AdminPagination<AdminSkillCategory | AdminSkillTag>>({
    queryKey: ['admin', 'taxonomy-options', 'skillCategories', apiKey, searchValue],
    queryFn: () => fetchAdminTaxonomyOptions({
      apiKey,
      resource: 'skillCategories',
      keyword: searchValue,
    }),
    enabled: Boolean(apiKey),
    retry: false,
  })
  const options = useMemo(() => {
    const optionMap = new Map<string, TaxonomyOption>()
    taxonomyQuery.data?.data.forEach(item => optionMap.set(item.slug, createTaxonomyOption(item.slug, item.name)))
    if (selectedOption)
      optionMap.set(selectedOption.value, selectedOption)
    const trimmedSearchValue = searchValue.trim()
    if (trimmedSearchValue && !optionMap.has(trimmedSearchValue))
      optionMap.set(trimmedSearchValue, createTaxonomyOption(trimmedSearchValue))
    return Array.from(optionMap.values())
  }, [searchValue, selectedOption, taxonomyQuery.data?.data])

  return (
    <Combobox<TaxonomyOption>
      items={options}
      value={selectedOption ?? undefined}
      inputValue={searchValue}
      itemToStringLabel={getTaxonomyOptionLabel}
      filter={null}
      onValueChange={(nextOption) => {
        const nextValue = nextOption?.value ?? ''
        onChange(nextValue)
      }}
      onInputValueChange={(nextSearchValue, { reason }) => {
        if (reason === 'item-press')
          return
        onChange(nextSearchValue.trim())
      }}
    >
      <ComboboxInputGroup className="mt-1 h-8 min-h-8 px-2">
        <ComboboxInput
          aria-label={t('filters.category')}
          placeholder={t('filters.categoryPlaceholder')}
          className="block h-4.5 grow px-1 py-0 system-sm-regular text-components-input-text-filled"
        />
        <ComboboxInputTrigger className="mr-0" aria-label={t('filters.openTaxonomyOptions')} />
      </ComboboxInputGroup>
      <ComboboxContent popupClassName="w-[320px]" popupProps={{ 'aria-busy': taxonomyQuery.isFetching || undefined }}>
        <ComboboxStatus className="border-b border-divider-subtle">
          {taxonomyQuery.isFetching ? t('states.loading') : t('filters.taxonomyStatus', { total: options.length })}
        </ComboboxStatus>
        <ComboboxList>{options.map(renderTaxonomyOption)}</ComboboxList>
        <ComboboxEmpty>{t('filters.taxonomyEmpty')}</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  )
}

function FieldInput({
  apiKey,
  field,
  value,
  onChange,
}: {
  apiKey?: string
  field: FieldConfig
  value: EditableFieldValue
  onChange: (_value: EditableFieldValue) => void
}) {
  const { t } = useTranslation('admin')

  if (field.type === 'taxonomy-multi') {
    return (
      <TaxonomyMultiField
        apiKey={apiKey ?? ''}
        field={field}
        value={Array.isArray(value) ? value : commaSeparatedTextToArray(String(value ?? ''))}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        className={cn('mt-1', field.inputClassName)}
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

function AdminDialogLayout({
  title,
  description,
  closeLabel,
  children,
  widthClassName = 'w-[760px]!',
}: {
  title: ReactNode
  description: ReactNode
  closeLabel: string
  children: ReactNode
  widthClassName?: string
}) {
  return (
    <DialogContent className={cn('flex h-[min(86dvh,900px)] max-w-[calc(100vw-2rem)]! flex-col overflow-hidden! border-none bg-background-default p-0! text-left align-middle shadow-xl', widthClassName)}>
      <div className="shrink-0 flex items-start justify-between gap-4 border-b border-divider-subtle px-6 py-5">
        <div className="min-w-0">
          <DialogTitle className="truncate title-xl-semi-bold text-text-primary">
            {title}
          </DialogTitle>
          <p className="mt-1 system-sm-regular text-pretty text-text-tertiary">
            {description}
          </p>
        </div>
        <DialogCloseButton aria-label={closeLabel} />
      </div>
      {children}
    </DialogContent>
  )
}

function AdminDialogBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  )
}

function AdminFieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
      {children}
    </div>
  )
}

function AdminDialogActions({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 flex justify-end gap-2 border-t border-divider-subtle bg-background-default px-6 py-4 shadow-xs">
      {children}
    </div>
  )
}

function ResourceEditorForm({
  apiKey,
  resource,
  item,
  detailFields,
  initialValues,
  beforeFields,
  onCancel,
  onSuccess,
  onUnauthorized,
}: {
  apiKey: string
  resource: AdminResourceName
  item: AdminItem
  detailFields: FieldConfig[]
  initialValues: Record<string, EditableFieldValue>
  beforeFields?: ReactNode
  onCancel: () => void
  onSuccess: () => void | Promise<void>
  onUnauthorized: () => void
}) {
  const { t } = useTranslation('admin')
  const [values, setValues] = useState(initialValues)
  const [localError, setLocalError] = useState<string | null>(null)
  const visibleFields = resource === 'autoServices'
    ? filterAutoServiceFieldsBySchedule(detailFields, String(values.schedule_type ?? ''))
    : detailFields
  const mutation = useMutation({
    mutationFn: async () => {
      const updatedItem = await updateAdminResource(apiKey, resource, item.id, buildPayload(resource, detailFields, values) as Partial<AdminResourceItemMap[typeof resource]>)
      if (resource === 'skills' && shouldCreateSkillVersion(initialValues, values))
        await createAdminSkillVersion(apiKey, item.id, buildSkillVersionPayload(values))
      return updatedItem
    },
    onSuccess: async () => {
      await onSuccess()
    },
    onError: (error) => {
      if (isUnauthorizedAdminError(error))
        onUnauthorized()
    },
  })
  const errorMessage = localError ?? (mutation.error ? getAdminMutationErrorMessage(mutation.error, t('states.saveError')) : null)

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        const validationError = validateResourceEditorValues(detailFields, values, t)
        if (validationError) {
          setLocalError(validationError)
          return
        }
        setLocalError(null)
        mutation.mutate()
      }}
    >
      <AdminDialogBody>
        {beforeFields}
        <AdminFieldGrid>
          {visibleFields.map(field => (
            <label key={field.name} className={cn('block min-w-0 system-sm-medium text-text-secondary', getFieldLayoutClassName(field))}>
              <span>{t(field.labelKey)}</span>
              <FieldInput
                apiKey={apiKey}
                field={field}
                value={values[field.name]}
                onChange={(value) => {
                  setLocalError(null)
                  setValues(current => ({ ...current, [field.name]: value }))
                }}
              />
            </label>
          ))}
          {errorMessage && (
            <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary md:col-span-2">
              {errorMessage}
            </div>
          )}
        </AdminFieldGrid>
      </AdminDialogBody>
      <AdminDialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          {t('actions.save')}
        </Button>
      </AdminDialogActions>
    </form>
  )
}

function SkillAssetUpload({
  apiKey,
  skill,
  onUploaded,
  onUnauthorized,
}: {
  apiKey: string
  skill: AdminSkill
  onUploaded: () => void
  onUnauthorized: () => void
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
    onError: (error) => {
      if (isUnauthorizedAdminError(error))
        onUnauthorized()
    },
  })

  return (
    <section className="m-6 mb-0 rounded-lg border border-divider-subtle bg-background-section p-4">
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
          <dd className="min-w-0 font-mono break-all text-text-secondary">
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
  onUnauthorized,
}: {
  apiKey: string
  resource: AdminResourceName
  item: AdminItem | null
  onClose: () => void
  onSaved: () => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation('admin')
  const open = Boolean(item)
  const fields = useMemo(() => item ? buildFieldConfigs(resource, item) : [], [item, resource])
  const detailQuery = useQuery({
    queryKey: ['admin', 'detail', resource, item?.id, apiKey],
    queryFn: () => fetchAdminResourceDetail(apiKey, resource, item!.id),
    enabled: Boolean(apiKey && item),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const detailItem = (detailQuery.data ?? item) as AdminItem | null
  const detailFields = useMemo(() => detailItem ? buildFieldConfigs(resource, detailItem) : fields, [detailItem, fields, resource])
  const initialValues = useMemo(() => getInitialFieldValues(detailFields), [detailFields])
  const fieldStateKey = useMemo(() => getFieldStateKey(detailFields), [detailFields])
  const skillAssetUpload = resource === 'skills' && detailItem
    ? (
        <SkillAssetUpload
          apiKey={apiKey}
          skill={detailItem as AdminSkill}
          onUploaded={async () => {
            await detailQuery.refetch()
            onSaved()
          }}
          onUnauthorized={onUnauthorized}
        />
      )
    : null

  useEffect(() => {
    if (isUnauthorizedAdminError(detailQuery.error))
      onUnauthorized()
  }, [detailQuery.error, onUnauthorized])

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <AdminDialogLayout
        title={detailItem ? getItemTitle(resource, detailItem) : t('drawer.title')}
        description={t('drawer.description')}
        closeLabel={t('actions.close')}
      >
        {(detailQuery.isFetching || detailQuery.error) && (
          <AdminDialogBody>
            {detailQuery.isFetching && <SkeletonRows />}
            {detailQuery.error && (
              <div className="m-6 rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary">
                {t('states.error')}
              </div>
            )}
          </AdminDialogBody>
        )}
        {!detailQuery.isFetching && !detailQuery.error && detailItem && item && (
          <ResourceEditorForm
            key={`${resource}:${item.id}:${fieldStateKey}`}
            apiKey={apiKey}
            resource={resource}
            item={item}
            detailFields={detailFields}
            initialValues={initialValues}
            beforeFields={skillAssetUpload}
            onCancel={onClose}
            onSuccess={async () => {
              await detailQuery.refetch()
              onSaved()
              onClose()
            }}
            onUnauthorized={onUnauthorized}
          />
        )}
      </AdminDialogLayout>
    </Dialog>
  )
}

function DeleteConfirmDialog({
  apiKey,
  resource,
  item,
  onClose,
  onDeleted,
  onUnauthorized,
}: {
  apiKey: string
  resource: AdminResourceName
  item: AdminItem | null
  onClose: () => void
  onDeleted: () => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation('admin')
  const mutation = useMutation({
    mutationFn: () => deleteAdminResource(apiKey, resource, item!.id),
    onSuccess: () => {
      onDeleted()
      onClose()
    },
    onError: (error) => {
      if (isUnauthorizedAdminError(error))
        onUnauthorized()
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

function BatchPublishFilteredConfirmDialog({
  open,
  total,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean
  total: number
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('admin')

  return (
    <AlertDialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <AlertDialogContent>
        <div className="p-6">
          <AlertDialogTitle className="title-lg-bold text-text-primary">
            {t('batch.publishFilteredTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 system-sm-regular text-pretty text-text-tertiary">
            {t('batch.publishFilteredDescription', { total })}
          </AlertDialogDescription>
        </div>
        <AlertDialogActions>
          <AlertDialogCancelButton>{t('actions.cancel')}</AlertDialogCancelButton>
          <AlertDialogConfirmButton loading={loading} onClick={onConfirm}>
            {t('batch.publishFilteredConfirm')}
          </AlertDialogConfirmButton>
        </AlertDialogActions>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RunAutoServiceConfirmDialog({
  apiKey,
  service,
  onClose,
  onQueued,
  onUnauthorized,
}: {
  apiKey: string
  service: AdminAutoService | null
  onClose: () => void
  onQueued: () => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation('admin')
  const serviceName = service?.name ?? '-'
  const runActionText = t('actions.run')
  const mutation = useMutation({
    mutationFn: () => runAdminAutoService(apiKey, service!.id),
    onSuccess: () => {
      toast.success(t('states.runQueued'))
      onQueued()
      onClose()
    },
    onError: (error) => {
      if (isUnauthorizedAdminError(error)) {
        onUnauthorized()
        return
      }
      toast.error(t('states.runError'))
    },
  })

  return (
    <AlertDialog open={Boolean(service)} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        <div className="p-6">
          <AlertDialogTitle className="title-lg-bold text-text-primary">
            {t('runConfirm.title', { defaultValue: `${t('actions.confirm')} ${runActionText}` })}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 system-sm-regular text-pretty text-text-tertiary">
            {t('runConfirm.description', {
              name: serviceName,
              defaultValue: `${runActionText}: ${serviceName}`,
            })}
          </AlertDialogDescription>
          {mutation.error && (
            <div className="mt-4 rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary">
              {t('states.runError')}
            </div>
          )}
        </div>
        <AlertDialogActions>
          <AlertDialogCancelButton>{t('actions.cancel')}</AlertDialogCancelButton>
          <AlertDialogConfirmButton loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('actions.confirm')}
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
  onUnauthorized,
}: {
  apiKey: string
  open: boolean
  onClose: () => void
  onCreated: (_skill: AdminSkill) => void
  onUnauthorized: () => void
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
    { name: 'categories', labelKey: 'fields.categories', type: 'taxonomy-multi', value: values.categories, taxonomyResource: 'skillCategories' },
    { name: 'tags', labelKey: 'fields.tags', type: 'taxonomy-multi', value: values.tags, taxonomyResource: 'skillTags' },
    { name: 'install_count', labelKey: 'fields.installCount', type: 'number', value: values.install_count },
    { name: 'github_stars', labelKey: 'fields.githubStars', type: 'number', value: values.github_stars },
    { name: 'is_featured', labelKey: 'fields.isFeatured', type: 'switch', value: values.is_featured },
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
    onError: (error) => {
      if (isUnauthorizedAdminError(error))
        onUnauthorized()
    },
  })
  const canSubmit = values.name.trim() && values.slug.trim() && values.description.trim()

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <AdminDialogLayout
        title={t('drawer.createSkillTitle')}
        description={t('drawer.createSkillDescription')}
        closeLabel={t('actions.close')}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit)
              mutation.mutate()
          }}
        >
          <AdminDialogBody>
            <AdminFieldGrid>
              {fields.map(field => (
                <label key={field.name} className={cn('block min-w-0 system-sm-medium text-text-secondary', getFieldLayoutClassName(field))}>
                  <span>{t(field.labelKey)}</span>
                  <FieldInput
                    apiKey={apiKey}
                    field={field}
                    value={values[field.name as keyof CreateSkillFormValues]}
                    onChange={value =>
                      setValues(current => ({
                        ...current,
                        [field.name]: typeof value === 'boolean'
                          ? value
                          : Array.isArray(value)
                            ? value
                            : String(value ?? ''),
                      }))}
                  />
                </label>
              ))}
              {mutation.error && (
                <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary md:col-span-2">
                  {t('states.createError')}
                </div>
              )}
            </AdminFieldGrid>
          </AdminDialogBody>
          <AdminDialogActions>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={mutation.isPending}>
              {t('actions.createSkill')}
            </Button>
          </AdminDialogActions>
        </form>
      </AdminDialogLayout>
    </Dialog>
  )
}

function CreateTaxonomyDialog({
  apiKey,
  resource,
  open,
  onClose,
  onCreated,
  onUnauthorized,
}: {
  apiKey: string
  resource: TaxonomyResourceName
  open: boolean
  onClose: () => void
  onCreated: (_item: AdminSkillCategory | AdminSkillTag) => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation('admin')
  const [values, setValues] = useState<CreateTaxonomyFormValues>(createTaxonomyInitialValues)
  const fields = useMemo<FieldConfig[]>(() => [
    { name: 'name', labelKey: 'fields.name', type: 'text', value: values.name },
    { name: 'slug', labelKey: 'fields.slug', type: 'text', value: values.slug },
    ...(resource === 'skillCategories'
      ? [{ name: 'position', labelKey: 'fields.position', type: 'number', value: values.position } as const]
      : []),
  ], [resource, values])
  const mutation = useMutation({
    mutationFn: () => createAdminResource(apiKey, resource, buildCreateTaxonomyPayload(resource, values)),
    onSuccess: (createdItem) => {
      setValues(createTaxonomyInitialValues)
      toast.success(t('states.createTaxonomySuccess'))
      onCreated(createdItem)
      onClose()
    },
    onError: (error) => {
      if (isUnauthorizedAdminError(error))
        onUnauthorized()
    },
  })
  const canSubmit = values.name.trim() && values.slug.trim()

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <AdminDialogLayout
        title={t(resource === 'skillCategories' ? 'drawer.createSkillCategoryTitle' : 'drawer.createSkillTagTitle')}
        description={t('drawer.createTaxonomyDescription')}
        closeLabel={t('actions.close')}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit)
              mutation.mutate()
          }}
        >
          <AdminDialogBody>
            <AdminFieldGrid>
              {fields.map(field => (
                <label key={field.name} className={cn('block min-w-0 system-sm-medium text-text-secondary', getFieldLayoutClassName(field))}>
                  <span>{t(field.labelKey)}</span>
                  <FieldInput
                    apiKey={apiKey}
                    field={field}
                    value={values[field.name as keyof CreateTaxonomyFormValues]}
                    onChange={value => setValues(current => ({ ...current, [field.name]: String(value ?? '') }))}
                  />
                </label>
              ))}
              {mutation.error && (
                <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary md:col-span-2">
                  {t('states.createTaxonomyError')}
                </div>
              )}
            </AdminFieldGrid>
          </AdminDialogBody>
          <AdminDialogActions>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={mutation.isPending}>
              {t('actions.createTaxonomy')}
            </Button>
          </AdminDialogActions>
        </form>
      </AdminDialogLayout>
    </Dialog>
  )
}

function CreateAutoServiceDialog({
  apiKey,
  open,
  onClose,
  onCreated,
  onUnauthorized,
}: {
  apiKey: string
  open: boolean
  onClose: () => void
  onCreated: (_service: AdminAutoService) => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation('admin')
  const [values, setValues] = useState<CreateAutoServiceFormValues>(createAutoServiceInitialValues)
  const fields = useMemo<FieldConfig[]>(() => filterAutoServiceFieldsBySchedule([
    { name: 'code', labelKey: 'fields.code', type: 'text', value: values.code },
    { name: 'name', labelKey: 'fields.name', type: 'text', value: values.name },
    { name: 'description', labelKey: 'fields.description', type: 'textarea', value: values.description },
    { name: 'service_type', labelKey: 'fields.autoServiceType', type: 'select', value: values.service_type, options: autoServiceTypeOptions },
    { name: 'status', labelKey: 'fields.autoServiceStatus', type: 'select', value: values.status, options: autoServiceStatusOptions },
    { name: 'schedule_type', labelKey: 'fields.scheduleType', type: 'select', value: values.schedule_type, options: autoServiceScheduleTypeOptions },
    { name: 'interval_minutes', labelKey: 'fields.intervalMinutes', type: 'number', value: values.interval_minutes },
    { name: 'cron_expression', labelKey: 'fields.cronExpression', type: 'text', value: values.cron_expression },
    { name: 'config', labelKey: 'fields.configJson', type: 'textarea', value: values.config, inputClassName: 'min-h-56' },
  ], values.schedule_type), [values])
  const mutation = useMutation({
    mutationFn: () => createAdminResource(apiKey, 'autoServices', buildCreateAutoServicePayload(values)),
    onSuccess: (createdService) => {
      setValues(createAutoServiceInitialValues)
      toast.success(t('states.createAutoServiceSuccess'))
      onCreated(createdService)
      onClose()
    },
    onError: (error) => {
      if (isUnauthorizedAdminError(error))
        onUnauthorized()
    },
  })
  const canSubmit = values.code.trim() && values.name.trim()

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <AdminDialogLayout
        title={t('drawer.createAutoServiceTitle')}
        description={t('drawer.createAutoServiceDescription')}
        closeLabel={t('actions.close')}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit)
              mutation.mutate()
          }}
        >
          <AdminDialogBody>
            <AdminFieldGrid>
              {fields.map(field => (
                <label key={field.name} className={cn('block min-w-0 system-sm-medium text-text-secondary', getFieldLayoutClassName(field))}>
                  <span>{t(field.labelKey)}</span>
                  <FieldInput
                    apiKey={apiKey}
                    field={field}
                    value={values[field.name as keyof CreateAutoServiceFormValues]}
                    onChange={value => setValues(current => ({ ...current, [field.name]: String(value ?? '') }))}
                  />
                </label>
              ))}
              {mutation.error && (
                <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary md:col-span-2">
                  {t('states.createAutoServiceError')}
                </div>
              )}
            </AdminFieldGrid>
          </AdminDialogBody>
          <AdminDialogActions>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={mutation.isPending}>
              {t('actions.createAutoService')}
            </Button>
          </AdminDialogActions>
        </form>
      </AdminDialogLayout>
    </Dialog>
  )
}

function AutoServiceLogsDialog({
  apiKey,
  service,
  onClose,
  onUnauthorized,
}: {
  apiKey: string
  service: AdminAutoService | null
  onClose: () => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation('admin')
  const logsQuery = useQuery<AdminPagination<AdminAutoServiceRunLog>>({
    queryKey: ['admin', 'auto-service-logs', service?.id, apiKey],
    queryFn: () => fetchAdminAutoServiceLogs(apiKey, service!.id, 1, 20),
    enabled: Boolean(apiKey && service),
    retry: false,
  })

  useEffect(() => {
    if (isUnauthorizedAdminError(logsQuery.error))
      onUnauthorized()
  }, [logsQuery.error, onUnauthorized])

  return (
    <Dialog open={Boolean(service)} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <DialogContent className="w-[860px]! max-w-[calc(100vw-2rem)]! overflow-hidden! border-none p-0! text-left align-middle">
        <div className="flex items-start justify-between gap-4 border-b border-divider-subtle p-6">
          <div className="min-w-0">
            <DialogTitle className="truncate title-xl-semi-bold text-text-primary">
              {service ? service.name : t('actions.logs')}
            </DialogTitle>
            <p className="mt-1 system-sm-regular text-pretty text-text-tertiary">
              {t('drawer.autoServiceLogsDescription')}
            </p>
          </div>
          <DialogCloseButton aria-label={t('actions.close')} />
        </div>
        <div className="max-h-[calc(80dvh-5rem)] overflow-y-auto p-6">
          {logsQuery.isFetching && <SkeletonRows />}
          {logsQuery.error && (
            <div className="rounded-lg bg-background-section-burn p-3 system-sm-regular text-text-tertiary">
              {t('states.error')}
            </div>
          )}
          {!logsQuery.isFetching && !logsQuery.error && (logsQuery.data?.data.length ?? 0) === 0 && (
            <EmptyState message={t('states.empty')} action={t('states.emptyAction')} />
          )}
          {!logsQuery.isFetching && !logsQuery.error && (logsQuery.data?.data.length ?? 0) > 0 && (
            <div className="overflow-x-auto rounded-lg border border-divider-subtle">
              <table className="w-full min-w-180 table-fixed">
                <thead>
                  <tr className="border-b border-divider-subtle bg-background-section-burn text-left system-xs-medium text-text-tertiary">
                    <th className="w-[16%] px-4 py-3">{t('table.status')}</th>
                    <th className="w-[18%] px-4 py-3">{t('table.startedAt')}</th>
                    <th className="w-[18%] px-4 py-3">{t('table.finishedAt')}</th>
                    <th className="w-[16%] px-4 py-3">{t('table.duration')}</th>
                    <th className="w-[32%] px-4 py-3">{t('table.result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider-subtle">
                  {logsQuery.data?.data.map(log => (
                    <tr key={log.id} className="bg-background-default">
                      <td className="px-4 py-3">
                        <span className="inline-flex max-w-full rounded-md bg-background-section-burn px-2 py-1 system-xs-medium text-text-secondary">
                          <span className="truncate">{getAutoServiceDisplayLabel(t, 'runStatus', log.status)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 system-sm-regular text-text-secondary">{formatDateTime(log.started_at)}</td>
                      <td className="px-4 py-3 system-sm-regular text-text-secondary">{formatDateTime(log.finished_at)}</td>
                      <td className="px-4 py-3 system-sm-regular text-text-secondary">{log.duration_ms ?? '-'}</td>
                      <td className="px-4 py-3 system-xs-regular text-text-secondary">
                        <pre className="max-h-24 overflow-auto rounded-md bg-background-section-burn p-2 break-words whitespace-pre-wrap">
                          {log.error ?? JSON.stringify(log.result ?? {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AdminTopBar({
  onDisconnect,
}: {
  onDisconnect: () => void
}) {
  const { t } = useTranslation('admin')

  return (
    <header className="border-b border-divider-subtle bg-background-default/95">
      <div className="flex h-13 min-w-0 items-center gap-4 px-4 md:px-5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-state-accent-solid"
          aria-label={t('topNav.productName')}
        >
          <JulyLogo size="small" alt="" className="h-5 w-auto" />
          <span className="whitespace-nowrap system-sm-semibold text-text-primary">{t('topNav.productName')}</span>
        </Link>

        <div className="min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden h-8 items-center rounded-lg bg-background-section-burn px-3 system-sm-medium text-text-secondary xl:inline-flex">
            {t('auth.connected')}
          </span>
          <Button variant="secondary" size="small" onClick={onDisconnect}>
            {t('auth.disconnect')}
          </Button>
        </div>
      </div>
    </header>
  )
}

function AdminResourceMobileNav({
  activeResourceName,
  onSelect,
}: {
  activeResourceName: AdminResourceName
  onSelect: (_resource: AdminResourceName) => void
}) {
  const { t } = useTranslation('admin')

  return (
    <nav className="lg:hidden" aria-label={t('nav.resources')}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {adminResources.map(item => (
          <button
            key={item.name}
            type="button"
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-lg border border-divider-subtle px-3 system-sm-medium outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-state-accent-solid',
              item.name === activeResourceName
                ? 'bg-background-default text-text-primary shadow-xs'
                : 'bg-background-section text-text-secondary hover:bg-background-default hover:text-text-primary',
            )}
            onClick={() => onSelect(item.name)}
          >
            <span aria-hidden className={cn(adminResourceIconClassNames[item.name], 'size-4 shrink-0')} />
            <span>{t(item.meta.titleKey)}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function AdminResourceButton({
  resourceName,
  activeResourceName,
  inset,
  onSelect,
}: {
  resourceName: AdminResourceName
  activeResourceName: AdminResourceName
  inset?: boolean
  onSelect: (_resource: AdminResourceName) => void
}) {
  const { t } = useTranslation('admin')
  const item = getAdminResource(resourceName)
  const isActive = item.name === activeResourceName

  return (
    <button
      type="button"
      className={cn(
        'group flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left system-sm-medium outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-state-accent-solid',
        inset && 'pl-7',
        isActive
          ? 'bg-background-default text-text-primary shadow-xs'
          : 'text-text-secondary hover:bg-background-default hover:text-text-primary',
      )}
      onClick={() => onSelect(item.name)}
    >
      <span
        aria-hidden
        className={cn(
          adminResourceIconClassNames[item.name],
          'size-4 shrink-0',
          isActive ? 'text-text-primary' : 'text-text-tertiary group-hover:text-text-secondary',
        )}
      />
      <span className="truncate">{t(item.meta.titleKey)}</span>
    </button>
  )
}

function AdminLockedState({ onUnlock }: { onUnlock: (_apiKey: string) => void }) {
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
  const [taxonomyCreateResource, setTaxonomyCreateResource] = useState<TaxonomyResourceName | null>(null)
  const [isCreateAutoServiceOpen, setIsCreateAutoServiceOpen] = useState(false)
  const [autoServiceLogsItem, setAutoServiceLogsItem] = useState<AdminAutoService | null>(null)
  const [runAutoServiceItem, setRunAutoServiceItem] = useState<AdminAutoService | null>(null)
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [isFilterPublishConfirmOpen, setIsFilterPublishConfirmOpen] = useState(false)
  const activeResource = getAdminResource(resource)
  const activeSkillFilters = useMemo(() => {
    if (resource !== 'skills')
      return undefined
    return {
      category: skillFilters.category,
      source_type: skillFilters.source_type,
      publication_status: skillFilters.publication_status,
      min_github_stars: skillFilters.min_github_stars.trim() || undefined,
      updated_at_start: skillFilters.updated_at_start,
      updated_at_end: skillFilters.updated_at_end,
    }
  }, [resource, skillFilters])
  const activeSort = resource === 'skills' ? skillFilters.sort : undefined

  useDocumentTitle(title)

  const handleUnauthorized = useCallback(() => {
    clearApiKey()
    setSelectedItem(null)
    setDeleteItem(null)
    setIsCreateSkillOpen(false)
    setTaxonomyCreateResource(null)
    setIsCreateAutoServiceOpen(false)
    setAutoServiceLogsItem(null)
    setRunAutoServiceItem(null)
    setSelectedSkillIds([])
    setIsFilterPublishConfirmOpen(false)
  }, [clearApiKey])

  const handleUnlock = useCallback((nextApiKey: string) => {
    setSelectedItem(null)
    setDeleteItem(null)
    setIsCreateSkillOpen(false)
    setTaxonomyCreateResource(null)
    setIsCreateAutoServiceOpen(false)
    setAutoServiceLogsItem(null)
    setRunAutoServiceItem(null)
    setSelectedSkillIds([])
    setIsFilterPublishConfirmOpen(false)
    saveApiKey(nextApiKey)
  }, [saveApiKey])

  const handleSelectResource = useCallback((nextResource: AdminResourceName) => {
    setResource(nextResource)
    setPage(1)
    setSelectedItem(null)
    setDeleteItem(null)
    setIsCreateSkillOpen(false)
    setTaxonomyCreateResource(null)
    setIsCreateAutoServiceOpen(false)
    setAutoServiceLogsItem(null)
    setRunAutoServiceItem(null)
    setSelectedSkillIds([])
    setIsFilterPublishConfirmOpen(false)
    setKeywordDraft('')
    setKeyword('')
    setSkillFilterDraft(skillFilterInitialValues)
    setSkillFilters(skillFilterInitialValues)
  }, [])

  const listQuery = useQuery<AdminPagination<AdminItem>>({
    queryKey: ['admin', 'list', resource, apiKey, page, keyword, activeSkillFilters, activeSort],
    queryFn: () => fetchAdminResourceList({
      apiKey,
      resource,
      page,
      limit: adminResourceLimit,
      keyword,
      filters: activeSkillFilters,
      sort: activeSort,
    }) as Promise<AdminPagination<AdminItem>>,
    enabled: Boolean(apiKey),
    retry: false,
  })
  const currentPageSkillIds = useMemo(() => {
    if (resource !== 'skills')
      return []
    return ((listQuery.data?.data as AdminSkill[] | undefined) ?? []).map(skill => skill.id)
  }, [listQuery.data?.data, resource])
  const selectedCurrentPageSkillIds = useMemo(
    () => selectedSkillIds.filter(skillId => currentPageSkillIds.includes(skillId)),
    [currentPageSkillIds, selectedSkillIds],
  )
  const batchPublishMutation = useMutation({
    mutationFn: (payload: AdminSkillBatchPublishPayload) => batchPublishAdminSkills(apiKey, payload),
    onSuccess: async (result) => {
      toast.success(t('states.batchPublishSuccess', { count: result.updated_count }))
      setSelectedSkillIds([])
      setIsFilterPublishConfirmOpen(false)
      await listQuery.refetch()
    },
    onError: (error) => {
      if (isUnauthorizedAdminError(error))
        handleUnauthorized()
      else
        toast.error(getAdminMutationErrorMessage(error, t('states.batchPublishError')))
    },
  })

  useEffect(() => {
    if (isUnauthorizedAdminError(listQuery.error))
      clearApiKey()
  }, [clearApiKey, listQuery.error])

  useEffect(() => {
    if (resource !== 'skills') {
      setSelectedSkillIds([])
      return
    }
    setSelectedSkillIds(current => current.filter(skillId => currentPageSkillIds.includes(skillId)))
  }, [currentPageSkillIds, resource])

  if (!apiKey)
    return <AdminLockedState onUnlock={handleUnlock} />

  const data = listQuery.data?.data ?? []
  const total = listQuery.data?.total ?? 0
  const handleApplyFilters = () => {
    setKeyword(keywordDraft)
    if (resource === 'skills')
      setSkillFilters(skillFilterDraft)
    setPage(1)
  }
  const handleResetFilters = () => {
    setKeywordDraft('')
    setKeyword('')
    setSkillFilterDraft(skillFilterInitialValues)
    setSkillFilters(skillFilterInitialValues)
    setSelectedSkillIds([])
    setPage(1)
  }
  const handleBatchPublishSelected = () => {
    if (selectedCurrentPageSkillIds.length === 0)
      return
    batchPublishMutation.mutate({ skill_ids: selectedCurrentPageSkillIds })
  }
  const handleBatchPublishFilters = () => {
    batchPublishMutation.mutate(buildSkillFilterBatchPublishPayload(keyword, skillFilters))
  }

  return (
    <main className="min-h-dvh bg-background-body text-text-primary">
      <AdminTopBar onDisconnect={clearApiKey} />
      <div className="flex min-h-[calc(100dvh-3.25rem)]">
        <aside className="hidden w-52 shrink-0 border-r border-divider-subtle bg-background-section px-3 py-5 lg:block">
          <nav className="space-y-4" aria-label={t('nav.resources')}>
            {adminResourceGroups.map(group => (
              <div key={group.titleKey}>
                <div className="px-2.5 py-1 system-xs-semibold text-text-tertiary uppercase">
                  {t(group.titleKey)}
                </div>
                <div className="mt-1 space-y-1">
                  {group.resources.map(resourceName => (
                    <AdminResourceButton
                      key={resourceName}
                      resourceName={resourceName}
                      activeResourceName={resource}
                      inset
                      onSelect={handleSelectResource}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-4 md:px-6">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
            <AdminResourceMobileNav activeResourceName={resource} onSelect={handleSelectResource} />

            <section className="overflow-hidden rounded-[20px] border border-divider-subtle bg-background-default shadow-xs">
              <header className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-divider-subtle px-4 py-4 md:px-5">
                <div className="min-w-0">
                  <h2 className="truncate title-xl-semi-bold text-text-primary">{t(activeResource.meta.titleKey)}</h2>
                  <p className="mt-1 max-w-3xl truncate system-sm-regular text-text-tertiary">{t(activeResource.meta.descriptionKey)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {resource === 'skills' && (
                    <>
                      <Button
                        variant="secondary"
                        size="medium"
                        disabled={selectedCurrentPageSkillIds.length === 0}
                        loading={batchPublishMutation.isPending && selectedCurrentPageSkillIds.length > 0}
                        onClick={handleBatchPublishSelected}
                      >
                        {t('batch.publishSelected', { count: selectedCurrentPageSkillIds.length })}
                      </Button>
                      <Button
                        variant="secondary"
                        size="medium"
                        loading={batchPublishMutation.isPending && isFilterPublishConfirmOpen}
                        onClick={() => setIsFilterPublishConfirmOpen(true)}
                      >
                        {t('batch.publishFiltered')}
                      </Button>
                      <Button variant="primary" size="medium" onClick={() => setIsCreateSkillOpen(true)}>
                        {t('actions.createSkill')}
                      </Button>
                    </>
                  )}
                  {(resource === 'skillCategories' || resource === 'skillTags') && (
                    <Button variant="primary" size="medium" onClick={() => setTaxonomyCreateResource(resource)}>
                      {t('actions.createTaxonomy')}
                    </Button>
                  )}
                  {resource === 'autoServices' && (
                    <Button variant="primary" size="medium" onClick={() => setIsCreateAutoServiceOpen(true)}>
                      {t('actions.createAutoService')}
                    </Button>
                  )}
                </div>
              </header>

              <form
                className="flex flex-wrap items-end gap-3 border-b border-divider-subtle bg-background-section px-4 py-3 md:px-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleApplyFilters()
                }}
              >
                <label className="min-w-56 flex-[1_1_24rem] system-sm-medium text-text-secondary">
                  {t('filters.search')}
                  <Input
                    className="mt-1"
                    value={keywordDraft}
                    placeholder={resource === 'skills' ? t('filters.skillNameSearchPlaceholder') : t('filters.searchPlaceholder')}
                    onChange={event => setKeywordDraft(event.target.value)}
                  />
                </label>
                {resource === 'skills' && (
                  <SkillFilterControls apiKey={apiKey} values={skillFilterDraft} onChange={setSkillFilterDraft} />
                )}
                <div className="ml-auto flex gap-2">
                  <Button type="submit" variant="primary">
                    {t('filters.query')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleResetFilters}>
                    {t('filters.reset')}
                  </Button>
                </div>
              </form>

              <div className="flex items-center justify-between border-b border-divider-subtle px-4 py-3 md:px-5">
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
                  selectedSkillIds={selectedCurrentPageSkillIds}
                  onSelectedSkillIdsChange={setSelectedSkillIds}
                  onSelect={setSelectedItem}
                  onDelete={setDeleteItem}
                  onRunAutoService={setRunAutoServiceItem}
                  onViewAutoServiceLogs={setAutoServiceLogsItem}
                />
              )}

              <div className="flex items-center justify-between border-t border-divider-subtle px-4 py-3 md:px-5">
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
            </section>
          </div>
        </section>
      </div>

      <ResourceEditor
        apiKey={apiKey}
        resource={resource}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSaved={() => listQuery.refetch()}
        onUnauthorized={handleUnauthorized}
      />
      <DeleteConfirmDialog
        apiKey={apiKey}
        resource={resource}
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDeleted={() => listQuery.refetch()}
        onUnauthorized={handleUnauthorized}
      />
      <BatchPublishFilteredConfirmDialog
        open={isFilterPublishConfirmOpen}
        total={total}
        loading={batchPublishMutation.isPending}
        onClose={() => setIsFilterPublishConfirmOpen(false)}
        onConfirm={handleBatchPublishFilters}
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
        onUnauthorized={handleUnauthorized}
      />
      <CreateAutoServiceDialog
        apiKey={apiKey}
        open={isCreateAutoServiceOpen}
        onClose={() => setIsCreateAutoServiceOpen(false)}
        onCreated={(createdService) => {
          setPage(1)
          setSelectedItem(createdService)
          listQuery.refetch()
        }}
        onUnauthorized={handleUnauthorized}
      />
      <CreateTaxonomyDialog
        apiKey={apiKey}
        resource={taxonomyCreateResource ?? 'skillCategories'}
        open={taxonomyCreateResource !== null}
        onClose={() => setTaxonomyCreateResource(null)}
        onCreated={(createdItem) => {
          setPage(1)
          setSelectedItem(createdItem)
          listQuery.refetch()
        }}
        onUnauthorized={handleUnauthorized}
      />
      <AutoServiceLogsDialog
        apiKey={apiKey}
        service={autoServiceLogsItem}
        onClose={() => setAutoServiceLogsItem(null)}
        onUnauthorized={handleUnauthorized}
      />
      <RunAutoServiceConfirmDialog
        apiKey={apiKey}
        service={runAutoServiceItem}
        onClose={() => setRunAutoServiceItem(null)}
        onQueued={() => listQuery.refetch()}
        onUnauthorized={handleUnauthorized}
      />
    </main>
  )
}
