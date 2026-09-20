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

  it('falls back to the debug stack when a legacy source contains stack text', () => {
    expect(
      getSourceForInstance({
        _debugSource: {
          fileName:
            'at https://admin.example.com/_next/static/chunks/0o24_next_116xctl._.js',
          lineNumber: 211,
          columnNumber: 33,
        },
        _debugStack: {
          stack: [
            'Error: react-stack-top-frame',
            '    at https://admin.example.com/_next/static/chunks/0o24_next_116xctl._.js:211:33',
            '    at LoginForm (https://admin.example.com/_next/static/chunks/_045cddz._.js:6338:420)',
          ].join('\n'),
        },
      }),
    ).toEqual({
      fileName: '/_next/static/chunks/_045cddz._.js',
      lineNumber: 6338,
      columnNumber: 420,
      projectRelative: true,
    })
  })
})

describe('parseDebugStack', () => {
  it('skips an anonymous React top frame without treating "at" as a path', () => {
    expect(
      parseDebugStack(
        [
          'Error: react-stack-top-frame',
          '    at https://admin.example.com/_next/static/chunks/0o24_next_116xctl._.js:211:33',
          '    at LoginForm (https://admin.example.com/_next/static/chunks/_045cddz._.js:6338:420)',
        ].join('\n'),
      ),
    ).toEqual({
      fileName: '/_next/static/chunks/_045cddz._.js',
      lineNumber: 6338,
      columnNumber: 420,
      projectRelative: true,
    })
  })

  it('parses anonymous URL frames without retaining the stack prefix', () => {
    expect(
      parseDebugStack(
        'Error\n    at https://example.com/src/App.tsx:7:4',
      ),
    ).toEqual({
      fileName: '/src/App.tsx',
      lineNumber: 7,
      columnNumber: 4,
      projectRelative: true,
    })
  })

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

  it('falls back to the Next source-map endpoint for server chunks', async () => {
    const source = parseDebugStack(
      [
        'Error: react-stack-top-frame',
        '    at fakeJSXCallSite (http://localhost:3001/_next/static/chunks/react-server-dom.js:1981:16)',
        '    at LoginPage (about://React/Server/file:///Users/me/project/.next/dev/server/chunks/ssr/%5Broot%5D.js?58:3760:488)',
      ].join('\n'),
    )
    if (!source) throw new Error('Expected a parsed Next source')

    const sourceMap = JSON.stringify({
      version: 3,
      names: [],
      sources: ['file:///Users/me/project/app/sso/login/page.tsx'],
      sourcesContent: ['export default function LoginPage() {}'],
      mappings: `${';'.repeat(3759)}AAAA`,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ status: 'rejected', reason: 'unsupported' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => sourceMap,
      })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { location: { href: 'http://localhost:3001/' } })
    vi.stubGlobal('document', {
      scripts: [{ src: 'http://localhost:3001/_next/static/chunks/app.js' }],
    })

    await expect(resolveSourceLocation(source)).resolves.toEqual({
      fileName: '/Users/me/project/app/sso/login/page.tsx',
      lineNumber: 1,
      columnNumber: 1,
    })
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      '/__nextjs_source-map?filename=%2FUsers%2Fme%2Fproject%2F.next%2Fdev%2Fserver%2Fchunks%2Fssr%2F%5Broot%5D.js',
    )

    vi.unstubAllGlobals()
  })

  it('skips React JSX callsites and maps the application chunk', async () => {
    const source = parseDebugStack(
      [
        'Error: react-stack-top-frame',
        '    at exports.jsxDEV (http://localhost:3001/_next/static/chunks/react-runtime.js:211:33)',
        '    at LarkLoginForm (http://localhost:3001/_next/static/chunks/app.js:4557:420)',
      ].join('\n'),
    )
    expect(source).toEqual({
      fileName: '/_next/static/chunks/app.js',
      lineNumber: 4557,
      columnNumber: 420,
      projectRelative: true,
    })
    if (!source) throw new Error('Expected a parsed Next client source')

    const map = btoa(
      JSON.stringify({
        version: 3,
        names: [],
        sources: [
          'file:///Users/me/project/apps/admin/components/login-form.tsx',
        ],
        sourcesContent: ['export function LarkLoginForm() {}'],
        mappings: `${';'.repeat(4556)}AAAA`,
      }),
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ status: 'rejected', reason: 'unsupported' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `compiled\n//# sourceMappingURL=data:application/json;base64,${map}`,
      })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { location: { href: 'http://localhost:3001/' } })
    vi.stubGlobal('document', {
      scripts: [{ src: 'http://localhost:3001/_next/static/chunks/app.js' }],
    })

    await expect(resolveSourceLocation(source)).resolves.toEqual({
      fileName: '/Users/me/project/apps/admin/components/login-form.tsx',
      lineNumber: 1,
      columnNumber: 1,
    })

    vi.unstubAllGlobals()
  })

  it('maps sectioned source maps emitted by Turbopack', async () => {
    const source = parseDebugStack(
      'Error\n    at App (http://localhost:3001/_next/static/chunks/sectioned.js:3:1)',
    )
    if (!source) throw new Error('Expected a parsed Next client source')

    const sectionedMap = {
      version: 3,
      sections: [
        {
          offset: { line: 2, column: 0 },
          map: {
            version: 3,
            names: [],
            sources: ['file:///Users/me/project/app/page.tsx'],
            sourcesContent: ['export default function Page() {}'],
            mappings: 'AAAA',
          },
        },
      ],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ status: 'rejected', reason: 'unsupported' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `compiled\n//# sourceMappingURL=data:application/json,${encodeURIComponent(JSON.stringify(sectionedMap))}`,
      })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { location: { href: 'http://localhost:3001/' } })
    vi.stubGlobal('document', {
      scripts: [{ src: 'http://localhost:3001/_next/static/chunks/sectioned.js' }],
    })

    await expect(resolveSourceLocation(source)).resolves.toEqual({
      fileName: '/Users/me/project/app/page.tsx',
      lineNumber: 1,
      columnNumber: 1,
    })

    vi.unstubAllGlobals()
  })

  it('maps Vite generated positions through the module source map', async () => {
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
    expect(sourceLocationNeedsResolution(source)).toBe(true)

    const map = btoa(
      JSON.stringify({
        version: 3,
        names: [],
        sources: ['App.tsx'],
        sourcesContent: ['export function App() {}'],
        mappings: ';;;;AAEA',
      }),
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        `export function App() {}\n//# sourceMappingURL=data:application/json;base64,${map}`,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveSourceLocation(source)).resolves.toEqual({
      fileName: '/src/App.tsx',
      lineNumber: 3,
      columnNumber: 1,
      projectRelative: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('maps webpack eval-source-map positions through the entry bundle', async () => {
    const source = parseDebugStack(
      'Error\n    at App (webpack-internal:///./src/App.tsx:5:19)',
    )
    if (!source) throw new Error('Expected a parsed webpack source')
    expect(sourceLocationNeedsResolution(source)).toBe(true)

    const map = btoa(
      JSON.stringify({
        version: 3,
        names: [],
        sources: ['webpack:///example-webpack-react/src/App.tsx'],
        sourcesContent: ['export function App() {}'],
        mappings: ';;;;AAEA',
      }),
    )
    const moduleSource = [
      'export function App() {}',
      `//# sourceMappingURL=data:application/json;base64,${map}`,
      '//# sourceURL=webpack-internal:///./src/App.tsx',
    ].join('\n')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `eval(${JSON.stringify(moduleSource)});`,
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      scripts: [{ src: 'http://localhost:5174/main.js' }],
    })

    await expect(resolveSourceLocation(source)).resolves.toEqual({
      fileName: 'src/App.tsx',
      lineNumber: 3,
      columnNumber: 1,
      projectRelative: true,
    })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5174/main.js')
    vi.unstubAllGlobals()
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
