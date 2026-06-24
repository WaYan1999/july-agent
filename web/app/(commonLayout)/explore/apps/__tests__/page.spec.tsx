import { render, screen } from '@testing-library/react'

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
}))

vi.mock('@/next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}))

vi.mock('@/app/components/explore/app-list', () => ({
  default: () => <section aria-label="explore-app-list">App gallery content</section>,
}))

describe('Explore apps route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the app gallery content on the route', async () => {
    const { default: Apps } = await import('../page')

    const page = await Apps({
      searchParams: Promise.resolve({
        category: 'Agent',
      }),
    })
    render(page)

    expect(screen.getByRole('region', { name: 'explore-app-list' })).toHaveTextContent('App gallery content')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
