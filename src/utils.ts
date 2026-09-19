import type { FiberType, PathModifier, ReactFiber, SourceLocation } from './types'

export function getPathToSource(
  source: SourceLocation,
  pathModifier?: PathModifier,
): string {
  const path = `${source.fileName}:${source.lineNumber}:${source.columnNumber}`
  return pathModifier ? pathModifier(path) : path
}

export function getPathToSourceSafely(
  source: SourceLocation,
  pathModifier?: PathModifier,
): string | undefined {
  try {
    const path = getPathToSource(source, pathModifier)
    return typeof path === 'string' && path ? path : undefined
  } catch {
    return
  }
}

export function getUrl(editor: string, pathToSource: string): string {
  return pathToSource.startsWith('/')
    ? `${editor}://file${pathToSource}`
    : `${editor}://file/${pathToSource}`
}

export function getDisplayNameForInstance(fiber: ReactFiber): string {
  let tag: number | undefined
  try {
    tag = fiber.tag
    const type = fiber.elementType ?? fiber.type
    const name = getTypeName(type, new Set<object>())
    if (name) return name
  } catch {
    // Fall back to the stable numeric tag map below.
  }

  switch (tag) {
    case 3:
      return 'React.Root'
    case 4:
      return 'React.Portal'
    case 5:
      return 'Host Component'
    case 6:
      return 'String'
    case 7:
      return 'React.Fragment'
    case 8:
      return 'React.StrictMode'
    case 9:
      return 'Context.Consumer'
    case 10:
      return 'Context.Provider'
    case 11:
      return 'React.forwardRef'
    case 12:
      return 'React.Profiler'
    case 13:
      return 'React.Suspense'
    case 14:
    case 15:
      return 'React.memo'
    case 16:
      return 'React.lazy'
    case 18:
      return 'React.DehydratedFragment'
    case 19:
      return 'React.SuspenseList'
    case 21:
      return 'React.Scope'
    case 22:
      return 'React.Offscreen'
    case 23:
      return 'React.LegacyHidden'
    case 24:
      return 'React.Cache'
    case 25:
      return 'React.TracingMarker'
    case 30:
      return 'React.ViewTransition'
    case 31:
      return 'React.Activity'
    default:
      return 'Anonymous Component'
  }
}

export function getPropsForInstance(
  fiber: ReactFiber,
): Record<string, string | number | boolean | symbol> {
  let memoizedProps: unknown
  try {
    memoizedProps = fiber.memoizedProps
  } catch {
    return {}
  }
  if (!memoizedProps || typeof memoizedProps !== 'object') return {}

  let defaults: Record<string, unknown> | undefined
  try {
    defaults = getDefaultProps(fiber.type)
  } catch {
    defaults = undefined
  }
  const props: Record<string, string | number | boolean | symbol> = {}

  let keys: string[]
  try {
    keys = Object.keys(memoizedProps)
  } catch {
    return props
  }

  for (const key of keys) {
    try {
      const value = (memoizedProps as Record<string, unknown>)[key]
      if (key === 'key' || value === defaults?.[key]) continue
      if (['string', 'number', 'boolean', 'symbol'].includes(typeof value)) {
        props[key] = value as string | number | boolean | symbol
      }
    } catch {
      // Skip only the malformed property.
    }
  }

  return props
}

function getTypeName(
  type: FiberType | undefined,
  visited: Set<object>,
): string | undefined {
  if (typeof type === 'string') return type
  if (typeof type === 'function') return type.displayName || type.name
  if (!type || typeof type !== 'object') return
  if (visited.has(type)) return
  visited.add(type)
  return type.displayName || type.name || getTypeName(type.type, visited)
}

function getDefaultProps(
  type: FiberType | undefined,
): Record<string, unknown> | undefined {
  if ((typeof type !== 'function' && typeof type !== 'object') || !type) return
  return (type as { defaultProps?: Record<string, unknown> }).defaultProps
}
