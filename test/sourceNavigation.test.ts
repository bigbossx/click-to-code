import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SourceLocation } from '../src/types'

const { resolveSourceLocation, sourceLocationNeedsResolution } = vi.hoisted(
  () => ({
    resolveSourceLocation: vi.fn(),
    sourceLocationNeedsResolution: vi.fn(() => true),
  }),
)

vi.mock('../src/reactFiber', () => ({
  resolveSourceLocation,
  sourceLocationNeedsResolution,
}))

import {
  openSourceInEditor,
  resolveApplicationSource,
} from '../src/sourceNavigation'

describe('openSourceInEditor', () => {
  beforeEach(() => {
    resolveSourceLocation.mockReset()
    sourceLocationNeedsResolution.mockClear()
  })

  it('skips dependency sources that are not present locally', async () => {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { assign } })

    const dependency: SourceLocation = {
      fileName: '/_next/static/chunks/radix.js',
      lineNumber: 47,
      columnNumber: 12,
      projectRelative: true,
    }
    const application: SourceLocation = {
      fileName: '/_next/static/chunks/app.js',
      lineNumber: 100,
      columnNumber: 8,
      projectRelative: true,
    }
    resolveSourceLocation
      .mockResolvedValueOnce({
        fileName:
          '/Users/me/project/node_modules/.pnpm/@radix-ui+react-primitive/node_modules/@radix-ui/react-primitive/src/primitive.tsx',
        lineNumber: 47,
        columnNumber: 12,
      })
      .mockResolvedValueOnce({
        fileName: '/Users/me/project/apps/admin-portal/components/button.tsx',
        lineNumber: 20,
        columnNumber: 5,
      })

    openSourceInEditor(
      [dependency, application],
      'vscode',
      undefined,
      '/Users/me/project',
    )

    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith(
        'vscode://file/Users/me/project/apps/admin-portal/components/button.tsx:20:5',
      )
    })
    expect(resolveSourceLocation).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })

  it('omits resolved dependency sources from menus', async () => {
    const source: SourceLocation = {
      fileName: '/_next/static/chunks/radix.js',
      lineNumber: 47,
      columnNumber: 12,
      projectRelative: true,
    }
    resolveSourceLocation.mockResolvedValueOnce({
      fileName:
        '/Users/me/project/node_modules/@radix-ui/react-primitive/src/primitive.tsx',
      lineNumber: 47,
      columnNumber: 12,
    })

    await expect(resolveApplicationSource(source)).resolves.toBeUndefined()
  })
})
