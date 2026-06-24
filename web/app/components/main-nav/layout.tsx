'use client'

import type { ReactNode } from 'react'
import { cn } from '@langgenius/dify-ui/cn'
import { useTranslation } from 'react-i18next'
import { usePathname } from '@/next/navigation'
import MainNav from './index'
import { isWorkflowAppRoute } from './routes'
import { MAIN_CONTENT_ID, SkipNav } from './skip-nav'

type MainNavLayoutProps = {
  children: ReactNode
}

const MainNavLayout = ({
  children,
}: MainNavLayoutProps) => {
  const { t } = useTranslation('common')
  const pathname = usePathname()
  const useLegacySideNavigationLayout = isWorkflowAppRoute(pathname)

  return (
    <div className={cn(
      'flex h-0 min-h-0 grow overflow-hidden bg-background-body',
      !useLegacySideNavigationLayout && 'flex-col',
    )}
    >
      <SkipNav>{t('navigation.skipToMain')}</SkipNav>
      <MainNav />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="flex min-h-0 min-w-0 grow flex-col overflow-hidden outline-hidden focus:outline-hidden focus-visible:outline-hidden"
      >
        {children}
      </main>
    </div>
  )
}

export default MainNavLayout
