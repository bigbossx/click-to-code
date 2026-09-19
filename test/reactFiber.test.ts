import { describe, expect, it, vi } from 'vitest'

import {
  getReactInstancesForElement,
  getSourceForInstance,
  parseDebugStack,
  resolveSourceLocation,
  sourceLocationNeedsResolution,
} from '../src/reactFiber'

describe('getSourceForInstance', () => {
  it('keeps the React 18 _debugSource path', () => {
    expect(
      getSourceForInstance({
        _debugSource: { fileName: '/workspace/src/App.tsx', lineNumber: 8 },
      }),
    ).toEqual({
      fileName: '/workspace/src/App.tsx',
      lineNumber: 8,
      columnNumber: 1,
    })
  })

  it('falls back to the owner source', () => {
    expect(
      getSourceForInstance({
        _debugOwner: {
          _debugSource: {
            fileName: '/workspace/src/Owner.tsx',
            lineNumber: 4,
            columnNumber: 7,
          },
        },
      }),
    ).toMatchObject({ fileName: '/workspace/src/Owner.tsx', lineNumber: 4 })
  })

  it('rejects malformed legacy sources without throwing', () => {
    expect(
      getSourceForInstance({
        _debugSource: { fileName: 42, lineNumber: Number.NaN },
      }),
    ).toBeUndefined()
  })

  it('contains errors from private Fiber accessors', () => {
    const fiber = {}
    Object.defineProperty(fiber, '_debugSource', {
      get() {
        throw new Error('stale fiber')
      },
    })

    expect(() => getSourceForInstance(fiber)).not.toThrow()
    expect(getSourceForInstance(fiber)).toBeUndefined()
  })

  it('normalizes invalid legacy line and column values', () => {
    expect(
      getSourceForInstance({
        _debugSource: {
          fileName: '/src/App.tsx',
          lineNumber: Number.POSITIVE_INFINITY,
          columnNumber: -2,
        },
      }),
    ).toEqual({
      fileName: '/src/App.tsx',
      lineNumber: 1,
      columnNumber: 1,
    })
  })
})

describe('parseDebugStack', () => {
  it('extracts React 19 Vite /@fs/ frames', () => {
    expect(
      parseDebugStack({
        stack: [
          'Error: react-stack-top-frame',
          '    at jsxDEV (http://localhost:5173/node_modules/react/jsx-dev-runtime.js:12:3)',
          '    at App (http://localhost:5173/@fs/Users/me/app/src/App.tsx?t=1:14:9)',
        ].join('\n'),
      }),
    ).toEqual({
      fileName: '/Users/me/app/src/App.tsx',
      lineNumber: 14,
      columnNumber: 9,
    })
  })

  it('extracts webpack-internal frames', () => {
    expect(
      parseDebugStack(
        'Error\n    at Page (webpack-internal:///(app-pages-browser)/./app/page.tsx:20:11)',
      ),
    ).toEqual({
      fileName: 'app/page.tsx',
      lineNumber: 20,
      columnNumber: 11,
      projectRelative: true,
    })
  })

  it('maps a Next Server Component fake stack through Next source maps', async () => {
    const source = parseDebugStack(
      [
        'Error: react-stack-top-frame',
        '    at fakeJSXCallSite (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_hash._.js:2001:21)',
        '    at ExampleCard (about://React/Server/file:///Users/me/project/.next/dev/server/chunks/ssr/%5Broot%5D.js?11:54:264)',
        '    at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_hash._.js:2768:93)',
      ].join('\n'),
    )
    expect(source).toEqual({
      fileName: '/Users/me/project/.next/dev/server/chunks/ssr/[root].js',
      lineNumber: 54,
      columnNumber: 264,
    })
    if (!source) throw new Error('Expected a parsed Next source')
    expect(sourceLocationNeedsResolution(source)).toBe(true)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          status: 'fulfilled',
          value: {
            originalStackFrame: {
              file: 'app/page.tsx',
              line1: 15,
              column1: 7,
            },
          },
        },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { location: { href: 'http://localhost:3000/' } })
    vi.stubGlobal('document', {
      scripts: [{ src: 'http://localhost:3000/_next/static/chunks/app.js' }],
    })

    await expect(resolveSourceLocation(source)).resolves.toEqual({
      fileName: 'app/page.tsx',
      lineNumber: 15,
      columnNumber: 7,
      projectRelative: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/__nextjs_original-stack-frames',
      expect.objectContaining({ method: 'POST' }),
    )

    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(request).toMatchObject({
      isServer: true,
      isAppDirectory: true,
      frames: [
        {
          file: 'about://React/Server/file:///Users/me/project/.next/dev/server/chunks/ssr/%5Broot%5D.js?11',
          line1: 54,
          column1: 264,
          methodName: 'ExampleCard',
        },
      ],
    })

    vi.unstubAllGlobals()
  })

  it('marks Vite root URLs as project-relative', () => {
    const source = parseDebugStack(
      'Error\n    at App (http://localhost:5173/src/App.tsx:5:19)',
    )
    expect(source).toEqual({
      fileName: '/src/App.tsx',
      lineNumber: 5,
      columnNumber: 19,
      projectRelative: true,
    })
    if (!source) throw new Error('Expected a parsed Vite source')
    expect(sourceLocationNeedsResolution(source)).toBe(false)
  })

  it('skips Vite prebundled React runtime frames', () => {
    expect(
      parseDebugStack(
        [
          'Error: react-stack-top-frame',
          '    at jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:12:3)',
          '    at App (http://localhost:5173/@fs/Users/me/app/src/App.tsx:14:9)',
        ].join('\n'),
      ),
    ).toEqual({
      fileName: '/Users/me/app/src/App.tsx',
      lineNumber: 14,
      columnNumber: 9,
    })
  })

  it('skips malformed URLs and continues to later frames', () => {
    expect(
      parseDebugStack(
        'Error\n    at Broken (http://%:1:2)\n    at App (/src/App.tsx:7:4)',
      ),
    ).toEqual({ fileName: '/src/App.tsx', lineNumber: 7, columnNumber: 4 })
  })

  it('returns undefined when no source frame is available', () => {
    expect(parseDebugStack('Error: react-stack-top-frame')).toBeUndefined()
  })

  it('rejects a malformed non-string stack value', () => {
    expect(
      parseDebugStack({ stack: 42 } as unknown as Error),
    ).toBeUndefined()
  })
})

describe('getReactInstancesForElement', () => {
  it('terminates when a Fiber owner chain contains a cycle', () => {
    const fiber: { _debugOwner?: unknown } = {}
    fiber._debugOwner = fiber
    const element = { __reactFiber$test: fiber } as unknown as Element
    vi.stubGlobal('window', {})

    expect(getReactInstancesForElement(element)).toEqual([fiber])
    vi.unstubAllGlobals()
  })

  it('continues after a stale DevTools renderer throws', () => {
    const fiber = { tag: 5 }
    vi.stubGlobal('window', {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {
        renderers: new Map([
          [
            'stale',
            {
              findFiberByHostInstance() {
                throw new Error('renderer is committing')
              },
            },
          ],
          ['valid', { findFiberByHostInstance: () => fiber }],
        ]),
      },
    })

    expect(
      getReactInstancesForElement({} as Element),
    ).toEqual([fiber])
    vi.unstubAllGlobals()
  })
})
