import { isAbsoluteFilePath, normalizePosition } from '../sourceLocation'
import type { SourceLocation } from '../types'
import { fetchText } from './sourceMapShared'
import type {
  SourceMapLoaderAdapter,
  SourceResolverAdapter,
  StackFrameAdapter,
} from './types'

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

const stackFrames = new WeakMap<SourceLocation, NextStackFrame>()
const sourceCache = new Map<string, Promise<SourceLocation | undefined>>()

export const nextStackFrameAdapter: StackFrameAdapter = {
  canNormalize(fileName) {
    if (fileName.startsWith('about://React/Server/file://')) return true
    if (!/^https?:\/\//.test(fileName)) return false

    try {
      return new URL(fileName).pathname.includes('/_next/static/chunks/')
    } catch {
      return false
    }
  },
  normalize(stackFileName, fileName) {
    if (fileName.startsWith('about://React/Server/file://')) {
      const sourceFileName = fileName
        .slice('about://React/Server/file://'.length)
        .replace(/[?#].*$/, '')
      return {
        fileName: sourceFileName,
        projectRelative: false,
        nextFrame: { file: stackFileName, isServer: true },
        sourceMapFrame: { file: sourceFileName, kind: 'next-server' },
      }
    }

    try {
      const url = new URL(fileName)
      return {
        fileName: url.pathname.replace(/[?#].*$/, ''),
        projectRelative: true,
        nextFrame: { file: stackFileName, isServer: false },
        sourceMapFrame: { file: stackFileName, kind: 'module' },
      }
    } catch {
      return
    }
  },
}

export function registerNextSource(
  source: SourceLocation,
  frame: NextStackFrame,
): void {
  stackFrames.set(source, frame)
}

export const nextSourceResolverAdapter: SourceResolverAdapter = {
  canResolve(source) {
    return stackFrames.has(source)
  },
  resolve(source) {
    const frame = stackFrames.get(source)
    if (!frame) return Promise.resolve(undefined)

    const cacheKey = `${frame.file}:${frame.line1}:${frame.column1}:${frame.isServer}`
    const cached = sourceCache.get(cacheKey)
    if (cached) return cached

    const resolution = resolveNextSource(frame).then((resolved) => {
      if (resolved && !isNextGeneratedSource(resolved.fileName)) return resolved
      sourceCache.delete(cacheKey)
      return undefined
    })
    sourceCache.set(cacheKey, resolution)
    return resolution
  },
}

export const nextServerSourceMapAdapter: SourceMapLoaderAdapter = {
  kind: 'next-server',
  async load(frame) {
    try {
      const pageUrl = window.location.href
      const script = Array.from(document.scripts, (item) => item.src).find(
        (source) => new URL(source, pageUrl).pathname.includes('/_next/'),
      )
      const scriptUrl = new URL(script || pageUrl, pageUrl)
      const basePath = script
        ? scriptUrl.pathname.split('/_next/', 1)[0]
        : ''
      const endpoint = new URL(
        `${basePath}/__nextjs_source-map`,
        scriptUrl.origin,
      )
      endpoint.searchParams.set('filename', frame.file)

      const contents = await fetchText(endpoint.href)
      return contents ? { contents, url: endpoint.href } : undefined
    } catch {
      return
    }
  },
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
    const original =
      result?.status === 'fulfilled'
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

function isNextGeneratedSource(fileName: string): boolean {
  return (
    fileName.startsWith('.next/') ||
    fileName.includes('/.next/') ||
    fileName.includes('/_next/static/chunks/')
  )
}
