'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import AppList from '@/app/components/explore/app-list'
import Sidebar from '@/app/components/explore/sidebar'
import useDocumentTitle from '@/hooks/use-document-title'

const Home = () => {
  const { t } = useTranslation()
  useDocumentTitle(t('menus.explore', { ns: 'common' }))

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background-body">
      <aside
        aria-label={t('sidebar.title', { ns: 'explore' })}
        className="h-full min-h-0 shrink-0 bg-background-body"
      >
        <Sidebar />
      </aside>
      <div className="h-full min-h-0 w-0 grow">
        <AppList />
      </div>
    </div>
  )
}

export default React.memo(Home)
