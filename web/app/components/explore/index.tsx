'use client'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import Sidebar from '@/app/components/explore/sidebar'

const Explore = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full overflow-hidden border-t border-divider-regular bg-background-body">
      <aside
        aria-label={t('sidebar.title', { ns: 'explore' })}
        className="h-full min-h-0 shrink-0 bg-background-body"
      >
        <Sidebar />
      </aside>
      <div className="h-full min-h-0 w-0 grow">
        {children}
      </div>
    </div>
  )
}
export default React.memo(Explore)
