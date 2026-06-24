import { render, screen } from '@testing-library/react'
import Home from '../page'

const mockUseDocumentTitle = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-document-title', () => ({
  default: (title: string) => mockUseDocumentTitle(title),
}))

vi.mock('@/app/components/explore/sidebar', () => ({
  default: () => (
    <nav aria-label="explore-sidebar">
      <a href="/">explore.sidebar.title</a>
      <section aria-label="explore.sidebar.webApps">Pinned web apps</section>
    </nav>
  ),
}))

vi.mock('@/app/components/explore/app-list', () => ({
  default: () => <section aria-label="explore-app-list">Original home content</section>,
}))

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should set the page title to Explore', () => {
      render(<Home />)

      expect(mockUseDocumentTitle).toHaveBeenCalledWith('common.menus.explore')
    })

    it('should render the app gallery sidebar before the original home content', () => {
      render(<Home />)

      const sidebar = screen.getByRole('navigation', { name: 'explore-sidebar' })
      const appGalleryLink = screen.getByRole('link', { name: 'explore.sidebar.title' })
      const webApps = screen.getByRole('region', { name: 'explore.sidebar.webApps' })
      const appList = screen.getByRole('region', { name: 'explore-app-list' })

      expect(sidebar).toContainElement(appGalleryLink)
      expect(sidebar).toContainElement(webApps)
      expect(sidebar.compareDocumentPosition(appList)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })
})
