import { describe, expect, it, vi } from 'vitest'
import { redirect } from '@/next/navigation'
import InstalledApp from '../page'

vi.mock('@/next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

describe('installed app route', () => {
  it('redirects legacy installed app links to the explore installed route', async () => {
    await expect(InstalledApp({
      params: Promise.resolve({ appId: 'installed-1' }),
    })).rejects.toThrow('redirect:/explore/installed/installed-1')

    expect(redirect).toHaveBeenCalledWith('/explore/installed/installed-1')
  })
})
