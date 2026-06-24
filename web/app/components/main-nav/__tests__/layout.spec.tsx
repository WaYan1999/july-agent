import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import MainNavLayout from '../layout'

let mockPathname = '/'

vi.mock('@/app/components/header', () => ({
  default: () => <div data-testid="desktop-header">Header</div>,
}))

vi.mock('@/app/components/header/header-wrapper', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="header-wrapper">{children}</div>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../index', () => ({
  default: ({ className }: { className?: string }) => <header className={className} data-testid="main-nav">MainNav</header>,
}))

vi.mock('@/next/navigation', () => ({
  usePathname: () => mockPathname,
}))

describe('MainNavLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    mockPathname = '/'
  })

  it('renders desktop main nav instead of the desktop header', () => {
    render(<MainNavLayout><div>content</div></MainNavLayout>)

    expect(screen.getByTestId('main-nav')).toBeInTheDocument()
    expect(screen.queryByTestId('desktop-header')).not.toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('uses the main nav without the desktop header wrapper', () => {
    render(<MainNavLayout><div>content</div></MainNavLayout>)

    expect(screen.getByTestId('main-nav')).toBeInTheDocument()
    expect(screen.queryByTestId('header-wrapper')).not.toBeInTheDocument()
    expect(screen.queryByTestId('desktop-header')).not.toBeInTheDocument()
  })

  it('stacks the top navigation above the main content', () => {
    const { container } = render(<MainNavLayout><div>content</div></MainNavLayout>)

    const shell = container.firstElementChild
    const nav = screen.getByTestId('main-nav')
    const main = screen.getByRole('main')

    expect(shell).toHaveClass('flex-col')
    expect(nav.compareDocumentPosition(main)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(main).toHaveClass('min-h-0', 'grow', 'overflow-hidden')
  })

  it('keeps workflow app pages on the legacy side navigation layout', () => {
    mockPathname = '/app/app-1/workflow'

    const { container } = render(<MainNavLayout><div>workflow content</div></MainNavLayout>)

    const shell = container.firstElementChild
    const nav = screen.getByTestId('main-nav')
    const main = screen.getByRole('main')

    expect(shell).not.toHaveClass('flex-col')
    expect(nav.compareDocumentPosition(main)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(main).toHaveClass('min-w-0', 'grow', 'overflow-hidden')
    expect(main).toHaveTextContent('workflow content')
  })

  it('renders one main landmark as the skip navigation target', () => {
    render(<MainNavLayout><div>content</div></MainNavLayout>)

    const main = screen.getByRole('main')

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabIndex', '-1')
    expect(main).toHaveClass('outline-hidden', 'focus:outline-hidden', 'focus-visible:outline-hidden')
    expect(main).toHaveTextContent('content')
  })

  it('renders skip navigation before the repeated main navigation', () => {
    const { container } = render(<MainNavLayout><div>content</div></MainNavLayout>)

    const skipLink = screen.getByRole('link', { name: 'navigation.skipToMain' })

    expect(skipLink).toHaveAttribute('href', '#main-content')
    expect(skipLink).toHaveClass('outline-hidden', 'focus-visible:ring-2', 'focus-visible:ring-state-accent-solid')
    expect(container.querySelector('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).toBe(skipLink)
  })

  it('moves focus to the main content when skip navigation is activated', () => {
    render(<MainNavLayout><div>content</div></MainNavLayout>)

    const skipLink = screen.getByRole('link', { name: 'navigation.skipToMain' })
    const main = screen.getByRole('main')

    fireEvent.click(skipLink)

    expect(main).toHaveFocus()
  })
})
