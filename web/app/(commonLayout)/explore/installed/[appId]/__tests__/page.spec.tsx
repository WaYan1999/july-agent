import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import InstalledApp from '../page'

vi.mock('@/app/components/explore/installed-app', () => ({
  default: ({ id }: { id: string }) => (
    <main aria-label="installed app">
      {id}
    </main>
  ),
}))

describe('explore installed app route', () => {
  it('renders the installed app page inside the explore route', async () => {
    const page = await InstalledApp({
      params: Promise.resolve({ appId: 'installed-1' }),
    })

    render(page)

    expect(screen.getByRole('main', { name: 'installed app' })).toHaveTextContent('installed-1')
  })
})
