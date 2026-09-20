import {
  fetchText,
  loadSourceMapFromText,
  normalizeWebpackModuleId,
} from './sourceMapShared'
import type { SourceMapLoaderAdapter, StackFrameAdapter } from './types'

export const webpackStackFrameAdapter: StackFrameAdapter = {
  canNormalize(fileName) {
    return (
      fileName.startsWith('webpack-internal://') ||
      fileName.startsWith('webpack://')
    )
  },
  normalize(stackFileName, fileName) {
    const normalized = normalizeWebpackModuleId(fileName)
    if (!normalized) return

    return {
      fileName: normalized,
      projectRelative: true,
      sourceMapFrame: { file: stackFileName, kind: 'webpack' },
    }
  },
}

const webpackModuleCache = new Map<
  string,
  Promise<Map<string, string> | undefined>
>()

export const webpackSourceMapAdapter: SourceMapLoaderAdapter = {
  kind: 'webpack',
  async load(frame) {
    const targetId = normalizeWebpackModuleId(frame.file)
    if (!targetId) return

    let scriptUrls: string[]
    try {
      scriptUrls = Array.from(document.scripts, (script) => script.src).filter(
        Boolean,
      )
    } catch {
      return
    }

    for (const scriptUrl of scriptUrls) {
      const modules = await loadWebpackModules(scriptUrl)
      const moduleSource = modules?.get(targetId)
      if (!moduleSource) continue

      const payload = await loadSourceMapFromText(moduleSource, scriptUrl)
      if (payload) return payload
    }
  },
}

async function loadWebpackModules(
  scriptUrl: string,
): Promise<Map<string, string> | undefined> {
  const cached = webpackModuleCache.get(scriptUrl)
  if (cached) return cached

  const loading = fetchText(scriptUrl).then((bundle) => {
    if (!bundle) {
      webpackModuleCache.delete(scriptUrl)
      return
    }
    return extractWebpackEvalModules(bundle)
  })
  webpackModuleCache.set(scriptUrl, loading)
  return loading
}

function extractWebpackEvalModules(bundle: string): Map<string, string> {
  const modules = new Map<string, string>()
  let cursor = 0

  while (cursor < bundle.length) {
    const evalStart = bundle.indexOf('eval("', cursor)
    if (evalStart < 0) break

    const stringStart = evalStart + 'eval('.length
    const stringEnd = findJsonStringEnd(bundle, stringStart)
    if (stringEnd < 0) break
    cursor = stringEnd + 1

    try {
      const moduleSource = JSON.parse(
        bundle.slice(stringStart, stringEnd + 1),
      ) as unknown
      if (typeof moduleSource !== 'string') continue

      const sourceUrl = findSourceUrl(moduleSource)
      const moduleId = sourceUrl
        ? normalizeWebpackModuleId(sourceUrl)
        : undefined
      if (moduleId) modules.set(moduleId, moduleSource)
    } catch {
      // A malformed eval block should not prevent scanning the rest of the bundle.
    }
  }

  return modules
}

function findJsonStringEnd(value: string, start: number): number {
  if (value[start] !== '"') return -1

  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1
      continue
    }
    if (value[index] === '"') return index
  }
  return -1
}

function findSourceUrl(source: string): string | undefined {
  const expression = /^[\t ]*\/\/[#@][\t ]*sourceURL=([^\s]+)[\t ]*$/gm
  let value: string | undefined
  for (const match of source.matchAll(expression)) value = match[1]
  return value
}
