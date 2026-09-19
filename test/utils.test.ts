import { describe, expect, it } from 'vitest'

import type { FiberType } from '../src/types'
import {
  getDisplayNameForInstance,
  getPathToSource,
  getPathToSourceSafely,
  getPropsForInstance,
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
