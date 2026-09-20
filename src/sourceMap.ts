import { AnyMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { moduleSourceMapAdapter } from './adapters/module'
import { nextServerSourceMapAdapter } from './adapters/next'
import { normalizeWebpackModuleId } from './adapters/sourceMapShared'
import type {
  SourceMapAdapterKind,
  SourceMapLoaderAdapter,
  SourceMapStackFrame,
} from './adapters/types'
import { webpackSourceMapAdapter } from './adapters/webpack'

export type { SourceMapStackFrame } from './adapters/types'

export interface OriginalSourcePosition {
  source: string
  lineNumber: number
  columnNumber: number
}

const sourceMapAdapters: Record<
  SourceMapAdapterKind,
  SourceMapLoaderAdapter
> = {
  module: moduleSourceMapAdapter,
  'next-server': nextServerSourceMapAdapter,
  webpack: webpackSourceMapAdapter,
}

export async function resolveSourceMapStackFrame(
  frame: SourceMapStackFrame,
): Promise<OriginalSourcePosition | undefined> {
  try {
    const payload = await sourceMapAdapters[frame.kind].load(frame)
    if (!payload) return

    const map = new AnyMap(payload.contents, payload.url)
    const original = originalPositionFor(map, {
      line: frame.lineNumber,
      column: Math.max(0, frame.columnNumber - 1),
    })
    if (
      typeof original.source !== 'string' ||
      !original.source ||
      typeof original.line !== 'number' ||
      typeof original.column !== 'number'
    ) {
      return
    }

    return {
      source: preferFrameSource(frame, original.source),
      lineNumber: original.line,
      columnNumber: original.column + 1,
    }
  } catch {
    return
  }
}

function preferFrameSource(
  frame: SourceMapStackFrame,
  mappedSource: string,
): string {
  const frameSource = getFrameSource(frame)
  if (!frameSource) return mappedSource

  const frameId = normalizeComparablePath(frameSource)
  const mappedId = normalizeComparablePath(mappedSource)
  if (
    frameId &&
    mappedId &&
    (mappedId === frameId ||
      mappedId.endsWith(`/${frameId}`) ||
      (frame.kind === 'module' &&
        !mappedId.includes('/') &&
        frameId.endsWith(`/${mappedId}`)))
  ) {
    return frameSource
  }
  return mappedSource
}

function getFrameSource(frame: SourceMapStackFrame): string | undefined {
  if (frame.kind === 'webpack') return normalizeWebpackModuleId(frame.file)

  try {
    const url = new URL(frame.file)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.startsWith('/@fs/')) pathname = pathname.slice('/@fs'.length)
    return pathname || undefined
  } catch {
    return
  }
}

function normalizeComparablePath(value: string): string | undefined {
  let pathname = value
  if (value.startsWith('webpack:')) {
    pathname = normalizeWebpackModuleId(value) ?? ''
  } else {
    try {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
        pathname = decodeURIComponent(new URL(value).pathname)
      } else {
        pathname = decodeURIComponent(value)
      }
    } catch {
      // Keep malformed source names comparable as plain paths.
    }
  }

  pathname = pathname
    .replace(/[?#].*$/, '')
    .replace(/^\.?\//, '')
    .replace(/\\/g, '/')
  return pathname || undefined
}
