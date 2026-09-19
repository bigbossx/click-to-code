import type { ReactFiber, SourceLocation } from './types'
import {
  resolveSourceMapStackFrame,
  type SourceMapStackFrame,
} from './sourceMap'

interface NextStackFrame {
  file: string
  line1: number
  column1: number
  methodName: string
  isServer: boolean
}

interface NextOriginalStackFrameResponse {
  status?: unknown
  value?: {
    originalStackFrame?: {
      file?: unknown
      line1?: unknown
      column1?: unknown
    } | null
  }
}

const nextStackFrames = new WeakMap<SourceLocation, NextStackFrame>()
const nextSourceCache = new Map<string, Promise<SourceLocation | undefined>>()
const sourceMapStackFrames = new WeakMap<SourceLocation, SourceMapStackFrame>()
const sourceMapPositionCache = new Map<string, Promise<SourceLocation>>()

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

    let normalizedFile: NormalizedStackFile | undefined
    try {
      normalizedFile = normalizeStackFileName(rawFileName)
    } catch {
      continue
    }
    if (!normalizedFile) continue

    const source: SourceLocation = {
      fileName: normalizedFile.fileName,
      lineNumber: normalizePosition(Number(rawLine)),
      columnNumber: normalizePosition(Number(rawColumn)),
      ...(normalizedFile.projectRelative ? { projectRelative: true } : {}),
    }

    if (normalizedFile.nextFrame) {
      nextStackFrames.set(source, {
        file: normalizedFile.nextFrame.file,
        line1: source.lineNumber,
        column1: source.columnNumber,
        methodName: getStackMethodName(line),
        isServer: normalizedFile.nextFrame.isServer,
      })
    }
    if (normalizedFile.sourceMapFrame) {
      sourceMapStackFrames.set(source, {
        ...normalizedFile.sourceMapFrame,
        lineNumber: source.lineNumber,
        columnNumber: source.columnNumber,
      })
    }

    return source
  }
}

export function resolveSourceLocation(
  source: SourceLocation,
): Promise<SourceLocation | undefined> {
  const frame = nextStackFrames.get(source)
  if (!frame) return resolveBundlerSource(source)

  const cacheKey = `${frame.file}:${frame.line1}:${frame.column1}:${frame.isServer}`
  const cached = nextSourceCache.get(cacheKey)
  if (cached) return cached

  const resolution = resolveNextSource(frame).then((resolved) => {
    if (!resolved) nextSourceCache.delete(cacheKey)
    return resolved
  })
  nextSourceCache.set(cacheKey, resolution)
  return resolution
}

export function sourceLocationNeedsResolution(source: SourceLocation): boolean {
  return nextStackFrames.has(source) || sourceMapStackFrames.has(source)
}

function resolveBundlerSource(source: SourceLocation): Promise<SourceLocation> {
  const frame = sourceMapStackFrames.get(source)
  if (!frame) return Promise.resolve(source)

  const cacheKey = `${frame.kind}:${frame.file}:${frame.lineNumber}:${frame.columnNumber}`
  const cached = sourceMapPositionCache.get(cacheKey)
  if (cached) return cached

  const resolution = resolveSourceMapStackFrame(frame).then((original) => {
    try {
      if (!original) {
        sourceMapPositionCache.delete(cacheKey)
        return source
      }

      const normalized = normalizeStackFileName(original.source)
      if (!normalized) {
        sourceMapPositionCache.delete(cacheKey)
        return source
      }

      const projectRelative =
        normalized.projectRelative ||
        (source.projectRelative && normalized.fileName === source.fileName)

      return {
        fileName: normalized.fileName,
        lineNumber: normalizePosition(original.lineNumber),
        columnNumber: normalizePosition(original.columnNumber),
        ...(projectRelative ? { projectRelative: true } : {}),
      }
    } catch {
      sourceMapPositionCache.delete(cacheKey)
      return source
    }
  })
  sourceMapPositionCache.set(cacheKey, resolution)
  return resolution
}

async function resolveNextSource(
  frame: NextStackFrame,
): Promise<SourceLocation | undefined> {
  try {
    const response = await fetch(getNextStackFrameEndpoint(), {
      method: 'POST',
      body: JSON.stringify({
        frames: [{ ...frame, arguments: [] }],
        isServer: frame.isServer,
        isEdgeServer: false,
        isAppDirectory: true,
      }),
    })
    if (!response.ok) return

    const body = (await response.json()) as unknown
    if (!Array.isArray(body)) return

    const result = body[0] as NextOriginalStackFrameResponse | undefined
    const original = result?.status === 'fulfilled'
      ? result.value?.originalStackFrame
      : undefined
    if (
      typeof original?.file !== 'string' ||
      !original.file ||
      typeof original.line1 !== 'number'
    ) {
      return
    }

    const fileName = original.file.startsWith('file://')
      ? original.file.slice('file://'.length)
      : original.file
    const projectRelative = !isAbsoluteFilePath(fileName)

    return {
      fileName,
      lineNumber: normalizePosition(original.line1),
      columnNumber: normalizePosition(original.column1),
      ...(projectRelative ? { projectRelative: true } : {}),
    }
  } catch {
    return
  }
}

