export type TranslationFn = (key: string, options?: { ns?: string }) => string

export function getSkillSourceTypeLabel(sourceType: string | null | undefined, t: TranslationFn) {
  if (sourceType === 'github')
    return 'GitHub'
  if (sourceType === 'official')
    return t('skills.sourceTypes.official', { ns: 'explore' })
  if (sourceType === 'site')
    return t('skills.sourceTypes.site', { ns: 'explore' })
  return t('skills.sourceTypes.other', { ns: 'explore' })
}
