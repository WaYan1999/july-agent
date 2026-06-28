import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useLocale } from '@/context/i18n'
import { systemFeaturesQueryOptions } from '@/features/system-features/client'
import { usePipelineTemplateList } from '@/service/use-pipeline'
import CreateCard from './create-card'
import TemplateCard from './template-card'

const BuiltInPipelineList = () => {
  const locale = useLocale()
  const language = useMemo(() => {
    if (locale === 'zh-Hans')
      return locale
    return 'en-US'
  }, [locale])
  const { data: enableMarketplace } = useSuspenseQuery({
    ...systemFeaturesQueryOptions(),
    select: s => s.enable_marketplace,
  })
  const { data: pipelineList, isLoading } = usePipelineTemplateList({ type: 'built-in', language }, enableMarketplace)
  const list = pipelineList?.pipeline_templates || []

  return (
    <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      <CreateCard />
      {!isLoading && list.map((pipeline, index) => (
        <TemplateCard
          key={index}
          type="built-in"
          pipeline={pipeline}
          showMoreOperations={false}
        />
      ))}
    </div>
  )
}

export default BuiltInPipelineList
