import type { ReactFiber, SourceLocation } from './types'

type DevToolsRenderer = {
  findFiberByHostInstance?: (element: Element) => ReactFiber | null
}

type ReactDevToolsHook = {
  renderers?: Map<unknown, DevToolsRenderer>
}

type ReactElementInternals = Element & {
  _reactRootContainer?: { _internalRoot?: { current?: ReactFiber } }
  [key: string]: unknown
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook
  }
}

export function getReactInstanceForElement(
  element: Element,
): ReactFiber | undefined {
  let renderers: ReactDevToolsHook['renderers']
  try {
    renderers =
      typeof window === 'undefined'
        ? undefined
        : window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers
  } catch {
    renderers = undefined
  }

  if (renderers) {
    let rendererList: DevToolsRenderer[] = []
    try {
      rendererList = Array.from(renderers.values())
    } catch {
      rendererList = []
    }

    for (const renderer of rendererList) {
      try {
        const fiber = renderer.findFiberByHostInstance?.(element)
        if (fiber) return fiber
      } catch {
        // Keep trying when one renderer is stale or currently committing.
      }
    }
  }

  const internals = element as ReactElementInternals
  try {
    const rootFiber = internals._reactRootContainer?._internalRoot?.current
    if (rootFiber) return rootFiber.child ?? rootFiber
  } catch {
    // A stale or instrumented element may expose throwing accessors.
  }

  let keys: string[]
  try {
    keys = Object.keys(element)
  } catch {
    return
  }

  for (const key of keys) {
    if (
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$')
    ) {
      try {
        const fiber = internals[key]
        if (isFiber(fiber)) return fiber
      } catch {
        // Keep looking when one renderer leaves behind an invalid accessor.
      }
    }
  }
}

export function getReactInstancesForElement(
  element: Element,
): ReactFiber[] {
  const fibers: ReactFiber[] = []
  const visited = new Set<ReactFiber>()
  let fiber = getReactInstanceForElement(element)

  while (fiber && !visited.has(fiber)) {
    visited.add(fiber)
    fibers.push(fiber)
    try {
      fiber = fiber._debugOwner ?? fiber.return ?? undefined
    } catch {
      break
    }
  }

  return fibers
}

export function getSourceForElement(
  element: Element,
): SourceLocation | undefined {
  let current: Element | null = element

  while (current) {
    try {
      const source = getSourceForInstance(getReactInstanceForElement(current))
      if (source) return source
    } catch {
      // A malformed child should not prevent checking a valid parent.
    }
    try {
      current = current.parentElement
    } catch {
      return
    }
  }
}

export function getSourceForInstance(
  fiber?: ReactFiber | null,
): SourceLocation | undefined {
  if (!fiber) return

  try {
    const legacySource = normalizeSource(
      fiber._debugSource ?? fiber._debugOwner?._debugSource,
    )
    if (legacySource) return legacySource

    return (
      parseDebugStack(fiber._debugStack) ??
      parseDebugStack(fiber._debugOwner?._debugStack)
    )
  } catch {
    return
  }
}

export function parseDebugStack(
  debugStack: ReactFiber['_debugStack'],
): SourceLocation | undefined {
  let stackValue: unknown
  try {
    stackValue =
      typeof debugStack === 'string' ? debugStack : debugStack?.stack ?? ''
  } catch {
    return
  }
  if (typeof stackValue !== 'string') return

  for (const line of stackValue.split('\n')) {
    const match = line.trim().match(/(?:at\s+.*?\s+\()?(.+?):(\d+):(\d+)\)?$/)
    if (!match) continue

    const [, rawFileName, rawLine, rawColumn] = match
    if (!rawFileName || isReactInternalFrame(rawFileName)) continue

    let fileName: string | undefined
    try {
      fileName = normalizeStackFileName(rawFileName)
    } catch {
      continue
    }
    if (!fileName) continue

    return {
      fileName,
      lineNumber: normalizePosition(Number(rawLine)),
      columnNumber: normalizePosition(Number(rawColumn)),
    }
  }
}

function normalizeSource(
  source?: Partial<SourceLocation> | null,
): SourceLocation | undefined {
  if (typeof source?.fileName !== 'string' || !source.fileName) return

  return {
    fileName: source.fileName,
    lineNumber: normalizePosition(source.lineNumber),
    columnNumber: normalizePosition(source.columnNumber),
  }
}

function normalizeStackFileName(rawFileName: string): string | undefined {
  let fileName = rawFileName.replace(/^\(/, '')

  try {
    fileName = decodeURIComponent(fileName)
  } catch {
    // Keep malformed URLs usable instead of failing the whole interaction.
  }

  if (fileName.startsWith('file://')) {
    fileName = fileName.slice('file://'.length)
  } else if (/^https?:\/\//.test(fileName)) {
    const url = new URL(fileName)
    fileName = url.pathname.replace(/^\/@fs\//, '/')
  } else if (fileName.startsWith('webpack-internal://')) {
    fileName = fileName
      .replace(/^webpack-internal:\/\/\/(?:\([^)]*\)\/)?/, '')
      .replace(/^\.\//, '')
  }

  fileName = fileName.replace(/[?#].*$/, '')
  return fileName && fileName !== '<anonymous>' ? fileName : undefined
}

function isReactInternalFrame(fileName: string): boolean {
  return (
    fileName.includes('/node_modules/react') ||
    fileName.includes('/node_modules/.vite/deps/react_') ||
    fileName.includes('react-jsx-dev-runtime') ||
    fileName.includes('react_jsx-dev-runtime') ||
    fileName.includes('react_stack_bottom_frame')
  )
}

function normalizePosition(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 1
}

function isFiber(value: unknown): value is ReactFiber {
  return typeof value === 'object' && value !== null
}
