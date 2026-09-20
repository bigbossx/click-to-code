import type { SourceLocation } from '../types'
import { mappedSourceResolverAdapter } from './mappedSource'
import { nextSourceResolverAdapter } from './next'
import type { SourceResolverAdapter } from './types'

const adapters: SourceResolverAdapter[] = [
  nextSourceResolverAdapter,
  mappedSourceResolverAdapter,
]
const resolutionCache = new WeakMap<
  SourceLocation,
  Promise<SourceLocation | undefined>
>()

export function sourceLocationNeedsResolution(source: SourceLocation): boolean {
  return adapters.some((adapter) => adapter.canResolve(source))
}

export function resolveSourceLocation(
  source: SourceLocation,
): Promise<SourceLocation | undefined> {
  const matchingAdapters = adapters.filter((adapter) =>
    adapter.canResolve(source),
  )
  if (matchingAdapters.length === 0) return Promise.resolve(source)

  const cached = resolutionCache.get(source)
  if (cached) return cached

  const resolution = resolveWithAdapters(source, matchingAdapters).then(
    (resolved) => {
      if (!resolved) resolutionCache.delete(source)
      return resolved ?? source
    },
  )
  resolutionCache.set(source, resolution)
  return resolution
}

async function resolveWithAdapters(
  source: SourceLocation,
  matchingAdapters: SourceResolverAdapter[],
): Promise<SourceLocation | undefined> {
  for (const adapter of matchingAdapters) {
    try {
      const resolved = await adapter.resolve(source)
      if (resolved) return resolved
    } catch {
      // A platform adapter failure should not prevent another adapter fallback.
    }
  }
}
