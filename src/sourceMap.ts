import { AnyMap, originalPositionFor } from '@jridgewell/trace-mapping'

export interface SourceMapStackFrame {
  file: string
  lineNumber: number
  columnNumber: number
  kind: 'module' | 'next-server' | 'webpack'
}

export interface OriginalSourcePosition {
  source: string
  lineNumber: number
  columnNumber: number
}

interface SourceMapPayload {
  contents: string
  url?: string
}

const textCache = new Map<string, Promise<string | undefined>>()
const webpackModuleCache = new Map<
  string,
  Promise<Map<string, string> | undefined>
>()

export async function resolveSourceMapStackFrame(
  frame: SourceMapStackFrame,
): Promise<OriginalSourcePosition | undefined> {
  try {
    let payload: SourceMapPayload | undefined
    if (frame.kind === 'webpack') {
      payload = await loadWebpackSourceMap(frame.file)
    } else if (frame.kind === 'next-server') {
      payload = await loadNextServerSourceMap(frame.file)
    } else {
      payload = await loadModuleSourceMap(frame.file)
    }
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

async function loadModuleSourceMap(
  moduleUrl: string,
): Promise<SourceMapPayload | undefined> {
  const source = await fetchText(moduleUrl)
  return source ? loadSourceMapFromText(source, moduleUrl) : undefined
}

async function loadNextServerSourceMap(
  fileName: string,
): Promise<SourceMapPayload | undefined> {
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
    endpoint.searchParams.set('filename', fileName)

    const contents = await fetchText(endpoint.href)
    return contents ? { contents, url: endpoint.href } : undefined
  } catch {
    return
  }
}

async function loadWebpackSourceMap(
  frameUrl: string,
): Promise<SourceMapPayload | undefined> {
  const targetId = normalizeWebpackModuleId(frameUrl)
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

      const sourceUrl = findDirective(moduleSource, 'sourceURL')
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

async function loadSourceMapFromText(
  source: string,
  ownerUrl: string,
): Promise<SourceMapPayload | undefined> {
  const sourceMapUrl = findDirective(source, 'sourceMappingURL')
  if (!sourceMapUrl) return

  if (sourceMapUrl.startsWith('data:')) {
    const contents = decodeDataUrl(sourceMapUrl)
    return contents ? { contents } : undefined
  }

  try {
    const url = new URL(sourceMapUrl, ownerUrl).href
    const contents = await fetchText(url)
    return contents ? { contents, url } : undefined
  } catch {
    return
  }
}

function findDirective(source: string, name: string): string | undefined {
  const expression = new RegExp(
    `^[\\t ]*//[#@][\\t ]*${name}=([^\\s]+)[\\t ]*$`,
    'gm',
  )
  let value: string | undefined
  for (const match of source.matchAll(expression)) value = match[1]
  return value
}

function decodeDataUrl(url: string): string | undefined {
  try {
    const separator = url.indexOf(',')
    if (separator < 0) return

    const metadata = url.slice(0, separator)
    const payload = url.slice(separator + 1)
    if (!/;base64(?:;|$)/i.test(metadata)) return decodeURIComponent(payload)

    const binary = atob(payload)
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    )
    return new TextDecoder().decode(bytes)
  } catch {
    return
  }
}

function normalizeWebpackModuleId(value: string): string | undefined {
  try {
    value = decodeURIComponent(value)
  } catch {
    // Keep the encoded value when a loader emitted malformed escapes.
  }

  const withoutQuery = value.replace(/[?#].*$/, '')
  const afterLoader = withoutQuery.slice(withoutQuery.lastIndexOf('!') + 1)
  const path = afterLoader
    .replace(/^webpack-internal:\/\/\/(?:\([^)]*\)\/)?/, '')
    .replace(/^webpack:\/\/[^/]*\//, '')
    .replace(/^\.?\//, '')

  return path || undefined
}

function fetchText(url: string): Promise<string | undefined> {
  const cached = textCache.get(url)
  if (cached) return cached

  const loading = fetch(url)
    .then((response) => (response.ok ? response.text() : undefined))
    .catch(() => undefined)
    .then((value) => {
      if (!value) textCache.delete(url)
      return value
    })
  textCache.set(url, loading)
  return loading
}
