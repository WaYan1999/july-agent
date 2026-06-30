import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExploreNav } from '../index'

const usePathnameMock = vi.fn()

vi.mock('@/next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}))

vi.mock('@/next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}))

describe('ExploreNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should highlight explore nav when current page is skills under explore', () => {
      usePathnameMock.mockReturnValue('/explore/skills')

      render(<ExploreNav />)

      expect(screen.getByRole('link', { name: 'common:menus.explore' })).toHaveClass('bg-components-main-nav-nav-button-bg-active')
    })
  })
})
