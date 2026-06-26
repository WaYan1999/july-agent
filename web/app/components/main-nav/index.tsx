'use client'

import type { MainNavItem, MainNavProps } from './types'
import { cn } from '@langgenius/dify-ui/cn'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import AppDetailSection from '@/app/components/app-sidebar/app-detail-section'
import AppDetailTop from '@/app/components/app-sidebar/app-detail-top'
import DatasetDetailSection from '@/app/components/app-sidebar/dataset-detail-section'
import DatasetDetailTop from '@/app/components/app-sidebar/dataset-detail-top'
import { useStore as useAppStore } from '@/app/components/app/store'
import DifyLogo from '@/app/components/base/logo/dify-logo'
import EnvNav from '@/app/components/header/env-nav'
import { useAppContext } from '@/context/app-context'
import { AgentDetailSection, AgentDetailTop } from '@/features/agent-v2/agent-detail/navigation'
import { isAgentV2Enabled } from '@/features/agent-v2/feature-flag'
import { DeploymentDetailSection, DeploymentDetailTop } from '@/features/deployments/detail/deployment-sidebar'
import { systemFeaturesQueryOptions } from '@/features/system-features/client'
import Link from '@/next/link'
import { usePathname } from '@/next/navigation'
import AccountSection from './components/account-section'
import HelpMenu from './components/help-menu'
import MainNavLink from './components/nav-link'
import { MainNavSearchButton } from './components/search-button'
import { WorkspaceCard } from './components/workspace-card'
import { isMainNavRouteVisible, isWorkflowAppRoute, MAIN_NAV_ROUTES } from './routes'
import { useDetailSidebarMode } from './storage'

const DATASET_COLLECTION_ROUTES = new Set(['create', 'create-from-pipeline', 'connect'])
const DATASET_DOCUMENT_CREATION_ROUTES = new Set(['create', 'create-from-pipeline'])
const DEPLOYMENT_COLLECTION_ROUTES = new Set(['create'])
const secondarySidebarHelpTriggerIcon = <span aria-hidden className="i-ri-question-line size-4 shrink-0" />

function SecondarySidebarHelpMenu({
  triggerClassName,
}: {
  triggerClassName?: string
}) {
  return (
    <HelpMenu
      triggerIcon={secondarySidebarHelpTriggerIcon}
      triggerClassName={triggerClassName}
    />
  )
}

const isDatasetDetailPathname = (pathname: string) => {
  const [section, datasetId, subSection, action] = pathname.split('/').filter(Boolean)

  if (section !== 'datasets' || !datasetId)
    return false

  if (DATASET_COLLECTION_ROUTES.has(datasetId))
    return false

  if (subSection === 'documents' && action && DATASET_DOCUMENT_CREATION_ROUTES.has(action))
    return false

  return true
}

const isAgentDetailPathname = (pathname: string) => {
  const [section, type, agentId] = pathname.split('/').filter(Boolean)

  return section === 'roster' && type === 'agent' && !!agentId
}

const isDeploymentDetailPathname = (pathname: string) => {
  const [section, appInstanceId] = pathname.split('/').filter(Boolean)

  return section === 'deployments' && !!appInstanceId && !DEPLOYMENT_COLLECTION_ROUTES.has(appInstanceId)
}

const isSnippetDetailPathname = (pathname: string) => {
  const [section, snippetId] = pathname.split('/').filter(Boolean)

  return section === 'snippets' && !!snippetId
}

