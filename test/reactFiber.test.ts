import { describe, expect, it, vi } from 'vitest'

import {
  getReactInstancesForElement,
  getSourceForInstance,
  parseDebugStack,
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
    })
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
