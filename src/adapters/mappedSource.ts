import { normalizePosition } from '../sourceLocation'
import { normalizeStackFileName } from '../sourcePath'
import { resolveSourceMapStackFrame } from '../sourceMap'
import type { SourceLocation } from '../types'
import type {
  SourceMapStackFrame,
  SourceResolverAdapter,
} from './types'

const stackFrames = new WeakMap<SourceLocation, SourceMapStackFrame>()
const positionCache = new Map<string, Promise<SourceLocation | undefined>>()

export function registerMappedSource(
  source: SourceLocation,
  frame: SourceMapStackFrame,
): void {
  stackFrames.set(source, frame)
}

export const mappedSourceResolverAdapter: SourceResolverAdapter = {
  canResolve(source) {
    return stackFrames.has(source)
  },
  resolve(source) {
    const frame = stackFrames.get(source)
    if (!frame) return Promise.resolve(undefined)

    const cacheKey = `${frame.kind}:${frame.file}:${frame.lineNumber}:${frame.columnNumber}`
    const cached = positionCache.get(cacheKey)
    if (cached) return cached

    const resolution = resolveSourceMapStackFrame(frame).then((original) => {
      try {
        if (!original) {
          positionCache.delete(cacheKey)
          return
        }

        const normalized = normalizeStackFileName(original.source)
        if (!normalized) {
          positionCache.delete(cacheKey)
          return
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
        positionCache.delete(cacheKey)
        return
      }
    })
    positionCache.set(cacheKey, resolution)
    return resolution
  },
}