const MainNav = ({
  className,
}: MainNavProps) => {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { langGeniusVersionInfo, isCurrentWorkspaceDatasetOperator, isCurrentWorkspaceEditor } = useAppContext()
  const { data: systemFeatures } = useSuspenseQuery(systemFeaturesQueryOptions())
  const agentV2Enabled = isAgentV2Enabled()
  const showEnvTag = langGeniusVersionInfo.current_env === 'TESTING' || langGeniusVersionInfo.current_env === 'DEVELOPMENT'
  const canUseAppDeploy = isCurrentWorkspaceEditor && systemFeatures.enable_app_deploy
  const showAppDetailNavigation = !isCurrentWorkspaceDatasetOperator && pathname.startsWith('/app/')
  const showLegacyAppDetailNavigation = showAppDetailNavigation && isWorkflowAppRoute(pathname)
  const showDatasetDetailNavigation = isDatasetDetailPathname(pathname)
  const showAgentDetailNavigation = agentV2Enabled && !isCurrentWorkspaceDatasetOperator && isAgentDetailPathname(pathname)
  const showDeploymentDetailNavigation = canUseAppDeploy && !isCurrentWorkspaceDatasetOperator && isDeploymentDetailPathname(pathname)
  const showSnippetDetailBottomNavigation = isSnippetDetailPathname(pathname)
  const showDetailNavigation = showAppDetailNavigation || showDatasetDetailNavigation || showAgentDetailNavigation || showDeploymentDetailNavigation
  const { hasAppDetail, setAppDetail } = useAppStore(useShallow(state => ({
    hasAppDetail: !!state.appDetail,
    setAppDetail: state.setAppDetail,
  })))
  const [storedDetailSidebarExpand, setStoredDetailSidebarExpand] = useDetailSidebarMode()
  const detailNavigationMode = storedDetailSidebarExpand === 'collapse' ? 'collapse' : 'expand'
  const detailNavigationExpanded = detailNavigationMode === 'expand'
  const isCollapsedDetailNavigation = showDetailNavigation && !detailNavigationExpanded
  const [detailNavigationHoverPreviewOpen, setDetailNavigationHoverPreviewOpen] = useState(false)
  const [detailNavigationTransitionDisabled, setDetailNavigationTransitionDisabled] = useState(false)
  const closeDetailNavigationHoverPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailNavigationTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const globalNavRef = useRef<HTMLElement | null>(null)
  const [activeIndicatorStyle, setActiveIndicatorStyle] = useState({
    visible: false,
    width: 0,
    x: 0,
  })
  const isDetailNavigationHoverPreviewOpen = isCollapsedDetailNavigation && detailNavigationHoverPreviewOpen
  const detailNavigationVisibleExpanded = detailNavigationExpanded || isDetailNavigationHoverPreviewOpen
  const handleToggleDetailNavigation = useCallback(() => {
    if (isDetailNavigationHoverPreviewOpen) {
      if (detailNavigationTransitionTimerRef.current)
        clearTimeout(detailNavigationTransitionTimerRef.current)

      setDetailNavigationTransitionDisabled(true)
      setDetailNavigationHoverPreviewOpen(false)
      setStoredDetailSidebarExpand('expand')
      detailNavigationTransitionTimerRef.current = setTimeout(() => {
        setDetailNavigationTransitionDisabled(false)
      }, 200)
      return
    }

    const nextMode = detailNavigationExpanded ? 'collapse' : 'expand'
    setDetailNavigationHoverPreviewOpen(false)
    setStoredDetailSidebarExpand(nextMode)
  }, [detailNavigationExpanded, isDetailNavigationHoverPreviewOpen, setStoredDetailSidebarExpand])
  const openDetailNavigationHoverPreview = useCallback(() => {
    if (!isCollapsedDetailNavigation)
      return

    if (closeDetailNavigationHoverPreviewTimerRef.current)
      clearTimeout(closeDetailNavigationHoverPreviewTimerRef.current)

    setDetailNavigationHoverPreviewOpen(true)
  }, [isCollapsedDetailNavigation])
  const closeDetailNavigationHoverPreview = useCallback(() => {
    if (closeDetailNavigationHoverPreviewTimerRef.current)
      clearTimeout(closeDetailNavigationHoverPreviewTimerRef.current)

    closeDetailNavigationHoverPreviewTimerRef.current = setTimeout(() => {
      setDetailNavigationHoverPreviewOpen(false)
    }, 120)
  }, [])

  useEffect(() => {
    return () => {
      if (closeDetailNavigationHoverPreviewTimerRef.current)
        clearTimeout(closeDetailNavigationHoverPreviewTimerRef.current)
      if (detailNavigationTransitionTimerRef.current)
        clearTimeout(detailNavigationTransitionTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/app/') || !hasAppDetail)
      return

    setAppDetail()
  }, [hasAppDetail, pathname, setAppDetail])

  useHotkey('Mod+B', (e) => {
    if (!showDetailNavigation)
      return

    e.preventDefault()
    handleToggleDetailNavigation()
  }, {
    ignoreInputs: false,
  })

  const navItems = useMemo<MainNavItem[]>(() => MAIN_NAV_ROUTES
    .filter(route => isMainNavRouteVisible(route, {
      agentV2Enabled,
      canUseAppDeploy,
      isCurrentWorkspaceDatasetOperator,
      marketplaceEnabled: systemFeatures.enable_marketplace,
    }))
    .map(route => ({
      href: route.href,
      label: t(route.labelKey, { ns: 'common' }),
      active: route.active,
      icon: route.icon,
      activeIcon: route.activeIcon,
    })), [agentV2Enabled, canUseAppDeploy, isCurrentWorkspaceDatasetOperator, systemFeatures.enable_marketplace, t])

  useEffect(() => {
    const nav = globalNavRef.current

    if (!nav)
      return

    const updateActiveIndicator = () => {
      const activeLink = nav.querySelector<HTMLAnchorElement>('a[aria-current="page"]')

      if (!activeLink) {
        setActiveIndicatorStyle(previous => previous.visible ? { ...previous, visible: false } : previous)
        return
      }

      setActiveIndicatorStyle({
        visible: true,
        width: activeLink.offsetWidth,
        x: activeLink.offsetLeft,
      })
    }

    updateActiveIndicator()

    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateActiveIndicator)
    resizeObserver?.observe(nav)
    nav.querySelectorAll('a').forEach(link => resizeObserver?.observe(link))
    window.addEventListener('resize', updateActiveIndicator)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateActiveIndicator)
    }
  }, [navItems, pathname])

  const renderLogo = () => {
    const appTitle = systemFeatures.branding.enabled && systemFeatures.branding.application_title ? systemFeatures.branding.application_title : 'Dify'

    return (
      <Link
        href="/"
        className="flex h-8 shrink-0 items-center overflow-hidden focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
        aria-label={appTitle}
      >
        {systemFeatures.branding.enabled && systemFeatures.branding.workspace_logo
          ? (
              <img
                src={systemFeatures.branding.workspace_logo}
                className="block h-5.5 w-auto object-contain"
                alt=""
              />
            )
          : <DifyLogo alt="" />}
      </Link>
    )
  }

  const renderDetailTop = () => {
    if (showAppDetailNavigation) {
      return (
        <AppDetailTop
          expand={detailNavigationVisibleExpanded}
          onToggle={handleToggleDetailNavigation}
        />
      )
    }

    if (showDatasetDetailNavigation) {
      return (
        <DatasetDetailTop
          expand={detailNavigationVisibleExpanded}
          onToggle={handleToggleDetailNavigation}
        />
      )
    }

    if (showAgentDetailNavigation) {
      return (
        <AgentDetailTop
          expand={detailNavigationVisibleExpanded}
          onToggle={handleToggleDetailNavigation}
        />
      )
    }

    return (
      <DeploymentDetailTop
        expand={detailNavigationVisibleExpanded}
        onToggle={handleToggleDetailNavigation}
      />
    )
  }

  const renderDetailSection = () => {
    if (showAppDetailNavigation)
      return <AppDetailSection expand={detailNavigationVisibleExpanded} orientation="horizontal" />

    if (showDatasetDetailNavigation)
      return <DatasetDetailSection expand={detailNavigationVisibleExpanded} orientation="horizontal" />

    if (showAgentDetailNavigation)
      return <AgentDetailSection expand={detailNavigationVisibleExpanded} orientation="horizontal" />

    return <DeploymentDetailSection expand={detailNavigationVisibleExpanded} orientation="horizontal" />
  }

  if (showLegacyAppDetailNavigation) {
    const bottomNavigationExpanded = detailNavigationVisibleExpanded

    return (
      <aside
        className={cn(
          'relative flex h-full shrink-0',
          detailNavigationTransitionDisabled ? 'transition-none' : 'transition-all',
          isDetailNavigationHoverPreviewOpen ? 'overflow-visible' : 'overflow-hidden',
          detailNavigationExpanded ? 'w-[248px] bg-background-body p-1' : 'w-16 bg-background-body p-1',
          className,
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            isDetailNavigationHoverPreviewOpen
              ? 'absolute top-1 bottom-1 left-1 z-40 w-60 overflow-hidden rounded-lg border border-divider-subtle bg-components-panel-bg shadow-lg'
              : 'overflow-hidden rounded-lg bg-components-panel-bg',
            detailNavigationVisibleExpanded ? 'w-60' : 'w-14',
          )}
          onMouseEnter={isCollapsedDetailNavigation ? openDetailNavigationHoverPreview : undefined}
          onMouseLeave={isCollapsedDetailNavigation ? closeDetailNavigationHoverPreview : undefined}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <AppDetailTop
              expand={detailNavigationVisibleExpanded}
              onToggle={handleToggleDetailNavigation}
            />
            <AppDetailSection expand={detailNavigationVisibleExpanded} />
            {showEnvTag && detailNavigationVisibleExpanded && (
              <div className="relative z-30 mt-auto shrink-0 px-3 pb-2">
                <EnvNav />
              </div>
            )}
          </div>
          <div className={cn(
            !bottomNavigationExpanded
              ? 'flex w-full shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 pt-1 pb-3'
              : 'flex w-60 items-center justify-between bg-components-panel-bg py-3 pr-1 pl-3',
          )}
          >
            {!bottomNavigationExpanded
              ? (
                  <>
                    <SecondarySidebarHelpMenu triggerClassName="mb-2" />
                    <AccountSection compact />
                  </>
                )
              : (
                  <>
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                      <AccountSection />
                    </div>
                    <div className="flex shrink-0 items-center justify-center rounded-full p-1">
                      <SecondarySidebarHelpMenu />
                    </div>
                  </>
                )}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <header
      className={cn(
        'relative z-30 flex w-full shrink-0 flex-col border-b border-divider-subtle bg-background-body',
        detailNavigationTransitionDisabled ? 'transition-none' : 'transition-all',
        isDetailNavigationHoverPreviewOpen ? 'overflow-visible' : 'overflow-hidden',
        className,
      )}
    >
      {showDetailNavigation
        ? (
            <div
              className={cn(
                'flex min-h-0 w-full flex-col bg-components-panel-bg',
                isDetailNavigationHoverPreviewOpen && 'shadow-lg',
              )}
              onMouseEnter={isCollapsedDetailNavigation ? openDetailNavigationHoverPreview : undefined}
              onMouseLeave={isCollapsedDetailNavigation ? closeDetailNavigationHoverPreview : undefined}
            >
              <div className="flex h-12 min-w-0 shrink-0 items-center gap-2 px-4">
                <div className="min-w-0 flex-1">
                  {renderDetailTop()}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {detailNavigationVisibleExpanded && <SecondarySidebarHelpMenu />}
                  <AccountSection compact={!detailNavigationVisibleExpanded} />
                </div>
              </div>
              <div className={cn(
                'min-h-0 w-full',
                detailNavigationVisibleExpanded ? 'h-14' : 'h-0 overflow-hidden',
              )}
              >
                {renderDetailSection()}
              </div>
            </div>
          )
        : showSnippetDetailBottomNavigation
          ? (
              <div className="flex h-12 w-full items-center justify-end gap-2 px-4">
                <SecondarySidebarHelpMenu />
                <AccountSection compact />
              </div>
            )
          : (
              <div className="flex h-14 min-w-0 items-center gap-3 px-4">
                {renderLogo()}
                <div className="w-56 shrink-0">
                  <WorkspaceCard />
                </div>
                <div className="flex min-w-0 flex-1 justify-center">
                  <nav
                    ref={globalNavRef}
                    className="relative flex max-w-full min-w-0 items-center justify-center gap-1 overflow-x-auto rounded-xl border border-divider-subtle bg-components-panel-bg p-1 shadow-xs shadow-shadow-shadow-4"
                  >
                    <div
                      aria-hidden
                      data-main-nav-active-indicator
                      className="pointer-events-none absolute top-1 bottom-1 left-0 z-0 rounded-lg border border-divider-subtle bg-state-accent-active transition-[transform,width,opacity] duration-200 ease-out motion-reduce:transition-none"
                      style={{
                        opacity: activeIndicatorStyle.visible ? 1 : 0,
                        transform: `translateX(${activeIndicatorStyle.x}px)`,
                        width: activeIndicatorStyle.width,
                      }}
                    />
                    {navItems.map(item => (
                      <MainNavLink key={item.href} item={item} pathname={pathname} orientation="horizontal" />
                    ))}
                  </nav>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <MainNavSearchButton />
                  {showEnvTag && (
                    <div className="relative z-30 shrink-0" data-main-nav-env>
                      <EnvNav />
                    </div>
                  )}
                  <div className="flex shrink-0 items-center justify-center">
                    <HelpMenu />
                  </div>
                  <AccountSection />
                </div>
              </div>
            )}
    </header>
  )
}

export default MainNav
