'use client'

import type { MainNavItem } from '../types'
import { cn } from '@langgenius/dify-ui/cn'
import Link from '@/next/link'

const navItemClassName = 'group relative z-10 flex h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-state-accent-solid'

const activeNavItemClassName = cn(
  'system-md-semibold text-components-main-nav-nav-button-text-active',
)

const inactiveNavItemClassName = 'system-md-medium bg-transparent text-components-main-nav-nav-button-text hover:bg-components-main-nav-nav-button-bg-hover hover:text-components-main-nav-nav-button-text'

const NavIcon = ({
  icon,
  className,
}: {
  icon: string
  className?: string
}) => (
  <span aria-hidden className={cn(icon, 'h-5 w-5 shrink-0', className)} />
)

type MainNavLinkProps = {
  item: MainNavItem
  pathname: string
  orientation?: 'vertical' | 'horizontal'
}

const MainNavLink = ({
  item,
  pathname,
  orientation = 'vertical',
}: MainNavLinkProps) => {
  const activated = item.active(pathname)

  return (
    <Link
      href={item.href}
      aria-current={activated ? 'page' : undefined}
      title={item.label}
      className={cn(
        navItemClassName,
        orientation === 'horizontal' ? 'w-auto shrink-0' : 'w-full',
        activated ? activeNavItemClassName : inactiveNavItemClassName,
      )}
    >
      <NavIcon icon={activated ? item.activeIcon : item.icon} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export default MainNavLink
