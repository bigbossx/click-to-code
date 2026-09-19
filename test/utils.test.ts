import { describe, expect, it } from 'vitest'

import type { FiberType } from '../src/types'
import {
  getDisplayNameForInstance,
  getDevServerOpenUrl,
  getPathToSource,
  getPathToSourceSafely,
  getPropsForInstance,
  getViteProjectRootFromSource,
} from '../src/utils'

describe('getDisplayNameForInstance', () => {
  it.each([
    [7, 'React.Fragment'],
    [8, 'React.StrictMode'],
    [12, 'React.Profiler'],
    [13, 'React.Suspense'],
    [19, 'React.SuspenseList'],
    [22, 'React.Offscreen'],
    [24, 'React.Cache'],
    [25, 'React.TracingMarker'],
    [30, 'React.ViewTransition'],
    [31, 'React.Activity'],
  ])('maps built-in Fiber tag %i to %s', (tag, name) => {
    expect(getDisplayNameForInstance({ tag })).toBe(name)
  })

  it('terminates when a wrapped type contains a cycle', () => {
    const type: { type?: FiberType } = {}
    type.type = type

    expect(getDisplayNameForInstance({ tag: 14, type })).toBe('React.memo')
  })

  it('contains errors from malformed Fiber tag accessors', () => {
    const fiber = {}
    Object.defineProperty(fiber, 'tag', {
      get() {
        throw new Error('stale tag')
      },
    })

    expect(getDisplayNameForInstance(fiber)).toBe('Anonymous Component')
  })
})

describe('local error capture', () => {
  it('contains pathModifier failures', () => {
    expect(
      getPathToSourceSafely(
        { fileName: '/src/App.tsx', lineNumber: 1, columnNumber: 1 },
        () => {
          throw new Error('invalid mapping')
        },
      ),
    ).toBeUndefined()
  })

  it('skips a throwing prop while preserving valid props', () => {
    const props = { valid: 'yes' } as Record<string, unknown>
    Object.defineProperty(props, 'broken', {
      enumerable: true,
      get() {
        throw new Error('broken getter')
      },
    })

    expect(getPropsForInstance({ memoizedProps: props })).toEqual({
      valid: 'yes',
    })
  })
})

describe('getPathToSource', () => {
  it('resolves browser-root paths against an explicit project root', () => {
    expect(
      getPathToSource(
        {
          fileName: '/src/App.tsx',
          lineNumber: 5,
          columnNumber: 19,
          projectRelative: true,
        },
        undefined,
        '/Users/me/project',
      ),
    ).toBe('/Users/me/project/src/App.tsx:5:19')
  })

  it('does not prefix an absolute filesystem source', () => {
    expect(
      getPathToSource(
        {
          fileName: '/Users/me/project/src/App.tsx',
          lineNumber: 5,
          columnNumber: 19,
        },
        undefined,
        '/Users/me/project',
      ),
    ).toBe('/Users/me/project/src/App.tsx:5:19')
  })

  it('normalizes Windows project roots for editor URLs', () => {
    expect(
      getPathToSource(
        {
          fileName: '/src/App.tsx',
          lineNumber: 5,
          columnNumber: 19,
          projectRelative: true,
        },
        undefined,
        'C:\\code\\project',
      ),
    ).toBe('C:/code/project/src/App.tsx:5:19')
  })
})

describe('getDevServerOpenUrl', () => {
  const source = {
    fileName: '/src/App.tsx',
    lineNumber: 5,
    columnNumber: 19,
    projectRelative: true,
  }

  it('uses the Vite dev server root, including a configured base path', () => {
    expect(
      getDevServerOpenUrl(
        source,
        ['http://localhost:5173/demo/@vite/client'],
        'http://localhost:5173/demo/',
      ),
    ).toBe(
      'http://localhost:5173/demo/__open-in-editor?file=src%2FApp.tsx%3A5%3A19',
    )
  })

  it('uses the Next.js dev server root, including a configured base path', () => {
    expect(
      getDevServerOpenUrl(
        source,
        ['http://localhost:3000/demo/_next/static/chunks/main.js'],
        'http://localhost:3000/demo/',
      ),
    ).toBe(
      'http://localhost:3000/demo/__nextjs_launch-editor?file=src%2FApp.tsx&line1=5&column1=19',
    )
  })

  it('does not route absolute filesystem paths through a dev server', () => {
    expect(
      getDevServerOpenUrl(
        {
          ...source,
          fileName: '/Users/me/project/src/App.tsx',
          projectRelative: false,
        },
        ['http://localhost:5173/@vite/client'],
        'http://localhost:5173/',
      ),
    ).toBeUndefined()
  })
})

describe('getViteProjectRootFromSource', () => {
  it('recovers the workspace root from Vite React JSX metadata', () => {
    expect(
      getViteProjectRootFromSource(
        'var _jsxFileName = "/Users/me/project/src/main.tsx";',
        'src/main.tsx',
      ),
    ).toBe('/Users/me/project')
  })

  it('supports Windows paths emitted as JSON strings', () => {
    expect(
      getViteProjectRootFromSource(
        'var _jsxFileName = "C:\\\\code\\\\project\\\\src\\\\main.tsx";',
        'src/main.tsx',
      ),
    ).toBe('C:/code/project')
  })

  it('ignores unrelated JSX metadata', () => {
    expect(
      getViteProjectRootFromSource(
        'var _jsxFileName = "/Users/me/other/App.tsx";',
        'src/main.tsx',
      ),
    ).toBeUndefined()
  })
})