function getNextStackFrameEndpoint(): string {
  try {
    const pageUrl = window.location.href
    const script = Array.from(document.scripts, (item) => item.src).find(
      (source) => new URL(source, pageUrl).pathname.includes('/_next/'),
    )
    if (!script) return '/__nextjs_original-stack-frames'

    const scriptUrl = new URL(script, pageUrl)
    const basePath = scriptUrl.pathname.split('/_next/', 1)[0]
    return `${scriptUrl.origin}${basePath}/__nextjs_original-stack-frames`
  } catch {
    return '/__nextjs_original-stack-frames'
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

interface NormalizedStackFile {
  fileName: string
  projectRelative: boolean
  nextFrame?: { file: string; isServer: boolean }
  sourceMapFrame?: Pick<SourceMapStackFrame, 'file' | 'kind'>
}

function normalizeStackFileName(
  rawFileName: string,
): NormalizedStackFile | undefined {
  let fileName = rawFileName.replace(/^\(/, '')
  const stackFileName = fileName
  let projectRelative = false

  try {
    fileName = decodeURIComponent(fileName)
  } catch {
    // Keep malformed URLs usable instead of failing the whole interaction.
  }

  if (fileName.startsWith('file://')) {
    fileName = fileName.slice('file://'.length)
  } else if (fileName.startsWith('about://React/Server/file://')) {
    fileName = fileName.slice('about://React/Server/file://'.length)
    return {
      fileName: fileName.replace(/[?#].*$/, ''),
      projectRelative: false,
      nextFrame: { file: stackFileName, isServer: true },
    }
  } else if (/^https?:\/\//.test(fileName)) {
    const url = new URL(fileName)
    const isFileSystemPath = url.pathname.startsWith('/@fs/')
    fileName = url.pathname.replace(/^\/@fs\//, '/')
    projectRelative = !isFileSystemPath
    if (url.pathname.includes('/_next/static/chunks/')) {
      return {
        fileName: fileName.replace(/[?#].*$/, ''),
        projectRelative,
        nextFrame: { file: stackFileName, isServer: false },
      }
    }
    return {
      fileName: fileName.replace(/[?#].*$/, ''),
      projectRelative,
      sourceMapFrame: { file: stackFileName, kind: 'module' },
    }
  } else if (fileName.startsWith('webpack-internal://')) {
    fileName = fileName
      .replace(/^webpack-internal:\/\/\/(?:\([^)]*\)\/)?/, '')
      .replace(/^\.\//, '')
    projectRelative = true
    return {
      fileName: fileName.replace(/[?#].*$/, ''),
      projectRelative,
      sourceMapFrame: { file: stackFileName, kind: 'webpack' },
    }
  } else if (fileName.startsWith('webpack://')) {
    fileName = fileName
      .replace(/^webpack:\/\/[^/]*\//, '')
      .replace(/^\.\//, '')
    projectRelative = true
    return {
      fileName: fileName.replace(/[?#].*$/, ''),
      projectRelative,
      sourceMapFrame: { file: stackFileName, kind: 'webpack' },
    }
  } else if (!isAbsoluteFilePath(fileName)) {
    projectRelative = true
  }

  fileName = fileName.replace(/[?#].*$/, '')
  return fileName && fileName !== '<anonymous>'
    ? { fileName, projectRelative }
    : undefined
}

function isReactInternalFrame(fileName: string): boolean {
  return (
    fileName.includes('/node_modules/react') ||
    fileName.includes('/node_modules/.vite/deps/react_') ||
    fileName.includes('react-jsx-dev-runtime') ||
    fileName.includes('react_jsx-dev-runtime') ||
    fileName.includes('react-server-dom-') ||
    fileName.includes('/node_modules_next_dist_') ||
    fileName.includes('/node_modules/next/dist/') ||
    fileName.includes('react_stack_bottom_frame')
  )
}

function getStackMethodName(line: string): string {
  return line.trim().match(/^at\s+(.+?)\s+\(/)?.[1] ?? '<unknown>'
}

function isAbsoluteFilePath(fileName: string): boolean {
  return fileName.startsWith('/') || /^[A-Za-z]:[\\/]/.test(fileName)
}

function normalizePosition(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 1
}

function isFiber(value: unknown): value is ReactFiber {
  return typeof value === 'object' && value !== null
}
