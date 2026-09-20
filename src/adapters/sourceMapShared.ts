import type { SourceMapPayload } from './types'

const textCache = new Map<string, Promise<string | undefined>>()

export async function loadSourceMapFromText(
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

export function normalizeWebpackModuleId(value: string): string | undefined {
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

export function fetchText(url: string): Promise<string | undefined> {
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
